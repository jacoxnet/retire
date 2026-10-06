"""Dump golden fixtures from the Python engine for the TypeScript port.

Run from the repo root:  uv run tools/golden/dump_fixtures.py

For every plan in `saved json files/` it writes web/fixtures/plans/<name>/:
  imported.json      plan after import_plan_data() (the Manage-page import), plus import errors
  inputs.json        extract_sim_inputs(plan)
  numba_inputs.json  prepare_numba_inputs(inputs)
  det_rows.json      run_deterministic(plan)
  kernel.json        njit_simulate_all_paths over FIXED seeded return matrices, for exact comparison
  mc.json            seeded generate_runs / binary_search, for statistical comparison
  stress.json        seeded run_historical_stress_test (default scenario), statistical + exact crisis rows
and web/fixtures/functions/*.json with input/output grids for the pure helpers.

Non-finite floats are written as the strings "NaN", "Infinity", "-Infinity"
because JSON has no literal for them; the TS loader converts them back.
"""
import datetime
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'retire.settings')

import django  # noqa: E402

django.setup()

from core import forms, runs  # noqa: E402
from core import cpi_service, historical_data  # noqa: E402
from core.views import import_plan_data  # noqa: E402

PLANS_DIR = ROOT / 'saved json files'
OUT_DIR = ROOT / 'web' / 'fixtures'

# Import code fills missing balance-sheet dates from date.today(); freeze it so
# fixtures don't change with the day they were generated.
FIXTURE_TODAY = datetime.date(2026, 1, 15)
KERNEL_RUNS = 16
KERNEL_SEED = 12345
MC_SEED = 20260115


class _FrozenDate(datetime.date):
    @classmethod
    def today(cls):
        return FIXTURE_TODAY


class _FrozenDatetimeModule:
    date = _FrozenDate

    def __getattr__(self, name):
        return getattr(datetime, name)


forms.datetime = _FrozenDatetimeModule()


def to_jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return to_jsonable(obj.tolist())
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        if math.isnan(f):
            return 'NaN'
        if math.isinf(f):
            return 'Infinity' if f > 0 else '-Infinity'
        return f
    return obj


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(to_jsonable(obj), f, separators=(',', ':'), allow_nan=False)
        f.write('\n')


def load_plan(path):
    with open(path) as f:
        data = json.load(f)
    # Some older saved files are a JSON-encoded string of the plan.
    if isinstance(data, str):
        data = json.loads(data)
    return data


def kernel_case(inputs, nb, returns, with_trajectories=True):
    """Run njit_simulate_all_paths on given return matrices; mirrors generate_runs' call."""
    k, years = returns[0].shape
    ending = np.empty(k, dtype=np.float64)
    traj = np.empty((k, years + 1), dtype=np.float64) if with_trajectories else None
    flags = np.empty(k, dtype=np.float64)
    runs.njit_simulate_all_paths(
        k, years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
        nb['filing_status_code'], inputs['desired_spending_start_age'], nb['desired_spending'], nb['survivor_spending'],
        inputs['adjust_spending_inflation'], inputs['inflation_rate'], nb['hsa_user_for_medical_code'], nb['user_rmd_start_age'], nb['spouse_rmd_start_age'],
        nb['pretax_user_init'], nb['pretax_spouse_init'], nb['roth_init'], nb['taxable_init'], nb['hsa_user_init'],
        nb['c_pre_user'], nb['c_pre_spouse'], nb['c_roth'], nb['c_tax'], nb['c_hsa_user'],
        nb['add_spending_arr'], nb['inc_taxable_arr'], nb['inc_ss_arr'], nb['inc_nontaxable_arr'],
        *returns,
        nb['state_tax_rate'], nb['state_ss_exempt_code'], nb['other_taxes_arr'],
        nb['hsa_spouse_init'], nb['c_hsa_spouse'], nb['hsa_spouse_for_medical_code'],
        ending,
        traj,
        nb['inf_factors'],
        nb['taxable_deposit_t'],
        nb['taxable_deposit_amt'],
        nb['terminal_life_ins_estate'],
        flags,
        nb['taxable_div_yield'],
        nb['taxable_qual_pct'],
        nb['taxable_int_yield'],
        nb['taxable_cg_dist_rate'],
        nb['taxable_basis_init'],
        nb['is_community_property_code'],
    )
    return {
        'ending_wealths': ending,
        'trajectories': traj,
        'success_flags': flags,
    }


RETURN_KEYS = ['pre_user', 'pre_spouse', 'roth', 'taxable', 'hsa_user', 'hsa_spouse']


