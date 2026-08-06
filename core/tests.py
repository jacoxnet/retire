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
        self.assertContains(response, "Target Success Rate must be between 1% and 99% for Goal-Seeking simulation.")

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






