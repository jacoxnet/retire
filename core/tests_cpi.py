"""Unit and integration tests for CPI-U target inflation and FRED service."""

import json
from django.test import TestCase, Client
from django.urls import reverse

from core.cpi_service import (
    load_cpi_data,
    get_prior_month_str,
    get_cpi_index_for_date,
    calculate_cpi_inflation,
    get_latest_cpi_month,
    TREASURY_CONTINGENCY_OVERRIDES,
)
from core.forms import build_default_balance_sheet, parse_balance_sheet


class CpiServiceTests(TestCase):
    """Test CPI data retrieval, interpolation, contingency overrides, and lag calculations."""

    def test_load_cpi_data_contains_treasury_contingency(self):
        data = load_cpi_data()
        self.assertIsInstance(data, dict)
        self.assertGreater(len(data), 500)
        # October 2025 federal shutdown contingency
        self.assertEqual(data.get("2025-10"), 325.604)

    def test_get_prior_month_str(self):
        self.assertEqual(get_prior_month_str("2024-02-15"), "2024-01")
        self.assertEqual(get_prior_month_str("2020-06-01"), "2020-05")
        self.assertEqual(get_prior_month_str("2025-01-01"), "2024-12")
        self.assertEqual(get_prior_month_str("2026-09"), "2026-08")

    def test_calculate_cpi_inflation_feb_2025(self):
        # Base date Feb 2025 -> prior month Jan 2025 (CPI: 317.671)
        # Eval date Sept 2026 -> prior month Aug 2026 (CPI: 334.980)
        res = calculate_cpi_inflation("2025-02-15", "2026-09-01")
        self.assertEqual(res["base_month"], "2025-01")
        self.assertEqual(res["base_index"], 317.671)
        self.assertEqual(res["eval_month"], "2026-08")
        self.assertEqual(res["eval_index"], 334.980)
        self.assertAlmostEqual(res["inflation_pct"], 5.45, places=2)

    def test_calculate_cpi_inflation_june_2020(self):
        # Base date June 2020 -> prior month May 2020 (CPI: 256.394)
        # Eval date Sept 2026 -> prior month Aug 2026 (CPI: 334.980)
        res = calculate_cpi_inflation("2020-06-01", "2026-09-01")
        self.assertEqual(res["base_month"], "2020-05")
        self.assertEqual(res["base_index"], 256.394)
        self.assertEqual(res["eval_month"], "2026-08")
        self.assertEqual(res["eval_index"], 334.980)
        self.assertAlmostEqual(res["inflation_pct"], 30.65, places=2)

    def test_october_2025_reference_date(self):
        # Reference date Nov 2025 -> prior month Oct 2025 (Treasury contingency: 325.604)
        res = calculate_cpi_inflation("2025-11-15", "2026-09-01")
        self.assertEqual(res["base_month"], "2025-10")
        self.assertEqual(res["base_index"], 325.604)


class BalanceSheetCpiIntegrationTests(TestCase):
    """Test balance sheet data structures, parsing, and serialization with CPI attributes."""

    def test_build_default_balance_sheet_has_cpi_fields(self):
        bs = build_default_balance_sheet()
        emg = bs["categories"]["emergency"]
        self.assertIn("target_auto_inflate", emg)
        self.assertFalse(emg["target_auto_inflate"])
        self.assertIn("target_base_date", emg)

        goals = bs["categories"]["goals"]["goal_groups"]
        for g in goals:
            self.assertIn("target_auto_inflate", g)
            self.assertFalse(g["target_auto_inflate"])
            self.assertIn("target_base_date", g)

    def test_parse_balance_sheet_preserves_cpi_fields(self):
        bs = build_default_balance_sheet()
        bs["categories"]["emergency"]["target_amount"] = 40000.0
        bs["categories"]["emergency"]["target_auto_inflate"] = True
        bs["categories"]["emergency"]["target_base_date"] = "2025-02-01"

        goal_car = bs["categories"]["goals"]["goal_groups"][0]
        goal_car["target_amount"] = 25000.0
        goal_car["target_auto_inflate"] = True
        goal_car["target_base_date"] = "2020-06-01"

        raw_json = json.dumps(bs)
        parsed = parse_balance_sheet(raw_json)

        self.assertTrue(parsed["categories"]["emergency"]["target_auto_inflate"])
        self.assertEqual(parsed["categories"]["emergency"]["target_base_date"], "2025-02-01")
        self.assertEqual(parsed["categories"]["emergency"]["target_amount"], 40000.0)

        parsed_car = parsed["categories"]["goals"]["goal_groups"][0]
        self.assertTrue(parsed_car["target_auto_inflate"])
        self.assertEqual(parsed_car["target_base_date"], "2020-06-01")
        self.assertEqual(parsed_car["target_amount"], 25000.0)

    def test_parse_legacy_balance_sheet_backfills_cpi_defaults(self):
        # Legacy structure without target_auto_inflate / target_base_date
        legacy_bs = {
            "periods": ["2026-08-31"],
            "current_period": "2026-08-31",
            "categories": {
                "emergency": {
                    "title": "Emergency Fund Accounts",
                    "target_amount": 30000.0,
                    "accounts": []
                },
                "goals": {
                    "title": "Goal Savings",
                    "goal_groups": [
                        {
                            "id": "g1",
                            "name": "Vacation",
                            "target_amount": 5000.0,
                            "accounts": []
                        }
                    ]
                }
            }
        }
        parsed = parse_balance_sheet(json.dumps(legacy_bs))
        emg = parsed["categories"]["emergency"]
        self.assertFalse(emg["target_auto_inflate"])
        self.assertEqual(emg["target_base_date"], "2026-08-31")

        g1 = parsed["categories"]["goals"]["goal_groups"][0]
        self.assertFalse(g1["target_auto_inflate"])
        self.assertEqual(g1["target_base_date"], "2026-08-31")


class CpiViewsAndApiTests(TestCase):
    """Test Django views and API endpoints for CPI data."""

    def setUp(self):
        self.client = Client()

    def test_cpi_data_api(self):
        resp = self.client.get(reverse("cpi_data_api"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("2025-10", data)
        self.assertEqual(data["2025-10"], 325.604)
        self.assertIn("2026-08", data)

    def test_enter_view_contains_cpi_data_script(self):
        resp = self.client.get(reverse("enter"))
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode("utf-8")
        self.assertIn('id="initial-cpi-data"', content)
        self.assertIn('id="targetCpiModal"', content)
        self.assertIn('id="modalGoalBaseTargetRow"', content)
