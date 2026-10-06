"""Sensitivity tests: every input the user can enter must affect the calculations.

Persistence tests (tests_navigation.py, tests_browser.py) prove a value survives
navigation; these prove it is used. Each case changes one input the way the
Enter page would submit it, saves it through the normal Enter POST (so derived
values are rebuilt), and checks that the deterministic projection, or for
Monte Carlo-only inputs the simulation inputs, change as a result. An input that
changes nothing is either not wired up or not reaching the engine.
"""
import copy

from django.conf import settings
from django.test import Client, TestCase

from core.runs import extract_sim_inputs, run_deterministic
from core.tests_navigation import _diff, _rich_plan, server_round_trip

# Row keys that only label results; changing them is not a calculation change.
LABEL_KEYS = {'year', 'milestones'}


# -- mutations (each mirrors what the Enter page submits for that edit) --------

def top(key, value):
    def apply(plan):
        plan[key] = value
    return apply


def ss(key, value):
    def apply(plan):
        plan['social_security'][key] = value
    return apply


def row(list_key, idx, **values):
    def apply(plan):
        plan[list_key][idx].update(values)
    return apply


def income_adjustment(idx, **values):
    """Income cards submit their adjustment schedule, not the flat adjust_* fields."""
    def apply(plan):
        plan['income_sources'][idx]['adjustments'][0].update(values)
    return apply


def _bs_accounts(plan):
    cats = plan['balance_sheet']['categories']
    accs = [a for c in cats.values() if isinstance(c, dict) for a in c.get('accounts', [])]
    accs += [a for g in cats.get('goals', {}).get('goal_groups', []) for a in g.get('accounts', [])]
    return accs


def account(idx, **values):
    """Account-card edits: enter.js mirrors them into the balance sheet before submitting."""
    def apply(plan):
        acc = plan['accounts'][idx]
        acc.update(values)
        period = plan['balance_sheet']['current_period']
        for bs_acc in _bs_accounts(plan):
            if bs_acc.get('id') == acc['id']:
                for k, v in values.items():
                    if k == 'balance':
                        bs_acc.setdefault('values', {})[period] = v
                    else:
                        bs_acc[k] = v
    return apply


def balance_sheet_account(idx, **values):
    def apply(plan):
        acc_id = plan['accounts'][idx]['id']
        for bs_acc in _bs_accounts(plan):
            if bs_acc.get('id') == acc_id:
                bs_acc.update(values)
    return apply


def both(*fns):
    def apply(plan):
        for fn in fns:
            fn(plan)
    return apply


PROJECTION = 'projection'

