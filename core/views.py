import copy
import json
from core.runs import generate_runs, binary_search, run_deterministic
from core.models import SimulationData
from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.urls import reverse

import numpy as np

# Helper to get float with fallback
def get_float(val, default=0.0):
    try:
        if isinstance(val, str):
            val = val.replace('$', '').replace('%', '').replace(',', '').strip()
        return float(val)
    except (TypeError, ValueError):
        return default

# Helper to get int with fallback
def get_int(val, default=0):
    try:
        if isinstance(val, str):
            val = val.replace('$', '').replace('%', '').replace(',', '').strip()
        return int(float(val))
    except (TypeError, ValueError):
        return default

# Helper to get bool with fallback
def get_bool(val):
    if val in ['on', 'true', 'True', True]:
        return True
    return False

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
        'inflation_rate': 2.5,
        'runs': 1000,
        'target_success_rate': 80.0,
        'pretax_assets': {
            'present_balance': 500000.0,
            'contrib_amount': 5000.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0
        },
        'roth_assets': {
            'present_balance': 100000.0,
            'contrib_amount': 2000.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0
        },
        'taxable_assets': {
            'present_balance': 200000.0,
            'contrib_amount': 1000.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 5.0,
            'return_std': 8.0
        },
        'hsa_assets': {
            'present_balance': 20000.0,
            'contrib_amount': 1000.0,
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
        'income_sources': []
    }

def get_session_sim_data(request):
    if 'simulation_data' not in request.session or not request.session['simulation_data']:
        request.session['simulation_data'] = get_default_data()
        request.session['data_version'] = 1
        request.session['cached_results'] = None
        request.session['cached_version'] = -1
    return request.session['simulation_data']

@require_http_methods(["GET", "POST"])
def clear_data_view(request):
    request.session['simulation_data'] = get_default_data()
    request.session['data_version'] = request.session.get('data_version', 0) + 1
    request.session['cached_results'] = None
    request.session['cached_version'] = -1
    messages.success(request, "All simulation data has been cleared.")
    return redirect(reverse('enter'))

