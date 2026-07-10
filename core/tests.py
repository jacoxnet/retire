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
