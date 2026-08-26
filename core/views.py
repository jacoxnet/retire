import json
from core.runs import generate_runs, binary_search, run_deterministic
from core.models import SimulationData
from core.forms import (
    get_float, get_int, get_bool,
    aggregate_accounts, flat_assets_to_accounts,
    parse_account_rows, parse_legacy_accounts,
    parse_additional_spending, parse_income_sources, parse_other_taxes,
    validate_accounts, validate_additional_spending, validate_scheduled_items,
)
from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.urls import reverse

import numpy as np

def get_default_data():
    return {
        'goal_seeking': False,
        'user_name': 'John Doe',
        'user_age': 60,
        'user_retirement_age': 65,
        'user_age_death': 90,
        'is_married': False,
        'spouse_name': 'Jane Doe',
        'spouse_age': 60,
        'spouse_retirement_age': 65,
        'spouse_age_death': 90,
        'filing_status': 'single',
        'current_year': 2026,
        'begin_spending_age_type': 'retirement',
        'begin_spending_age_specified': 65,
        'desired_spending': 40000.0,
        'survivor_spending': 40000.0,
        'adjust_spending_inflation': True,
        'inflation_rate': 3.5,
        'runs': 10000,
        'target_success_rate': 80.0,
        'social_security': {
            'user_entitled': True,
            'user_amount': 2500.0,
            'user_freq': 'monthly',
            'user_start_age': 67,
            'spouse_entitled': False,
            'spouse_amount': 0.0,
            'spouse_freq': 'monthly',
            'spouse_start_age': 67,
        },
        'accounts': [],
        'pretax_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0
        },
        'spouse_pretax_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'spouse_retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0
        },
        'roth_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0
        },
        'taxable_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 5.0,
            'return_std': 8.0
        },
        'hsa_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 5.0,
            'return_std': 8.0,
            'hsa_for_medical': True
        },
        'spouse_hsa_assets': {
            'present_balance': 0.0,
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 5.0,
            'return_std': 8.0,
            'hsa_for_medical': True
        },
        'additional_spending': [],
        'income_sources': [],
        'other_taxes': [],
        'state_tax_rate': 0.0,
        'state_ss_exempt': True
    }

def get_session_sim_data(request):
    if 'simulation_data' not in request.session or not request.session['simulation_data']:
        request.session['simulation_data'] = get_default_data()
        request.session['data_version'] = 1
        request.session['cached_results'] = None
        request.session['cached_version'] = -1
    return request.session['simulation_data']

@require_http_methods(["GET"])
def manage_data_view(request):
    data = get_session_sim_data(request)
    return render(request, 'manage_data.html', {
        'plan_data_json': data
    })

@require_http_methods(["GET", "POST"])
def clear_data_view(request):
    request.session['simulation_data'] = get_default_data()
    request.session['data_version'] = request.session.get('data_version', 0) + 1
    request.session['cached_results'] = None
    request.session['cached_version'] = -1
    messages.success(request, "All simulation data has been cleared.")
    next_url = request.POST.get('next') or request.GET.get('next')
    if next_url:
        return redirect(reverse(next_url))
    return redirect(reverse('enter'))

@require_http_methods(["POST"])
def load_plan_view(request):
    raw_json = request.POST.get('json_data')
    redirect_target = request.POST.get('next', 'results')
    if not raw_json:
        messages.error(request, "No plan data provided.")
        return redirect(reverse(redirect_target))
    
    try:
        data = json.loads(raw_json)
        if not isinstance(data, dict):
            raise ValueError("Invalid JSON format")
            
        if 'goal_seeking' not in data and 'simulation_type' in data:
            data['goal_seeking'] = (data['simulation_type'] == 'goal_seeking')
        elif 'simulation_type' not in data and 'goal_seeking' in data:
            data['simulation_type'] = 'goal_seeking' if data['goal_seeking'] else 'regular'

        if data.get('accounts') and isinstance(data['accounts'], list):
            agg = aggregate_accounts(
                data['accounts'],
                data.get('user_age', 60),
                data.get('user_retirement_age', 65),
                data.get('user_age_death', 90),
                data.get('is_married', False),
                data.get('spouse_age', 60),
                data.get('spouse_retirement_age', 65),
                data.get('spouse_age_death', 90)
            )
            for k, v in agg.items():
                data[k] = v
        else:
            data['accounts'] = flat_assets_to_accounts(data, data.get('is_married', False))

        request.session['simulation_data'] = data
        request.session['data_version'] = request.session.get('data_version', 0) + 1
        request.session['cached_results'] = None
        request.session['cached_version'] = -1
        SimulationData.objects.create(data=data)
        messages.success(request, "Plan loaded successfully!")
    except Exception as e:
        messages.error(request, f"Error loading plan: {str(e)}")
        
    return redirect(reverse(redirect_target))

