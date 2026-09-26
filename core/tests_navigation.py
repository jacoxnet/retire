"""Round-trip persistence tests for navigating away from and back to the Enter page.

Each round trip mirrors what a browser does with no JavaScript edits:
GET the Enter page, collect the form controls rendered by the template plus the
row lists enter.js builds from the initial-* JSON blocks, POST them back, and
compare the resulting session against what was there before. Any difference
means a value the user entered would be lost or altered just by navigating.
"""
import copy
import json
from html.parser import HTMLParser

from django.conf import settings
from django.test import TestCase
from django.urls import reverse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FormControlParser(HTMLParser):
    """Collect the successful controls of an HTML form (what a browser submits)."""

    def __init__(self):
        super().__init__()
        self.fields = []
        self._select_name = None
        self._options = []
        self._option_text = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'input':
            name = a.get('name')
            if not name or 'disabled' in a:
                return
            input_type = a.get('type', 'text')
            if input_type in ('checkbox', 'radio'):
                if 'checked' in a:
                    self.fields.append((name, a.get('value') or 'on'))
            elif input_type not in ('submit', 'button', 'image', 'reset'):
                self.fields.append((name, a.get('value') or ''))
        elif tag == 'select':
            self._select_name = a.get('name') if 'disabled' not in a else None
            self._options = []
        elif tag == 'option' and self._select_name is not None:
            self._options.append({'value': a.get('value'), 'selected': 'selected' in a,
                                  'disabled': 'disabled' in a, 'text': ''})
            self._option_text = self._options[-1]

    def handle_data(self, data):
        if self._option_text is not None:
            self._option_text['text'] += data

    def handle_endtag(self, tag):
        if tag == 'option':
            self._option_text = None
        elif tag == 'select' and self._select_name is not None:
            enabled = [o for o in self._options if not o['disabled']]
            chosen = next((o for o in enabled if o['selected']), enabled[0] if enabled else None)
            if chosen is not None:
                value = chosen['value'] if chosen['value'] is not None else chosen['text'].strip()
                self.fields.append((self._select_name, value))
            self._select_name = None


def _extract_json_script(content, script_id):
    marker = f'<script id="{script_id}" type="application/json">'
    start = content.find(marker)
    if start == -1:
        raise AssertionError(f'json_script block {script_id!r} not found in page')
    start += len(marker)
    end = content.find('</script>', start)
    return json.loads(content[start:end])


def _b(val):
    return 'true' if val in (True, 'true', 'True', 'on') else 'false'


