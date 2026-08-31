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

        # Switch back to Regular Mode and change runs
        response = self.client.post('/change_mode/', {
            'simulation_type': 'regular',
            'runs': '20000'
        })
        self.assertRedirects(response, '/results/')
        self.assertFalse(self.client.session['simulation_data']['goal_seeking'])
        self.assertEqual(self.client.session['simulation_data']['runs'], 20000)

    def test_enter_page_no_simulation_mode_card(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        # Verify Simulation Mode card, Target Success Rate box, and runs input are absent from enter.html
        self.assertNotContains(response, 'simulation-mode-container')
        self.assertNotContains(response, 'id="simulation_type_regular"')
        self.assertNotContains(response, 'id="simulation_type_goal"')
        self.assertNotContains(response, 'id="target_success_rate_group"')
        self.assertNotContains(response, 'id="runs"')

    def test_results_page_runs_input(self):
        self.client.get('/')
        response = self.client.get('/results/')
        self.assertEqual(response.status_code, 200)
        # Verify Number of Simulations input is present on results page with default 10000
        self.assertContains(response, 'id="input_runs"')
        self.assertContains(response, 'value="10000"')

    def test_change_mode_invalid_target_success_rate(self):
        self.client.get('/')
        # The redirect to /results/ triggers a full simulation; cap runs since
        # this test only checks the validation message and clamped session value.
        session = self.client.session
        sim_data = session['simulation_data']
        sim_data['runs'] = 50
        session['simulation_data'] = sim_data
        session.save()

        response = self.client.post('/change_mode/', {
            'simulation_type': 'goal_seeking',
            'target_success_rate': '150.0'
        }, follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Target Success Rate must be between 1% and 99% for Maximum Spending simulation.")
        self.assertEqual(self.client.session['simulation_data']['target_success_rate'], 99.0)

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

        # det_rows is deterministic and doesn't depend on Monte Carlo path count;
        # override the plan's real-world runs value to keep this smoke test fast.
        plan_data['runs'] = 50

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

        # det_rows is deterministic and doesn't depend on Monte Carlo path count;
        # override the plan's real-world runs value to keep this smoke test fast.
        plan_data['runs'] = 50

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

    def test_enter_form_without_runs_preserves_loaded_session_runs(self):
        session = self.client.session
        session['simulation_data'] = {'user_name': 'James Kirk', 'runs': 25000}
        session.save()

        post_data = {
            'user_name': 'James Kirk',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '85',
            'desired_spending': '180000',
            'inflation_rate': '2.5',
            'account_name[]': ['Traditional IRA'],
            'account_type[]': ['pretax'],
            'account_owner[]': ['user'],
            'account_balance[]': ['550000'],
            'account_return_mean[]': ['6.0'],
            'account_return_std[]': ['16.0'],
        }
        response = self.client.post('/', post_data)
        self.assertRedirects(response, '/results/')
        saved_data = self.client.session['simulation_data']
        self.assertEqual(saved_data['runs'], 25000)

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

    def test_income_multi_period_adjustments(self):
        from core.runs import run_deterministic
        # Base amount = $10,000/yr starting at age 65
        # Period 1: Age 60 to 65 -> Inflation (3.0% / yr)
        # Period 2: Age 65 to 70 -> None (0%)
        # Period 3: Age 70 to 75 -> Fixed 5.0% / yr
        data = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 75,
            'is_married': False,
            'current_year': 2026,
            'desired_spending': 0,
            'inflation_rate': 3.0,
            'adjust_spending_inflation': False,
            'social_security': {'user_entitled': False, 'spouse_entitled': False},
            'income_sources': [
                {
                    'name': 'Tiered Pension',
                    'amount': 10000.0,
                    'frequency': 'annual',
                    'start_age_type': 'specified',
                    'start_age_specified': 65,
                    'end_age_type': 'specified',
                    'end_age_specified': 75,
                    'subject_to_tax': False,
                    'adjustments': [
                        {'start_type': 'current_age', 'start_spec': 60, 'end_type': 'specified', 'end_spec': 65, 'adjust_type': 'inflation', 'adjust_val': 0.0},
                        {'start_type': 'specified', 'start_spec': 65, 'end_type': 'specified', 'end_spec': 70, 'adjust_type': 'none', 'adjust_val': 0.0},
                        {'start_type': 'specified', 'start_spec': 70, 'end_type': 'specified', 'end_spec': 75, 'adjust_type': 'fixed_pct', 'adjust_val': 5.0},
                    ]
                }
            ]
        }
        rows = run_deterministic(data)
        # Year 0 to 4 (ages 60-64): income = 0 (hasn't started)
        self.assertEqual(rows[0]['income'], 0.0)
        self.assertEqual(rows[4]['income'], 0.0)

        # Year 5 (age 65): 5 years of 3% inflation = 10000 * (1.03^5) = 11592.74
        expected_age_65 = 10000.0 * (1.03 ** 5)
        self.assertAlmostEqual(rows[5]['income'], expected_age_65, places=2)

        # Year 6 to 9 (ages 66-69): 0% growth during gap period -> stays at expected_age_65
        self.assertAlmostEqual(rows[9]['income'], expected_age_65, places=2)

        # Year 10 (age 70): 5 years inflation, 5 years gap, 0 years 5% -> still expected_age_65
        self.assertAlmostEqual(rows[10]['income'], expected_age_65, places=2)

        # Year 11 (age 71): 1 year of 5% growth after age 70
        expected_age_71 = expected_age_65 * 1.05
        self.assertAlmostEqual(rows[11]['income'], expected_age_71, places=2)

    def test_income_survivor_benefit(self):
        from core.runs import run_deterministic
        # User age 60, dies at 65. Spouse age 60, dies at 70.
        # Pension $40,000/yr starting at 60, ending at User Death, with 75% survivor benefit.
        data = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 65,
            'is_married': True,
            'spouse_age': 60,
            'spouse_retirement_age': 65,
            'spouse_age_death': 70,
            'current_year': 2026,
            'desired_spending': 0,
            'inflation_rate': 0.0,
            'adjust_spending_inflation': False,
            'social_security': {'user_entitled': False, 'spouse_entitled': False},
            'income_sources': [
                {
                    'name': 'Joint Pension',
                    'amount': 40000.0,
                    'frequency': 'annual',
                    'start_age_type': 'specified',
                    'start_age_specified': 60,
                    'end_age_type': 'death',
                    'end_age_specified': 65,
                    'has_survivor_benefit': True,
                    'survivor_benefit_pct': 75.0,
                    'adjust_type': 'none',
                    'subject_to_tax': False,
                }
            ]
        }
        rows = run_deterministic(data)
        # Year 0 to 5 (ages 60-65): User is alive -> 100% of $40,000 = $40,000
        for y in range(6):
            self.assertEqual(rows[y]['income'], 40000.0)

        # Year 6 to 10 (ages 66-70): User is dead, spouse is alive -> 75% of $40,000 = $30,000
        for y in range(6, 11):
            self.assertEqual(rows[y]['income'], 30000.0)

    def test_income_survivor_benefit_spouse_primary(self):
        from core.runs import run_deterministic
        # Spouse dies at 63, User lives to 70.
        # Spouse annuity $20,000/yr ending at spouse_death, 50% survivor benefit to User.
        data = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 70,
            'is_married': True,
            'spouse_age': 60,
            'spouse_retirement_age': 65,
            'spouse_age_death': 63,
            'current_year': 2026,
            'desired_spending': 0,
            'inflation_rate': 0.0,
            'adjust_spending_inflation': False,
            'social_security': {'user_entitled': False, 'spouse_entitled': False},
            'income_sources': [
                {
                    'name': "Spouse's Annuity",
                    'amount': 20000.0,
                    'frequency': 'annual',
                    'start_age_type': 'specified',
                    'start_age_specified': 60,
                    'end_age_type': 'spouse_death',
                    'end_age_specified': 63,
                    'has_survivor_benefit': True,
                    'survivor_benefit_pct': 50.0,
                    'adjust_type': 'none',
                    'subject_to_tax': False,
                }
            ]
        }
        rows = run_deterministic(data)
        # Ages 60-63 (years 0-3): Spouse alive -> 20000
        for y in range(4):
            self.assertEqual(rows[y]['income'], 20000.0)
        # Ages 64-70 (years 4-10): Spouse dead, User alive -> 50% of 20000 = 10000
        for y in range(4, 11):
            self.assertEqual(rows[y]['income'], 10000.0)

    def test_parse_income_sources_with_multi_period_and_survivor(self):
        from core.forms import parse_income_sources
        from django.http import QueryDict
        qd = QueryDict('', mutable=True)
        qd.setlist('income_name[]', ['Exec Pension'])
        qd.setlist('income_amount[]', ['5000'])
        qd.setlist('income_frequency[]', ['monthly'])
        qd.setlist('income_start_age_type[]', ['retirement'])
        qd.setlist('income_start_age_specified[]', ['65'])
        qd.setlist('income_end_age_type[]', ['death'])
        qd.setlist('income_end_age_specified[]', ['90'])
        qd.setlist('income_subject_to_tax[]', ['true'])
        qd.setlist('income_is_ss[]', ['false'])
        qd.setlist('income_has_survivor_benefit[]', ['true'])
        qd.setlist('income_survivor_benefit_pct[]', ['66.7'])
        qd.setlist('income_adjustments_json[]', ['[{"start_type": "current_age", "start_spec": 60, "end_type": "retirement", "end_spec": 65, "adjust_type": "inflation", "adjust_val": 0.0}, {"start_type": "retirement", "start_spec": 65, "end_type": "death", "end_spec": 90, "adjust_type": "fixed_pct", "adjust_val": 2.5}]'])

        parsed = parse_income_sources(qd)
        self.assertEqual(len(parsed), 1)
        item = parsed[0]
        self.assertEqual(item['name'], 'Exec Pension')
        self.assertEqual(item['amount'], 5000.0)
        self.assertTrue(item['has_survivor_benefit'])
        self.assertAlmostEqual(item['survivor_benefit_pct'], 66.7)
        self.assertEqual(len(item['adjustments']), 2)
        self.assertEqual(item['adjustments'][0]['adjust_type'], 'inflation')
        self.assertEqual(item['adjustments'][1]['adjust_type'], 'fixed_pct')
        self.assertAlmostEqual(item['adjustments'][1]['adjust_val'], 2.5)

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
            r_pre, r_pre, r_roth, r_tax, r_hsa, r_hsa,
            nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
            nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code']
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
        self.assertContains(resp, "Account &#x27;PRETAX Account&#x27; Specified Contribution End Age (62) must be greater than or equal to Contribution Start Age (65)")

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

    def test_historical_returns_dataset_integrity(self):
        """Test that historical returns dataset covers 1926 through 2024 with valid keys."""
        from core.historical_data import HISTORICAL_RETURNS, CRISIS_SCENARIOS, get_historical_sequence, MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR

        self.assertEqual(MIN_HISTORICAL_YEAR, 1926)
        self.assertEqual(MAX_HISTORICAL_YEAR, 2024)
        for yr in range(1926, 2025):
            self.assertIn(yr, HISTORICAL_RETURNS)
            data = HISTORICAL_RETURNS[yr]
            self.assertIn('stocks', data)
            self.assertIn('bonds', data)
            self.assertIn('cash', data)
            self.assertIn('inflation', data)

        self.assertIn('2000_dotcom', CRISIS_SCENARIOS)
        self.assertIn('1973_stagflation', CRISIS_SCENARIOS)
        self.assertIn('2008_gfc', CRISIS_SCENARIOS)

        seq = get_historical_sequence(2000, 30)
        self.assertEqual(len(seq['stocks']), 30)
        self.assertEqual(len(seq['bonds']), 30)

    def test_historical_stress_test_simulation(self):
        """Test running historical Monte Carlo stress test scenarios."""
        from core.views import get_default_data
        from core.runs import run_historical_stress_test

        plan = get_default_data()
        res_dotcom = run_historical_stress_test(plan, scenario_key='2000_dotcom')
        self.assertIn('regular_results', res_dotcom)
        self.assertIn('stress_results', res_dotcom)
        self.assertIn('deltas', res_dotcom)
        self.assertIn('chart_labels', res_dotcom)
        self.assertIn('run_success', res_dotcom['regular_results'])
        self.assertIn('run_success', res_dotcom['stress_results'])
        self.assertIn('mc_p50', res_dotcom['stress_results'])
        self.assertGreater(len(res_dotcom['chart_labels']), 0)

        res_stagflation = run_historical_stress_test(plan, scenario_key='1973_stagflation', asset_allocation='60_40', crisis_timing='current')
        self.assertEqual(res_stagflation['scenario']['key'], '1973_stagflation')
        self.assertIn('delta_success', res_stagflation['deltas'])

    def test_stress_test_api_endpoint(self):
        """Test the /api/stress_test/ endpoint."""
        resp = self.client.get('/api/stress_test/', {
            'scenario_key': '1973_stagflation',
            'asset_allocation': '60_40',
            'crisis_timing': 'retirement'
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('regular_results', data)
        self.assertIn('stress_results', data)
        self.assertIn('deltas', data)
        self.assertEqual(data['scenario']['key'], '1973_stagflation')

    def test_state_income_taxes_and_ss_exemption(self):
        """Verify state income tax calculations with and without Social Security exemption."""
        from core.runs import simulate_step
        
        # Scenario: Single filer, Age 65.
        # Taxable Pension: $60,000. Social Security: $20,000.
        # Standard deduction 2026 Single: $16,100.
        # Provisional income: 60,000 + 10,000 = 70,000 -> Taxable SS = 0.85 * 20000 = 17,000.
        # Federal Taxable income = 60,000 + 17,000 - 16,100 = 60,900.
        
        # Test Case 1: State tax 5%, Social Security EXEMPT from state tax
        # State Taxable Income = 60,000 + 0 - 16,100 = 43,900.
        # Expected State Tax = 43,900 * 5% = 2,195.00.
        res_exempt = simulate_step(
            t=0, user_age=65, is_married=False, spouse_age=65,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=65, desired_spending=40000, survivor_spending=40000,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[],
            income_sources_list=[
                {'name': 'Pension', 'amount': 60000.0, 'frequency': 'annual', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'death', 'end_age_specified': 90, 'subject_to_tax': True, 'is_social_security': False, 'adjust_type': 'none', 'adjust_val': 0.0}
            ],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=100000.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            social_security_data={'user_entitled': True, 'user_amount': 20000.0, 'user_freq': 'annual', 'user_start_age': 65},
            state_tax_rate=5.0, state_ss_exempt=True, other_taxes_list=[]
        )
        self.assertAlmostEqual(res_exempt['tax_breakdown']['state_tax'], 2195.00, places=2)
        self.assertEqual(res_exempt['tax_breakdown']['other_taxes'], 0.0)
        self.assertAlmostEqual(res_exempt['taxes_paid'], res_exempt['tax_breakdown']['fed_tax'] + 2195.00, places=2)

        # Test Case 2: State tax 5%, Social Security NOT EXEMPT from state tax
        # State Taxable Income = 60,000 + 17,000 - 16,100 = 60,900.
        # Expected State Tax = 60,900 * 5% = 3,045.00.
        res_non_exempt = simulate_step(
            t=0, user_age=65, is_married=False, spouse_age=65,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=65, desired_spending=40000, survivor_spending=40000,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[],
            income_sources_list=[
                {'name': 'Pension', 'amount': 60000.0, 'frequency': 'annual', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'death', 'end_age_specified': 90, 'subject_to_tax': True, 'is_social_security': False, 'adjust_type': 'none', 'adjust_val': 0.0}
            ],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=100000.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            social_security_data={'user_entitled': True, 'user_amount': 20000.0, 'user_freq': 'annual', 'user_start_age': 65},
            state_tax_rate=5.0, state_ss_exempt=False, other_taxes_list=[]
        )
        self.assertAlmostEqual(res_non_exempt['tax_breakdown']['state_tax'], 3045.00, places=2)
        self.assertAlmostEqual(res_non_exempt['tax_breakdown']['fed_tax'], res_exempt['tax_breakdown']['fed_tax'], places=2)

    def test_other_taxes_calculation_and_breakdown(self):
        """Verify user-specified other taxes (capital gains, NIIT, etc.) and their item breakdown."""
        from core.runs import simulate_step
        
        other_taxes = [
            {'name': 'Cap Gains Real Estate', 'amount': 15000.0, 'frequency': 'one_time', 'start_age_type': 'specified', 'start_age_specified': 65, 'adjust_type': 'none'},
            {'name': 'Estimated Dividend Tax', 'amount': 3000.0, 'frequency': 'annual', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'death', 'end_age_specified': 90, 'adjust_type': 'inflation', 'adjust_start_age_type': 'start'}
        ]

        res = simulate_step(
            t=0, user_age=65, is_married=False, spouse_age=65,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=65, desired_spending=30000, survivor_spending=30000,
            adjust_spending_inflation=False, inflation_rate=3.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=100000.0, hsa=0.0, hsa_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            social_security_data={'user_entitled': False},
            state_tax_rate=0.0, state_ss_exempt=True, other_taxes_list=other_taxes
        )

        self.assertEqual(res['tax_breakdown']['other_taxes'], 18000.0)
        self.assertEqual(res['tax_breakdown']['other_taxes_breakdown']['Cap Gains Real Estate'], 15000.0)
        self.assertEqual(res['tax_breakdown']['other_taxes_breakdown']['Estimated Dividend Tax'], 3000.0)
        self.assertEqual(res['taxes_paid'], 18000.0)

    def test_dual_engine_numba_parity_with_state_and_other_taxes(self):
        """Verify 100% numerical parity between Python and Numba JIT engines with state and other taxes active."""
        import numpy as np
        from core.runs import extract_sim_inputs, run_simulation_path, prepare_numba_inputs, njit_simulate_path

        sim_input = {
            'user_name': 'Tax Parity User',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 85,
            'is_married': True,
            'spouse_name': 'Tax Parity Spouse',
            'spouse_age': 58,
            'spouse_retirement_age': 65,
            'spouse_age_death': 88,
            'filing_status': 'joint',
            'current_year': 2026,
            'begin_spending_age_type': 'retirement',
            'begin_spending_age_specified': 65,
            'desired_spending': 50000.0,
            'survivor_spending': 40000.0,
            'adjust_spending_inflation': True,
            'inflation_rate': 2.5,
            'runs': 10,
            'target_success_rate': 80.0,
            'state_tax_rate': 4.5,
            'state_ss_exempt': False,
            'social_security': {
                'user_entitled': True,
                'user_amount': 2800.0,
                'user_freq': 'monthly',
                'user_start_age': 67,
                'spouse_entitled': True,
                'spouse_amount': 1500.0,
                'spouse_freq': 'monthly',
                'spouse_start_age': 67
            },
            'pretax_assets': {'present_balance': 400000.0, 'contrib_amount': 5000.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'retirement', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0},
            'spouse_pretax_assets': {'present_balance': 150000.0, 'contrib_amount': 3000.0, 'contrib_freq': 'annual', 'contrib_start_age': 58, 'contrib_end_age_type': 'spouse_retirement', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0},
            'roth_assets': {'present_balance': 100000.0, 'contrib_amount': 2000.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'retirement', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0},
            'taxable_assets': {'present_balance': 200000.0, 'contrib_amount': 1000.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'retirement', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 5.0, 'return_std': 8.0},
            'hsa_assets': {'present_balance': 25000.0, 'contrib_amount': 1000.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'retirement', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 5.0, 'return_std': 8.0, 'hsa_for_medical': True},
            'additional_spending': [
                {'name': 'College', 'amount': 20000.0, 'start_age': 62, 'interval': 0, 'adjust_inflation': True}
            ],
            'income_sources': [
                {'name': 'Consulting', 'amount': 1500.0, 'frequency': 'monthly', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'specified', 'end_age_specified': 70, 'subject_to_tax': True, 'is_social_security': False, 'adjust_type': 'inflation'}
            ],
            'other_taxes': [
                {'name': 'Cap Gains on Business Sale', 'amount': 25000.0, 'frequency': 'one_time', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'death', 'end_age_specified': 90, 'adjust_type': 'none'},
                {'name': 'NIIT and Dividends', 'amount': 4000.0, 'frequency': 'annual', 'start_age_type': 'retirement', 'start_age_specified': 65, 'end_age_type': 'death', 'end_age_specified': 90, 'adjust_type': 'inflation'}
            ]
        }

        inputs = extract_sim_inputs(sim_input)
        years = inputs['total_years']

        r_pre = np.full(years, 0.055)
        r_roth = np.full(years, 0.055)
        r_tax = np.full(years, 0.045)
        r_hsa = np.full(years, 0.04)

        # 1. Pure Python run
        py_results = run_simulation_path(inputs, r_pre, r_roth, r_tax, r_hsa)
        py_ending_wealth = py_results[-1]['ending_assets']['total']

        # 2. Numba JIT run
        nb_inp = prepare_numba_inputs(inputs)
        nb_ending_wealth = njit_simulate_path(
            years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
            nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
            inputs['adjust_spending_inflation'], inputs['inflation_rate'], inputs['hsa_for_medical'], nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
            nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_init'],
            nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa'],
            nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
            r_pre, r_pre, r_roth, r_tax, r_hsa, r_hsa,
            nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
            nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code']
        )

        self.assertAlmostEqual(py_ending_wealth, nb_ending_wealth, places=2)

    def test_enter_view_post_and_tax_breakdown_in_results(self):
        """Verify full POST submission including state taxes and other taxes persists and renders in results."""
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'Full Tax User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '40000',
            'inflation_rate': '2.5',
            'runs': '20',
            'state_tax_rate': '4.95',
            'state_ss_exempt': 'true',
            'pretax_present_balance': '500000',
            'taxable_present_balance': '200000',
            'other_tax_name[]': ['Rental Depreciation Recapture', 'Annual Dividend Tax'],
            'other_tax_amount[]': ['20000', '1500'],
            'other_tax_frequency[]': ['one_time', 'annual'],
            'other_tax_start_age_type[]': ['retirement', 'retirement'],
            'other_tax_start_age_specified[]': ['65', '65'],
            'other_tax_end_age_type[]': ['death', 'death'],
            'other_tax_end_age_specified[]': ['90', '90'],
            'other_tax_adjust_type[]': ['none', 'inflation'],
            'other_tax_adjust_val[]': ['0', '0'],
            'other_tax_adjust_start_age_type[]': ['start', 'start'],
            'other_tax_adjust_start_age_specified[]': ['65', '65']
        }

        resp = self.client.post('/', post_data)
        self.assertRedirects(resp, '/results/')

        session_data = self.client.session['simulation_data']
        self.assertEqual(session_data['state_tax_rate'], 4.95)
        self.assertTrue(session_data['state_ss_exempt'])
        self.assertEqual(len(session_data['other_taxes']), 2)
        self.assertEqual(session_data['other_taxes'][0]['name'], 'Rental Depreciation Recapture')

        # Check results view
        res = self.client.get('/results/')
        self.assertEqual(res.status_code, 200)
        det_rows = res.context['det_rows']
        self.assertTrue(len(det_rows) > 0)
        
        # Check first row has tax breakdown dict
        first_row = det_rows[0]
        self.assertIn('tax_breakdown', first_row)
        self.assertIn('fed_tax', first_row['tax_breakdown'])
        self.assertIn('state_tax', first_row['tax_breakdown'])
        self.assertIn('other_taxes', first_row['tax_breakdown'])
        self.assertIn('other_taxes_breakdown', first_row['tax_breakdown'])

    def test_hsa_non_medical_penalty_age_logic(self):
        """
        Verify owner-specific age 65 penalty logic:
        - User age 66 (>= 65): 0% penalty on non-medical HSA withdrawals.
        - Spouse age 62 (< 65): 20% penalty on non-medical HSA withdrawals.
        - Both are subject to ordinary income tax regardless of age.
        """
        from core.runs import simulate_step

        # Step where User is 66, Spouse is 62.
        # Deficit of $10,000 pulls from User HSA first.
        res_user = simulate_step(
            t=0, user_age=66, is_married=True, spouse_age=62,
            user_age_death=90, spouse_age_death=90, filing_status='joint',
            desired_spending_start_age=60, desired_spending=10000.0, survivor_spending=10000.0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=0.0,
            hsa_user=50000.0, hsa_user_for_medical=False,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            hsa_spouse=50000.0, hsa_spouse_for_medical=False,
            r_hsa_spouse=0.0, contrib_hsa_spouse=0.0
        )
        # User is >= 65 so HSA penalty should be 0
        self.assertEqual(res_user['tax_breakdown'].get('hsa_penalty', 0.0), 0.0)
        self.assertGreater(res_user['withdrawals']['hsa_user'], 0.0)
        self.assertEqual(res_user['withdrawals']['hsa_spouse'], 0.0)

        # Now test Spouse HSA withdrawal when User HSA is empty and Spouse is 62 (< 65)
        res_spouse = simulate_step(
            t=0, user_age=66, is_married=True, spouse_age=62,
            user_age_death=90, spouse_age_death=90, filing_status='joint',
            desired_spending_start_age=60, desired_spending=10000.0, survivor_spending=10000.0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=0.0,
            hsa_user=0.0, hsa_user_for_medical=False,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            hsa_spouse=50000.0, hsa_spouse_for_medical=False,
            r_hsa_spouse=0.0, contrib_hsa_spouse=0.0
        )
        # Spouse is < 65, so 20% penalty must apply to Spouse HSA withdrawal
        w_spouse = res_spouse['withdrawals']['hsa_spouse']
        self.assertGreater(w_spouse, 0.0)
        expected_penalty = 0.20 * w_spouse
        self.assertAlmostEqual(res_spouse['tax_breakdown']['hsa_penalty'], expected_penalty, places=4)

    def test_hsa_medical_vs_nonmedical_taxation(self):
        """
        Verify HSA medical vs non-medical:
        - Medical: 100% tax-free and penalty-free at any age (e.g., age 50).
        - Non-medical: ordinary income tax + 20% penalty under age 65.
        """
        from core.runs import simulate_step

        # Age 50 with medical HSA
        res_med = simulate_step(
            t=0, user_age=50, is_married=False, spouse_age=50,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=50, desired_spending=10000.0, survivor_spending=10000.0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=0.0,
            hsa_user=20000.0, hsa_user_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75
        )
        self.assertAlmostEqual(res_med['withdrawals']['hsa_user'], 10000.0)
        self.assertEqual(res_med['taxes_paid'], 0.0)
        self.assertEqual(res_med['tax_breakdown'].get('hsa_penalty', 0.0), 0.0)

        # Age 50 with non-medical HSA
        res_non_med = simulate_step(
            t=0, user_age=50, is_married=False, spouse_age=50,
            user_age_death=90, spouse_age_death=90, filing_status='single',
            desired_spending_start_age=50, desired_spending=10000.0, survivor_spending=10000.0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=0.0,
            hsa_user=20000.0, hsa_user_for_medical=False,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75
        )
        # Gross withdrawal must cover spending + 20% penalty + taxes
        w_gross = res_non_med['withdrawals']['hsa_user']
        self.assertGreater(w_gross, 10000.0)
        self.assertAlmostEqual(res_non_med['tax_breakdown']['hsa_penalty'], 0.20 * w_gross, places=4)

    def test_hsa_spousal_death_rollover(self):
        """
        Verify tax-free spousal rollover of HSA upon first death.
        """
        from core.runs import simulate_step

        # Year t=1 after spouse dies at t=0 (user_age=80, spouse_age_death=79)
        res = simulate_step(
            t=1, user_age=79, is_married=True, spouse_age=79,
            user_age_death=90, spouse_age_death=79, filing_status='joint',
            desired_spending_start_age=60, desired_spending=0.0, survivor_spending=0.0,
            adjust_spending_inflation=False, inflation_rate=0.0,
            additional_spending_list=[], income_sources_list=[],
            pretax_user=0.0, pretax_spouse=0.0, roth=0.0, taxable=0.0,
            hsa_user=15000.0, hsa_user_for_medical=True,
            r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa=0.0,
            contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa=0.0,
            user_rmd_start_age=75, spouse_rmd_start_age=75,
            hsa_spouse=25000.0, hsa_spouse_for_medical=True,
            r_hsa_spouse=0.0, contrib_hsa_spouse=0.0
        )
        # Spouse HSA should roll into User HSA: 15000 + 25000 = 40000
        self.assertAlmostEqual(res['beginning_assets']['hsa_user'], 40000.0)
        self.assertAlmostEqual(res['beginning_assets']['hsa_spouse'], 0.0)

    def test_hsa_dual_python_numba_parity(self):
        """Verify Numba vs Python simulation parity with dual HSA accounts."""
        import numpy as np
        from core.runs import extract_sim_inputs, run_simulation_path, prepare_numba_inputs, njit_simulate_path

        sim_input = {
            'user_name': 'HSA Parity User',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 85,
            'is_married': True,
            'spouse_name': 'Spouse',
            'spouse_age': 58,
            'spouse_retirement_age': 62,
            'spouse_age_death': 88,
            'filing_status': 'joint',
            'desired_spending': 60000.0,
            'survivor_spending': 45000.0,
            'inflation_rate': 2.5,
            'pretax_assets': {'present_balance': 300000.0, 'return_mean': 5.0, 'return_std': 0.0},
            'spouse_pretax_assets': {'present_balance': 200000.0, 'return_mean': 5.0, 'return_std': 0.0},
            'roth_assets': {'present_balance': 100000.0, 'return_mean': 5.0, 'return_std': 0.0},
            'taxable_assets': {'present_balance': 150000.0, 'return_mean': 4.0, 'return_std': 0.0},
            'hsa_assets': {'present_balance': 40000.0, 'return_mean': 4.0, 'return_std': 0.0, 'hsa_for_medical': False},
            'spouse_hsa_assets': {'present_balance': 30000.0, 'return_mean': 4.0, 'return_std': 0.0, 'hsa_for_medical': False},
            'state_tax_rate': 4.5,
            'state_ss_exempt': True,
            'additional_spending': [],
            'income_sources': [],
            'other_taxes': []
        }

        inputs = extract_sim_inputs(sim_input)
        years = inputs['total_years']
        det_r_pre = [0.05] * years
        det_r_roth = [0.05] * years
        det_r_tax = [0.04] * years
        det_r_hsa = [0.04] * years

        py_res = run_simulation_path(inputs, det_r_pre, det_r_roth, det_r_tax, det_r_hsa)
        py_ending_wealth = py_res[-1]['ending_assets']['total']

        nb_inp = prepare_numba_inputs(inputs)
        nb_ending_wealth = njit_simulate_path(
            years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'],
            inputs['user_age_death'], inputs['spouse_age_death'],
            nb_inp['filing_status_code'], inputs['desired_spending_start_age'],
            nb_inp['desired_spending'], nb_inp['survivor_spending'],
            inputs['adjust_spending_inflation'], inputs['inflation_rate'],
            nb_inp['hsa_user_for_medical_code'],
            nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
            nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'],
            nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_user_init'],
            nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa_user'],
            nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
            np.array(det_r_pre, dtype=np.float64), np.array(det_r_pre, dtype=np.float64), np.array(det_r_roth, dtype=np.float64),
            np.array(det_r_tax, dtype=np.float64), np.array(det_r_hsa, dtype=np.float64), np.array(det_r_hsa, dtype=np.float64),
            nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
            nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code']
        )

        self.assertAlmostEqual(py_ending_wealth, nb_ending_wealth, places=2)

    def test_enter_view_post_spouse_hsa(self):
        """Verify full POST submission including Spouse HSA data persists in session and context."""
        post_data = {
            'simulation_type': 'regular',
            'user_name': 'HSA User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'is_married': 'on',
            'spouse_name': 'Spouse HSA',
            'spouse_age': '58',
            'spouse_retirement_age': '62',
            'spouse_age_death': '90',
            'desired_spending': '40000',
            'survivor_spending': '30000',
            'inflation_rate': '2.5',
            'runs': '20',
            'hsa_present_balance': '25000',
            'hsa_contrib_amount': '1500',
            'hsa_for_medical': 'true',
            'spouse_hsa_present_balance': '18000',
            'spouse_hsa_contrib_amount': '1200',
            'spouse_hsa_for_medical': 'true'
        }

        resp = self.client.post('/', post_data)
        self.assertRedirects(resp, '/results/')

        session_data = self.client.session['simulation_data']
        self.assertEqual(session_data['hsa_assets']['present_balance'], 25000.0)
        self.assertEqual(session_data['spouse_hsa_assets']['present_balance'], 18000.0)
        self.assertTrue(session_data['spouse_hsa_assets']['hsa_for_medical'])

        res = self.client.get('/results/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('spouse_hsa_assets', res.context)
        self.assertEqual(res.context['spouse_hsa_assets']['present_balance'], 18000.0)

    def test_manage_data_view(self):
        """Test the Save/Load/Clear Data dedicated page view."""
        resp = self.client.get('/manage_data/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Save / Load / Clear Data')
        self.assertContains(resp, 'Save Plan (JSON)')
        self.assertContains(resp, 'Load Plan (JSON)')
        self.assertContains(resp, 'Clear Data')

    def test_dynamic_accounts_aggregation(self):
        """Test submitting dynamic accounts list and verifying aggregation."""
        post_data = {
            'user_name': 'Account Tester',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'is_married': 'on',
            'spouse_name': 'Spouse Tester',
            'spouse_age': '58',
            'spouse_retirement_age': '62',
            'spouse_age_death': '90',
            'desired_spending': '50000',
            'survivor_spending': '35000',
            'inflation_rate': '3.0',
            'runs': '50',
            'account_name[]': ['Primary 401(k)', 'Rollover IRA', 'Roth IRA', 'Spouse 401(k)'],
            'account_type[]': ['pretax', 'pretax', 'roth', 'pretax'],
            'account_owner[]': ['user', 'user', 'user', 'spouse'],
            'account_balance[]': ['300000', '200000', '150000', '100000'],
            'account_contrib_amount[]': ['10000', '0', '7000', '5000'],
            'account_contrib_freq[]': ['annual', 'annual', 'annual', 'annual'],
            'account_contrib_start_age[]': ['60', '60', '60', '58'],
            'account_contrib_end_age_type[]': ['retirement', 'retirement', 'retirement', 'spouse_retirement'],
            'account_contrib_end_age_specified[]': ['65', '65', '65', '62'],
            'account_contrib_adjust_inflation[]': ['true', 'true', 'true', 'true'],
            'account_return_mean[]': ['6.0%', '8.0%', '7.0%', '6.5%'],
            'account_return_std[]': ['10.0%', '12.0%', '10.0%', '9.5%'],
            'account_hsa_for_medical[]': ['false', 'false', 'false', 'false'],
        }

        resp = self.client.post('/', post_data)
        self.assertRedirects(resp, '/results/')

        session_data = self.client.session['simulation_data']
        self.assertEqual(len(session_data['accounts']), 4)
        # Aggregated user pretax: 300,000 + 200,000 = 500,000
        self.assertEqual(session_data['pretax_assets']['present_balance'], 500000.0)
        # Weighted mean for pretax: (300k*6% + 200k*8%) / 500k = (1.8m + 1.6m)/500k = 6.8%
        self.assertAlmostEqual(session_data['pretax_assets']['return_mean'], 6.8, places=1)
        # Roth balance: 150,000
        self.assertEqual(session_data['roth_assets']['present_balance'], 150000.0)
        # Spouse pretax balance: 100,000
        self.assertEqual(session_data['spouse_pretax_assets']['present_balance'], 100000.0)

    def test_results_historical_stress_no_trajectory_chart(self):
        """Test results page Tab 5 historical crisis stress test has no trajectory comparison chart element."""
        resp = self.client.get('/results/')
        self.assertEqual(resp.status_code, 200)
        self.assertNotContains(resp, 'id="stressComparisonChartCanvas"')
        self.assertNotContains(resp, 'stressTrajectoryChart')
        self.assertContains(resp, 'Select Crisis Scenario')

    def test_multi_account_monthly_contribution_annualized_in_aggregate_accounts(self):
        """Verify that monthly contributions are annualized (multiplied by 12) before summing in aggregate_accounts."""
        from core.forms import aggregate_accounts
        accounts = [
            {
                'name': '401k A',
                'type': 'pretax',
                'balance': 100000.0,
                'contrib_amount': 500.0, # $500/month = $6000/yr
                'contrib_freq': 'monthly',
                'contrib_start_age': 60,
                'contrib_end_age_type': 'retirement',
                'contrib_end_age_specified': 65,
                'contrib_adjust_inflation': True,
                'return_mean': 6.0,
                'return_std': 10.0,
            },
            {
                'name': '401k B',
                'type': 'pretax',
                'balance': 50000.0,
                'contrib_amount': 4000.0, # $4000/yr
                'contrib_freq': 'annual',
                'contrib_start_age': 60,
                'contrib_end_age_type': 'retirement',
                'contrib_end_age_specified': 65,
                'contrib_adjust_inflation': True,
                'return_mean': 6.0,
                'return_std': 10.0,
            }
        ]
        agg = aggregate_accounts(accounts, 60, 65, 90, False, 60, 65, 90)
        # Total contribution must be 6000 + 4000 = 10000, and freq should be 'annual'
        self.assertEqual(agg['pretax_assets']['contrib_amount'], 10000.0)
        self.assertEqual(agg['pretax_assets']['contrib_freq'], 'annual')

    def test_load_plan_view_empty_accounts_preserves_flat_assets(self):
        """Verify that loading a plan JSON with accounts: [] correctly migrates flat assets and does not wipe them to 0."""
        import json
        plan_json = json.dumps({
            'user_age': 62,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': False,
            'desired_spending': 50000.0,
            'accounts': [],
            'pretax_assets': {'present_balance': 350000.0, 'return_mean': 7.0, 'return_std': 12.0},
            'roth_assets': {'present_balance': 120000.0, 'return_mean': 7.0, 'return_std': 12.0},
            'taxable_assets': {'present_balance': 80000.0, 'return_mean': 6.0, 'return_std': 10.0},
            'hsa_assets': {'present_balance': 25000.0, 'return_mean': 5.0, 'return_std': 8.0}
        })
        resp = self.client.post('/load_plan/', {'json_data': plan_json, 'next': 'enter'})
        self.assertRedirects(resp, '/')
        session_data = self.client.session['simulation_data']
        self.assertEqual(session_data['pretax_assets']['present_balance'], 350000.0)
        self.assertEqual(session_data['roth_assets']['present_balance'], 120000.0)
        self.assertEqual(session_data['taxable_assets']['present_balance'], 80000.0)
        self.assertEqual(session_data['hsa_assets']['present_balance'], 25000.0)
        self.assertTrue(len(session_data['accounts']) >= 4)

    def test_change_mode_view_updates_spouse_hsa_return(self):
        """Verify change_mode_view updates spouse_hsa_assets return_mean."""
        session = self.client.session
        session['simulation_data'] = {
            'is_married': True,
            'user_age': 60,
            'spouse_age': 58,
            'spouse_hsa_assets': {'present_balance': 15000.0, 'return_mean': 5.0, 'return_std': 8.0}
        }
        session.save()
        resp = self.client.post('/change_mode/', {
            'simulation_type': 'regular',
            'spouse_hsa_return_mean': '7.5'
        })
        self.assertRedirects(resp, '/results/')
        data = self.client.session['simulation_data']
        self.assertEqual(data['spouse_hsa_assets']['return_mean'], 7.5)

    def test_resolve_age_spouse_retirement_timing(self):
        """Verify that spouse_retirement timing in other_taxes/income_sources resolves to spouse retirement in user timeline."""
        from core.runs import extract_sim_inputs, run_deterministic
        sim_input = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': True,
            'spouse_age': 58,
            'spouse_retirement_age': 63, # spouse turns 63 when user is 60 + (63 - 58) = 65
            'spouse_age_death': 90,
            'desired_spending': 30000.0,
            'income_sources': [
                {
                    'name': 'Spouse Pension',
                    'amount': 1000.0,
                    'frequency': 'annual',
                    'start_age_type': 'spouse_retirement',
                    'start_age_specified': 60,
                    'end_age_type': 'death',
                    'end_age_specified': 90,
                    'adjust_type': 'none',
                    'subject_to_tax': True
                }
            ],
            'pretax_assets': {'present_balance': 100000.0, 'return_mean': 0.0, 'return_std': 0.0},
            'roth_assets': {'present_balance': 0.0},
            'taxable_assets': {'present_balance': 0.0},
            'hsa_assets': {'present_balance': 0.0}
        }
        rows = run_deterministic(sim_input)
        # Year 0: user age 60, spouse age 58 -> pension should NOT be active
        self.assertEqual(rows[0]['income_breakdown'].get('Spouse Pension', 0.0), 0.0)
        # Year 4: user age 64, spouse age 62 -> pension should NOT be active
        self.assertEqual(rows[4]['income_breakdown'].get('Spouse Pension', 0.0), 0.0)
        # Year 5: user age 65, spouse age 63 -> pension should be active ($1000)
        self.assertEqual(rows[5]['income_breakdown'].get('Spouse Pension', 0.0), 1000.0)

    def test_spouse_contributions_start_age_alignment(self):
        """Verify spouse account contributions convert start_age from spouse coordinates to user coordinates."""
        from core.runs import get_contributions_for_year
        # User is 60, spouse is 58. Spouse starts contributing at spouse age 60 (which occurs at user age 62, t=2).
        spouse_asset_data = {
            'is_spouse': True,
            'contrib_amount': 5000.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60, # spouse age 60
            'contrib_end_age_type': 'spouse_retirement',
            'user_ret_age': 65,
            'spouse_ret_age': 65,
            'contrib_adjust_inflation': False
        }
        # At t=0 (user 60, spouse 58): spouse is not 60 yet -> contrib = 0
        c0 = get_contributions_for_year(0, 60, True, 58, 2026, spouse_asset_data)
        self.assertEqual(c0, 0.0)
        # At t=1 (user 61, spouse 59): spouse is not 60 yet -> contrib = 0
        c1 = get_contributions_for_year(1, 60, True, 58, 2026, spouse_asset_data)
        self.assertEqual(c1, 0.0)
        # At t=2 (user 62, spouse 60): spouse is 60 -> contrib = 5000
        c2 = get_contributions_for_year(2, 60, True, 58, 2026, spouse_asset_data)
        self.assertEqual(c2, 5000.0)

    def test_distinct_spouse_asset_returns_deterministic(self):
        """Verify that spouse pretax assets grow at spouse_pretax return rate rather than user pretax return rate."""
        from core.runs import run_deterministic
        sim_input = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 70,
            'is_married': True,
            'spouse_age': 60,
            'spouse_retirement_age': 65,
            'spouse_age_death': 70,
            'desired_spending': 0.0,
            'pretax_assets': {'present_balance': 100000.0, 'return_mean': 10.0, 'return_std': 0.0},
            'spouse_pretax_assets': {'present_balance': 100000.0, 'return_mean': 2.0, 'return_std': 0.0},
            'roth_assets': {'present_balance': 0.0},
            'taxable_assets': {'present_balance': 0.0},
            'hsa_assets': {'present_balance': 0.0},
            'spouse_hsa_assets': {'present_balance': 0.0}
        }
        rows = run_deterministic(sim_input)
        growth_y1 = rows[0]['growth']
        # User pretax growth: 100,000 * 10% = 10,000
        self.assertAlmostEqual(growth_y1['pretax_user'], 10000.0, places=1)
        # Spouse pretax growth: 100,000 * 2% = 2,000
        self.assertAlmostEqual(growth_y1['pretax_spouse'], 2000.0, places=1)

    def test_early_pretax_withdrawal_penalty_married_age_distinction(self):
        """Verify early pre-tax penalty applies only to under-59.5 spouse account, not over-59.5 user account."""
        from core.runs import njit_rmd_tax_withdraw
        # User is 62 (>= 59.5, no penalty), Spouse is 50 (< 59.5, penalty applies).
        # Scenario A: All pretax is user pretax ($100k user, $0 spouse). Deficit of $10,000.
        (u_end_a, sp_end_a, roth_end, tax_end, hsa_u, hsa_s,
         u_rmd, sp_rmd, w_pre_a, w_tax, w_roth, w_hu, w_hs,
         fed_tax_a, st_tax_a, pen_a, hsa_pen_u, hsa_pen_s) = njit_rmd_tax_withdraw(
            62, 50, True, True, True,
            100000.0, 0.0, 100000.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            75, 75, 1, 1.0,
            10000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, 1, 1
        )
        self.assertEqual(pen_a, 0.0)

        # Scenario B: All pretax is spouse pretax ($0 user, $100k spouse). Deficit of $10,000.
        (u_end_b, sp_end_b, roth_end, tax_end, hsa_u, hsa_s,
         u_rmd, sp_rmd, w_pre_b, w_tax, w_roth, w_hu, w_hs,
         fed_tax_b, st_tax_b, pen_b, hsa_pen_u, hsa_pen_s) = njit_rmd_tax_withdraw(
            62, 50, True, True, True,
            0.0, 100000.0, 0.0, 100000.0,
            0.0, 0.0, 0.0, 0.0,
            75, 75, 1, 1.0,
            10000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, 1, 1
        )
        self.assertGreater(pen_b, 0.0)
        self.assertAlmostEqual(pen_b, 0.10 * w_pre_b, places=1)

    def test_social_security_survivor_claiming_minimum_age_60(self):
        """Verify surviving spouse does not receive deceased spouse's Social Security benefit before age 60."""
        from core.runs import extract_sim_inputs, run_deterministic
        sim_input = {
            'user_age': 55,
            'user_retirement_age': 65,
            'user_age_death': 56, # user dies at age 56
            'is_married': True,
            'spouse_age': 55,
            'spouse_retirement_age': 65,
            'spouse_age_death': 75,
            'desired_spending': 30000.0,
            'social_security': {
                'user_entitled': True,
                'user_amount': 3000.0,
                'user_freq': 'monthly',
                'user_start_age': 67,
                'spouse_entitled': False,
                'spouse_amount': 0.0,
                'spouse_freq': 'monthly',
                'spouse_start_age': 67
            },
            'pretax_assets': {'present_balance': 500000.0, 'return_mean': 0.0, 'return_std': 0.0},
            'roth_assets': {'present_balance': 0.0},
            'taxable_assets': {'present_balance': 0.0},
            'hsa_assets': {'present_balance': 0.0}
        }
        rows = run_deterministic(sim_input)
        # Year 2 (spouse age 57, user deceased): survivor benefit should NOT be active (< 60)
        self.assertEqual(rows[2]['income_breakdown'].get("Spouse's Social Security", 0.0), 0.0)
        # Year 4 (spouse age 59, user deceased): survivor benefit should NOT be active (< 60)
        self.assertEqual(rows[4]['income_breakdown'].get("Spouse's Social Security", 0.0), 0.0)
        # Year 5 (spouse age 60, user deceased): survivor benefit SHOULD be active (>= 60)
        self.assertGreater(rows[5]['income_breakdown'].get("Spouse's Social Security", 0.0), 0.0)

    def test_infer_asset_allocation_continuous_model(self):
        """Verify the continuous linear asset allocation inference model (7% stocks, 4% bonds, 2.5% cash)."""
        from core.runs import infer_asset_allocation

        # Return >= 7.0%: 100% stocks, 0% bonds, 0% cash
        self.assertEqual(infer_asset_allocation(10.0), (100.0, 0.0, 0.0))
        self.assertEqual(infer_asset_allocation(8.0), (100.0, 0.0, 0.0))
        self.assertEqual(infer_asset_allocation(7.0), (100.0, 0.0, 0.0))

        # Return = 6.0%: (6.0 - 4.0)/3.0 = 66.67% stocks, 33.33% bonds
        s, b, c = infer_asset_allocation(6.0)
        self.assertAlmostEqual(s, 200.0 / 3.0, places=4)
        self.assertAlmostEqual(b, 100.0 / 3.0, places=4)
        self.assertEqual(c, 0.0)

        # Return = 5.0%: (5.0 - 4.0)/3.0 = 33.33% stocks, 66.67% bonds
        s, b, c = infer_asset_allocation(5.0)
        self.assertAlmostEqual(s, 100.0 / 3.0, places=4)
        self.assertAlmostEqual(b, 200.0 / 3.0, places=4)
        self.assertEqual(c, 0.0)

        # Return = 4.0%: 0% stocks, 100% bonds, 0% cash
        self.assertEqual(infer_asset_allocation(4.0), (0.0, 100.0, 0.0))

        # Return = 3.9%: (3.9 - 2.5)/1.5 = 93.33% bonds, 6.67% cash
        s, b, c = infer_asset_allocation(3.9)
        self.assertEqual(s, 0.0)
        self.assertAlmostEqual(b, 93.3333, places=3)
        self.assertAlmostEqual(c, 6.6667, places=3)

        # Return = 3.0%: (3.0 - 2.5)/1.5 = 33.33% bonds, 66.67% cash
        s, b, c = infer_asset_allocation(3.0)
        self.assertEqual(s, 0.0)
        self.assertAlmostEqual(b, 100.0 / 3.0, places=4)
        self.assertAlmostEqual(c, 200.0 / 3.0, places=4)

        # Return = 2.6%: (2.6 - 2.5)/1.5 = 6.67% bonds, 93.33% cash
        s, b, c = infer_asset_allocation(2.6)
        self.assertEqual(s, 0.0)
        self.assertAlmostEqual(b, 6.6667, places=3)
        self.assertAlmostEqual(c, 93.3333, places=3)

        # Return <= 2.5%: 0% stocks, 0% bonds, 100% cash
        self.assertEqual(infer_asset_allocation(2.5), (0.0, 0.0, 100.0))
        self.assertEqual(infer_asset_allocation(2.0), (0.0, 0.0, 100.0))
        self.assertEqual(infer_asset_allocation(1.0), (0.0, 0.0, 100.0))