@require_http_methods(["POST"])
def change_mode_view(request):
    sim_type = request.POST.get('simulation_type', 'regular')
    is_goal = (sim_type == 'goal_seeking')
    
    session_data = get_session_sim_data(request)
    data = session_data if isinstance(session_data, dict) else session_data.to_dict()
        
    data['simulation_type'] = 'goal_seeking' if is_goal else 'regular'
    data['goal_seeking'] = is_goal
    
    if is_goal:
        target_rate = get_float(request.POST.get('target_success_rate'), data.get('target_success_rate', 80.0))
        if target_rate < 1.0 or target_rate > 99.0:
            messages.error(request, "Target Success Rate must be between 1% and 99% for Maximum Spending simulation.")
            data['target_success_rate'] = min(99.0, max(1.0, target_rate))
        else:
            data['target_success_rate'] = target_rate

    # Input adjustments from Simulation Inputs card sliders/steppers
    if 'desired_spending' in request.POST:
        data['desired_spending'] = get_float(request.POST.get('desired_spending'), data.get('desired_spending', 40000.0))
    if 'inflation_rate' in request.POST:
        data['inflation_rate'] = get_float(request.POST.get('inflation_rate'), data.get('inflation_rate', 2.5))
    if 'runs' in request.POST:
        runs_val = get_int(request.POST.get('runs'), data.get('runs', 10000))
        if runs_val < 1 or runs_val > 100000:
            messages.error(request, "Number of Simulations must be an integer between 1 and 100,000.")
            data['runs'] = min(100000, max(1, runs_val))
        else:
            data['runs'] = runs_val
    if 'user_age_death' in request.POST:
        data['user_age_death'] = get_int(request.POST.get('user_age_death'), data.get('user_age_death', 90))
    if 'spouse_age_death' in request.POST:
        data['spouse_age_death'] = get_int(request.POST.get('spouse_age_death'), data.get('spouse_age_death', 90))

    # Asset return updates
    for prefix in ['pretax', 'spouse_pretax', 'roth', 'taxable', 'hsa', 'spouse_hsa']:
        key = f'{prefix}_return_mean'
        if key in request.POST:
            if prefix + '_assets' not in data or not isinstance(data[prefix + '_assets'], dict):
                data[prefix + '_assets'] = {}
            data[prefix + '_assets']['return_mean'] = get_float(request.POST.get(key), data[prefix + '_assets'].get('return_mean', 5.0))

    request.session['simulation_data'] = data
    request.session['data_version'] = request.session.get('data_version', 0) + 1
    request.session['cached_results'] = None
    request.session['cached_version'] = -1
    
    messages.success(request, "Simulation inputs updated and simulation re-run.")
    return redirect(reverse('results'))