def _rows_to_post(initial):
    """Build the row-list POST fields enter.js submits for the initial-* data."""
    post = {}

    def put(key, values):
        post[key] = [str(v) for v in values]

    accs = initial['accounts'] or []
    put('account_id[]', [a.get('id', '') for a in accs])
    put('account_name[]', [a.get('name', '') for a in accs])
    put('account_type[]', [a.get('type', 'pretax') for a in accs])
    put('account_owner[]', [a.get('owner', 'user') for a in accs])
    put('account_balance[]', [a.get('balance', 0) for a in accs])
    put('account_contrib_amount[]', [a.get('contrib_amount', 0) for a in accs])
    put('account_contrib_freq[]', [a.get('contrib_freq', 'annual') for a in accs])
    put('account_contrib_start_age[]', [a.get('contrib_start_age', '') for a in accs])
    put('account_contrib_end_age_type[]', [a.get('contrib_end_age_type', 'retirement') for a in accs])
    put('account_contrib_end_age_specified[]', [a.get('contrib_end_age_specified', '') for a in accs])
    put('account_contrib_adjust_inflation[]', [_b(a.get('contrib_adjust_inflation', True)) for a in accs])
    put('account_return_mean[]', [a.get('return_mean', 6.0) for a in accs])
    put('account_return_std[]', [a.get('return_std', 10.0) for a in accs])
    put('account_hsa_for_medical[]', [_b(a.get('hsa_for_medical', True)) for a in accs])
    put('account_dividend_yield[]', [a.get('dividend_yield', 0.0) for a in accs])
    put('account_qualified_dividend_pct[]', [a.get('qualified_dividend_pct', 0.0) for a in accs])
    put('account_interest_yield[]', [a.get('interest_yield', 0.0) for a in accs])
    put('account_capital_gains_dist_rate[]', [a.get('capital_gains_dist_rate', 0.0) for a in accs])
    put('account_cost_basis_ratio[]', [a.get('cost_basis_ratio', 100.0) for a in accs])
    put('account_is_community_property[]', [_b(a.get('is_community_property', False)) for a in accs])

    spend = initial['additional_spending'] or []
    put('add_spending_name[]', [s.get('name', '') for s in spend])
    put('add_spending_amount[]', [s.get('amount', 0) for s in spend])
    put('add_spending_start_age[]', [s.get('start_age', 65) for s in spend])
    put('add_spending_start_age_type[]', [s.get('start_age_type', 'user') for s in spend])
    put('add_spending_interval[]', [s.get('interval', 0) for s in spend])
    put('add_spending_adjust_inflation[]', [_b(s.get('adjust_inflation', True)) for s in spend])

    # Income cards submit their adjustment schedule as JSON (serializeCardAdjustments);
    # the flat income_adjust_* fields are not rendered, and neither is income_is_ss[].
    inc = initial['income_sources'] or []
    put('income_name[]', [i.get('name', '') for i in inc])
    put('income_amount[]', [i.get('amount', 0) for i in inc])
    put('income_frequency[]', [i.get('frequency', 'monthly') for i in inc])
    put('income_start_age_type[]', [i.get('start_age_type', 'retirement') for i in inc])
    put('income_start_age_specified[]', [i.get('start_age_specified', 65) for i in inc])
    put('income_end_age_type[]', [i.get('end_age_type', 'death') for i in inc])
    put('income_end_age_specified[]', [i.get('end_age_specified', 90) for i in inc])
    put('income_subject_to_tax[]', [_b(i.get('subject_to_tax', True)) for i in inc])
    put('income_has_survivor_benefit[]', [_b(i.get('has_survivor_benefit', False)) for i in inc])
    put('income_survivor_benefit_pct[]', [i.get('survivor_benefit_pct', 100.0) for i in inc])
    post['income_adjustments_json[]'] = [json.dumps(i.get('adjustments') or []) for i in inc]

    taxes = initial['other_taxes'] or []
    put('other_tax_name[]', [t.get('name', '') for t in taxes])
    put('other_tax_amount[]', [t.get('amount', 0) for t in taxes])
    put('other_tax_frequency[]', [t.get('frequency', 'annual') for t in taxes])
    put('other_tax_start_age_type[]', [t.get('start_age_type', 'retirement') for t in taxes])
    put('other_tax_start_age_specified[]', [t.get('start_age_specified', 65) for t in taxes])
    put('other_tax_end_age_type[]', [t.get('end_age_type', 'death') for t in taxes])
    put('other_tax_end_age_specified[]', [t.get('end_age_specified', 90) for t in taxes])
    put('other_tax_adjust_type[]', [t.get('adjust_type', 'inflation') for t in taxes])
    put('other_tax_adjust_val[]', [t.get('adjust_val', 0.0) for t in taxes])
    put('other_tax_adjust_start_age_type[]', [t.get('adjust_start_age_type', 'start') for t in taxes])
    put('other_tax_adjust_start_age_specified[]', [t.get('adjust_start_age_specified', 65) for t in taxes])

    post['balance_sheet_json'] = json.dumps(initial['balance_sheet'])
    post['rebalancing_json'] = json.dumps(initial['rebalancing'])
    return post


def post_enter_as_rendered(client, content, next_page='results'):
    """POST the Enter form exactly as rendered, as if the user clicked away without editing."""
    form_start = content.find('id="enterDataForm"')
    if form_start == -1:
        raise AssertionError('enterDataForm not found in page')
    form_end = content.find('</form>', form_start)
    parser = _FormControlParser()
    parser.feed(content[content.rfind('<form', 0, form_start):form_end])

    post = {}
    for name, value in parser.fields:
        if name in ('balance_sheet_json', 'rebalancing_json', 'csrfmiddlewaretoken'):
            continue
        post.setdefault(name, []).append(value)
    post = {k: v if len(v) > 1 else v[0] for k, v in post.items()}

    initial = {
        'accounts': _extract_json_script(content, 'initial-accounts'),
        'additional_spending': _extract_json_script(content, 'initial-additional-spending'),
        'income_sources': _extract_json_script(content, 'initial-income-sources'),
        'other_taxes': _extract_json_script(content, 'initial-other-taxes'),
        'balance_sheet': _extract_json_script(content, 'initial-balance-sheet'),
        'rebalancing': _extract_json_script(content, 'initial-rebalancing'),
    }
    post.update(_rows_to_post(initial))
    post['next'] = next_page
    return client.post(reverse('enter'), post)


def server_round_trip(client):
    """GET Enter and POST it back unchanged (no JavaScript); return the saved simulation data."""
    content = client.get(reverse('enter')).content.decode('utf-8')
    resp = post_enter_as_rendered(client, content, 'manage_data')
    if resp.status_code != 302:
        raise AssertionError('Enter POST was rejected by server validation')
    return copy.deepcopy(client.session['simulation_data'])


