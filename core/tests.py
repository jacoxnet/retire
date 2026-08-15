from django.test import TestCase
from core.runs import calculate_tax, calculate_taxable_ss, get_rmd_start_age
from core.models import SimulationData

class RetirementCalculationTests(TestCase):
    
    def test_tax_calculation(self):
        # 2026 brackets for Single: [12400, 50400, 105700, 201775, 256225, 640600]
        # Rates: [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
        thresholds = [12400, 50400, 105700, 201775, 256225, 640600]
        rates = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
        
        # Test income 0
        self.assertEqual(calculate_tax(0, thresholds, rates), 0.0)
        self.assertEqual(calculate_tax(-100, thresholds, rates), 0.0)
        
        # Test inside first bracket: $10,000 -> 10% = $1,000
        self.assertAlmostEqual(calculate_tax(10000, thresholds, rates), 1000.0)
        
        # Test exact boundary: $12,400 -> $1,240
        self.assertAlmostEqual(calculate_tax(12400, thresholds, rates), 1240.0)
        
        # Test second bracket: $20,000 -> 10% of 12400 + 12% of 7600 = 1240 + 912 = $2,152
        self.assertAlmostEqual(calculate_tax(20000, thresholds, rates), 2152.0)
        
    def test_rmd_start_age(self):
        # Birth year <= 1950: 72
        self.assertEqual(get_rmd_start_age(1948), 72)
        self.assertEqual(get_rmd_start_age(1950), 72)
        
        # Birth year 1951-1959: 73
        self.assertEqual(get_rmd_start_age(1951), 73)
        self.assertEqual(get_rmd_start_age(1955), 73)
        self.assertEqual(get_rmd_start_age(1959), 73)
        
        # Birth year >= 1960: 75
        self.assertEqual(get_rmd_start_age(1960), 75)
        self.assertEqual(get_rmd_start_age(1975), 75)

    def test_rmd_calculation_uses_prior_year_balance(self):
        # Age 75 divisor is 24.6
        # Initial pretax balance: 246,000. Return: 10% (r_pretax = 0.10)
        # Expected RMD based on prior year-end balance = 246,000 / 24.6 = 10,000
        from core.runs import simulate_step
        res = simulate_step(
            t=0, user_age=75, is_married=False, spouse_age=75,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=75, desired_spending=0, survivor_spending=0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=246000.0, pretax_spouse=0.0, roth=0.0, taxable=0.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.10, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75
        )
        self.assertAlmostEqual(res['withdrawals']['pretax_rmd'], 10000.0)

    def test_taxable_social_security_single(self):
        # Combined Income = AGI ex SS + 0.5 * SS
        # Base limit: 25000, step: 9000 (upper: 34000)
        
        # Case 1: Combined Income <= 25000 -> 0 taxable
        # AGI = 10000, SS = 15000 -> provisional = 10000 + 7500 = 17500 <= 25000
        self.assertEqual(calculate_taxable_ss(10000, 15000, 'single'), 0.0)
        
        # Case 2: Combined Income between 25000 and 34000
        # AGI = 20000, SS = 10000 -> provisional = 20000 + 5000 = 25000 -> exactly base
        self.assertEqual(calculate_taxable_ss(20000, 10000, 'single'), 0.0)
        
        # AGI = 22000, SS = 10000 -> provisional = 22000 + 5000 = 27000 (> 25000 by 2000)
        # Taxable = min(50% of SS, 50% of (provisional - 25000)) = min(5000, 1000) = 1000
        self.assertAlmostEqual(calculate_taxable_ss(22000, 10000, 'single'), 1000.0)
        
        # Case 3: Combined Income > 34000
        # AGI = 40000, SS = 20000 -> provisional = 40000 + 10000 = 50000
        # Taxable is min(0.85 * 20000, 0.85 * (50000 - 34000) + min(10000 * 0.5, 9000 * 0.5))
        # = min(17000, 0.85 * 16000 + min(10000, 4500)) = min(17000, 13600 + 4500) = min(17000, 18100) = 17000
        self.assertAlmostEqual(calculate_taxable_ss(40000, 20000, 'single'), 17000.0)

    def test_database_model(self):
        # Verify JSON database structure works
        data = {
            'user_name': 'Alice',
            'user_age': 55,
            'desired_spending': 50000.0
        }
        sim = SimulationData.objects.create(data=data)
        self.assertEqual(SimulationData.objects.count(), 1)
        self.assertEqual(sim.to_dict()['user_name'], 'Alice')
        self.assertEqual(sim.to_dict()['user_age'], 55)

    def test_session_clear_data_view(self):
        # Verify clear_data resets session data and redirects to enter
        session = self.client.session
        session['simulation_data'] = {'user_name': 'Custom User', 'user_age': 70}
        session.save()

        response = self.client.get('/clear/')
        self.assertRedirects(response, '/')
        
        # Verify default data re-initialized on enter view GET
        enter_response = self.client.get('/')
        self.assertEqual(enter_response.status_code, 200)
        self.assertEqual(self.client.session['simulation_data']['user_name'], 'John Doe')

    def test_enter_view_post_redirects_to_results(self):
        # Verify form submit redirects directly to results view
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Bob Smith',
            'user_age': '62',
            'user_retirement_age': '67',
            'user_age_death': '95',
            'desired_spending': '45000',
            'inflation_rate': '2.5',
            'runs': '50',
            'pretax_present_balance': '600000',
            'pretax_contrib_amount': '10000',
            'pretax_contrib_freq': 'annual',
            'pretax_contrib_start_age': '62',
            'pretax_contrib_end_age_type': 'retirement',
            'pretax_contrib_end_age_specified': '67',
            'pretax_return_mean': '6.0',
            'pretax_return_std': '10.0',
            'roth_present_balance': '0',
            'taxable_present_balance': '0',
            'hsa_present_balance': '0'
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        self.assertEqual(self.client.session['simulation_data']['user_name'], 'Bob Smith')
        self.assertEqual(self.client.session['simulation_data']['user_age'], 62)

    def test_hundredths_inflation_rate(self):
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Inflation Test',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '50000',
            'inflation_rate': '2.25',
            'runs': '10',
            'pretax_present_balance': '500000',
            'pretax_contrib_amount': '0',
            'pretax_contrib_freq': 'annual',
            'pretax_contrib_start_age': '60',
            'pretax_contrib_end_age_type': 'retirement',
            'pretax_contrib_end_age_specified': '65',
            'pretax_return_mean': '6.0',
            'pretax_return_std': '10.0',
            'roth_present_balance': '0',
            'taxable_present_balance': '0',
            'hsa_present_balance': '0'
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        self.assertEqual(self.client.session['simulation_data']['inflation_rate'], 2.25)

    def test_load_plan_view(self):
        import json, os
        from django.conf import settings
        file_path = os.path.join(settings.BASE_DIR, 'saved json files', 'aug_5_smith_plan.json')
        with open(file_path, 'r') as f:
            raw_json = f.read()
        
        response = self.client.post('/load_plan/', {'json_data': raw_json})
        self.assertRedirects(response, '/results/')
        self.assertEqual(self.client.session['simulation_data']['user_name'], 'Aug 5 Smith')

    def test_change_mode_view(self):
        # Initialize default session
        self.client.get('/')
        
        # Switch to Goal-Seeking Mode
        response = self.client.post('/change_mode/', {
            'simulation_type': 'goal_seeking',
            'target_success_rate': '85.0'
        })
        self.assertRedirects(response, '/results/')
        self.assertTrue(self.client.session['simulation_data']['goal_seeking'])
        self.assertEqual(self.client.session['simulation_data']['target_success_rate'], 85.0)

        # Switch back to Regular Mode
        response = self.client.post('/change_mode/', {
            'simulation_type': 'regular'
        })
        self.assertRedirects(response, '/results/')
        self.assertFalse(self.client.session['simulation_data']['goal_seeking'])

    def test_named_additional_spending_breakdown(self):
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Spending Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '40000',
            'inflation_rate': '2.5',
            'runs': '10',
            'pretax_present_balance': '500000',
            'add_spending_name[]': ['Car Purchase', 'World Cruise'],
            'add_spending_amount[]': ['50000', '40000'],
            'add_spending_start_age[]': ['65', '65'],
            'add_spending_interval[]': ['10', '0'],
            'add_spending_adjust_inflation[]': ['true', 'true']
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        
        # Access results page
        res = self.client.get('/results/')
        det_rows = res.context['det_rows']
        
        # At age 65 (year_index 5), both Car Purchase and World Cruise occur
        row_65 = [r for r in det_rows if r['user_age'] == 65][0]
        self.assertIn('Car Purchase', row_65['additional_spending_breakdown'])
        self.assertIn('World Cruise', row_65['additional_spending_breakdown'])
        self.assertGreater(row_65['additional_spending_breakdown']['Car Purchase'], 50000)
        self.assertGreater(row_65['additional_spending_breakdown']['World Cruise'], 40000)





    def test_early_suzie_plan_simulation(self):
        import json, os
        from django.conf import settings
        file_path = os.path.join(settings.BASE_DIR, 'saved json files', 'early_suzie_plan.json')
        with open(file_path, 'r') as f:
            plan_data = json.load(f)
        
        session = self.client.session
        session['simulation_data'] = plan_data
        session['data_version'] = 1
        session.save()
        
        response = self.client.get('/results/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('det_rows', response.context)

    def test_aug_5_smith_plan_simulation(self):
        import json, os
        from django.conf import settings
        file_path = os.path.join(settings.BASE_DIR, 'saved json files', 'aug_5_smith_plan.json')
        with open(file_path, 'r') as f:
            plan_data = json.load(f)
        
        session = self.client.session
        session['simulation_data'] = plan_data
        session['data_version'] = 1
        session.save()
        
        response = self.client.get('/results/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('det_rows', response.context)

    def test_ui_label_and_simulation_input_updates(self):
        # 1. Test Base Navigation Bar label
        base_resp = self.client.get('/')
        self.assertContains(base_resp, 'Simulation Results')
        self.assertNotContains(base_resp, 'View Results')

        # 2. Test Regular Simulation Results page
        res_resp = self.client.get('/results/')
        self.assertEqual(res_resp.status_code, 200)
        self.assertContains(res_resp, 'Desired Annual Recurring Spending')
        self.assertNotContains(res_resp, 'Simulations Run:')
        self.assertNotContains(res_resp, '(Deterministic)')
        self.assertContains(res_resp, 'Average Return')
        self.assertContains(res_resp, 'Your\'s Age at Death' if False else 'Your Age at Death')
        
        # Percentile labels checks
        self.assertContains(res_resp, 'Median Ending Wealth')
        self.assertContains(res_resp, '25th Percentile Ending Wealth')
        self.assertContains(res_resp, '10th Percentile Ending Wealth')
        self.assertNotContains(res_resp, 'Median (50th Pct)')
        
        # Heading checks: "Results" card title instead of "Regular Simulation Results"
        self.assertContains(res_resp, 'Results')
        self.assertNotContains(res_resp, 'Regular Simulation Results')
        self.assertNotContains(res_resp, 'Goal-Seeking Simulation Results')

        # 3. Test Goal-Seeking mode Results page
        session = self.client.session
        sim_data = session['simulation_data']
        sim_data['goal_seeking'] = True
        session['simulation_data'] = sim_data
        session['data_version'] = session.get('data_version', 1) + 1
        session.save()

        goal_resp = self.client.get('/results/')
        self.assertEqual(goal_resp.status_code, 200)
        # Desired Annual Recurring Spending should NOT be shown in Simulation Inputs during goal seeking mode
        self.assertNotContains(goal_resp, 'Desired Annual Recurring Spending in Today\'s Dollars')
        self.assertNotContains(goal_resp, 'Bisection Searches Done')
        self.assertNotContains(goal_resp, 'Goal-Seeking Simulation Results')
        self.assertContains(goal_resp, 'Results')

    def test_update_simulation_inputs_via_steppers(self):
        # Initialize default session
        self.client.get('/')
        
        # Post updated inputs from sliders/steppers
        response = self.client.post('/change_mode/', {
            'simulation_type': 'regular',
            'desired_spending': '48000',
            'inflation_rate': '3.2',
            'user_age_death': '95',
            'pretax_return_mean': '7.5',
            'roth_return_mean': '8.0'
        })
        self.assertRedirects(response, '/results/')
        
        # Verify session data was updated
        sim = self.client.session['simulation_data']
        self.assertEqual(sim['desired_spending'], 48000.0)
        self.assertEqual(sim['inflation_rate'], 3.2)
        self.assertEqual(sim['user_age_death'], 95)
        self.assertEqual(sim['pretax_assets']['return_mean'], 7.5)
        self.assertEqual(sim['roth_assets']['return_mean'], 8.0)

    def test_milestones_and_cash_flow_age_columns(self):
        self.client.get('/')
        res_resp = self.client.get('/results/')
        self.assertEqual(res_resp.status_code, 200)
        
        # Verify Milestones header is present
        self.assertContains(res_resp, '<th>Milestones</th>')
        self.assertContains(res_resp, 'You Retire')
        self.assertContains(res_resp, 'Your Final Year')
        
        # Verify det_rows contains milestones list
        det_rows = res_resp.context['det_rows']
        self.assertTrue(len(det_rows) > 0)
        self.assertIn('milestones', det_rows[0])

    def test_spouse_rmd_start_milestone(self):
        from core.runs import run_deterministic
        sim_input = {
            'user_name': 'User Milestone',
            'user_age': 65,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': True,
            'spouse_name': 'Spouse Milestone',
            'spouse_age': 60, # Born ~1966 -> RMD start age 75 (occurs in 15 years, t=15)
            'spouse_retirement_age': 65,
            'spouse_age_death': 90,
            'filing_status': 'joint',
            'current_year': 2026,
            'desired_spending': 50000.0,
            'survivor_spending': 40000.0,
            'adjust_spending_inflation': True,
            'inflation_rate': 2.0,
            'pretax_assets': {'present_balance': 100000.0},
            'spouse_pretax_assets': {'present_balance': 100000.0},
            'roth_assets': {}, 'taxable_assets': {}, 'hsa_assets': {},
            'additional_spending': [], 'income_sources': []
        }
        rows = run_deterministic(sim_input)
        # Find row where spouse_age is 75 (t=15)
        spouse_rmd_row = [r for r in rows if r['spouse_age'] == 75][0]
        self.assertIn("Spouse RMDs Start (75)", spouse_rmd_row['milestones'])




    def test_invalid_goal_seeking_target_success_rate(self):
        post_data = {
            'simulation_type': 'goal_seeking',
            'user_name': 'Bob Smith',
            'user_age': '62',
            'user_retirement_age': '67',
            'user_age_death': '95',
            'desired_spending': '45000',
            'inflation_rate': '2.5',
            'runs': '50',
            'target_success_rate': '100.0',
            'pretax_present_balance': '600000',
        }
        response = self.client.post('/', post_data)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Target Success Rate must be between 1% and 99% for Maximum Spending simulation.")

    def test_invalid_runs_exceeds_max(self):
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Bob Smith',
            'user_age': '62',
            'user_retirement_age': '67',
            'user_age_death': '95',
            'desired_spending': '45000',
            'inflation_rate': '2.5',
            'runs': '200000',
            'pretax_present_balance': '600000',
        }
        response = self.client.post('/', post_data)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Number of Simulations must be an integer between 1 and 100,000.")

    def test_reset_session_data(self):
        session = self.client.session
        session['simulation_data'] = {'user_name': 'Old Name', 'user_age': 99}
        session.save()
        
        response = self.client.get('/?reset=1')
        self.assertRedirects(response, '/')
        self.assertEqual(self.client.session['simulation_data']['user_name'], 'John Doe')

    def test_income_stream_frequencies(self):
        from core.runs import run_deterministic
        data = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 70,
            'is_married': False,
            'current_year': 2026,
            'desired_spending': 0,
            'inflation_rate': 0.0,
            'adjust_spending_inflation': False,
            'income_sources': [
                {'name': 'Monthly Stream', 'amount': 1000, 'frequency': 'monthly', 'start_age_type': 'specified', 'start_age_specified': 60, 'end_age_type': 'specified', 'end_age_specified': 70, 'subject_to_tax': False, 'adjust_type': 'none'},
                {'name': 'Annual Stream', 'amount': 5000, 'frequency': 'annual', 'start_age_type': 'specified', 'start_age_specified': 60, 'end_age_type': 'specified', 'end_age_specified': 70, 'subject_to_tax': False, 'adjust_type': 'none'},
                {'name': 'One-Time Stream', 'amount': 25000, 'frequency': 'one_time', 'start_age_type': 'specified', 'start_age_specified': 62, 'end_age_type': 'specified', 'end_age_specified': 70, 'subject_to_tax': False, 'adjust_type': 'none'}
            ]
        }
        rows = run_deterministic(data)
        # Year 0 (Age 60): 1000*12 + 5000 = 17000
        self.assertEqual(rows[0]['income'], 17000)
        # Year 2 (Age 62): 1000*12 + 5000 + 25000 = 42000
        self.assertEqual(rows[2]['income'], 42000)
        # Year 3 (Age 63): 1000*12 + 5000 = 17000
        self.assertEqual(rows[3]['income'], 17000)

    def test_formatted_currency_input_parsing(self):
        # Verify post values formatted with $ and commas are parsed correctly
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Formatted Currency User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '$120,000',
            'inflation_rate': '2.5',
            'runs': '10',
            'pretax_present_balance': '$500,000',
            'pretax_contrib_amount': '$12,500',
            'roth_present_balance': '$150,000',
            'taxable_present_balance': '$250,000',
            'hsa_present_balance': '$25,000'
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        sim_data = self.client.session['simulation_data']
        self.assertEqual(sim_data['desired_spending'], 120000.0)
        self.assertEqual(sim_data['pretax_assets']['present_balance'], 500000.0)
        self.assertEqual(sim_data['pretax_assets']['contrib_amount'], 12500.0)
        self.assertEqual(sim_data['roth_assets']['present_balance'], 150000.0)
        self.assertEqual(sim_data['taxable_assets']['present_balance'], 250000.0)
        self.assertEqual(sim_data['hsa_assets']['present_balance'], 25000.0)

    def test_formatted_percent_input_parsing(self):
        # Verify post values formatted with % sign are parsed correctly
        post_data = {
            'simulation_type': 'goal_seeking',
            'user_name': 'Formatted Percent User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '$40,000',
            'inflation_rate': '2.25%',
            'target_success_rate': '85.5%',
            'runs': '10',
            'pretax_present_balance': '$500,000',
            'pretax_return_mean': '6.5%',
            'pretax_return_std': '10.5%',
            'roth_present_balance': '0',
            'taxable_present_balance': '0',
            'hsa_present_balance': '0'
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        sim_data = self.client.session['simulation_data']
        self.assertEqual(sim_data['inflation_rate'], 2.25)
        self.assertEqual(sim_data['target_success_rate'], 85.5)
        self.assertEqual(sim_data['pretax_assets']['return_mean'], 6.5)
        self.assertEqual(sim_data['pretax_assets']['return_std'], 10.5)

    def test_spouse_pretax_independent_rmd(self):
        # User age 75 (RMD start age 75), Spouse age 65 (RMD start age 75)
        # User pretax balance: 246,000 (divisor 24.6 -> RMD = 10,000)
        # Spouse pretax balance: 500,000 (RMD = 0 because age < 75)
        from core.runs import simulate_step
        res = simulate_step(
            t=0, user_age=75, is_married=True, spouse_age=65,
            user_age_death=90, spouse_age_death=90, filing_status='joint',
            desired_spending_start_age=75, desired_spending=0, survivor_spending=0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=246000.0, pretax_spouse=500000.0, roth=0.0, taxable=0.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75
        )
        self.assertAlmostEqual(res['withdrawals']['user_pretax_rmd'], 10000.0)
        self.assertEqual(res['withdrawals']['spouse_pretax_rmd'], 0.0)
        self.assertAlmostEqual(res['withdrawals']['pretax_rmd'], 10000.0)

    def test_spouse_pretax_proportional_deficit_drawdown(self):
        # User pretax: 300,000, Spouse pretax: 100,000 (3:1 ratio)
        # Spending requirement produces a deficit requiring extra pretax withdrawal.
        from core.runs import simulate_step
        res = simulate_step(
            t=0, user_age=60, is_married=True, spouse_age=60,
            user_age_death=90, spouse_age_death=90, filing_status='joint',
            desired_spending_start_age=60, desired_spending=40000, survivor_spending=40000,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=300000.0, pretax_spouse=100000.0, roth=0.0, taxable=0.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75
        )
        w_extra = res['withdrawals']['pretax_extra']
        self.assertGreater(w_extra, 0.0)
        
        # Verify remaining balances reflect 3:1 proportional reduction
        user_end = res['ending_assets']['pretax_user']
        spouse_end = res['ending_assets']['pretax_spouse']
        self.assertAlmostEqual(user_end / spouse_end, 3.0, delta=0.01)

    def test_spousal_rollover_upon_first_death(self):
        # User dies at age 70 (t=10). At t=11 (t > t_first_death), deceased user's pretax rolls into spouse's pretax.
        from core.runs import simulate_step
        res = simulate_step(
            t=11, user_age=60, is_married=True, spouse_age=60,
            user_age_death=70, spouse_age_death=90, filing_status='joint',
            desired_spending_start_age=60, desired_spending=0, survivor_spending=0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=200000.0, pretax_spouse=100000.0, roth=0.0, taxable=0.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75
        )
        # User is deceased, spouse is survivor
        self.assertEqual(res['ending_assets']['pretax_user'], 0.0)
        self.assertEqual(res['ending_assets']['pretax_spouse'], 300000.0)
        self.assertEqual(res['ending_assets']['pretax'], 300000.0)

    def test_dual_engine_numba_vs_python_parity(self):
        # Verify Python run_simulation_path and Numba njit_simulate_path produce identical ending wealth
        from core.runs import extract_sim_inputs, run_simulation_path, prepare_numba_inputs, njit_simulate_path
        import numpy as np
        
        sim_input = {
            'user_name': 'Parity User',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': True,
            'spouse_name': 'Parity Spouse',
            'spouse_age': 58,
            'spouse_retirement_age': 65,
            'spouse_age_death': 92,
            'filing_status': 'joint',
            'current_year': 2026,
            'begin_spending_age_type': 'retirement',
            'desired_spending': 80000.0,
            'survivor_spending': 60000.0,
            'adjust_spending_inflation': True,
            'inflation_rate': 2.5,
            'runs': 1,
            'target_success_rate': 80.0,
            'pretax_assets': {'present_balance': 500000.0, 'contrib_amount': 10000.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'retirement', 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0},
            'spouse_pretax_assets': {'present_balance': 300000.0, 'contrib_amount': 5000.0, 'contrib_freq': 'annual', 'contrib_start_age': 58, 'contrib_end_age_type': 'spouse_retirement', 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0},
            'roth_assets': {'present_balance': 150000.0, 'contrib_amount': 0.0, 'return_mean': 6.0, 'return_std': 10.0},
            'taxable_assets': {'present_balance': 200000.0, 'contrib_amount': 0.0, 'return_mean': 5.0, 'return_std': 8.0},
            'hsa_assets': {'present_balance': 20000.0, 'contrib_amount': 0.0, 'return_mean': 4.0, 'return_std': 5.0, 'hsa_for_medical': True},
            'additional_spending': [],
            'income_sources': []
        }
        
        inputs = extract_sim_inputs(sim_input)
        years = inputs['total_years']
        
        # Fixed deterministic return vectors
        r_pre = np.full(years, 0.06)
        r_roth = np.full(years, 0.06)
        r_tax = np.full(years, 0.05)
        r_hsa = np.full(years, 0.04)
        
        # 1. Run Python simulation
        py_results = run_simulation_path(inputs, r_pre, r_roth, r_tax, r_hsa)
        py_ending_wealth = py_results[-1]['ending_assets']['total']
        
        # 2. Run Numba JIT simulation
        nb_inp = prepare_numba_inputs(inputs)
        nb_ending_wealth = njit_simulate_path(
            years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
            nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
            inputs['adjust_spending_inflation'], inputs['inflation_rate'], inputs['hsa_for_medical'], nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
            nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_init'],
            nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa'],
            nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
            r_pre, r_roth, r_tax, r_hsa
        )
        
        self.assertAlmostEqual(py_ending_wealth, nb_ending_wealth, places=2)

    def test_social_security_card_defaults_and_validation(self):
        from core.views import get_default_data
        default_data = get_default_data()
        self.assertIn('social_security', default_data)
        ss = default_data['social_security']
        self.assertTrue(ss['user_entitled'])
        self.assertEqual(ss['user_start_age'], 67)
        self.assertFalse(ss['spouse_entitled'])

        # Test claiming age validation < 62
        resp = self.client.post('/', {
            'user_name': 'Test Validation',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': True,
            'spouse_name': 'Spouse',
            'spouse_age': 60,
            'spouse_retirement_age': 65,
            'spouse_age_death': 90,
            'user_ss_entitled': 'true',
            'user_ss_start_age': '60', # Invalid: below legal min age 62
            'spouse_ss_entitled': 'true',
            'spouse_ss_start_age': '72', # Invalid: above legal max age 70
        })
        self.assertEqual(resp.status_code, 200) # Form re-rendered with validation errors
        self.assertContains(resp, 'Your Social Security Claiming Age must be between 62 and 70.')
        self.assertContains(resp, 'Spouse&#x27;s Social Security Claiming Age must be between 62 and 70.')

    def test_spousal_survivor_social_security_step_up(self):
        from core.runs import extract_sim_inputs, run_deterministic
        sim_input = {
            'user_name': 'Survivor User',
            'user_age': 65,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': True,
            'spouse_name': 'Deceased Spouse',
            'spouse_age': 65,
            'spouse_retirement_age': 65,
            'spouse_age_death': 75, # Spouse dies at age 75 (year t=10)
            'filing_status': 'joint',
            'current_year': 2026,
            'inflation_rate': 0.0, # Zero inflation for clear math assertion
            'desired_spending': 40000.0,
            'social_security': {
                'user_entitled': True,
                'user_amount': 2000.0, # $24,000 annual
                'user_freq': 'monthly',
                'user_start_age': 65,
                'spouse_entitled': True,
                'spouse_amount': 3000.0, # $36,000 annual (higher)
                'spouse_freq': 'monthly',
                'spouse_start_age': 65,
            },
            'pretax_assets': {'present_balance': 500000.0, 'contrib_amount': 0.0, 'return_mean': 5.0},
            'spouse_pretax_assets': {'present_balance': 0.0},
            'roth_assets': {'present_balance': 0.0},
            'taxable_assets': {'present_balance': 0.0},
            'hsa_assets': {'present_balance': 0.0},
            'additional_spending': [],
            'income_sources': []
        }
        inputs = extract_sim_inputs(sim_input)
        det_rows = run_deterministic(inputs)

        # Before death (e.g. t=5, age 70): User gets 24k, Spouse gets 36k
        row_t5 = [r for r in det_rows if r['user_age'] == 70][0]
        self.assertIn("Your Social Security", row_t5['income_breakdown'])
        self.assertIn("Spouse's Social Security", row_t5['income_breakdown'])
        self.assertEqual(row_t5['income_breakdown']["Your Social Security"], 24000.0)
        self.assertEqual(row_t5['income_breakdown']["Spouse's Social Security"], 36000.0)

        # After spouse death (e.g. t=12, age 77, Spouse is dead):
        # User receives survivor step-up to Spouse's higher benefit ($36,000)
        row_t12 = [r for r in det_rows if r['user_age'] == 77][0]
        self.assertIn("Your Social Security", row_t12['income_breakdown'])
        self.assertNotIn("Spouse's Social Security", row_t12['income_breakdown'])
        self.assertEqual(row_t12['income_breakdown']["Your Social Security"], 36000.0)

    def test_custom_pension_income_stream_persistence(self):
        # Post form with custom Pension income stream (without legacy income_is_ss array)
        response = self.client.post('/', {
            'user_name': 'Pension User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'runs': '1000',
            'current_year': '2026',
            'inflation_rate': '3.5',
            'desired_spending': '50000',
            'income_name[]': ['Pension'],
            'income_amount[]': ['15000'],
            'income_frequency[]': ['annual'],
            'income_start_age_type[]': ['retirement'],
            'income_start_age_specified[]': ['65'],
            'income_end_age_type[]': ['death'],
            'income_end_age_specified[]': ['90'],
            'income_subject_to_tax[]': ['true'],
            'income_adjust_type[]': ['inflation'],
            'income_adjust_val[]': ['0.0'],
        })
        self.assertRedirects(response, '/results/')

        # 1. Verify session saved income stream
        sim = self.client.session['simulation_data']
        self.assertEqual(len(sim['income_sources']), 1)
        self.assertEqual(sim['income_sources'][0]['name'], 'Pension')
        self.assertEqual(sim['income_sources'][0]['amount'], 15000.0)

        # 2. Verify results page includes Pension in projections
        # When adjust_start_age_type defaults to 'start', at age 65 it is $15,000 and at age 66 it is 15000 * 1.035
        res_resp = self.client.get('/results/')
        self.assertEqual(res_resp.status_code, 200)
        det_rows = res_resp.context['det_rows']
        row_65 = [r for r in det_rows if r['user_age'] == 65][0]
        row_66 = [r for r in det_rows if r['user_age'] == 66][0]
        self.assertIn('Pension', row_65['income_breakdown'])
        self.assertAlmostEqual(row_65['income_breakdown']['Pension'], 15000.0, places=2)
        self.assertAlmostEqual(row_66['income_breakdown']['Pension'], 15000.0 * 1.035, places=2)

        # 3. Verify navigating back to enter page displays Pension
        enter_resp = self.client.get('/')
        self.assertEqual(enter_resp.status_code, 200)
        self.assertContains(enter_resp, 'Pension')

    def test_income_stream_deferred_inflation_start_at_specified_age(self):
        """Test pension starting at age 65 with inflation adjustment deferred until age 68."""
        post_data = {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'is_married': False,
            'runs': '1000',
            'current_year': '2026',
            'inflation_rate': '3.5',
            'desired_spending': '40000',
            'income_name[]': ['Pension'],
            'income_amount[]': ['2500'],
            'income_frequency[]': ['monthly'],
            'income_start_age_type[]': ['specified'],
            'income_start_age_specified[]': ['65'],
            'income_end_age_type[]': ['death'],
            'income_end_age_specified[]': ['90'],
            'income_subject_to_tax[]': ['true'],
            'income_adjust_type[]': ['inflation'],
            'income_adjust_val[]': ['0.0'],
            'income_adjust_start_age_type[]': ['specified'],
            'income_adjust_start_age_specified[]': ['68'],
        }
        resp = self.client.post('/', post_data)
        self.assertRedirects(resp, '/results/')

        res_resp = self.client.get('/results/')
        self.assertEqual(res_resp.status_code, 200)
        det_rows = res_resp.context['det_rows']

        # Annual base is 2500 * 12 = 30,000
        # Age 65: 30,000
        # Age 66: 30,000
        # Age 67: 30,000
        # Age 68: 30,000
        # Age 69: 30,000 * 1.035 = 31,050
        # Age 70: 30,000 * (1.035 ** 2) = 32,136.75
        row_65 = [r for r in det_rows if r['user_age'] == 65][0]
        row_66 = [r for r in det_rows if r['user_age'] == 66][0]
        row_67 = [r for r in det_rows if r['user_age'] == 67][0]
        row_68 = [r for r in det_rows if r['user_age'] == 68][0]
        row_69 = [r for r in det_rows if r['user_age'] == 69][0]
        row_70 = [r for r in det_rows if r['user_age'] == 70][0]

        self.assertAlmostEqual(row_65['income_breakdown']['Pension'], 30000.0, places=2)
        self.assertAlmostEqual(row_66['income_breakdown']['Pension'], 30000.0, places=2)
        self.assertAlmostEqual(row_67['income_breakdown']['Pension'], 30000.0, places=2)
        self.assertAlmostEqual(row_68['income_breakdown']['Pension'], 30000.0, places=2)
        self.assertAlmostEqual(row_69['income_breakdown']['Pension'], 30000.0 * 1.035, places=2)
        self.assertAlmostEqual(row_70['income_breakdown']['Pension'], 30000.0 * (1.035 ** 2), places=2)

    def test_load_aug_13_plan_json(self):
        import os, json
        plan_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'saved json files', 'aug_13_plan.json')
        self.assertTrue(os.path.exists(plan_path))
        with open(plan_path, 'r') as f:
            raw_content = f.read()

        parsed = json.loads(raw_content)
        while isinstance(parsed, str):
            parsed = json.loads(parsed)

        self.assertEqual(parsed['user_name'], 'Jack Doe')
        self.assertEqual(parsed['spouse_name'], 'Diane Doe')
        self.assertEqual(len(parsed['income_sources']), 1)
        self.assertEqual(parsed['income_sources'][0]['name'], 'Pension')
        self.assertEqual(parsed['income_sources'][0]['amount'], 50000.0)

    def test_load_aug_13_v2_plan_spouse_pretax(self):
        import os, json
        plan_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'saved json files', 'aug_13_v2_plan.json')
        self.assertTrue(os.path.exists(plan_path))
        with open(plan_path, 'r') as f:
            raw_content = f.read()

        parsed = json.loads(raw_content)
        while isinstance(parsed, str):
            parsed = json.loads(parsed)

        self.assertEqual(parsed['user_name'], 'Jack Doe')
        self.assertEqual(parsed['spouse_name'], 'Diane Doe')
        self.assertIn('spouse_pretax_assets', parsed)
        self.assertEqual(parsed['spouse_pretax_assets']['present_balance'], 500000.0)

    def test_load_plan_with_deferred_income_adjustment(self):
        import json
        plan_data = {
            'user_name': 'Deferred User',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': False,
            'current_year': 2026,
            'desired_spending': 40000.0,
            'income_sources': [
                {
                    'name': 'Pension',
                    'amount': 2500.0,
                    'frequency': 'monthly',
                    'start_age_type': 'specified',
                    'start_age_specified': 65,
                    'end_age_type': 'death',
                    'end_age_specified': 90,
                    'subject_to_tax': True,
                    'adjust_type': 'inflation',
                    'adjust_val': 0.0,
                    'adjust_start_age_type': 'specified',
                    'adjust_start_age_specified': 68
                }
            ]
        }
        resp = self.client.post('/load_plan/', {'json_data': json.dumps(plan_data)})
        self.assertRedirects(resp, '/results/')
        sim = self.client.session['simulation_data']
        self.assertEqual(len(sim['income_sources']), 1)
        self.assertEqual(sim['income_sources'][0]['adjust_start_age_type'], 'specified')
        self.assertEqual(sim['income_sources'][0]['adjust_start_age_specified'], 68)

    def test_validation_spending_start_age_out_of_range(self):
        """Test validation error when specified spending start age is younger than user present age."""
        resp = self.client.post('/', {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'runs': '1000',
            'begin_spending_age_type': 'specified',
            'begin_spending_age_specified': '55',
            'desired_spending': '40000',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Specified Spending Start Age (55) must be between Your Present Age (60) and Your Age at Death (90).")

    def test_validation_survivor_spending_negative(self):
        """Test validation error when survivor spending is negative."""
        resp = self.client.post('/', {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'is_married': 'on',
            'spouse_name': 'Spouse User',
            'spouse_age': '60',
            'spouse_retirement_age': '65',
            'spouse_age_death': '90',
            'runs': '1000',
            'desired_spending': '40000',
            'survivor_spending': '-5000',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Amount of Regular Retirement Spending for Surviving Spouse must be a valid non-negative number.")

    def test_validation_asset_contribution_end_age_before_start_age(self):
        """Test validation error when specified contribution end age is before contribution start age."""
        resp = self.client.post('/', {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'runs': '1000',
            'pretax_contrib_amount': '5000',
            'pretax_contrib_start_age': '65',
            'pretax_contrib_end_age_type': 'age',
            'pretax_contrib_end_age_specified': '62',
            'desired_spending': '40000',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Pre-Tax Specified Contribution End Age (62) must be greater than or equal to Contribution Start Age (65)")

    def test_validation_additional_spending_start_age_younger_than_present_age(self):
        """Test validation error when additional spending start age is younger than user present age."""
        resp = self.client.post('/', {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'runs': '1000',
            'desired_spending': '40000',
            'add_spending_name[]': ['College Tuition'],
            'add_spending_amount[]': ['25000'],
            'add_spending_start_age[]': ['55'],
            'add_spending_interval[]': ['0'],
            'add_spending_adjust_inflation[]': ['true'],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Additional Spending item &#x27;College Tuition&#x27; Start Age (55) cannot be younger than Your Present Age (60)")