@require_http_methods(["GET", "POST"])
def enter_view(request):
    if request.method == "POST":
        simulation_type = request.POST.get('simulation_type', 'regular')
        
        # Demographics
        user_name = request.POST.get('user_name', 'User')
        user_age = get_int(request.POST.get('user_age'), 60)
        user_retirement_age = get_int(request.POST.get('user_retirement_age'), 65)
        user_age_death = get_int(request.POST.get('user_age_death'), 90)
        
        is_married = get_bool(request.POST.get('is_married'))
        spouse_name = request.POST.get('spouse_name', 'Spouse') if is_married else ""
        spouse_age = get_int(request.POST.get('spouse_age'), 60) if is_married else 0
        spouse_retirement_age = get_int(request.POST.get('spouse_retirement_age'), 65) if is_married else 0
        spouse_age_death = get_int(request.POST.get('spouse_age_death'), 92) if is_married else 0
        
        min_start_age = min(user_age, spouse_age) if is_married else user_age
        
        filing_status = request.POST.get('filing_status', 'single')
        if not is_married and filing_status == 'joint':
            filing_status = 'single'
            
        current_year = get_int(request.POST.get('current_year'), 2026)
        
        begin_spending_age_type = request.POST.get('begin_spending_age_type', 'retirement')
        if not is_married and begin_spending_age_type == 'spouse_retirement':
            begin_spending_age_type = 'retirement'
        begin_spending_age_specified = get_int(request.POST.get('begin_spending_age_specified'), 65)
        
        desired_spending = get_float(request.POST.get('desired_spending'), 40000.0)
        survivor_spending = get_float(request.POST.get('survivor_spending'), desired_spending) if is_married else 0.0
        adjust_spending_inflation = get_bool(request.POST.get('adjust_spending_inflation'))
        
        inflation_rate = get_float(request.POST.get('inflation_rate'), 2.5)
        session_data = get_session_sim_data(request)
        runs = get_int(request.POST.get('runs'), session_data.get('runs', 10000) if isinstance(session_data, dict) else getattr(session_data, 'runs', 10000))
        curr_target_srate = session_data.get('target_success_rate', 80.0) if isinstance(session_data, dict) else getattr(session_data, 'target_success_rate', 80.0)
        raw_target_srate = get_float(request.POST.get('target_success_rate'), curr_target_srate)
        target_success_rate = min(99.0, max(1.0, raw_target_srate))
        state_tax_rate = get_float(request.POST.get('state_tax_rate'), 0.0)
        state_ss_exempt = get_bool(request.POST.get('state_ss_exempt'))

        # Dedicated Social Security
        user_ss_entitled = request.POST.get('user_ss_entitled') == 'true' if request.POST.get('user_ss_entitled') is not None else True
        user_ss_amount = get_float(request.POST.get('user_ss_amount'), 2500.0)
        user_ss_freq = request.POST.get('user_ss_freq', 'monthly')
        user_ss_start_age = get_int(request.POST.get('user_ss_start_age'), 67)

        spouse_ss_entitled = request.POST.get('spouse_ss_entitled') == 'true' if is_married else False
        spouse_ss_amount = get_float(request.POST.get('spouse_ss_amount'), 0.0) if is_married else 0.0
        spouse_ss_freq = request.POST.get('spouse_ss_freq', 'monthly')
        spouse_ss_start_age = get_int(request.POST.get('spouse_ss_start_age'), 67) if is_married else 67

        social_security = {
            'user_entitled': user_ss_entitled,
            'user_amount': user_ss_amount,
            'user_freq': user_ss_freq,
            'user_start_age': user_ss_start_age,
            'spouse_entitled': spouse_ss_entitled,
            'spouse_amount': spouse_ss_amount,
            'spouse_freq': spouse_ss_freq,
            'spouse_start_age': spouse_ss_start_age,
        }
        
        # Accounts: dynamic account_name[] rows, falling back to the older flat
        # per-category fields (pretax_present_balance, roth_contrib_amount, ...).
        if request.POST.getlist('account_name[]'):
            accounts = parse_account_rows(
                request.POST, user_age, user_retirement_age, is_married,
                spouse_age, spouse_retirement_age, min_start_age
            )
        else:
            accounts = parse_legacy_accounts(
                request.POST, user_age, user_retirement_age, is_married,
                spouse_age, spouse_retirement_age, min_start_age
            )

        agg = aggregate_accounts(accounts, user_age, user_retirement_age, user_age_death, is_married, spouse_age, spouse_retirement_age, spouse_age_death)
        pretax_assets = agg['pretax_assets']
        spouse_pretax_assets = agg['spouse_pretax_assets']
        roth_assets = agg['roth_assets']
        taxable_assets = agg['taxable_assets']
        hsa_assets = agg['hsa_assets']
        spouse_hsa_assets = agg['spouse_hsa_assets']

        additional_spending = parse_additional_spending(request.POST)
        income_sources = parse_income_sources(request.POST)
        other_taxes = parse_other_taxes(request.POST)

        is_goal_seeking = (simulation_type == 'goal_seeking')
        
        # Validation checks
        validation_errors = []
        raw_runs = request.POST.get('runs')
        try:
            runs_val = int(raw_runs)
            if runs_val < 1 or runs_val > 100000:
                validation_errors.append("Number of Simulations must be an integer between 1 and 100,000.")
        except (TypeError, ValueError):
            validation_errors.append("Number of Simulations must be a valid number between 1 and 100,000.")
            
        if is_goal_seeking and (raw_target_srate < 1.0 or raw_target_srate > 99.0):
            validation_errors.append("Target Success Rate must be between 1% and 99% for Maximum Spending simulation.")
            
        if user_age < 18 or user_age > 120:
            validation_errors.append("Your Present Age must be an integer between 18 and 120.")
        if user_retirement_age < user_age or user_retirement_age > 120:
            validation_errors.append(f"Your Retirement Age must be between Your Present Age ({user_age}) and 120.")
        if user_age_death <= user_age or user_age_death > 120:
            validation_errors.append(f"Your Age at Death must be an integer greater than Your Present Age ({user_age}) up to 120.")
            
        if is_married:
            if spouse_age < 18 or spouse_age > 120:
                validation_errors.append("Spouse's Present Age must be an integer between 18 and 120.")
            if spouse_retirement_age < spouse_age or spouse_retirement_age > 120:
                validation_errors.append(f"Spouse's Retirement Age must be between Spouse's Present Age ({spouse_age}) and 120.")
            if spouse_age_death <= spouse_age or spouse_age_death > 120:
                validation_errors.append(f"Spouse's Age at Death must be an integer greater than Spouse's Present Age ({spouse_age}) up to 120.")
            if survivor_spending < 0:
                validation_errors.append("Amount of Regular Retirement Spending for Surviving Spouse must be a valid non-negative number.")

        if begin_spending_age_type == 'specified':
            if begin_spending_age_specified < user_age or begin_spending_age_specified > user_age_death:
                validation_errors.append(f"Specified Spending Start Age ({begin_spending_age_specified}) must be between Your Present Age ({user_age}) and Your Age at Death ({user_age_death}).")

        if desired_spending < 0:
            validation_errors.append("Desired Annual Spending must be a valid non-negative number.")

        if state_tax_rate < 0.0 or state_tax_rate > 100.0:
            validation_errors.append("State Income Tax Rate must be between 0% and 100%.")

        if user_ss_entitled:
            if user_ss_start_age < 62 or user_ss_start_age > 70:
                validation_errors.append("Your Social Security Claiming Age must be between 62 and 70.")
        if is_married and spouse_ss_entitled:
            if spouse_ss_start_age < 62 or spouse_ss_start_age > 70:
                validation_errors.append("Spouse's Social Security Claiming Age must be between 62 and 70.")

        # Accounts are validated once, whichever path (dynamic or legacy fields)
        # produced them; the derived pretax/roth/taxable/hsa aggregates below are
        # views over the same accounts, so they don't need a second validation pass.
        validation_errors.extend(validate_accounts(accounts, user_age, user_age_death, is_married, spouse_age, spouse_age_death))
        validation_errors.extend(validate_additional_spending(additional_spending, user_age, user_age_death))
        validation_errors.extend(validate_scheduled_items("Income Source", income_sources))
        validation_errors.extend(validate_scheduled_items("Other Tax item", other_taxes))
                
        # Store in JSON block
        data_block = {
            'goal_seeking': is_goal_seeking,
            'user_name': user_name,
            'user_age': user_age,
            'user_retirement_age': user_retirement_age,
            'user_age_death': user_age_death,
            'is_married': is_married,
            'spouse_name': spouse_name,
            'spouse_age': spouse_age,
            'spouse_retirement_age': spouse_retirement_age,
            'spouse_age_death': spouse_age_death,
            'filing_status': filing_status,
            'current_year': current_year,
            'begin_spending_age_type': begin_spending_age_type,
            'begin_spending_age_specified': begin_spending_age_specified,
            'desired_spending': desired_spending,
            'survivor_spending': survivor_spending,
            'adjust_spending_inflation': adjust_spending_inflation,
            'inflation_rate': inflation_rate,
            'runs': runs,
            'target_success_rate': raw_target_srate if is_goal_seeking else target_success_rate,
            'state_tax_rate': state_tax_rate,
            'state_ss_exempt': state_ss_exempt,
            'social_security': social_security,
            'accounts': accounts,
            'pretax_assets': pretax_assets,
            'spouse_pretax_assets': spouse_pretax_assets,
            'roth_assets': roth_assets,
            'taxable_assets': taxable_assets,
            'hsa_assets': hsa_assets,
            'spouse_hsa_assets': spouse_hsa_assets,
            'additional_spending': additional_spending,
            'income_sources': income_sources,
            'other_taxes': other_taxes
        }
        
        if validation_errors:
            for err in validation_errors:
                messages.error(request, err)
            data_block['target_success_rate_error'] = is_goal_seeking and (raw_target_srate < 1.0 or raw_target_srate > 99.0)
            data_block['runs_error'] = (runs < 1 or runs > 100000)
            request.session['simulation_data'] = data_block
            return render(request, 'enter.html', data_block)
            
        request.session['simulation_data'] = data_block
        request.session['data_version'] = request.session.get('data_version', 0) + 1
        SimulationData.objects.create(data=data_block)
        return redirect(reverse('results'))
    else:
        if request.GET.get('new_session') == '1' or request.GET.get('reset') == '1':
            request.session['simulation_data'] = get_default_data()
            request.session['data_version'] = request.session.get('data_version', 0) + 1
            request.session['cached_results'] = None
            request.session['cached_version'] = -1
            messages.success(request, "New session started. Simulation data reset to default values.")
            return redirect(reverse('enter'))
        data = get_session_sim_data(request)
        return render(request, 'enter.html', data)