def _diff(a, b, path=''):
    """Yield every path where a and b differ (floats compared to 6 places)."""
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            p = f'{path}.{k}' if path else str(k)
            if k not in a:
                yield f'{p}: missing before, now {b[k]!r}'
            elif k not in b:
                yield f'{p}: was {a[k]!r}, now missing'
            else:
                yield from _diff(a[k], b[k], p)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            yield f'{path}: length {len(a)} -> {len(b)}'
        for i, (x, y) in enumerate(zip(a, b)):
            yield from _diff(x, y, f'{path}[{i}]')
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        if round(float(a) - float(b), 6) != 0:
            yield f'{path}: {a!r} -> {b!r}'
    elif a != b:
        yield f'{path}: {a!r} -> {b!r}'


# Keys the server derives from other inputs on every save; they may legitimately change.
DERIVED_KEYS = {'pretax_assets', 'spouse_pretax_assets', 'roth_assets', 'taxable_assets',
                'hsa_assets', 'spouse_hsa_assets', 'marginal_tax_rate', 'balance_sheet',
                'rebalancing', 'simulation_type'}


def _rich_plan():
    """A married plan with non-default values and mixed booleans across rows."""
    with open(settings.BASE_DIR / 'saved json files' / 'sept23.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    data['adjust_spending_inflation'] = False
    data['state_ss_exempt'] = False
    data['state_tax_rate'] = 4.25
    data['inflation_rate'] = 3.1
    data['survivor_spending'] = 77000.0
    data['user_life_insurance_amount'] = 250000.0
    data['user_life_insurance_type'] = 'term'
    data['user_life_insurance_term_age'] = 72
    data['spouse_life_insurance_amount'] = 150000.0
    data['spouse_life_insurance_type'] = 'permanent'
    data['social_security'].update({
        'user_receiving': False, 'user_future_entitled': True, 'user_entitled': True,
        'user_amount': 2345.0, 'user_freq': 'monthly', 'user_start_age': 68,
        'spouse_receiving': False, 'spouse_future_entitled': True, 'spouse_entitled': True,
        'spouse_amount': 1234.0, 'spouse_freq': 'monthly', 'spouse_start_age': 66,
    })

    # Accounts: mix booleans across rows; mark the taxable account community property.
    for i, acc in enumerate(data['accounts']):
        acc['contrib_adjust_inflation'] = (i % 2 == 0)
        if acc['type'] == 'hsa':
            acc['hsa_for_medical'] = False
        acc['is_community_property'] = (acc['type'] == 'taxable')
    # enter.js mirrors account-card edits into the balance sheet before submitting.
    by_id = {a['id']: a for a in data['accounts']}
    cats = data['balance_sheet']['categories']
    bs_accounts = [a for c in cats.values() if isinstance(c, dict) for a in c.get('accounts', [])]
    bs_accounts += [a for g in cats.get('goals', {}).get('goal_groups', []) for a in g.get('accounts', [])]
    for bs_acc in bs_accounts:
        if True:
            src = by_id.get(bs_acc.get('id'))
            if src:
                for k in ('contrib_adjust_inflation', 'hsa_for_medical', 'is_community_property'):
                    if k in src:
                        bs_acc[k] = src[k]

    for i, item in enumerate(data['additional_spending']):
        item['adjust_inflation'] = (i % 2 == 1)

    base_income = data['income_sources'][0]
    # Flat adjust_* fields mirror the first adjustment period (the engine uses the schedule).
    base_income['adjust_type'] = base_income['adjustments'][0]['adjust_type']
    base_income['adjust_val'] = base_income['adjustments'][0]['adjust_val']
    second_income = copy.deepcopy(base_income)
    second_income.update({
        'name': 'Annuity', 'amount': 750.0, 'subject_to_tax': False,
        'has_survivor_benefit': True, 'survivor_benefit_pct': 60.0,
        'is_social_security': False,
        'adjust_type': 'none', 'adjust_val': 0.0,
    })
    second_income['adjustments'] = [{
        'start_type': 'current_age', 'start_spec': 65, 'end_type': 'death', 'end_spec': 90,
        'adjust_type': 'none', 'adjust_val': 0.0,
    }]
    data['income_sources'].append(second_income)

    second_tax = copy.deepcopy(data['other_taxes'][0])
    second_tax.update({'name': 'HOA Assessment', 'amount': 1800.0, 'adjust_type': 'none', 'adjust_val': 0.0})
    data['other_taxes'].append(second_tax)
    return data


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class NavigationPersistenceTests(TestCase):

    def _seed(self, data):
        session = self.client.session
        session['server_run_id'] = settings.SERVER_RUN_ID
        session['simulation_data'] = data
        session['data_version'] = 1
        session.save()

    def _session_data(self):
        return copy.deepcopy(self.client.session['simulation_data'])

    def _render_enter(self):
        resp = self.client.get(reverse('enter'))
        self.assertEqual(resp.status_code, 200)
        return resp.content.decode('utf-8')

    def _post_from_page(self, content, next_page='results'):
        resp = post_enter_as_rendered(self.client, content, next_page)
        errors = [str(m) for m in resp.context['messages']] if resp.status_code == 200 and resp.context else []
        self.assertEqual(resp.status_code, 302, f'Enter POST re-rendered with errors: {errors}')
        return resp

    def _round_trip(self):
        self._post_from_page(self._render_enter())
        return self._session_data()

    def _assert_no_loss(self, before, after, label):
        diffs = [d for d in _diff(
            {k: v for k, v in before.items() if k not in DERIVED_KEYS},
            {k: v for k, v in after.items() if k not in DERIVED_KEYS},
        )]
        self.assertEqual(diffs, [], f'{label}: {len(diffs)} value(s) changed by navigating:\n  ' + '\n  '.join(diffs))

    # -- Enter -> Results -> Enter -------------------------------------------------

    def test_first_round_trip_preserves_user_inputs(self):
        """Navigating away from Enter without editing must not change any user input."""
        self._seed(_rich_plan())
        before = self._session_data()
        # Normalize once so fields the server adds on first save don't count as loss.
        after = self._round_trip()
        self._assert_no_loss(before, after, 'Enter -> Results (first save)')

    def test_round_trip_is_a_fixed_point(self):
        """Once saved, repeated navigation must leave the whole session unchanged."""
        self._seed(_rich_plan())
        first = self._round_trip()
        second = self._round_trip()
        diffs = list(_diff(first, second))
        self.assertEqual(diffs, [], 'Second navigation changed saved data:\n  ' + '\n  '.join(diffs))

    def test_single_filer_round_trip_is_a_fixed_point(self):
        plan = _rich_plan()
        plan['is_married'] = False
        plan['filing_status'] = 'single'
        plan['begin_spending_age_type'] = 'retirement'
        self._seed(plan)
        first = self._round_trip()
        second = self._round_trip()
        diffs = list(_diff(first, second))
        self.assertEqual(diffs, [], 'Second navigation changed saved data (single):\n  ' + '\n  '.join(diffs))

    def test_rendered_row_blocks_match_session(self):
        """Every list the JS rebuilds from initial-* JSON must match the session exactly."""
        self._seed(_rich_plan())
        saved = self._round_trip()
        content = self._render_enter()
        for key, script_id in [('accounts', 'initial-accounts'),
                               ('additional_spending', 'initial-additional-spending'),
                               ('income_sources', 'initial-income-sources'),
                               ('other_taxes', 'initial-other-taxes')]:
            diffs = list(_diff(saved[key], _extract_json_script(content, script_id)))
            self.assertEqual(diffs, [], f'{script_id} differs from session:\n  ' + '\n  '.join(diffs))

    # -- Other ways into and out of the Enter page ---------------------------------

    def test_results_page_edits_survive_return_to_enter(self):
        """Edits made in the Results page Simulation Inputs card must survive the next Enter save."""
        self._seed(_rich_plan())
        self._round_trip()
        resp = self.client.post(reverse('change_mode'), {
            'simulation_type': 'regular', 'desired_spending': '123456', 'inflation_rate': '3.3',
            'runs': '777', 'user_age_death': '95', 'spouse_age_death': '93', 'pretax_return_mean': '7.7',
        })
        self.assertEqual(resp.status_code, 302)
        after_results = self._session_data()
        after_enter = self._round_trip()
        self._assert_no_loss(after_results, after_enter, 'Results edits -> Enter')
        self.assertEqual(after_enter['desired_spending'], 123456.0)
        self.assertEqual(after_enter['runs'], 777)
        self.assertEqual(after_enter['user_age_death'], 95)

    def test_loaded_plan_survives_first_enter_save(self):
        """A plan loaded from Manage Data must not be altered by the first Enter save."""
        self._seed(_rich_plan())
        resp = self.client.post(reverse('load_plan'), {'json_data': json.dumps(_rich_plan()), 'next': 'enter'})
        self.assertEqual(resp.status_code, 302)
        loaded = self._session_data()
        after = self._round_trip()
        self._assert_no_loss(loaded, after, 'Load plan -> Enter save')

    def test_enter_brand_link_returns_to_enter(self):
        """The Enter nav/brand link submits next='enter' (enter.js) and should land on Enter."""
        self._seed(_rich_plan())
        resp = self._post_from_page(self._render_enter(), next_page='enter')
        self.assertEqual(resp.url, reverse('enter'))