@require_http_methods(["POST"])
def load_plan_view(request):
    raw_json = request.POST.get('json_data')
    if not raw_json:
        messages.error(request, "No plan data provided.")
        return redirect(reverse('results'))
    
    try:
        data = json.loads(raw_json)
        if not isinstance(data, dict):
            raise ValueError("Invalid JSON format")
            
        if 'goal_seeking' not in data and 'simulation_type' in data:
            data['goal_seeking'] = (data['simulation_type'] == 'goal_seeking')
        elif 'simulation_type' not in data and 'goal_seeking' in data:
            data['simulation_type'] = 'goal_seeking' if data['goal_seeking'] else 'regular'

        request.session['simulation_data'] = data
        request.session['data_version'] = request.session.get('data_version', 0) + 1
        request.session['cached_results'] = None
        request.session['cached_version'] = -1
        SimulationData.objects.create(data=data)
        messages.success(request, "Plan loaded successfully!")
    except Exception as e:
        messages.error(request, f"Error loading plan: {str(e)}")
        
    return redirect(reverse('results'))

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
        data['target_success_rate'] = min(99.0, max(1.0, target_rate))

    request.session['simulation_data'] = data
    request.session['data_version'] = request.session.get('data_version', 0) + 1
    request.session['cached_results'] = None
    request.session['cached_version'] = -1
    
    mode_label = "Goal-Seeking Simulation" if is_goal else "Regular Simulation"
    messages.success(request, f"Simulation mode updated to {mode_label}.")
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
        runs = get_int(request.POST.get('runs'), 1000)
        raw_target_srate = get_float(request.POST.get('target_success_rate'), 80.0)
        target_success_rate = min(99.0, max(1.0, raw_target_srate))
        
        # Assets (Pretax, Roth, Taxable, HSA)
        pretax_assets = {
            'present_balance': get_float(request.POST.get('pretax_present_balance'), 500000.0),
            'contrib_amount': get_float(request.POST.get('pretax_contrib_amount'), 0.0),
            'contrib_freq': request.POST.get('pretax_contrib_freq', 'annual'),
            'contrib_start_age': max(min_start_age, get_int(request.POST.get('pretax_contrib_start_age'), user_age)),
            'contrib_end_age_type': request.POST.get('pretax_contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': get_int(request.POST.get('pretax_contrib_end_age_specified'), user_retirement_age),
            'contrib_adjust_inflation': get_bool(request.POST.get('pretax_contrib_adjust_inflation')),
            'return_mean': get_float(request.POST.get('pretax_return_mean'), 6.0),
            'return_std': get_float(request.POST.get('pretax_return_std'), 10.0),
        }
        
        roth_assets = {
            'present_balance': get_float(request.POST.get('roth_present_balance'), 0.0),
            'contrib_amount': get_float(request.POST.get('roth_contrib_amount'), 0.0),
            'contrib_freq': request.POST.get('roth_contrib_freq', 'annual'),
            'contrib_start_age': max(min_start_age, get_int(request.POST.get('roth_contrib_start_age'), user_age)),
            'contrib_end_age_type': request.POST.get('roth_contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': get_int(request.POST.get('roth_contrib_end_age_specified'), user_retirement_age),
            'contrib_adjust_inflation': get_bool(request.POST.get('roth_contrib_adjust_inflation')),
            'return_mean': get_float(request.POST.get('roth_return_mean'), 6.0),
            'return_std': get_float(request.POST.get('roth_return_std'), 10.0),
        }
        
        taxable_assets = {
            'present_balance': get_float(request.POST.get('taxable_present_balance'), 100000.0),
            'contrib_amount': get_float(request.POST.get('taxable_contrib_amount'), 0.0),
            'contrib_freq': request.POST.get('taxable_contrib_freq', 'annual'),
            'contrib_start_age': max(min_start_age, get_int(request.POST.get('taxable_contrib_start_age'), user_age)),
            'contrib_end_age_type': request.POST.get('taxable_contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': get_int(request.POST.get('taxable_contrib_end_age_specified'), user_retirement_age),
            'contrib_adjust_inflation': get_bool(request.POST.get('taxable_contrib_adjust_inflation')),
            'return_mean': get_float(request.POST.get('taxable_return_mean'), 5.0),
            'return_std': get_float(request.POST.get('taxable_return_std'), 8.0),
        }
        
        hsa_assets = {
            'present_balance': get_float(request.POST.get('hsa_present_balance'), 0.0),
            'contrib_amount': get_float(request.POST.get('hsa_contrib_amount'), 0.0),
            'contrib_freq': request.POST.get('hsa_contrib_freq', 'annual'),
            'contrib_start_age': max(min_start_age, get_int(request.POST.get('hsa_contrib_start_age'), user_age)),
            'contrib_end_age_type': request.POST.get('hsa_contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': get_int(request.POST.get('hsa_contrib_end_age_specified'), user_retirement_age),
            'contrib_adjust_inflation': get_bool(request.POST.get('hsa_contrib_adjust_inflation')),
            'return_mean': get_float(request.POST.get('hsa_return_mean'), 5.0),
            'return_std': get_float(request.POST.get('hsa_return_std'), 8.0),
            'hsa_for_medical': get_bool(request.POST.get('hsa_for_medical')),
        }
        
        # Additional Spending Lists
        additional_spending = []
        add_names = request.POST.getlist('add_spending_name[]')
        add_amounts = request.POST.getlist('add_spending_amount[]')
        add_start_ages = request.POST.getlist('add_spending_start_age[]')
        add_intervals = request.POST.getlist('add_spending_interval[]')
        add_inflation_flags = request.POST.getlist('add_spending_adjust_inflation[]')
        
        for i in range(len(add_amounts)):
            try:
                name_val = add_names[i].strip() if i < len(add_names) and add_names[i] else "Additional Expense"
                additional_spending.append({
                    'name': name_val,
                    'amount': get_float(add_amounts[i]),
                    'start_age': get_int(add_start_ages[i]),
                    'interval': get_int(add_intervals[i]),
                    'adjust_inflation': add_inflation_flags[i] == 'true'
                })
            except IndexError:
                pass
                
        # Income Sources List
        income_sources = []
        inc_names = request.POST.getlist('income_name[]')
        inc_amounts = request.POST.getlist('income_amount[]')
        inc_freqs = request.POST.getlist('income_frequency[]')
        inc_start_types = request.POST.getlist('income_start_age_type[]')
        inc_start_specs = request.POST.getlist('income_start_age_specified[]')
        inc_end_types = request.POST.getlist('income_end_age_type[]')
        inc_end_specs = request.POST.getlist('income_end_age_specified[]')
        inc_subj_taxes = request.POST.getlist('income_subject_to_tax[]')
        inc_is_ss_list = request.POST.getlist('income_is_ss[]')
        inc_adj_types = request.POST.getlist('income_adjust_type[]')
        inc_adj_vals = request.POST.getlist('income_adjust_val[]')
        
        for i in range(len(inc_names)):
            try:
                freq = inc_freqs[i] if i < len(inc_freqs) else 'monthly'
                income_sources.append({
                    'name': inc_names[i],
                    'amount': get_float(inc_amounts[i]),
                    'frequency': freq,
                    'start_age_type': inc_start_types[i],
                    'start_age_specified': get_int(inc_start_specs[i]),
                    'end_age_type': inc_end_types[i],
                    'end_age_specified': get_int(inc_end_specs[i]),
                    'subject_to_tax': inc_subj_taxes[i] == 'true',
                    'is_social_security': inc_is_ss_list[i] == 'true',
                    'adjust_type': inc_adj_types[i],
                    'adjust_val': get_float(inc_adj_vals[i])
                })
            except IndexError:
                pass
                
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
            validation_errors.append("Target Success Rate must be between 1% and 99% for Goal-Seeking simulation.")
            
        if user_age < 18 or user_age > 120:
            validation_errors.append("User's Present Age must be an integer between 18 and 120.")
        if user_retirement_age < user_age or user_retirement_age > 120:
            validation_errors.append(f"User's Retirement Age must be between User's Present Age ({user_age}) and 120.")
        if user_age_death <= user_age or user_age_death > 120:
            validation_errors.append(f"User's Age at Death must be an integer greater than User's Present Age ({user_age}) up to 120.")
            
        if is_married:
            if spouse_age < 18 or spouse_age > 120:
                validation_errors.append("Spouse's Present Age must be an integer between 18 and 120.")
            if spouse_retirement_age < spouse_age or spouse_retirement_age > 120:
                validation_errors.append(f"Spouse's Retirement Age must be between Spouse's Present Age ({spouse_age}) and 120.")
            if spouse_age_death <= spouse_age or spouse_age_death > 120:
                validation_errors.append(f"Spouse's Age at Death must be an integer greater than Spouse's Present Age ({spouse_age}) up to 120.")
                
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
            'pretax_assets': pretax_assets,
            'roth_assets': roth_assets,
            'taxable_assets': taxable_assets,
            'hsa_assets': hsa_assets,
            'additional_spending': additional_spending,
            'income_sources': income_sources
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
        messages.success(request, "Simulation data saved successfully!")
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
    roth_bal = data.get('roth_assets', {}).get('present_balance', 0.0)
    taxable_bal = data.get('taxable_assets', {}).get('present_balance', 0.0)
    hsa_bal = data.get('hsa_assets', {}).get('present_balance', 0.0)
    total_initial_wealth = pretax_bal + roth_bal + taxable_bal + hsa_bal
    
    results = {
        "goal_seeking": is_goal_seeking,
        "initial_wealth": total_initial_wealth,
        "years": len(det_rows),
        "runs": data.get('runs', 100),
        "inflation_rate": data.get('inflation_rate', 2.5),
        "desired_spending": data.get('desired_spending', 40000.0),
        "target_success_rate": data.get('target_success_rate', 80.0),
        "user_age_death": data.get('user_age_death', 90),
        "spouse_age_death": data.get('spouse_age_death', 90),
        "is_married": data.get('is_married', False),
        "det_rows": det_rows,
        "pretax_assets": data.get('pretax_assets', {}),
        "roth_assets": data.get('roth_assets', {}),
        "taxable_assets": data.get('taxable_assets', {}),
        "hsa_assets": data.get('hsa_assets', {}),
        "plan_data_json": json.dumps(data, indent=4)
    }
    
    if not is_goal_seeking:
        mc_stats = generate_runs(sim_input)
        results.update(mc_stats)
    else:
        achieved_spending, achieved_success_rate, searches, achieved_spending_y1 = binary_search(sim_input)
        results.update({
            "target_success_rate": data.get('target_success_rate', 80.0),
            "achieved_spending": achieved_spending,
            "achieved_success_rate": achieved_success_rate,
            "searches": searches,
            "achieved_spending_y1": achieved_spending_y1
        })
        
    request.session['cached_results'] = results
    request.session['cached_version'] = data_ver
    return render(request, 'results.html', results)