# (label, mutation, how the input is used[, mutation applied to the baseline too])
#   PROJECTION        -> the deterministic projection must change
#   ('mc', key)       -> only the Monte Carlo inputs use it; extract_sim_inputs()[key] must change
#   ('none', reason)  -> deliberately not used by the simulation; documented here
CASES = [
    # Demographics
    ('user_age', top('user_age', 37), PROJECTION),
    ('user_retirement_age', top('user_retirement_age', 62), PROJECTION),
    ('user_age_death', top('user_age_death', 92), PROJECTION),
    ('spouse_age', top('spouse_age', 43), PROJECTION),
    ('spouse_retirement_age', top('spouse_retirement_age', 63), PROJECTION),
    ('spouse_age_death', top('spouse_age_death', 90), PROJECTION),
    ('is_married', top('is_married', False), PROJECTION),
    ('filing_status (married: joint -> head of household)', top('filing_status', 'hoh'), PROJECTION),
    # Married users are not offered Single; a saved or loaded married + Single is stored as Joint.
    ('filing_status (married: joint -> single)', top('filing_status', 'single'),
     ('none', 'married + Single is saved as Joint')),
    ('filing_status (unmarried: single -> head of household)', top('filing_status', 'hoh'), PROJECTION,
     both(top('is_married', False), top('filing_status', 'single'))),
    ('current_year', top('current_year', 2027),
     ('none', 'only sets birth year, which moves the RMD start age near the 1959/1960 boundary; not for this plan')),
    ('state_tax_rate', top('state_tax_rate', 6.0), PROJECTION),
    ('state_ss_exempt', top('state_ss_exempt', True), PROJECTION),
    ('inflation_rate', top('inflation_rate', 4.0), PROJECTION),
    ('user_life_insurance_type', top('user_life_insurance_type', 'permanent'), PROJECTION),
    ('user_life_insurance_term_age', top('user_life_insurance_term_age', 99), PROJECTION),
    ('user_life_insurance_amount (permanent)',
     both(top('user_life_insurance_type', 'permanent'), top('user_life_insurance_amount', 400000.0)), PROJECTION),
    ('spouse_life_insurance_amount', top('spouse_life_insurance_amount', 300000.0), PROJECTION),
    ('spouse_life_insurance_type (term ends before death)',
     both(top('spouse_life_insurance_type', 'term'), top('spouse_life_insurance_term_age', 70)), PROJECTION),

    # Spending
    ('desired_spending', top('desired_spending', 120000.0), PROJECTION),
    ('survivor_spending', top('survivor_spending', 60000.0), PROJECTION),
    ('adjust_spending_inflation', top('adjust_spending_inflation', True), PROJECTION),
    ('begin_spending_age (specified)',
     both(top('begin_spending_age_type', 'specified'), top('begin_spending_age_specified', 66)), PROJECTION),
    ('additional_spending.amount', row('additional_spending', 0, amount=50000), PROJECTION),
    ('additional_spending.start_age', row('additional_spending', 0, start_age=64), PROJECTION),
    ('additional_spending.start_age_type', row('additional_spending', 0, start_age_type='spouse'), PROJECTION),
    ('additional_spending.interval', row('additional_spending', 0, interval=5), PROJECTION),
    ('additional_spending.adjust_inflation', row('additional_spending', 0, adjust_inflation=True), PROJECTION),

    # Social Security
    ('ss.user_amount', ss('user_amount', 3000.0), PROJECTION),
    ('ss.user_start_age', ss('user_start_age', 70), PROJECTION),
    ('ss.user_freq', ss('user_freq', 'annual'), PROJECTION),
    ('ss.user_future_entitled', ss('user_future_entitled', False), PROJECTION),
    ('ss.user_receiving', ss('user_receiving', True), PROJECTION),
    ('ss.spouse_amount', ss('spouse_amount', 2000.0), PROJECTION),
    ('ss.spouse_start_age', ss('spouse_start_age', 70), PROJECTION),

    # Other income streams
    ('income.amount', row('income_sources', 0, amount=12000.0), PROJECTION),
    ('income.frequency', row('income_sources', 0, frequency='annual'), PROJECTION),
    ('income.start_age_type', row('income_sources', 0, start_age_type='retirement'), PROJECTION),
    ('income.start_age_specified',
     row('income_sources', 0, start_age_type='spouse_specified', start_age_specified=63), PROJECTION),
    ('income.end_age_type', row('income_sources', 0, end_age_type='death'), PROJECTION),
    ('income.end_age_specified',
     row('income_sources', 0, end_age_type='spouse_specified', end_age_specified=75), PROJECTION),
    ('income.subject_to_tax', row('income_sources', 0, subject_to_tax=False), PROJECTION),
    ('income.has_survivor_benefit', row('income_sources', 0, has_survivor_benefit=False), PROJECTION),
    ('income.survivor_benefit_pct', row('income_sources', 0, survivor_benefit_pct=40.0), PROJECTION),
    ('income.adjustment type', income_adjustment(0, adjust_type='none'), PROJECTION),
    ('income.adjustment value', income_adjustment(0, adjust_val=1.0), PROJECTION),

    # Other taxes (row 1 has a non-zero amount)
    ('other_tax.amount', row('other_taxes', 1, amount=3000.0), PROJECTION),
    ('other_tax.frequency', row('other_taxes', 1, frequency='monthly'), PROJECTION),
    ('other_tax.start_age', row('other_taxes', 1, start_age_type='retirement'), PROJECTION),
    ('other_tax.end_age', row('other_taxes', 1, end_age_type='retirement'), PROJECTION),
    ('other_tax.adjust_type', row('other_taxes', 1, adjust_type='inflation'), PROJECTION),
    ('other_tax.adjust_val', row('other_taxes', 1, adjust_type='fixed_pct', adjust_val=5.0), PROJECTION),
    ('other_tax.adjust_start_age',
     row('other_taxes', 1, adjust_type='inflation', adjust_start_age_type='specified', adjust_start_age_specified=60),
     PROJECTION),

    # Accounts (0 = user pre-tax 401k, 4 = joint taxable, 5 = spouse HSA)
    ('account.balance', account(0, balance=250000.0), PROJECTION),
    ('account.contrib_amount', account(0, contrib_amount=15000.0), PROJECTION),
    ('account.contrib_freq', account(0, contrib_freq='monthly'), PROJECTION),
    ('account.contrib_start_age', account(0, contrib_start_age=45), PROJECTION),
    ('account.contrib_end_age', account(0, contrib_end_age_type='age', contrib_end_age_specified=50), PROJECTION),
    ('account.contrib_adjust_inflation', account(0, contrib_adjust_inflation=False), PROJECTION),
    ('account.return_mean', account(0, return_mean=7.0), PROJECTION),
    ('account.return_std', account(0, return_std=15.0), ('mc', 'pretax_data')),
    ('account.type', account(0, type='roth'), PROJECTION),
    ('account.owner', account(0, owner='spouse'), PROJECTION),
    ('account.dividend_yield', account(4, dividend_yield=4.0), PROJECTION),
    ('account.qualified_dividend_pct', account(4, qualified_dividend_pct=40.0), PROJECTION),
    ('account.interest_yield', account(4, interest_yield=2.0), PROJECTION),
    ('account.capital_gains_dist_rate', account(4, capital_gains_dist_rate=3.0), PROJECTION),
    ('account.cost_basis_ratio', account(4, cost_basis_ratio=30.0), PROJECTION),
    ('account.is_community_property', account(4, is_community_property=False), PROJECTION),
    # This plan never draws the HSA down, so check the setting reaches the engine.
    ('account.hsa_for_medical', account(5, hsa_for_medical=True), ('mc', 'spouse_hsa_for_medical')),
    ('balance_sheet.include_in_retirement', balance_sheet_account(3, include_in_retirement=False), PROJECTION),

    # Simulation settings
    ('runs', top('runs', 75), ('mc', 'runs')),
    ('target_success_rate', top('target_success_rate', 70.0),
     ('none', 'only used by the Maximum Spending search, not by a single projection')),
    ('balance_sheet.marginal_tax_rate_override',
     lambda plan: plan['balance_sheet'].update(marginal_tax_rate_override=40.0),
     ('none', 'only used for the Balance Sheet after-tax display')),
]


class InputSensitivityTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.plan = _rich_plan()
        cls.plan['runs'] = 50

    def _saved(self, plan):
        client = Client()
        session = client.session
        session['server_run_id'] = settings.SERVER_RUN_ID
        session['simulation_data'] = copy.deepcopy(plan)
        session.save()
        return server_round_trip(client)

    @staticmethod
    def _projection(saved):
        return [{k: v for k, v in r.items() if k not in LABEL_KEYS} for r in run_deterministic(saved)]

    def test_every_input_affects_the_simulation(self):
        baselines = {}

        def baseline(base_mutate):
            if base_mutate not in baselines:
                plan = copy.deepcopy(self.plan)
                if base_mutate:
                    base_mutate(plan)
                saved = self._saved(plan)
                baselines[base_mutate] = (plan, self._projection(saved), extract_sim_inputs(saved))
            return baselines[base_mutate]

        for label, mutate, usage, *rest in CASES:
            with self.subTest(input=label):
                base_plan, base_projection, base_inputs = baseline(rest[0] if rest else None)
                plan = copy.deepcopy(base_plan)
                mutate(plan)
                saved = self._saved(plan)
                if usage == PROJECTION:
                    changed = any(True for _ in _diff(base_projection, self._projection(saved)))
                    self.assertTrue(changed, f'Changing {label} did not change the projection')
                elif usage[0] == 'mc':
                    key = usage[1]
                    changed = any(True for _ in _diff(base_inputs[key], extract_sim_inputs(saved)[key]))
                    self.assertTrue(changed, f'Changing {label} did not reach the Monte Carlo inputs ({key})')
                else:
                    unchanged = not any(True for _ in _diff(base_projection, self._projection(saved)))
                    self.assertTrue(unchanged, f'{label} is documented as unused ({usage[1]}) but changed the projection')
