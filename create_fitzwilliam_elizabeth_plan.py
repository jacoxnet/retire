import json
import calendar

def build_fitzwilliam_and_elizabeth_plan():
    # 1. Historical Monthly Periods (Jan 2022 to Oct 2026)
    # Skipping 5 months: May 2022, Nov 2022, Sep 2023, Jul 2024, Mar 2025
    skip_months = {(2022, 5), (2022, 11), (2023, 9), (2024, 7), (2025, 3)}
    
    periods = []
    use_month_end = True
    
    for year in range(2022, 2027):
        max_m = 10 if year == 2026 else 12
        for month in range(1, max_m + 1):
            if (year, month) in skip_months:
                continue
            
            last_day = calendar.monthrange(year, month)[1]
            if year == 2026 and month == 10:
                # Current date
                date_str = "2026-10-10"
            elif use_month_end:
                date_str = f"{year}:{month:02d}:{last_day:02d}".replace(':', '-')
            else:
                day = max(22, last_day - 6)
                date_str = f"{year}:{month:02d}:{day:02d}".replace(':', '-')
            
            periods.append(date_str)
            use_month_end = not use_month_end

    curr_period = "2026-10-10"
    if curr_period not in periods:
        periods.append(curr_period)
        
    num_periods = len(periods)
    
    # We model realistic market trajectory:
    # 2022: volatile market with tech pullbacks (~0.76 of end value)
    # 2023: steady recovery
    # 2024: experiences typical ups and downs with one 18% DECREASE in 2024 (e.g. spring/summer 2024 dip)
    # 2025-2026: strong bull market run up to 100% of current target values on Oct 10, 2026.
    
    def generate_market_factors():
        factors = []
        for p in periods:
            parts = p.split('-')
            y = int(parts[0])
            m = int(parts[1])
            d = int(parts[2])
            
            # Base timeline progression (0.0 at Jan 2022, 1.0 at Oct 2026)
            year_frac = (y - 2022) + (m - 1) / 12.0 + (d / 365.0)
            total_span = (2026 - 2022) + (10 - 1) / 12.0 + (10 / 365.0)
            t_norm = min(1.0, max(0.0, year_frac / total_span))
            
            # Baseline growth curve from 0.76 to 1.00
            base = 0.76 + (1.00 - 0.76) * t_norm
            
            # 2024 18% drawdown: mid-2024 drop of ~18%
            dip = 0.0
            if y == 2024:
                # Dip reaches ~18% in May-August 2024
                if m in (4, 5):
                    dip = -0.12
                elif m in (6, 8):  # note Jul 2024 is skipped
                    dip = -0.18
                elif m in (9, 10):
                    dip = -0.10
                elif m in (11, 12):
                    dip = -0.04
            elif y == 2022 and m in (6, 9):
                dip = -0.05
            elif y == 2023 and m in (8, 10):
                dip = -0.03
            elif y == 2025 and m in (8, 9):
                dip = -0.04
                
            factor = max(0.5, base * (1.0 + dip))
            factors.append(factor)
            
        # Ensure the final period exactly matches 1.00 (today's exact balance)
        factors[-1] = 1.00
        return factors

    market_factors = generate_market_factors()
    
    def series_for(target_end_val, noise=0.0):
        res = {}
        for i, p in enumerate(periods):
            f = market_factors[i]
            val = target_end_val * f
            if noise > 0 and i < num_periods - 1:
                # Deterministic small variation
                var = ((i * 43) % 9 - 4) * noise
                val = round(val + var, 2)
            else:
                val = round(val, 2)
            res[p] = val
        return res

    def linear_amort(start_val, end_val):
        res = {}
        for i, p in enumerate(periods):
            frac = i / float(num_periods - 1) if num_periods > 1 else 1.0
            res[p] = round(start_val + (end_val - start_val) * frac, 2)
        return res

    # 2. Account Trajectories
    # Total retirement portfolio = $5,000,000
    fitz_403b_1_vals = series_for(1000000.0, noise=250.0)
    fitz_403b_2_vals = series_for(600000.0, noise=150.0)
    liz_pretax_ira_vals = series_for(400000.0, noise=100.0)
    fitz_roth_ira_vals = series_for(400000.0, noise=120.0)
    liz_roth_401k_vals = series_for(850000.0, noise=200.0)
    fitz_hsa_vals = series_for(250000.0, noise=80.0)
    joint_taxable_1_vals = series_for(750000.0, noise=180.0)
    joint_taxable_2_vals = series_for(750000.0, noise=180.0)

    # Cash and Sinking Funds
    emergency_vals = series_for(45000.0, noise=120.0)
    housing_vals = linear_amort(17000.0, 22000.0)
    car_fund_vals = linear_amort(8000.0, 30000.0)
    vacation_fund_vals = linear_amort(3500.0, 5500.0)
    daily_checking_vals = linear_amort(7500.0, 9500.0)

    # Real Estate & Debts
    house_vals = linear_amort(540000.0, 650000.0)
    mortgage_vals = linear_amort(165000.0, 125000.0)
    student_loan_vals = linear_amort(47500.0, 37500.0)

    # 3. Retirement Accounts Card List
    accounts = [
        {
            "id": "acc_fitz_403b_1",
            "name": "Fitzwilliam's Primary Pretax 403(b)",
            "institution": "TIAA",
            "type": "pretax",
            "owner": "user",
            "balance": 1000000.0,
            "contrib_amount": 600.0,
            "contrib_freq": "monthly",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 8.5,
            "return_std": 13.0,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_fitz_403b_2",
            "name": "Fitzwilliam's Secondary Pretax 403(b)",
            "institution": "Fidelity",
            "type": "pretax",
            "owner": "user",
            "balance": 600000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 8.5,
            "return_std": 13.0,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_liz_pretax_ira",
            "name": "Elizabeth's Pretax IRA",
            "institution": "Vanguard",
            "type": "pretax",
            "owner": "spouse",
            "balance": 400000.0,
            "contrib_amount": 7000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 53,
            "contrib_end_age_type": "spouse_retirement",
            "contrib_end_age_specified": 54,
            "contrib_adjust_inflation": True,
            "return_mean": 7.0,
            "return_std": 9.5,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_fitz_roth_ira",
            "name": "Fitzwilliam's Roth IRA",
            "institution": "Vanguard",
            "type": "roth",
            "owner": "user",
            "balance": 400000.0,
            "contrib_amount": 7000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 8.5,
            "return_std": 13.0,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_liz_roth_401k",
            "name": "Elizabeth's Roth 401(k)",
            "institution": "Charles Schwab",
            "type": "roth",
            "owner": "spouse",
            "balance": 850000.0,
            "contrib_amount": 23000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 53,
            "contrib_end_age_type": "spouse_retirement",
            "contrib_end_age_specified": 54,
            "contrib_adjust_inflation": True,
            "return_mean": 7.0,
            "return_std": 9.5,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_fitz_hsa",
            "name": "Fitzwilliam's Health Savings Account",
            "institution": "Fidelity HSA",
            "type": "hsa",
            "owner": "user",
            "balance": 250000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 6.5,
            "return_std": 8.0,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_joint_taxable_1",
            "name": "Joint Taxable Brokerage Account #1",
            "institution": "Vanguard",
            "type": "taxable",
            "owner": "user",
            "balance": 750000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 7.5,
            "return_std": 10.0,
            "hsa_for_medical": True,
            "dividend_yield": 2.0,
            "qualified_dividend_pct": 85.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.5,
            "cost_basis_ratio": 70.0
        },
        {
            "id": "acc_joint_taxable_2",
            "name": "Joint Taxable Brokerage Account #2",
            "institution": "Fidelity",
            "type": "taxable",
            "owner": "user",
            "balance": 750000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 61,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 62,
            "contrib_adjust_inflation": True,
            "return_mean": 7.5,
            "return_std": 10.0,
            "hsa_for_medical": True,
            "dividend_yield": 2.0,
            "qualified_dividend_pct": 85.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.5,
            "cost_basis_ratio": 70.0
        }
    ]

    # 4. Comprehensive Balance Sheet Structure
    balance_sheet = {
        "periods": periods,
        "current_period": curr_period,
        "marginal_tax_rate": 24.0,
        "marginal_tax_rate_override": None,
        "emergency_goal_amount": 40000.0,
        "period_view_limit": 6,
        "period_view_frequency": "all",
        "categories": {
            "pretax": {
                "title": "Pretax Retirement Accounts",
                "is_pretax": True,
                "accounts": [
                    {
                        "id": "acc_fitz_403b_1",
                        "name": "Fitzwilliam's Primary Pretax 403(b)",
                        "institution": "TIAA",
                        "owner": "user",
                        "type": "pretax",
                        "include_in_retirement": True,
                        "values": fitz_403b_1_vals,
                        "contrib_amount": 600.0,
                        "contrib_freq": "monthly",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 8.5,
                        "return_std": 13.0,
                        "hsa_for_medical": True
                    },
                    {
                        "id": "acc_fitz_403b_2",
                        "name": "Fitzwilliam's Secondary Pretax 403(b)",
                        "institution": "Fidelity",
                        "owner": "user",
                        "type": "pretax",
                        "include_in_retirement": True,
                        "values": fitz_403b_2_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 8.5,
                        "return_std": 13.0,
                        "hsa_for_medical": True
                    },
                    {
                        "id": "acc_liz_pretax_ira",
                        "name": "Elizabeth's Pretax IRA",
                        "institution": "Vanguard",
                        "owner": "spouse",
                        "type": "pretax",
                        "include_in_retirement": True,
                        "values": liz_pretax_ira_vals,
                        "contrib_amount": 7000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 53,
                        "contrib_end_age_type": "spouse_retirement",
                        "contrib_end_age_specified": 54,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.0,
                        "return_std": 9.5,
                        "hsa_for_medical": True
                    }
                ]
            },
            "roth": {
                "title": "Post-Tax (Roth) Retirement Accounts",
                "is_pretax": False,
                "accounts": [
                    {
                        "id": "acc_fitz_roth_ira",
                        "name": "Fitzwilliam's Roth IRA",
                        "institution": "Vanguard",
                        "owner": "user",
                        "type": "roth",
                        "include_in_retirement": True,
                        "values": fitz_roth_ira_vals,
                        "contrib_amount": 7000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 8.5,
                        "return_std": 13.0,
                        "hsa_for_medical": True
                    },
                    {
                        "id": "acc_liz_roth_401k",
                        "name": "Elizabeth's Roth 401(k)",
                        "institution": "Charles Schwab",
                        "owner": "spouse",
                        "type": "roth",
                        "include_in_retirement": True,
                        "values": liz_roth_401k_vals,
                        "contrib_amount": 23000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 53,
                        "contrib_end_age_type": "spouse_retirement",
                        "contrib_end_age_specified": 54,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.0,
                        "return_std": 9.5,
                        "hsa_for_medical": True
                    }
                ]
            },
            "taxable": {
                "title": "Investment / Taxable Brokerage Accounts",
                "is_pretax": False,
                "accounts": [
                    {
                        "id": "acc_joint_taxable_1",
                        "name": "Joint Taxable Brokerage Account #1",
                        "institution": "Vanguard",
                        "owner": "user",
                        "type": "taxable",
                        "include_in_retirement": True,
                        "values": joint_taxable_1_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.5,
                        "return_std": 10.0,
                        "dividend_yield": 2.0,
                        "qualified_dividend_pct": 85.0,
                        "interest_yield": 0.0,
                        "capital_gains_dist_rate": 0.5,
                        "cost_basis_ratio": 70.0
                    },
                    {
                        "id": "acc_joint_taxable_2",
                        "name": "Joint Taxable Brokerage Account #2",
                        "institution": "Fidelity",
                        "owner": "user",
                        "type": "taxable",
                        "include_in_retirement": True,
                        "values": joint_taxable_2_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.5,
                        "return_std": 10.0,
                        "dividend_yield": 2.0,
                        "qualified_dividend_pct": 85.0,
                        "interest_yield": 0.0,
                        "capital_gains_dist_rate": 0.5,
                        "cost_basis_ratio": 70.0
                    }
                ]
            },
            "hsa": {
                "title": "Health Savings Accounts (HSA)",
                "is_pretax": False,
                "accounts": [
                    {
                        "id": "acc_fitz_hsa",
                        "name": "Fitzwilliam's Health Savings Account",
                        "institution": "Fidelity HSA",
                        "owner": "user",
                        "type": "hsa",
                        "include_in_retirement": True,
                        "values": fitz_hsa_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 61,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 62,
                        "contrib_adjust_inflation": True,
                        "return_mean": 6.5,
                        "return_std": 8.0,
                        "hsa_for_medical": True
                    }
                ]
            },
            "emergency": {
                "title": "Emergency Fund Accounts",
                "is_pretax": False,
                "target_amount": 40000.0,
                "target_auto_inflate": False,
                "target_base_date": curr_period,
                "accounts": [
                    {
                        "id": "acc_emg_cash",
                        "name": "High-Yield Emergency Cash Savings",
                        "institution": "Marcus by Goldman Sachs",
                        "owner": "user",
                        "type": "cash",
                        "include_in_retirement": False,
                        "values": emergency_vals
                    }
                ]
            },
            "goals": {
                "title": "Goal Savings (Sinking Funds)",
                "is_pretax": False,
                "goal_groups": [
                    {
                        "id": "goal_housing",
                        "name": "Extraordinary Housing Expenses Reserve",
                        "target_amount": 20000.0,
                        "target_auto_inflate": False,
                        "target_base_date": curr_period,
                        "accounts": [
                            {
                                "id": "acc_g_housing",
                                "name": "Housing Emergency Reserve",
                                "institution": "Capital One 360",
                                "owner": "user",
                                "type": "cash",
                                "include_in_retirement": False,
                                "values": housing_vals
                            }
                        ]
                    },
                    {
                        "id": "goal_car",
                        "name": "Car Replacement Sinking Fund",
                        "target_amount": 50000.0,
                        "target_auto_inflate": True,
                        "target_base_date": curr_period,
                        "accounts": [
                            {
                                "id": "acc_g_car",
                                "name": "Car Fund (HYSA)",
                                "institution": "Ally Bank",
                                "owner": "user",
                                "type": "cash",
                                "include_in_retirement": False,
                                "values": car_fund_vals
                            }
                        ]
                    },
                    {
                        "id": "goal_vacation",
                        "name": "Vacation & Travel Sinking Fund",
                        "target_amount": 30000.0,
                        "target_auto_inflate": True,
                        "target_base_date": curr_period,
                        "accounts": [
                            {
                                "id": "acc_g_vacation",
                                "name": "Vacation Savings",
                                "institution": "Discover Bank",
                                "owner": "user",
                                "type": "cash",
                                "include_in_retirement": False,
                                "values": vacation_fund_vals
                            }
                        ]
                    }
                ]
            },
            "daily": {
                "title": "Daily Spending Accounts (Checking & Cash)",
                "is_pretax": False,
                "accounts": [
                    {
                        "id": "acc_daily_checking",
                        "name": "Joint Primary Checking",
                        "institution": "Chase Bank",
                        "owner": "user",
                        "type": "cash",
                        "include_in_retirement": False,
                        "values": daily_checking_vals
                    }
                ]
            },
            "real_estate": {
                "properties": [
                    {
                        "id": "prop_primary",
                        "name": "Primary Residence",
                        "market_values": house_vals,
                        "mortgages": [
                            {
                                "id": "mort_primary",
                                "name": "Primary Mortgage",
                                "balances": mortgage_vals
                            }
                        ]
                    }
                ]
            },
            "debts": [
                {
                    "id": "debt_student",
                    "name": "Fitzwilliam's Student Loan",
                    "institution": "Federal Student Aid",
                    "values": student_loan_vals
                }
            ]
        }
    }

    # 5. Income Sources
    income_sources = [
        {
            "name": "Fitzwilliam's Salary",
            "amount": 240000.0,
            "frequency": "annual",
            "start_age_type": "specified",
            "start_age_specified": 61,
            "end_age_type": "retirement",
            "end_age_specified": 62,
            "subject_to_tax": True,
            "is_social_security": False,
            "has_survivor_benefit": False,
            "survivor_benefit_pct": 0.0,
            "adjust_type": "inflation_less_pct",
            "adjust_val": 1.0,
            "adjust_start_age_type": "current_age",
            "adjust_start_age_specified": 61,
            "adjustments": [
                {
                    "start_type": "current_age",
                    "start_spec": 61,
                    "end_type": "retirement",
                    "end_spec": 62,
                    "adjust_type": "inflation_less_pct",
                    "adjust_val": 1.0
                }
            ]
        },
        {
            "name": "Elizabeth's Salary",
            "amount": 60000.0,
            "frequency": "annual",
            "start_age_type": "spouse_specified",
            "start_age_specified": 53,
            "end_age_type": "spouse_retirement",
            "end_age_specified": 54,
            "subject_to_tax": True,
            "is_social_security": False,
            "has_survivor_benefit": False,
            "survivor_benefit_pct": 0.0,
            "adjust_type": "inflation_less_pct",
            "adjust_val": 1.0,
            "adjust_start_age_type": "current_age",
            "adjust_start_age_specified": 53,
            "adjustments": [
                {
                    "start_type": "current_age",
                    "start_spec": 53,
                    "end_type": "spouse_retirement",
                    "end_spec": 54,
                    "adjust_type": "inflation_less_pct",
                    "adjust_val": 1.0
                }
            ]
        },
        {
            "name": "Fitzwilliam's Pension",
            "amount": 3200.0,
            "frequency": "monthly",
            "start_age_type": "retirement",
            "start_age_specified": 62,
            "end_age_type": "death",
            "end_age_specified": 95,
            "subject_to_tax": True,
            "is_social_security": False,
            "has_survivor_benefit": True,
            "survivor_benefit_pct": 75.0,
            "adjust_type": "inflation",
            "adjust_val": 0.0,
            "adjust_start_age_type": "current_age",
            "adjust_start_age_specified": 61,
            "adjustments": [
                {
                    "start_type": "current_age",
                    "start_spec": 61,
                    "end_type": "retirement",
                    "end_spec": 62,
                    "adjust_type": "inflation",
                    "adjust_val": 0.0
                },
                {
                    "start_type": "retirement",
                    "start_spec": 62,
                    "end_type": "death",
                    "end_spec": 95,
                    "adjust_type": "none",
                    "adjust_val": 0.0
                }
            ]
        },
        {
            "name": "Elizabeth's Inheritance",
            "amount": 250000.0,
            "frequency": "one_time",
            "start_age_type": "spouse_specified",
            "start_age_specified": 73,
            "end_age_type": "spouse_specified",
            "end_age_specified": 73,
            "subject_to_tax": False,
            "is_social_security": False,
            "has_survivor_benefit": False,
            "survivor_benefit_pct": 0.0,
            "adjust_type": "inflation",
            "adjust_val": 0.0,
            "adjust_start_age_type": "current_age",
            "adjust_start_age_specified": 53,
            "adjustments": [
                {
                    "start_type": "current_age",
                    "start_spec": 53,
                    "end_type": "spouse_specified",
                    "end_spec": 73,
                    "adjust_type": "inflation",
                    "adjust_val": 0.0
                }
            ]
        }
    ]

    # 6. Additional Spending
    # Retires at 62 in 2027. First year after retirement is 2028 (Fitzwilliam age 63, even-numbered year).
    additional_spending = [
        {
            "name": "Even-Year Vacation (Relaxed Travel)",
            "amount": 4000.0,
            "start_age": 63,
            "start_age_type": "user",
            "interval": 2,
            "adjust_inflation": True
        },
        {
            "name": "Odd-Year Vacation (Major International Travel)",
            "amount": 30000.0,
            "start_age": 64,
            "start_age_type": "user",
            "interval": 2,
            "adjust_inflation": True
        },
        {
            "name": "Next Vehicle Replacement (Every 10 Years)",
            "amount": 50000.0,
            "start_age": 66,
            "start_age_type": "user",
            "interval": 10,
            "adjust_inflation": True
        }
    ]

    # 7. Rebalancing Configuration
    rebalancing = {
        "included_account_ids": [
            "acc_fitz_403b_1",
            "acc_fitz_403b_2",
            "acc_liz_pretax_ira",
            "acc_fitz_roth_ira",
            "acc_liz_roth_401k",
            "acc_fitz_hsa",
            "acc_joint_taxable_1",
            "acc_joint_taxable_2"
        ],
        "tolerance_percent": 5.0,
        "rebalance_mode": "target",
        "cash_flow": 0.0,
        "asset_classes": [
            {
                "id": "ac_stocks",
                "name": "Stocks",
                "target_percent": 50.0,
                "color": "#3b82f6"
            },
            {
                "id": "ac_bonds",
                "name": "Bonds",
                "target_percent": 32.0,
                "color": "#10b981"
            },
            {
                "id": "ac_real_estate",
                "name": "Real Estate",
                "target_percent": 10.0,
                "color": "#8b5cf6"
            },
            {
                "id": "ac_cash",
                "name": "Cash",
                "target_percent": 8.0,
                "color": "#f59e0b"
            }
        ],
        "account_allocations": {}
    }

    plan_data = {
        "goal_seeking": False,
        "simulation_type": "regular",
        "user_name": "Fitzwilliam",
        "user_age": 61,
        "user_retirement_age": 62,
        "user_age_death": 95,
        "is_married": True,
        "spouse_name": "Elizabeth Bennett Darcy",
        "spouse_age": 53,
        "spouse_retirement_age": 54,
        "spouse_age_death": 103,
        "filing_status": "joint",
        "current_year": 2026,
        "begin_spending_age_type": "retirement",
        "begin_spending_age_specified": 62,
        "desired_spending": 168000.0,
        "survivor_spending": 144000.0,
        "adjust_spending_inflation": True,
        "inflation_rate": 3.0,
        "runs": 10000,
        "target_success_rate": 85.0,
        "state_tax_rate": 4.5,
        "state_ss_exempt": True,
        "user_life_insurance_amount": 1000000.0,
        "user_life_insurance_type": "permanent",
        "user_life_insurance_term_age": 70,
        "spouse_life_insurance_amount": 500000.0,
        "spouse_life_insurance_type": "term",
        "spouse_life_insurance_term_age": 71,
        "social_security": {
            "user_receiving": False,
            "user_future_entitled": True,
            "user_entitled": True,
            "user_amount": 4500.0,
            "user_freq": "monthly",
            "user_start_age": 70,
            "spouse_receiving": False,
            "spouse_future_entitled": True,
            "spouse_entitled": True,
            "spouse_amount": 1550.0,
            "spouse_freq": "monthly",
            "spouse_start_age": 62
        },
        "accounts": accounts,
        "balance_sheet": balance_sheet,
        "income_sources": income_sources,
        "additional_spending": additional_spending,
        "other_taxes": [],
        "rebalancing": rebalancing
    }
    return plan_data

if __name__ == '__main__':
    data = build_fitzwilliam_and_elizabeth_plan()
    
    # Save to web fixtures
    with open('/Users/Mike/Documents/GitHub/retire/web/fixtures/saved-plans/fitzwilliam_and_elizabeth.json', 'w') as f:
        json.dump(data, f, indent=4)
        
    # Save to legacy fixtures / saved json files
    with open('/Users/Mike/Documents/GitHub/retire/legacy/saved json files/fitzwilliam_and_elizabeth_plan.json', 'w') as f:
        json.dump(data, f, indent=4)
    with open('/Users/Mike/Documents/GitHub/retire/legacy/saved json files/fitzwilliam_and_elizabeth.json', 'w') as f:
        json.dump(data, f, indent=4)
        
    print(f"Plan generated successfully with {len(data['balance_sheet']['periods'])} monthly historical periods!")
    print(f"Total retirement accounts: {len(data['accounts'])}")
    total_bal = sum(a['balance'] for a in data['accounts'])
    print(f"Total retirement balance: ${total_bal:,.2f}")