def dump_kernel(inputs):
    years = inputs['total_years']
    rng = np.random.default_rng(KERNEL_SEED)
    returns = runs.generate_correlated_returns(inputs, KERNEL_RUNS, years, rng=rng)
    variants = {}

    nb = runs.prepare_numba_inputs(inputs)
    variants['regular'] = {'numba_inputs': nb, **kernel_case(inputs, nb, returns)}

    test_spending = float(inputs['desired_spending']) * 0.8
    nb = runs.prepare_numba_inputs(inputs, test_spending=test_spending)
    variants['test_spending'] = {'test_spending': test_spending, 'numba_inputs': nb,
                                 **kernel_case(inputs, nb, returns, with_trajectories=False)}

    # Varying per-year inflation, as the stress test feeds in.
    infl = np.array([float(inputs['inflation_rate']) + 3.0 * math.sin(t) for t in range(years)], dtype=np.float64)
    nb = runs.prepare_numba_inputs(inputs, custom_inflation_rates=infl)
    variants['custom_inflation'] = {'custom_inflation_rates': infl, 'numba_inputs': nb,
                                    **kernel_case(inputs, nb, returns)}

    return {
        'runs': KERNEL_RUNS,
        'years': years,
        'seed': KERNEL_SEED,
        'returns': dict(zip(RETURN_KEYS, returns)),
        'variants': variants,
    }


def dump_mc(plan, inputs):
    out = {'seed': MC_SEED, 'runs': inputs['runs'], 'goal_seeking': bool(plan.get('goal_seeking', False))}
    stats = runs.generate_runs(plan, rng=np.random.default_rng(MC_SEED))
    stats['mc_spaghetti_paths'] = stats['mc_spaghetti_paths'][:5]
    out['generate_runs'] = stats
    if out['goal_seeking']:
        spending, srate, searches, y1 = runs.binary_search(plan, rng=np.random.default_rng(MC_SEED))
        out['binary_search'] = {
            'achieved_spending': spending,
            'achieved_success_rate': srate,
            'searches': searches,
            'achieved_spending_y1': y1,
        }
    return out


def dump_stress(plan):
    res = runs.run_historical_stress_test(plan, scenario_key='2000_dotcom', rng=np.random.default_rng(MC_SEED))
    res.pop('scenarios_list', None)
    return res


def dump_plan(path):
    name = path.stem
    out = OUT_DIR / 'plans' / name
    plan = load_plan(path)
    errors = import_plan_data(plan)
    write(out / 'imported.json', {'plan': plan, 'import_errors': errors})

    inputs = runs.extract_sim_inputs(plan)
    write(out / 'inputs.json', inputs)
    write(out / 'numba_inputs.json', runs.prepare_numba_inputs(inputs))
    write(out / 'det_rows.json', runs.run_deterministic(plan))
    write(out / 'kernel.json', dump_kernel(inputs))
    write(out / 'mc.json', dump_mc(plan, inputs))
    write(out / 'stress.json', dump_stress(plan))
    return {'name': name, 'source': path.name, 'import_errors': len(errors),
            'years': inputs['total_years'], 'runs': inputs['runs']}


