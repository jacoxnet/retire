import json
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase
from django.urls import reverse

from core.forms import get_float, get_int, normalize_imported_plan


def valid_plan(**overrides):
    plan = {
        'user_name': 'Pat',
        'user_age': 60,
        'user_retirement_age': 65,
        'user_age_death': 90,
        'is_married': False,
        'runs': 100,
        'desired_spending': 40000.0,
        'accounts': [{
            'name': 'IRA', 'type': 'pretax', 'owner': 'user', 'balance': 500000.0,
            'contrib_amount': 0.0, 'contrib_start_age': 60,
            'return_mean': 6.0, 'return_std': 10.0,
        }],
    }
    plan.update(overrides)
    return plan


class SessionTestCase(TestCase):
    def setUp(self):
        session = self.client.session
        session['server_run_id'] = settings.SERVER_RUN_ID
        session.save()

    def load(self, plan, raw=None):
        return self.client.post(reverse('load_plan'), {
            'json_data': raw if raw is not None else json.dumps(plan),
            'next': 'results',
        })

    def messages_of(self, response):
        return [str(m) for m in response.wsgi_request._messages]


class CpiDataEmbeddingTests(SessionTestCase):
    def test_cpi_data_is_escaped_in_page(self):
        hostile = {'2026-01': 300.0, '</script><script>alert(1)</script>': 1.0}
        with patch('core.views.load_cpi_data', return_value=hostile):
            response = self.client.get(reverse('enter'))
        content = response.content.decode()
        self.assertIn('id="initial-cpi-data"', content)
        self.assertNotIn('<script>alert(1)', content)
        self.assertIn('\\u003C/script\\u003E', content)


class RedirectTargetTests(SessionTestCase):
    def test_clear_ignores_unknown_next(self):
        response = self.client.post(reverse('clear_data'), {'next': 'admin:index'})
        self.assertRedirects(response, reverse('enter'))

    def test_clear_honors_known_next(self):
        response = self.client.post(reverse('clear_data'), {'next': 'manage_data'})
        self.assertRedirects(response, reverse('manage_data'))

    def test_load_plan_ignores_unknown_next(self):
        response = self.client.post(reverse('load_plan'), {'json_data': '', 'next': 'no-such-page'})
        self.assertRedirects(response, reverse('results'), fetch_redirect_response=False)


class ImportedPlanValidationTests(SessionTestCase):
    def test_valid_plan_loads_to_requested_page(self):
        response = self.load(valid_plan())
        self.assertRedirects(response, reverse('results'), fetch_redirect_response=False)
        self.assertEqual(self.client.session['simulation_data']['user_name'], 'Pat')

    def test_excessive_runs_sent_to_enter_page(self):
        response = self.load(valid_plan(runs=50000000))
        self.assertRedirects(response, reverse('enter'), fetch_redirect_response=False)
        self.assertIn("Number of Simulations must be an integer between 1 and 1,000,000.", self.messages_of(response))

    def test_out_of_range_ages_rejected_like_enter_page(self):
        response = self.load(valid_plan(user_age=10, user_age_death=200))
        msgs = self.messages_of(response)
        self.assertRedirects(response, reverse('enter'), fetch_redirect_response=False)
        self.assertIn("Your Present Age must be an integer between 18 and 120.", msgs)

    def test_negative_account_balance_rejected(self):
        plan = valid_plan()
        plan['accounts'][0]['balance'] = -5.0
        response = self.load(plan)
        self.assertRedirects(response, reverse('enter'), fetch_redirect_response=False)
        self.assertIn("Account 'IRA' Present Balance cannot be negative.", self.messages_of(response))

    def test_wrong_types_reported_not_crashing(self):
        plan = valid_plan(user_age='sixty', desired_spending={'x': 1})
        plan['accounts'][0]['balance'] = 'lots'
        response = self.load(plan)
        msgs = self.messages_of(response)
        self.assertRedirects(response, reverse('enter'), fetch_redirect_response=False)
        self.assertIn("Imported plan: field 'user_age' must be a whole number.", msgs)
        self.assertIn("Imported plan: field 'desired_spending' must be a number.", msgs)
        self.assertIn("Imported plan: accounts #1 'balance' must be a number.", msgs)
        # The enter page still renders the partially loaded plan
        self.assertEqual(self.client.get(reverse('enter')).status_code, 200)

    def test_numeric_strings_are_coerced(self):
        self.load(valid_plan(user_age='61', runs='500'))
        data = self.client.session['simulation_data']
        self.assertEqual(data['user_age'], 61)
        self.assertEqual(data['runs'], 500)

    def test_non_finite_numbers_rejected(self):
        response = self.load(None, raw='{"user_age": 60, "runs": Infinity}')
        self.assertTrue(any('Invalid number' in m for m in self.messages_of(response)))
        self.assertNotEqual(self.client.session.get('simulation_data', {}).get('runs'), float('inf'))

    def test_unknown_keys_dropped(self):
        self.load(valid_plan(injected_key='<b>hi</b>'))
        self.assertNotIn('injected_key', self.client.session['simulation_data'])

    def test_saved_export_round_trips_without_errors(self):
        # Whatever the Manage Data page exports must load back cleanly
        self.client.get(reverse('enter'))
        exported = dict(self.client.session['simulation_data'])
        response = self.load(exported)
        self.assertRedirects(response, reverse('results'), fetch_redirect_response=False)


class NormalizeImportedPlanTests(TestCase):
    def test_non_list_rows_and_non_dict_items(self):
        data = {'accounts': 'nope', 'income_sources': [1, {'name': 'Pension', 'amount': '1200'}]}
        errors = normalize_imported_plan(data)
        self.assertNotIn('accounts', data)
        self.assertEqual(data['income_sources'], [{'name': 'Pension', 'amount': 1200.0}])
        self.assertEqual(len(errors), 2)

    def test_nulls_fall_back_to_defaults_silently(self):
        data = {'user_age': None, 'social_security': {'user_start_age': None}}
        self.assertEqual(normalize_imported_plan(data), [])
        self.assertNotIn('user_age', data)
        self.assertNotIn('user_start_age', data['social_security'])


class NumericHelperTests(TestCase):
    def test_non_finite_values_use_default(self):
        self.assertEqual(get_float('inf', 1.0), 1.0)
        self.assertEqual(get_float('nan', 2.0), 2.0)
        self.assertEqual(get_int('inf', 3), 3)
        self.assertEqual(get_int('1e400', 4), 4)