class BalanceSheetTests(TestCase):
    def test_marginal_tax_rate_calculation(self):
        from core.forms import calculate_marginal_tax_rate

        # 1. Single filer with $100k salary (active at age 60, current age 60)
        # Taxable base = $100,000 - $16,100 std ded = $83,900
        # 2026 Single thresholds: [12400, 50400, 105700, ...]
        # $83,900 falls in 22% bracket ($50,400 to $105,700)
        plan_single = {
            'filing_status': 'single',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'state_tax_rate': 0.0,
            'income_sources': [
                {
                    'name': 'Salary',
                    'amount': 100000.0,
                    'frequency': 'annual',
                    'start_age_type': 'current_age',
                    'end_age_type': 'specified',
                    'end_age_specified': 65,
                    'subject_to_tax': True
                }
            ]
        }
        rate = calculate_marginal_tax_rate(plan_single)
        self.assertEqual(rate, 22.0)

        # 2. Add 5.0% state tax rate -> 22.0% + 5.0% = 27.0%
        plan_single['state_tax_rate'] = 5.0
        rate_with_state = calculate_marginal_tax_rate(plan_single)
        self.assertEqual(rate_with_state, 27.0)

        # 3. High earner: $300k salary (Single)
        # Taxable base = $300k - $16.1k = $283.9k -> falls in 35% bracket ($256,225 to $640,600)
        plan_high = {
            'filing_status': 'single',
            'user_age': 55,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'state_tax_rate': 4.5,
            'income_sources': [
                {
                    'name': 'Executive Salary',
                    'amount': 300000.0,
                    'frequency': 'annual',
                    'start_age_type': 'current_age',
                    'end_age_type': 'retirement',
                    'subject_to_tax': True
                }
            ]
        }
        self.assertEqual(calculate_marginal_tax_rate(plan_high), 39.5)

    def test_marginal_tax_rate_pensions_and_social_security(self):
        from core.forms import calculate_marginal_tax_rate

        # 1. Pension $2,000/mo ($24k/yr) vs desired spending $60k/yr -> Base is $60k
        # Joint filer: std ded = $32,200. Taxable base = $60,000 - $32,200 = $27,800.
        # Joint thresholds: [24800, 100800, ...] -> falls in 12% bracket ($24,800 to $100,800)
        plan_pension_low = {
            'is_married': True,
            'filing_status': 'joint',
            'desired_spending': 60000.0,
            'state_tax_rate': 0.0,
            'income_sources': [
                {'name': 'Pension', 'amount': 2000.0, 'frequency': 'monthly', 'subject_to_tax': True}
            ]
        }
        self.assertEqual(calculate_marginal_tax_rate(plan_pension_low), 12.0)

        # 2. Large Pension $200,000/mo ($2.4M/yr)
        # Joint taxable base = $2.4M - $32.2k = ~$2.36M -> falls in highest 37% bracket
        plan_pension_high = {
            'is_married': True,
            'filing_status': 'joint',
            'desired_spending': 60000.0,
            'state_tax_rate': 5.0,
            'income_sources': [
                {'name': 'Mega Pension', 'amount': 200000.0, 'frequency': 'monthly', 'subject_to_tax': True}
            ]
        }
        # 37% fed + 5% state = 42.0%
        self.assertEqual(calculate_marginal_tax_rate(plan_pension_high), 42.0)

        # 3. Social Security included: $3,000/mo user + $2,000/mo spouse = $60,000/yr SS
        # Plus $50,000 pension -> Gross = $50k + $36.6k taxable SS = $86.6k
        # Taxable base = $86.6k - $32.2k = $54.4k -> falls in 12% bracket ($24.8k to $100.8k)
        plan_ss_12 = {
            'is_married': True,
            'filing_status': 'joint',
            'desired_spending': 40000.0,
            'state_tax_rate': 0.0,
            'social_security': {
                'user_entitled': True,
                'user_amount': 3000.0,
                'user_freq': 'monthly',
                'spouse_entitled': True,
                'spouse_amount': 2000.0,
                'spouse_freq': 'monthly'
            },
            'income_sources': [
                {'name': 'Pension', 'amount': 50000.0, 'frequency': 'annual', 'subject_to_tax': True}
            ]
        }
        self.assertEqual(calculate_marginal_tax_rate(plan_ss_12), 12.0)

        # 4. Social Security + $110,000 pension -> Gross = $110k + $51k taxable SS = $161k
        # Taxable base = $161k - $32.2k = $128.8k -> falls in 22% bracket ($100.8k to $211.4k)
        plan_ss_22 = {
            'is_married': True,
            'filing_status': 'joint',
            'desired_spending': 40000.0,
            'state_tax_rate': 0.0,
            'social_security': {
                'user_entitled': True,
                'user_amount': 3000.0,
                'user_freq': 'monthly',
                'spouse_entitled': True,
                'spouse_amount': 2000.0,
                'spouse_freq': 'monthly'
            },
            'income_sources': [
                {'name': 'Pension', 'amount': 110000.0, 'frequency': 'annual', 'subject_to_tax': True}
            ]
        }
        self.assertEqual(calculate_marginal_tax_rate(plan_ss_22), 22.0)

        # 5. Non-taxable income stream is excluded
        plan_tax_free = {
            'is_married': False,
            'filing_status': 'single',
            'desired_spending': 20000.0,
            'state_tax_rate': 0.0,
            'income_sources': [
                {'name': 'Tax Free Disability', 'amount': 100000.0, 'frequency': 'annual', 'subject_to_tax': False}
            ]
        }
        # Spending $20,000 - $16,100 std ded = $3,900 -> 10% bracket
        self.assertEqual(calculate_marginal_tax_rate(plan_tax_free), 10.0)

    def test_marginal_tax_rate_manual_override(self):
        from core.forms import calculate_marginal_tax_rate

        plan = {
            'filing_status': 'single',
            'desired_spending': 60000.0,
            'state_tax_rate': 5.0,
            'marginal_tax_rate_override': 18.5
        }
        self.assertEqual(calculate_marginal_tax_rate(plan), 18.5)

        # Override inside balance_sheet sub-dict
        plan2 = {
            'filing_status': 'single',
            'desired_spending': 60000.0,
            'state_tax_rate': 5.0,
            'balance_sheet': {'marginal_tax_rate_override': 28.0}
        }
        self.assertEqual(calculate_marginal_tax_rate(plan2), 28.0)

    def test_build_and_parse_balance_sheet(self):
        from core.forms import build_default_balance_sheet, parse_balance_sheet
        import json

        # Build default with sample accounts
        sample_accounts = [
            {'name': '401k Account', 'type': 'pretax', 'balance': 500000.0, 'contrib_amount': 20000.0},
            {'name': 'Roth IRA', 'type': 'roth', 'balance': 150000.0, 'contrib_amount': 7000.0}
        ]
        bs = build_default_balance_sheet(sample_accounts, current_year=2026)
        self.assertIn('categories', bs)
        self.assertIn('pretax', bs['categories'])
        self.assertIn('roth', bs['categories'])
        self.assertIn('goals', bs['categories'])
        self.assertIn('real_estate', bs['categories'])
        self.assertIn('debts', bs['categories'])

        # Check pretax account values
        pretax_accs = bs['categories']['pretax']['accounts']
        self.assertEqual(len(pretax_accs), 1)
        self.assertEqual(pretax_accs[0]['name'], '401k Account')
        curr_p = bs['current_period']
        self.assertEqual(pretax_accs[0]['values'][curr_p], 500000.0)

        # Parse from JSON string
        self.assertEqual(bs.get('period_view_frequency'), 'all')
        self.assertEqual(bs.get('period_view_limit'), 3)
        bs_json_str = json.dumps(bs)
        parsed = parse_balance_sheet(bs_json_str)
        self.assertEqual(parsed['current_period'], curr_p)
        self.assertEqual(parsed.get('period_view_frequency'), 'all')
        self.assertEqual(parsed.get('period_view_limit'), 3)
        self.assertEqual(len(parsed['categories']['pretax']['accounts']), 1)

    def test_sync_balance_sheet_to_accounts(self):
        from core.forms import build_default_balance_sheet, sync_balance_sheet_to_accounts

        bs = build_default_balance_sheet()
        # Add custom account with include_in_retirement = True
        curr_p = bs['current_period']
        bs['categories']['pretax']['accounts'].append({
            'name': 'New 401(k) Plan',
            'type': 'pretax',
            'owner': 'user',
            'include_in_retirement': True,
            'values': {curr_p: 350000.0},
            'contrib_amount': 22000.0,
            'return_mean': 6.5,
            'return_std': 9.5
        })

        # Add goal sinking fund with include_in_retirement = False
        bs['categories']['goals']['goal_groups'][0]['accounts'].append({
            'name': 'Car Fund HYSA',
            'type': 'cash',
            'owner': 'user',
            'include_in_retirement': False,
            'values': {curr_p: 20000.0}
        })

        synced = sync_balance_sheet_to_accounts(bs)
        synced_names = [a['name'] for a in synced]

        # 'New 401(k) Plan' should be included
        self.assertIn('New 401(k) Plan', synced_names)
        # 'Car Fund HYSA' should NOT be included because include_in_retirement = False
        self.assertNotIn('Car Fund HYSA', synced_names)

        # Verify synced account attributes
        new_401k = next(a for a in synced if a['name'] == 'New 401(k) Plan')
        self.assertEqual(new_401k['balance'], 350000.0)
        self.assertEqual(new_401k['contrib_amount'], 22000.0)
        self.assertEqual(new_401k['return_mean'], 6.5)

    def test_balance_sheet_view_integration(self):
        from django.urls import reverse
        import json

        # 1. GET enter view should contain Balance Sheet tab & json_script tags
        resp = self.client.get(reverse('enter'))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'id="balance-sheet-tab"')
        self.assertContains(resp, 'id="balanceSheetTable"')
        self.assertContains(resp, 'initial-balance-sheet')
        self.assertContains(resp, 'initial-marginal-tax-rate')

        # 2. POST with balance_sheet_json
        from core.forms import build_default_balance_sheet
        bs = build_default_balance_sheet()
        curr_p = bs['current_period']
        bs['categories']['pretax']['accounts'] = [{
            'name': 'Primary 401k',
            'type': 'pretax',
            'owner': 'user',
            'include_in_retirement': True,
            'values': {curr_p: 750000.0},
            'contrib_amount': 23000.0,
            'return_mean': 6.0,
            'return_std': 10.0
        }]
        bs_json = json.dumps(bs)

        post_data = {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '50000',
            'runs': '1000',
            'balance_sheet_json': bs_json,
            'next': 'manage_data'
        }
        post_resp = self.client.post(reverse('enter'), post_data)
        self.assertEqual(post_resp.status_code, 302)

        # Check session data
        session_data = self.client.session['simulation_data']
        self.assertIn('balance_sheet', session_data)
        self.assertEqual(session_data['balance_sheet']['categories']['pretax']['accounts'][0]['values'][curr_p], 750000.0)
        self.assertEqual(session_data['pretax_assets']['present_balance'], 750000.0)

    def test_bidirectional_sync_accounts_and_balance_sheet(self):
        """Test that account cards and balance sheet stay in 100% sync in both directions."""
        from core.forms import sync_balance_sheet_to_accounts, sync_accounts_to_balance_sheet, build_default_balance_sheet
        
        # 1. Start with default balance sheet
        bs = build_default_balance_sheet()
        curr_p = bs['current_period']
        
        # 2. User modifies Roth IRA on balance sheet from $150k to $20k
        for acc in bs['categories']['roth']['accounts']:
            if 'Roth' in acc['name']:
                acc['values'][curr_p] = 20000.0
                
        # Sync BS -> Accounts
        accounts = sync_balance_sheet_to_accounts(bs)
        roth_acc = next(a for a in accounts if a['type'] == 'roth')
        self.assertEqual(roth_acc['balance'], 20000.0)
        
        # 3. User modifies Account Card on Accounts Tab from $20k to $25k
        roth_acc['balance'] = 25000.0
        
        # Sync Accounts -> BS
        updated_bs = sync_accounts_to_balance_sheet(bs, accounts)
        bs_roth_acc = next(a for a in updated_bs['categories']['roth']['accounts'] if a['type'] == 'roth')
        self.assertEqual(bs_roth_acc['values'][curr_p], 25000.0)

    def test_balance_sheet_surplus_and_recalculation_persistence(self):
        """Test Technology reserve $12,000 with goal $10,000 persists and correctly calculates surplus."""
        from core.forms import build_default_balance_sheet
        from django.urls import reverse
        import json

        bs = build_default_balance_sheet()
        curr_p = bs['current_period']

        # Set Technology Reserve to $12,000 with target $10,000
        for group in bs['categories']['goals']['goal_groups']:
            if 'Tech' in group['name']:
                group['target_amount'] = 10000.0
                group['accounts'][0]['values'][curr_p] = 12000.0

        # Set Roth IRA to $20,000
        bs['categories']['roth']['accounts'][0]['values'][curr_p] = 20000.0

        post_data = {
            'user_name': 'Test User',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '50000',
            'runs': '100',
            'balance_sheet_json': json.dumps(bs),
            'next': 'results'
        }

        # 1. Post to enter form and redirect to results
        response = self.client.post(reverse('enter'), post_data)
        self.assertEqual(response.status_code, 302)
        self.assertRedirects(response, reverse('results'))

        # 2. Verify simulation results load without error
        res_page = self.client.get(reverse('results'))
        self.assertEqual(res_page.status_code, 200)

        # 3. Return to enter data view and verify that initial-balance-sheet script has the exact updated numbers
        enter_page = self.client.get(reverse('enter'))
        self.assertEqual(enter_page.status_code, 200)
        content = enter_page.content.decode('utf-8')

        self.assertIn('12000', content)
        self.assertIn('10000', content)
        self.assertIn('20000', content)

    def test_default_data_zero_dollar_amounts(self):
        """Verify that all default dollar amounts are 0.0 while non-dollar defaults are preserved."""
        from core.views import get_default_data
        import datetime

        data = get_default_data()

        # Dollar amounts
        self.assertEqual(data['desired_spending'], 0.0)
        self.assertEqual(data['survivor_spending'], 0.0)
        self.assertEqual(data['social_security']['user_amount'], 0.0)
        self.assertEqual(data['social_security']['spouse_amount'], 0.0)
        self.assertEqual(data['pretax_assets']['present_balance'], 0.0)
        self.assertEqual(data['pretax_assets']['contrib_amount'], 0.0)
        self.assertEqual(data['roth_assets']['present_balance'], 0.0)
        self.assertEqual(data['roth_assets']['contrib_amount'], 0.0)
        self.assertEqual(data['taxable_assets']['present_balance'], 0.0)
        self.assertEqual(data['taxable_assets']['contrib_amount'], 0.0)
        self.assertEqual(data['hsa_assets']['present_balance'], 0.0)
        self.assertEqual(data['hsa_assets']['contrib_amount'], 0.0)

        # Non-dollar defaults preserved
        self.assertEqual(data['user_name'], 'John Doe')
        self.assertEqual(data['user_age'], 60)
        self.assertEqual(data['user_retirement_age'], 65)
        self.assertEqual(data['user_age_death'], 90)
        self.assertFalse(data['is_married'])
        self.assertEqual(data['spouse_name'], 'Jane Doe')
        self.assertEqual(data['filing_status'], 'single')
        self.assertEqual(data['inflation_rate'], 3.5)
        self.assertEqual(data['runs'], 10000)
        self.assertEqual(data['target_success_rate'], 80.0)
        self.assertTrue(data['social_security']['user_entitled'])
        self.assertEqual(data['social_security']['user_start_age'], 67)

        # Balance sheet in default data
        bs = data['balance_sheet']
        today_str = datetime.date.today().isoformat()
        self.assertEqual(bs['periods'], [today_str])
        self.assertEqual(bs['current_period'], today_str)
        self.assertEqual(bs['emergency_goal_amount'], 0.0)

        # Balance sheet accounts
        for cat_key in ['pretax', 'roth', 'taxable']:
            accs = bs['categories'][cat_key]['accounts']
            for a in accs:
                self.assertEqual(a['values'][today_str], 0.0)
                self.assertEqual(a['contrib_amount'], 0.0)

        for g in bs['categories']['goals']['goal_groups']:
            self.assertEqual(g['target_amount'], 0.0)
            for a in g['accounts']:
                self.assertEqual(a['values'][today_str], 0.0)

        for p in bs['categories']['real_estate']['properties']:
            self.assertEqual(p['market_values'][today_str], 0.0)
            for m in p['mortgages']:
                self.assertEqual(m['balances'][today_str], 0.0)

        for d in bs['categories']['debts']:
            self.assertEqual(d['values'][today_str], 0.0)

    def test_multi_column_balance_sheet_json_import(self):
        """Verify that loading a JSON file with multiple balance sheet columns imports all columns accurately."""
        from django.urls import reverse
        import json

        multi_column_bs = {
            'periods': ['2026-06-30', '2026-07-31', '2026-08-28'],
            'current_period': '2026-08-28',
            'marginal_tax_rate': 24.0,
            'emergency_goal_amount': 30000.0,
            'categories': {
                'pretax': {
                    'title': 'Pretax Retirement Accounts',
                    'is_pretax': True,
                    'accounts': [
                        {
                            'id': 'acc_pretax_1',
                            'name': 'Primary 401(k)',
                            'institution': 'Fidelity',
                            'owner': 'user',
                            'type': 'pretax',
                            'include_in_retirement': True,
                            'values': {
                                '2026-06-30': 450000.0,
                                '2026-07-31': 480000.0,
                                '2026-08-28': 500000.0
                            },
                            'contrib_amount': 15000.0,
                            'return_mean': 6.0,
                            'return_std': 10.0
                        }
                    ]
                },
                'roth': {'title': 'Roth Accounts', 'is_pretax': False, 'accounts': []},
                'taxable': {'title': 'Taxable Accounts', 'is_pretax': False, 'accounts': []},
                'hsa': {'title': 'HSA Accounts', 'is_pretax': False, 'accounts': []},
                'emergency': {
                    'title': 'Emergency Fund',
                    'is_pretax': False,
                    'target_amount': 30000.0,
                    'accounts': [
                        {
                            'id': 'acc_emg_1',
                            'name': 'Emergency HYSA',
                            'institution': 'Ally',
                            'owner': 'user',
                            'type': 'cash',
                            'include_in_retirement': False,
                            'values': {
                                '2026-06-30': 25000.0,
                                '2026-07-31': 28000.0,
                                '2026-08-28': 30000.0
                            }
                        }
                    ]
                },
                'goals': {'title': 'Goals', 'is_pretax': False, 'goal_groups': []},
                'daily': {'title': 'Daily', 'is_pretax': False, 'accounts': []},
                'real_estate': {
                    'properties': [
                        {
                            'id': 'prop_1',
                            'name': 'Home',
                            'market_values': {
                                '2026-06-30': 500000.0,
                                '2026-07-31': 510000.0,
                                '2026-08-28': 520000.0
                            },
                            'mortgages': [
                                {
                                    'id': 'mort_1',
                                    'name': 'Mortgage',
                                    'balances': {
                                        '2026-06-30': 200000.0,
                                        '2026-07-31': 199000.0,
                                        '2026-08-28': 198000.0
                                    }
                                }
                            ]
                        }
                    ]
                },
                'debts': [
                    {
                        'id': 'debt_1',
                        'name': 'Auto Loan',
                        'values': {
                            '2026-06-30': 15000.0,
                            '2026-07-31': 14000.0,
                            '2026-08-28': 13000.0
                        }
                    }
                ]
            }
        }

        plan_data = {
            'user_name': 'Multi Column Test',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': False,
            'desired_spending': 50000.0,
            'balance_sheet': multi_column_bs,
            'accounts': [
                {
                    'name': 'Primary 401(k)',
                    'type': 'pretax',
                    'owner': 'user',
                    'balance': 500000.0,
                    'contrib_amount': 15000.0,
                    'return_mean': 6.0,
                    'return_std': 10.0
                }
            ]
        }

        # POST to load_plan view
        resp = self.client.post(reverse('load_plan'), {
            'json_data': json.dumps(plan_data),
            'next': 'enter'
        })
        self.assertEqual(resp.status_code, 302)

        # Check loaded session data contains all 3 periods
        session_data = self.client.session['simulation_data']
        self.assertIn('balance_sheet', session_data)
        bs_loaded = session_data['balance_sheet']
        self.assertEqual(len(bs_loaded['periods']), 3)
        self.assertEqual(bs_loaded['periods'], ['2026-06-30', '2026-07-31', '2026-08-28'])

        # Verify historical account values preserved
        p401k = bs_loaded['categories']['pretax']['accounts'][0]
        self.assertEqual(p401k['values']['2026-06-30'], 450000.0)
        self.assertEqual(p401k['values']['2026-07-31'], 480000.0)
        self.assertEqual(p401k['values']['2026-08-28'], 500000.0)

        # Verify GET enter view includes the multi-column data in initial-balance-sheet script tag
        enter_resp = self.client.get(reverse('enter'))
        self.assertEqual(enter_resp.status_code, 200)
        content = enter_resp.content.decode('utf-8')
        self.assertIn('2026-06-30', content)
        self.assertIn('2026-07-31', content)
        self.assertIn('2026-08-28', content)
        self.assertIn('450000', content)

    def test_rename_account_in_multi_account_category_no_clobbering(self):
        """Test that renaming an account when multiple accounts share owner/type does NOT overwrite the other account."""
        from core.forms import build_default_balance_sheet, sync_balance_sheet_to_accounts, sync_accounts_to_balance_sheet

        bs = build_default_balance_sheet()
        curr_p = bs['current_period']
        for k in ['roth', 'taxable', 'hsa', 'emergency', 'daily']:
            if k in bs['categories']:
                bs['categories'][k]['accounts'] = []

        # Setup 2 Pretax accounts
        bs['categories']['pretax']['accounts'] = [
            {
                'id': 'acc_pretax_1',
                'name': 'Primary 401(k)',
                'type': 'pretax',
                'owner': 'user',
                'include_in_retirement': True,
                'values': {curr_p: 500000.0},
                'contrib_amount': 20000.0
            },
            {
                'id': 'acc_pretax_2',
                'name': 'Old Rollover IRA',
                'type': 'pretax',
                'owner': 'user',
                'include_in_retirement': True,
                'values': {curr_p: 200000.0},
                'contrib_amount': 0.0
            }
        ]

        # Initial sync BS -> Accounts
        accounts = sync_balance_sheet_to_accounts(bs)
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts[0]['name'], 'Primary 401(k)')
        self.assertEqual(accounts[0]['balance'], 500000.0)
        self.assertEqual(accounts[1]['name'], 'Old Rollover IRA')
        self.assertEqual(accounts[1]['balance'], 200000.0)

        # User renames Account 2 on Balance Sheet to 'Vanguard Rollover IRA' and changes balance to $250k
        bs['categories']['pretax']['accounts'][1]['name'] = 'Vanguard Rollover IRA'
        bs['categories']['pretax']['accounts'][1]['values'][curr_p] = 250000.0

        # Sync BS -> Accounts with existing accounts passed
        synced_accounts = sync_balance_sheet_to_accounts(bs, existing_accounts=accounts)
        self.assertEqual(len(synced_accounts), 2)

        # Verify Account 1 is intact and NOT overwritten
        acc1 = next(a for a in synced_accounts if a['id'] == 'acc_pretax_1')
        self.assertEqual(acc1['name'], 'Primary 401(k)')
        self.assertEqual(acc1['balance'], 500000.0)

        # Verify Account 2 has new name and updated balance
        acc2 = next(a for a in synced_accounts if a['id'] == 'acc_pretax_2')
        self.assertEqual(acc2['name'], 'Vanguard Rollover IRA')
        self.assertEqual(acc2['balance'], 250000.0)

        # Now test syncing back from Accounts to Balance Sheet
        acc2['balance'] = 260000.0
        updated_bs = sync_accounts_to_balance_sheet(bs, synced_accounts)
        bs_accs = updated_bs['categories']['pretax']['accounts']
        self.assertEqual(len(bs_accs), 2)
        self.assertEqual(bs_accs[0]['name'], 'Primary 401(k)')
        self.assertEqual(bs_accs[0]['values'][curr_p], 500000.0)
        self.assertEqual(bs_accs[1]['name'], 'Vanguard Rollover IRA')
        self.assertEqual(bs_accs[1]['values'][curr_p], 260000.0)

    def test_cash_account_for_retirement_syncs_as_taxable(self):
        """Test that checking include_in_retirement on cash emergency/daily/goal accounts syncs as taxable."""
        from core.forms import build_default_balance_sheet, sync_balance_sheet_to_accounts

        bs = build_default_balance_sheet()
        curr_p = bs['current_period']

        # Add emergency fund with include_in_retirement = True
        bs['categories']['emergency']['accounts'].append({
            'id': 'acc_emg_ret',
            'name': 'Emergency HYSA for Retirement',
            'type': 'cash',
            'owner': 'user',
            'include_in_retirement': True,
            'values': {curr_p: 50000.0}
        })

        synced = sync_balance_sheet_to_accounts(bs)
        emg_acc = next(a for a in synced if a['id'] == 'acc_emg_ret')
        self.assertEqual(emg_acc['type'], 'taxable')
        self.assertEqual(emg_acc['balance'], 50000.0)

    def test_post_enter_view_with_account_ids_and_renamed_accounts(self):
        """Test POSTing enter form with account_id fields and renamed balance sheet data."""
        from django.urls import reverse
        from core.forms import build_default_balance_sheet
        import json

        bs = build_default_balance_sheet()
        curr_p = bs['current_period']
        bs['categories']['pretax']['accounts'] = [
            {
                'id': 'acc_pretax_custom_1',
                'name': 'Fidelity 401k Plan',
                'type': 'pretax',
                'owner': 'user',
                'include_in_retirement': True,
                'values': {curr_p: 850000.0},
                'contrib_amount': 23000.0,
                'return_mean': 7.0,
                'return_std': 12.0
            }
        ]

        post_data = {
            'user_name': 'Jane Doe',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '60000',
            'runs': '100',
            'account_id[]': ['acc_pretax_custom_1'],
            'account_name[]': ['Fidelity 401k Plan'],
            'account_type[]': ['pretax'],
            'account_owner[]': ['user'],
            'account_balance[]': ['850,000'],
            'account_contrib_amount[]': ['23,000'],
            'account_contrib_freq[]': ['annual'],
            'account_contrib_start_age[]': ['60'],
            'account_contrib_end_age_type[]': ['retirement'],
            'account_contrib_end_age_specified[]': ['65'],
            'account_contrib_adjust_inflation[]': ['true'],
            'account_return_mean[]': ['7.0%'],
            'account_return_std[]': ['12.0%'],
            'balance_sheet_json': json.dumps(bs),
            'next': 'manage_data'
        }

        resp = self.client.post(reverse('enter'), post_data)
        self.assertEqual(resp.status_code, 302)

        session_data = self.client.session['simulation_data']
        self.assertEqual(session_data['accounts'][0]['name'], 'Fidelity 401k Plan')
        self.assertEqual(session_data['accounts'][0]['balance'], 850000.0)
        self.assertEqual(session_data['accounts'][0]['id'], 'acc_pretax_custom_1')
        self.assertEqual(session_data['balance_sheet']['categories']['pretax']['accounts'][0]['name'], 'Fidelity 401k Plan')
        self.assertEqual(session_data['balance_sheet']['categories']['pretax']['accounts'][0]['values'][curr_p], 850000.0)

    def test_duplicate_account_names_validation(self):
        """Test validate_accounts rejects duplicate and blank account names."""
        from core.forms import validate_accounts

        # Valid accounts
        accs_valid = [
            {'name': 'Primary 401(k)', 'balance': 100000.0, 'contrib_amount': 0, 'contrib_start_age': 60, 'owner': 'user'},
            {'name': 'Roth IRA', 'balance': 50000.0, 'contrib_amount': 0, 'contrib_start_age': 60, 'owner': 'user'},
        ]
        errors = validate_accounts(accs_valid, 60, 90, False, 60, 90)
        self.assertEqual(errors, [])

        # Duplicate account names (case-insensitive)
        accs_dup = [
            {'name': 'Primary 401(k)', 'balance': 100000.0, 'contrib_amount': 0, 'contrib_start_age': 60, 'owner': 'user'},
            {'name': 'primary 401(k) ', 'balance': 50000.0, 'contrib_amount': 0, 'contrib_start_age': 60, 'owner': 'user'},
        ]
        errors = validate_accounts(accs_dup, 60, 90, False, 60, 90)
        self.assertTrue(any('Multiple accounts cannot have the same name' in e for e in errors))

        # Blank account name
        accs_blank = [
            {'name': '   ', 'balance': 100000.0, 'contrib_amount': 0, 'contrib_start_age': 60, 'owner': 'user'},
        ]
        errors = validate_accounts(accs_blank, 60, 90, False, 60, 90)
        self.assertTrue(any('Account Name cannot be blank' in e for e in errors))

    def test_duplicate_balance_sheet_accounts_validation(self):
        """Test validate_balance_sheet_accounts rejects duplicate account names in balance sheet."""
        from core.forms import build_default_balance_sheet, validate_balance_sheet_accounts

        bs = build_default_balance_sheet()
        # Default should have no errors
        errors = validate_balance_sheet_accounts(bs)
        self.assertEqual(errors, [])

        # Duplicate between pretax and roth
        bs['categories']['roth']['accounts'][0]['name'] = bs['categories']['pretax']['accounts'][0]['name']
        errors = validate_balance_sheet_accounts(bs)
        self.assertTrue(any('Multiple accounts cannot have the same name' in e for e in errors))

    def test_enter_post_rejects_duplicate_account_names(self):
        """Test submitting duplicate account names via POST fails validation and shows error notice."""
        from django.urls import reverse
        from core.forms import build_default_balance_sheet
        import json

        bs = build_default_balance_sheet()
        curr_p = bs['current_period']
        bs['categories']['pretax']['accounts'] = []
        bs['categories']['roth']['accounts'] = []
        bs['categories']['hsa']['accounts'] = []
        bs['categories']['taxable']['accounts'] = [
            {'id': 'acc_1', 'name': 'My Brokerage', 'type': 'taxable', 'owner': 'user', 'include_in_retirement': True, 'values': {curr_p: 100000.0}},
            {'id': 'acc_2', 'name': 'my brokerage', 'type': 'taxable', 'owner': 'user', 'include_in_retirement': True, 'values': {curr_p: 50000.0}},
        ]

        post_data = {
            'user_name': 'Jane Doe',
            'user_age': '60',
            'user_retirement_age': '65',
            'user_age_death': '90',
            'desired_spending': '60000',
            'runs': '100',
            'account_id[]': ['acc_1', 'acc_2'],
            'account_name[]': ['My Brokerage', 'my brokerage'],
            'account_type[]': ['taxable', 'taxable'],
            'account_owner[]': ['user', 'user'],
            'account_balance[]': ['100000', '50000'],
            'account_contrib_amount[]': ['0', '0'],
            'account_contrib_freq[]': ['annual', 'annual'],
            'account_contrib_start_age[]': ['60', '60'],
            'account_contrib_end_age_type[]': ['retirement', 'retirement'],
            'account_contrib_end_age_specified[]': ['65', '65'],
            'account_contrib_adjust_inflation[]': ['true', 'true'],
            'account_return_mean[]': ['6.0%', '6.0%'],
            'account_return_std[]': ['10.0%', '10.0%'],
            'balance_sheet_json': json.dumps(bs),
            'next': 'results'
        }

        resp = self.client.post(reverse('enter'), post_data)
        self.assertEqual(resp.status_code, 200)
        # Should render enter page with error message
        self.assertContains(resp, "Multiple accounts cannot have the same name")