def dump_functions():
    fn = OUT_DIR / 'functions'
    incomes = [-100.0, 0.0, 1.0, 12400.0, 30000.0, 50400.0, 75000.0, 105700.5, 150000.0,
               256225.0, 400000.0, 640600.0, 1000000.0, 5000000.0]
    statuses = {
        'single': (runs.THRESHOLDS_SINGLE_ARR, runs.LTCG_THRESHOLDS_SINGLE_ARR),
        'joint': (runs.THRESHOLDS_JOINT_ARR, runs.LTCG_THRESHOLDS_JOINT_ARR),
        'hoh': (runs.THRESHOLDS_HOH_ARR, runs.LTCG_THRESHOLDS_HOH_ARR),
    }
    tax_cases = []
    for st, (ord_t, ltcg_t) in statuses.items():
        for inc in incomes:
            tax_cases.append({'fn': 'calculate_tax', 'status': st, 'args': [inc],
                              'out': runs.calculate_tax(inc, ord_t, runs.TAX_RATES_ARR)})
            for pref in [0.0, 5000.0, 60000.0, 700000.0]:
                tax_cases.append({'fn': 'calculate_preferential_tax', 'status': st, 'args': [inc, pref],
                                  'out': runs.calculate_preferential_tax(inc, pref, ltcg_t, runs.LTCG_RATES_ARR)})
                for std in [0.0, 16100.0, 32200.0]:
                    tax_cases.append({'fn': 'njit_calc_fed_tax_dual', 'status': st, 'args': [inc, pref, std],
                                      'out': list(runs.njit_calc_fed_tax_dual(inc, pref, std, ord_t, runs.TAX_RATES_ARR,
                                                                              ltcg_t, runs.LTCG_RATES_ARR))})
        for agi in [0.0, 10000.0, 25000.0, 40000.0, 90000.0, 300000.0]:
            for ss in [0.0, 12000.0, 30000.0, 60000.0]:
                tax_cases.append({'fn': 'calculate_taxable_ss', 'status': st, 'args': [agi, ss],
                                  'out': runs.calculate_taxable_ss(agi, ss, st)})
                code = runs.FILING_STATUS_MAP[st]
                tax_cases.append({'fn': 'njit_calculate_taxable_ss', 'status': st, 'args': [agi, ss, code],
                                  'out': runs.njit_calculate_taxable_ss(agi, ss, code)})
    write(fn / 'tax.json', tax_cases)

    misc = []
    for by in [1940, 1950, 1951, 1955, 1959, 1960, 1990]:
        misc.append({'fn': 'get_rmd_start_age', 'args': [by], 'out': runs.get_rmd_start_age(by)})
    for m in [-1.0, 0.0, 2.5, 3.0, 4.0, 5.5, 7.0, 9.0]:
        misc.append({'fn': 'infer_asset_allocation', 'args': [m], 'out': list(runs.infer_asset_allocation(m))})
    age_types = ['specified', 'age', 'user_specified', 'spouse_specified', 'retirement', 'spouse_retirement',
                 'death', 'spouse_death', 'first_death', 'bogus']
    for at in age_types:
        for married in [False, True]:
            for spec in [70, '72', 'x', None]:
                kw = dict(user_age=60, user_ret_age=65, is_married=married, spouse_age=57, spouse_ret_age=62,
                          user_age_death=90, spouse_age_death=95, default_val=100)
                misc.append({'fn': 'resolve_age', 'args': [at, spec], 'kwargs': kw,
                             'out': runs.resolve_age(at, spec, **kw)})
    for start, n in [(1929, 5), (2000, 10), (2020, 10)]:
        misc.append({'fn': 'get_historical_sequence', 'args': [start, n],
                     'out': historical_data.get_historical_sequence(start, n)})
    write(fn / 'misc.json', misc)

    constants = {
        'RMD_TABLE_ARR': runs.RMD_TABLE_ARR,
        'ASSET_CLASS_CORRELATION': runs.ASSET_CLASS_CORRELATION,
        'ASSET_CLASS_CHOLESKY': runs._ASSET_CLASS_CHOLESKY,
        'HISTORICAL_RETURNS': historical_data.HISTORICAL_RETURNS,
        'CRISIS_SCENARIOS': historical_data.CRISIS_SCENARIOS,
    }
    write(fn / 'constants.json', constants)

    with open(cpi_service.SEED_FILE) as f:
        cpi_data = cpi_service._interpolate_missing_months(json.load(f))
    cpi_cases = []
    for base, ev in [('2020-01-15', '2025-06-01'), ('1913-01-01', None), ('1900-05-01', '2000-01-01'),
                     ('2026-03-10', None), ('2030-01-01', None), ('2024-01-01', '2024-01-31')]:
        cpi_cases.append({'fn': 'calculate_cpi_inflation', 'args': [base, ev],
                          'out': cpi_service.calculate_cpi_inflation(base, ev, cpi_data=cpi_data)})
    for d in ['2026-01-01', '2026-03-15', '2000-12-31']:
        cpi_cases.append({'fn': 'get_prior_month_str', 'args': [d], 'out': cpi_service.get_prior_month_str(d)})
    write(fn / 'cpi.json', cpi_cases)


def main():
    plans = sorted(PLANS_DIR.glob('*.json'))
    index = {
        'generated_with': {'numpy': np.__version__, 'fixture_today': FIXTURE_TODAY.isoformat(),
                           'kernel_seed': KERNEL_SEED, 'mc_seed': MC_SEED, 'kernel_runs': KERNEL_RUNS},
        'plans': [],
    }
    for p in plans:
        print(f'dumping {p.name} ...', flush=True)
        index['plans'].append(dump_plan(p))
    dump_functions()
    write(OUT_DIR / 'index.json', index)
    print(f'wrote fixtures for {len(plans)} plans to {OUT_DIR.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
