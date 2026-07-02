from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods

@require_http_methods(["GET", "POST"])
def enter_view(request):
    if request.method == "POST":
        # Get the form data and clean it up
        data = {
            'initial_wealth': float(request.POST.get('initial_wealth', 100000)),
            'annual_return': float(request.POST.get('annual_return', 6)) / 100,
            'return_std': float(request.POST.get('return_std', 12)) / 100,
            'annual_withdrawal': float(request.POST.get('annual_withdrawal', 10000)),
            'inflation_rate': float(request.POST.get('inflation_rate', 2.5)) / 100,
            'inflation_std': float(request.POST.get('inflation_std', 2.5)) / 100,
            'years': int(request.POST.get('years', 20)),
            'runs': int(request.POST.get('runs', 1000)),
        }
        # Save input
        # sim_input = SimulationInput.objects.create(**data)
    else:
        pass
    return render(request, 'enter.html')

def results_view(request):
    pass