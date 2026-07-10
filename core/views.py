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
        return float(val)
    except (TypeError, ValueError):
        return default

# Helper to get int with fallback
def get_int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default

# Helper to get bool with fallback
def get_bool(val):
    if val in ['on', 'true', 'True', True]:
        return True
    return False

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
        spouse_name = request.POST.get('spouse_name', 'Spouse')
        spouse_age = get_int(request.POST.get('spouse_age'), 60)
        spouse_retirement_age = get_int(request.POST.get('spouse_retirement_age'), 65)
        spouse_age_death = get_int(request.POST.get('spouse_age_death'), 92)
        
        filing_status = request.POST.get('filing_status', 'single')
        current_year = get_int(request.POST.get('current_year'), 2026)
        
        begin_spending_age_type = request.POST.get('begin_spending_age_type', 'retirement')
        begin_spending_age_specified = get_int(request.POST.get('begin_spending_age_specified'), 65)
        
        desired_spending = get_float(request.POST.get('desired_spending'), 40000.0)
        survivor_spending = get_float(request.POST.get('survivor_spending'), desired_spending)
        adjust_spending_inflation = get_bool(request.POST.get('adjust_spending_inflation'))
        
        inflation_rate = get_float(request.POST.get('inflation_rate'), 2.5)
        runs = get_int(request.POST.get('runs'), 100)
        target_success_rate = get_float(request.POST.get('target_success_rate'), 80.0)
        
        # Assets (Pretax, Roth, Taxable, HSA)
        pretax_assets = {
            'present_balance': get_float(request.POST.get('pretax_present_balance'), 500000.0),
            'contrib_amount': get_float(request.POST.get('pretax_contrib_amount'), 0.0),
            'contrib_freq': request.POST.get('pretax_contrib_freq', 'annual'),
            'contrib_start_age': get_int(request.POST.get('pretax_contrib_start_age'), user_age),
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
            'contrib_start_age': get_int(request.POST.get('roth_contrib_start_age'), user_age),
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
            'contrib_start_age': get_int(request.POST.get('taxable_contrib_start_age'), user_age),
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
            'contrib_start_age': get_int(request.POST.get('hsa_contrib_start_age'), user_age),
            'contrib_end_age_type': request.POST.get('hsa_contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': get_int(request.POST.get('hsa_contrib_end_age_specified'), user_retirement_age),
            'contrib_adjust_inflation': get_bool(request.POST.get('hsa_contrib_adjust_inflation')),
            'return_mean': get_float(request.POST.get('hsa_return_mean'), 5.0),
            'return_std': get_float(request.POST.get('hsa_return_std'), 8.0),
            'hsa_for_medical': get_bool(request.POST.get('hsa_for_medical')),
        }
        
        # Additional Spending Lists
        additional_spending = []
        add_amounts = request.POST.getlist('add_spending_amount[]')
        add_start_ages = request.POST.getlist('add_spending_start_age[]')
        add_intervals = request.POST.getlist('add_spending_interval[]')
        add_inflation_flags = request.POST.getlist('add_spending_adjust_inflation[]')
        
        for i in range(len(add_amounts)):
            try:
                additional_spending.append({
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
                income_sources.append({
                    'name': inc_names[i],
                    'amount': get_float(inc_amounts[i]),
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
                
        # Store in JSON block
        data_block = {
            'goal_seeking': simulation_type == 'goal_seeking',
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
            'target_success_rate': target_success_rate,
            'pretax_assets': pretax_assets,
            'roth_assets': roth_assets,
            'taxable_assets': taxable_assets,
            'hsa_assets': hsa_assets,
            'additional_spending': additional_spending,
            'income_sources': income_sources
        }
        
        SimulationData.objects.create(data=data_block)
        messages.success(request, "Simulation data saved successfully!")
        return redirect(reverse('enter'))
    else:
        # GET request
        sim_input = SimulationData.objects.last()
        if not sim_input:
            # Create a default dict to load into the template
            default_data = {
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
                'runs': 100,
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
            sim_input = SimulationData.objects.create(data=default_data)
        
        data = sim_input.to_dict()
    return render(request, 'enter.html', data)

@require_http_methods(["GET"])
def results_view(request):
    sim_input = SimulationData.objects.last()
    if not sim_input:
        messages.error(request, "No simulation data found. Please enter data first.")
        return redirect(reverse('enter'))
        
    data = sim_input.to_dict()
    is_goal_seeking = data.get('goal_seeking', False)
    
    # Run deterministic projection for tables
    det_rows = run_deterministic(sim_input)
    
    # Extract general statistics
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
        "det_rows": det_rows,
        "pretax_assets": data.get('pretax_assets', {}),
        "roth_assets": data.get('roth_assets', {}),
        "taxable_assets": data.get('taxable_assets', {}),
        "hsa_assets": data.get('hsa_assets', {})
    }
    
    if not is_goal_seeking:
        # Regular simulation
        mc_stats = generate_runs(sim_input)
        results.update(mc_stats)
    else:
        # Goal-seeking simulation
        achieved_spending, achieved_success_rate, searches, achieved_spending_y1 = binary_search(sim_input)
        results.update({
            "target_success_rate": data.get('target_success_rate', 80.0),
            "achieved_spending": achieved_spending, # The solved maximum Desired Spending
            "achieved_success_rate": achieved_success_rate,
            "searches": searches,
            "achieved_spending_y1": achieved_spending_y1 # Sum of withdrawals + income - taxes
        })
        
    return render(request, 'results.html', results)