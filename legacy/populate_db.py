import os
import json
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'retire.settings')
django.setup()

from core.models import SimulationData
from django.contrib.sessions.models import Session
from core.runs import run_deterministic, generate_runs
from core.views import load_plan_view, get_default_data

def populate_database_and_sessions():
    with open('saved json files/fitzwilliam_and_elizabeth.json', 'r') as f:
        plan_data = json.load(f)

    # 1. Update/Create SimulationData record
    SimulationData.objects.all().delete()
    sim_obj = SimulationData.objects.create(data=plan_data)
    print(f"Created SimulationData record (ID: {sim_obj.id}).")

    # 2. Update existing active sessions
    session_count = 0
    for session in Session.objects.all():
        data = session.get_decoded()
        data['simulation_data'] = plan_data
        data['data_version'] = data.get('data_version', 0) + 1
        data['cached_results'] = None
        data['cached_version'] = -1
        session.session_data = Session.objects.encode(data)
        session.save()
        session_count += 1
    print(f"Updated {session_count} existing active user session(s).")

    # 3. Verify Deterministic and Monte Carlo simulation runs cleanly on Fitzwilliam & Elizabeth's data
    print("Testing deterministic simulation execution...")
    det_rows = run_deterministic(plan_data)
    print(f"Deterministic simulation produced {len(det_rows)} yearly projection rows (Fitzwilliam age 61 -> 95).")
    
    print("Testing Monte Carlo simulation execution (100 runs fast test)...")
    test_plan = dict(plan_data, runs=100)
    mc_stats = generate_runs(test_plan)
    print(f"Monte Carlo simulation completed! Success rate: {mc_stats.get('run_success'):.1f}%")

if __name__ == '__main__':
    populate_database_and_sessions()