class AgeDisambiguationTests(TestCase):
    def test_resolve_age_user_and_spouse_specified(self):
        from core.runs import resolve_age

        # Single user
        self.assertEqual(resolve_age('user_specified', 67, 60, 65, False), 67)
        self.assertEqual(resolve_age('specified', 67, 60, 65, False), 67)

        # Married: User 60, Spouse 58 (Delta = +2 in user coordinates)
        # When spouse is 65, user is 67.
        self.assertEqual(resolve_age('spouse_specified', 65, 60, 65, True, 58, 62, 90, 88), 67)
        self.assertEqual(resolve_age('user_specified', 68, 60, 65, True, 58, 62, 90, 88), 68)
        self.assertEqual(resolve_age('spouse_retirement', None, 60, 65, True, 58, 62, 90, 88), 64) # 62 + 2 = 64
        self.assertEqual(resolve_age('spouse_death', None, 60, 65, True, 58, 62, 90, 88), 90) # 88 + 2 = 90

    def test_spouse_account_specified_end_age(self):
        from core.runs import get_contributions_for_year

        # User is 60, Spouse is 58 (offset = +2)
        # Spouse account: contrib start age 58, contrib end age specified 62 (in spouse age)
        acc_spouse = {
            'is_spouse': True,
            'contrib_amount': 10000.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 58,
            'contrib_end_age_type': 'spouse_specified',
            'contrib_end_age_specified': 62,
            'contrib_adjust_inflation': False,
            'user_ret_age': 65,
            'spouse_ret_age': 65
        }
        # Year 0: User is 60 (Spouse 58) -> within 58..62
        c0 = get_contributions_for_year(0, 60, True, 58, 2026, acc_spouse)
        self.assertEqual(c0, 10000.0)

        # Year 4: User is 64 (Spouse 62) -> within 58..62
        c4 = get_contributions_for_year(4, 60, True, 58, 2026, acc_spouse)
        self.assertEqual(c4, 10000.0)

        # Year 5: User is 65 (Spouse 63) -> past spouse age 62
        c5 = get_contributions_for_year(5, 60, True, 58, 2026, acc_spouse)
        self.assertEqual(c5, 0.0)

    def test_additional_spending_spouse_start_age(self):
        from core.runs import run_deterministic
        # User is 60, Spouse is 55 (Spouse is 5 years younger; offset = +5)
        # Additional spending tied to spouse age 60: starts when spouse is 60 (User is 65, year t=5)
        sim_input = {
            'user_name': 'Primary',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 80,
            'is_married': True,
            'spouse_name': 'Spouse',
            'spouse_age': 55,
            'spouse_retirement_age': 65,
            'spouse_age_death': 80,
            'filing_status': 'joint',
            'current_year': 2026,
            'inflation_rate': 0.0,
            'desired_spending': 0.0,
            'begin_spending_age_type': 'retirement',
            'taxable_assets': {'present_balance': 500000.0, 'return_mean': 0.0, 'return_std': 0.0},
            'additional_spending': [
                {
                    'name': 'Spouse Celebration',
                    'amount': 25000.0,
                    'start_age': 60,
                    'start_age_type': 'spouse',
                    'interval': 0,
                    'adjust_inflation': False
                }
            ],
            'income_sources': []
        }
        steps = run_deterministic(sim_input)

        # Year 0..4 (User 60..64, Spouse 55..59): spending should be 0
        for t in range(5):
            self.assertEqual(steps[t]['additional_spending'], 0.0, f"Year {t} should have 0 spending")

        # Year 5 (User 65, Spouse 60): spending should be 25,000
        self.assertEqual(steps[5]['additional_spending'], 25000.0, "Year 5 should have $25k spending")

    def test_income_source_spouse_specified_dates(self):
        from core.runs import run_deterministic
        # User 60, Spouse 55. Income stream starts at spouse age 60 (User 65, t=5) and ends at spouse age 62 (User 67, t=7)
        sim_input = {
            'user_name': 'Primary',
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 80,
            'is_married': True,
            'spouse_name': 'Spouse',
            'spouse_age': 55,
            'spouse_retirement_age': 65,
            'spouse_age_death': 80,
            'filing_status': 'joint',
            'current_year': 2026,
            'inflation_rate': 0.0,
            'desired_spending': 0.0,
            'begin_spending_age_type': 'retirement',
            'social_security': {'user_entitled': False, 'spouse_entitled': False},
            'taxable_assets': {'present_balance': 100000.0, 'return_mean': 0.0, 'return_std': 0.0},
            'income_sources': [
                {
                    'name': 'Spouse Temporary Contract',
                    'amount': 30000.0,
                    'frequency': 'annual',
                    'start_age_type': 'spouse_specified',
                    'start_age_specified': 60,
                    'end_age_type': 'spouse_specified',
                    'end_age_specified': 62,
                    'subject_to_tax': False,
                    'adjustments': [{'start_type': 'start', 'end_type': 'death', 'adjust_type': 'none', 'adjust_val': 0.0}]
                }
            ]
        }
        steps = run_deterministic(sim_input)

        # Year 0..4 (User 60..64): income 0
        for t in range(5):
            self.assertEqual(steps[t]['income'], 0.0, f"Year {t} income should be 0")

        # Year 5..7 (User 65..67, Spouse 60..62): income 30,000
        for t in range(5, 8):
            self.assertEqual(steps[t]['income'], 30000.0, f"Year {t} income should be 30000")

        # Year 8+ (User 68+, Spouse 63+): income 0
        self.assertEqual(steps[8]['income'], 0.0, "Year 8 income should be 0")

    def test_form_validation_for_user_and_spouse_specified_fields(self):
        from core.forms import validate_additional_spending, validate_accounts

        # Additional spending validation for spouse
        errors = validate_additional_spending([
            {'name': 'Trip', 'amount': 5000.0, 'start_age': 55, 'start_age_type': 'spouse', 'interval': 0, 'adjust_inflation': True}
        ], user_age=60, user_age_death=90, is_married=True, spouse_age=50, spouse_age_death=85)
        self.assertEqual(len(errors), 0)

        # Invalid start_age for spouse (below spouse present age)
        errors = validate_additional_spending([
            {'name': 'Trip', 'amount': 5000.0, 'start_age': 45, 'start_age_type': 'spouse', 'interval': 0, 'adjust_inflation': True}
        ], user_age=60, user_age_death=90, is_married=True, spouse_age=50, spouse_age_death=85)
        self.assertIn("cannot be younger than Spouse's Present Age", errors[0])

        # Accounts validation with user_specified and spouse_specified
        acc_errors = validate_accounts([
            {'id': 'a1', 'name': 'Acc 1', 'type': 'pretax', 'owner': 'user', 'balance': 1000.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual', 'contrib_start_age': 60, 'contrib_end_age_type': 'user_specified', 'contrib_end_age_specified': 65, 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0, 'hsa_for_medical': True},
            {'id': 'a2', 'name': 'Acc 2', 'type': 'pretax', 'owner': 'spouse', 'balance': 1000.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual', 'contrib_start_age': 55, 'contrib_end_age_type': 'spouse_specified', 'contrib_end_age_specified': 60, 'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0, 'hsa_for_medical': True}
        ], user_age=60, user_age_death=90, is_married=True, spouse_age=55, spouse_age_death=85)
        self.assertEqual(len(acc_errors), 0)

    def test_balance_sheet_frequency_filtering_and_persistence(self):
        """Test balance sheet frequency filtering options ('all', 'quarterly', 'yearly')
        and persistence through save/load plan operations."""
        import json
        from django.urls import reverse
        from core.forms import build_default_balance_sheet, parse_balance_sheet

        # Test prompt dates
        test_dates = [
            "2024-02-24", "2024-02-28", "2024-03-31", "2024-05-26", "2024-07-02",
            "2024-09-03", "2024-10-02", "2024-10-31", "2024-12-02", "2024-12-15",
            "2025-02-20", "2025-12-30", "2026-02-28", "2026-03-31", "2026-04-30",
            "2026-05-18", "2026-05-20", "2026-06-28"
        ]

        def filter_periods(periods, freq):
            sorted_p = sorted(list(set(periods)))
            if freq == 'quarterly':
                q_map = {}
                for p in sorted_p:
                    parts = p.split('-')
                    if len(parts) >= 2:
                        y = parts[0]
                        m = int(parts[1])
                        q = (m - 1) // 3 + 1
                        key = f"{y}-Q{q}"
                        if key not in q_map or p > q_map[key]:
                            q_map[key] = p
                return [q_map[k] for k in sorted(q_map.keys())]
            elif freq == 'yearly':
                y_map = {}
                for p in sorted_p:
                    parts = p.split('-')
                    if len(parts) >= 1:
                        y = parts[0]
                        if y not in y_map or p > y_map[y]:
                            y_map[y] = p
                return [y_map[k] for k in sorted(y_map.keys())]
            return sorted_p

        # 1. Verify quarterly candidate columns
        quarterly_candidates = filter_periods(test_dates, 'quarterly')
        expected_quarterly = [
            "2024-03-31", "2024-05-26", "2024-09-03", "2024-12-15",
            "2025-02-20", "2025-12-30", "2026-03-31", "2026-06-28"
        ]
        self.assertEqual(quarterly_candidates, expected_quarterly)

        # 2. Verify with limit = 4
        limited_quarterly = quarterly_candidates[-4:]
        expected_limited_q = ["2025-02-20", "2025-12-30", "2026-03-31", "2026-06-28"]
        self.assertEqual(limited_quarterly, expected_limited_q)

        # 3. Verify yearly candidate columns
        yearly_candidates = filter_periods(test_dates, 'yearly')
        expected_yearly = ["2024-12-15", "2025-12-30", "2026-06-28"]
        self.assertEqual(yearly_candidates, expected_yearly)

        # 4. Verify persistence in plan load/save
        bs = build_default_balance_sheet()
        bs['period_view_frequency'] = 'quarterly'
        bs['period_view_limit'] = 4
        bs['periods'] = test_dates
        bs['current_period'] = test_dates[-1]

        plan_data = {
            'user_age': 60,
            'user_retirement_age': 65,
            'user_age_death': 90,
            'is_married': False,
            'desired_spending': 50000.0,
            'balance_sheet': bs,
            'accounts': []
        }

        resp = self.client.post(reverse('load_plan'), {
            'json_data': json.dumps(plan_data),
            'next': 'enter'
        })
        self.assertEqual(resp.status_code, 302)

        session_bs = self.client.session['simulation_data']['balance_sheet']
        self.assertEqual(session_bs.get('period_view_frequency'), 'quarterly')
        self.assertEqual(session_bs.get('period_view_limit'), 4)
        self.assertEqual(session_bs.get('periods'), test_dates)

