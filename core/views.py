from core.runs import generate_runs, binary_search
from core.models import SimulationData
from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods
from django.contrib import messages
from django.urls import reverse

import numpy as np

@require_http_methods(["GET", "POST"])
def enter_view(request):
    if request.method == "POST":
        # Get the form data and clean it up
        simulation_type = request.POST.get('simulation_type', 'regular')
        data = {
            'goal_seeking': simulation_type == 'goal_seeking',
            'initial_wealth': float(request.POST.get('initial_wealth', 100000)),
            'annual_return': float(request.POST.get('annual_return', 6)),
            'return_std': float(request.POST.get('return_std', 12)),
            'inflation_rate': float(request.POST.get('inflation_rate', 2.5)),
            'inflation_std': float(request.POST.get('inflation_std', 2.5)),
            'years': int(request.POST.get('years', 20)),
            'runs': int(request.POST.get('runs', 100)),
            'annual_withdrawal': float(request.POST.get('annual_withdrawal', 10000)),
            'target_success_rate': float(request.POST.get('target_success_rate', 95)),
        }
        # Save input
        SimulationData.objects.create(**data)
        messages.success(request, "Simulation data saved")
        # redirect to enter
        return redirect(reverse('enter'))
    else:
        # request method is GET - load initial data from the model if possible
        # If no simulation has been run yet, create a new one with default model values
        sim_input = SimulationData.objects.last()
        if not sim_input:
            print(f"DEBUG: no simulation data found, creating new record")
            sim_input = SimulationData.objects.create()
        data = sim_input.to_dict()
        print(f"DEBUG: getting ready to render, data is {data}")
    return render(request, 'enter.html', data)

@require_http_methods(["GET", "POST"])
def results_view(request):
    # get simulation data from model
    sim_input = SimulationData.objects.last()
    if not sim_input:
        # No simulation data, redirect to enter page
        messages.error(request, "No simulation data found. Please enter data first")
        return redirect(reverse('enter'))
    if not sim_input.goal_seeking:
        # regular simulation - generate runs and get stats
        the_runs = generate_runs(sim_input)
        results = {
            "goal_seeking": False,
            "initial_wealth": sim_input.initial_wealth,
            "annual_return": sim_input.annual_return,
            "annual_withdrawal": sim_input.annual_withdrawal,
            "years": sim_input.years,
            "runs": sim_input.runs,
            "run_mean": np.mean(the_runs[:, -1]),
            "run_median": np.median(the_runs[:, -1]),
            "run_10": np.percentile(the_runs[:, -1], 10),
            "run_25": np.percentile(the_runs[:, -1], 25),
            "run_min": np.min(the_runs[:, -1]),
            "run_max": np.max(the_runs[:, -1]),
            "run_fail": 100 * np.count_nonzero(the_runs[:, -1] < 0) / sim_input.runs,
        }
        print(f"DEBUG: results page sending {results}")
        return render(request, 'results.html', results)
    else:
        # goal-seeking simulation
        achieved_withdrawal, achieved_success_rate, searches = binary_search(sim_input)
        results = {
            "goal_seeking": True,
            "initial_wealth": sim_input.initial_wealth,
            "annual_return": sim_input.annual_return,
            "years": sim_input.years,
            "runs": sim_input.runs,
            "target_success_rate": sim_input.target_success_rate,
            "achieved_withdrawal": achieved_withdrawal, 
            "achieved_success_rate": achieved_success_rate,
            "searches": searches,
        }
        return render(request, 'results.html', results)
    