@require_http_methods(["GET"])
def results_view(request):
    sim_input = get_session_sim_data(request)
    data = sim_input if isinstance(sim_input, dict) else sim_input.to_dict()
    
    data_ver = request.session.get('data_version', 1)
    cached_ver = request.session.get('cached_version', -1)
    cached_res = request.session.get('cached_results')
    
    if cached_ver == data_ver and cached_res is not None:
        return render(request, 'results.html', cached_res)

    is_goal_seeking = data.get('goal_seeking', False)
    det_rows = run_deterministic(sim_input)
    
    pretax_bal = data.get('pretax_assets', {}).get('present_balance', 0.0)
    spouse_pretax_bal = data.get('spouse_pretax_assets', {}).get('present_balance', 0.0) if data.get('is_married') else 0.0
    roth_bal = data.get('roth_assets', {}).get('present_balance', 0.0)
    taxable_bal = data.get('taxable_assets', {}).get('present_balance', 0.0)
    hsa_bal = data.get('hsa_assets', {}).get('present_balance', 0.0)
    spouse_hsa_bal = data.get('spouse_hsa_assets', {}).get('present_balance', 0.0) if data.get('is_married') else 0.0
    total_initial_wealth = pretax_bal + spouse_pretax_bal + roth_bal + taxable_bal + hsa_bal + spouse_hsa_bal
    
    results = {
        "goal_seeking": is_goal_seeking,
        "initial_wealth": total_initial_wealth,
        "years": len(det_rows),
        "runs": data.get('runs', 10000),
        "inflation_rate": data.get('inflation_rate', 2.5),
        "desired_spending": data.get('desired_spending', 40000.0),
        "target_success_rate": data.get('target_success_rate', 80.0),
        "user_age_death": data.get('user_age_death', 90),
        "spouse_age_death": data.get('spouse_age_death', 90),
        "is_married": data.get('is_married', False),
        "det_rows": det_rows,
        "pretax_assets": data.get('pretax_assets', {}),
        "spouse_pretax_assets": data.get('spouse_pretax_assets', {}),
        "roth_assets": data.get('roth_assets', {}),
        "taxable_assets": data.get('taxable_assets', {}),
        "hsa_assets": data.get('hsa_assets', {}),
        "spouse_hsa_assets": data.get('spouse_hsa_assets', {}),
        "plan_data_json": data
    }
    
    if not is_goal_seeking:
        mc_stats = generate_runs(sim_input)
        results.update(mc_stats)
    else:
        achieved_spending, achieved_success_rate, searches, achieved_spending_y1 = binary_search(sim_input)
        mc_stats = generate_runs(sim_input, test_spending=achieved_spending)
        results.update(mc_stats)
        results.update({
            "target_success_rate": data.get('target_success_rate', 80.0),
            "achieved_spending": achieved_spending,
            "achieved_success_rate": achieved_success_rate,
            "searches": searches,
            "achieved_spending_y1": achieved_spending_y1
        })

    from core.runs import run_historical_stress_test
    from core.historical_data import CRISIS_SCENARIOS

    stress_test_data = run_historical_stress_test(sim_input, scenario_key='2000_dotcom')
    results['stress_test'] = stress_test_data
    results['scenarios_list'] = CRISIS_SCENARIOS

    request.session['cached_results'] = results
    request.session['cached_version'] = data_ver
    return render(request, 'results.html', results)


@require_http_methods(["GET", "POST"])
def stress_test_api(request):
    from django.http import JsonResponse
    from core.runs import run_historical_stress_test

    sim_input = get_session_sim_data(request)
    params = request.POST if request.method == "POST" else request.GET

    scenario_key = params.get('scenario_key', '2000_dotcom')
    allocation = params.get('asset_allocation', 'matched')
    timing = params.get('crisis_timing', 'retirement')

    res = run_historical_stress_test(sim_input, scenario_key=scenario_key, asset_allocation=allocation, crisis_timing=timing)
    return JsonResponse(res)