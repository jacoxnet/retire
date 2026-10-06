import json
import datetime
import calendar

def build_jack_and_diane_plan():
    # 1. Generate Historical Monthly Periods (Jan 2022 to Sept 2026)
    # Skipping 5 months: Mar 2022, Nov 2023, Jul 2024, Jan 2025, May 2026
    skip_months = {(2022, 3), (2023, 11), (2024, 7), (2025, 1), (2026, 5)}
    
    periods = []
    
    # We alternate between month-end (last day) and week before month end (e.g. 23rd-25th)
    use_month_end = True
    
    for year in range(2022, 2027):
        max_m = 9 if year == 2026 else 12
        for month in range(1, max_m + 1):
            if (year, month) in skip_months:
                continue
            
            last_day = calendar.monthrange(year, month)[1]
            if year == 2026 and month == 9:
                # Current date
                date_str = "2026-09-27"
            elif use_month_end:
                date_str = f"{year}:{month:02d}:{last_day:02d}".replace(':', '-')
            else:
                day = max(22, last_day - 6)
                date_str = f"{year}:{month:02d}:{day:02d}".replace(':', '-')
            
            periods.append(date_str)
            use_month_end = not use_month_end

    curr_period = "2026-09-27"
    if curr_period not in periods:
        periods.append(curr_period)
        
    num_periods = len(periods)
    
    def interp_values(start_val, end_val, noise=0.0):
        vals = {}
        for i, p in enumerate(periods):
            frac = i / float(num_periods - 1) if num_periods > 1 else 1.0
            base = start_val + (end_val - start_val) * frac
            # Add small realistic fluctuation if noise > 0
            if noise > 0 and i < num_periods - 1:
                # Deterministic pseudo-random variation based on index
                var = ((i * 37) % 11 - 5) * noise
                val = round(base + var, 2)
            else:
                val = round(base, 2)
            vals[p] = val
        return vals

    # 2. Accounts & Values Trajectories (Jan 2022 -> Sept 2026)
    # Total retirement = $2,400,000 spread as 40% pretax ($960k), 45% Roth ($1.08M), 5% HSA ($120k), 10% Taxable ($240k)
    jack_403b_vals = interp_values(410000.0, 560000.0, noise=150.0)
    diane_ira_vals = interp_values(300000.0, 400000.0, noise=120.0)
    jack_roth_vals = interp_values(360000.0, 480000.0, noise=140.0)
    diane_roth_vals = interp_values(430000.0, 600000.0, noise=180.0)
    jack_hsa_vals = interp_values(90000.0, 120000.0, noise=50.0)
    joint_taxable_vals = interp_values(180000.0, 240000.0, noise=80.0)

    emergency_vals = interp_values(38000.0, 45000.0, noise=100.0)
    housing_vals = interp_values(17500.0, 22000.0, noise=60.0)
    car_fund_vals = interp_values(9000.0, 30000.0, noise=40.0)
    vacation_fund_vals = interp_values(3500.0, 5500.0, noise=80.0)
    daily_checking_vals = interp_values(6500.0, 8500.0, noise=90.0)

    house_vals = interp_values(540000.0, 650000.0, noise=0.0)
    mortgage_vals = interp_values(162000.0, 125000.0, noise=0.0)
    student_loan_vals = interp_values(47500.0, 37500.0, noise=0.0)

    # 3. Account Cards List
    accounts = [
        {
            "id": "acc_jack_403b",
            "name": "Jack's Pretax 403(b)",
            "institution": "TIAA",
            "type": "pretax",
            "owner": "user",
            "balance": 560000.0,
            "contrib_amount": 600.0,
            "contrib_freq": "monthly",
            "contrib_start_age": 56,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 60,
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
            "id": "acc_diane_pretax_ira",
            "name": "Diane's Pretax IRA",
            "institution": "Fidelity",
            "type": "pretax",
            "owner": "spouse",
            "balance": 400000.0,
            "contrib_amount": 7000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 53,
            "contrib_end_age_type": "spouse_retirement",
            "contrib_end_age_specified": 57,
            "contrib_adjust_inflation": True,
            "return_mean": 7.2,
            "return_std": 9.5,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_jack_roth_ira",
            "name": "Jack's Roth IRA",
            "institution": "Vanguard",
            "type": "roth",
            "owner": "user",
            "balance": 480000.0,
            "contrib_amount": 7000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 56,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 60,
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
            "id": "acc_diane_roth_401k",
            "name": "Diane's Roth 401(k)",
            "institution": "Charles Schwab",
            "type": "roth",
            "owner": "spouse",
            "balance": 600000.0,
            "contrib_amount": 23000.0,
            "contrib_freq": "annual",
            "contrib_start_age": 53,
            "contrib_end_age_type": "spouse_retirement",
            "contrib_end_age_specified": 57,
            "contrib_adjust_inflation": True,
            "return_mean": 7.2,
            "return_std": 9.5,
            "hsa_for_medical": True,
            "dividend_yield": 0.0,
            "qualified_dividend_pct": 0.0,
            "interest_yield": 0.0,
            "capital_gains_dist_rate": 0.0,
            "cost_basis_ratio": 100.0
        },
        {
            "id": "acc_jack_hsa",
            "name": "Jack's Health Savings Account",
            "institution": "Fidelity HSA",
            "type": "hsa",
            "owner": "user",
            "balance": 120000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 56,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 60,
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
            "id": "acc_joint_taxable",
            "name": "Joint Taxable Brokerage",
            "institution": "Vanguard",
            "type": "taxable",
            "owner": "user",
            "balance": 240000.0,
            "contrib_amount": 0.0,
            "contrib_freq": "annual",
            "contrib_start_age": 56,
            "contrib_end_age_type": "retirement",
            "contrib_end_age_specified": 60,
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

    # 4. Comprehensive Balance Sheet Object
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
                        "id": "acc_jack_403b",
                        "name": "Jack's Pretax 403(b)",
                        "institution": "TIAA",
                        "owner": "user",
                        "type": "pretax",
                        "include_in_retirement": True,
                        "values": jack_403b_vals,
                        "contrib_amount": 600.0,
                        "contrib_freq": "monthly",
                        "contrib_start_age": 56,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 60,
                        "contrib_adjust_inflation": True,
                        "return_mean": 8.5,
                        "return_std": 13.0,
                        "hsa_for_medical": True
                    },
                    {
                        "id": "acc_diane_pretax_ira",
                        "name": "Diane's Pretax IRA",
                        "institution": "Fidelity",
                        "owner": "spouse",
                        "type": "pretax",
                        "include_in_retirement": True,
                        "values": diane_ira_vals,
                        "contrib_amount": 7000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 53,
                        "contrib_end_age_type": "spouse_retirement",
                        "contrib_end_age_specified": 57,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.2,
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
                        "id": "acc_jack_roth_ira",
                        "name": "Jack's Roth IRA",
                        "institution": "Vanguard",
                        "owner": "user",
                        "type": "roth",
                        "include_in_retirement": True,
                        "values": jack_roth_vals,
                        "contrib_amount": 7000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 56,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 60,
                        "contrib_adjust_inflation": True,
                        "return_mean": 8.5,
                        "return_std": 13.0,
                        "hsa_for_medical": True
                    },
                    {
                        "id": "acc_diane_roth_401k",
                        "name": "Diane's Roth 401(k)",
                        "institution": "Charles Schwab",
                        "owner": "spouse",
                        "type": "roth",
                        "include_in_retirement": True,
                        "values": diane_roth_vals,
                        "contrib_amount": 23000.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 53,
                        "contrib_end_age_type": "spouse_retirement",
                        "contrib_end_age_specified": 57,
                        "contrib_adjust_inflation": True,
                        "return_mean": 7.2,
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
                        "id": "acc_joint_taxable",
                        "name": "Joint Taxable Brokerage",
                        "institution": "Vanguard",
                        "owner": "user",
                        "type": "taxable",
                        "include_in_retirement": True,
                        "values": joint_taxable_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 56,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 60,
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
                        "id": "acc_jack_hsa",
                        "name": "Jack's Health Savings Account",
                        "institution": "Fidelity HSA",
                        "owner": "user",
                        "type": "hsa",
                        "include_in_retirement": True,
                        "values": jack_hsa_vals,
                        "contrib_amount": 0.0,
                        "contrib_freq": "annual",
                        "contrib_start_age": 56,
                        "contrib_end_age_type": "retirement",
                        "contrib_end_age_specified": 60,
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
                        "target_amount": 42000.0,
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
                        "target_amount": 12000.0,
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
                    "name": "Jack's Student Loan",
                    "institution": "Federal Student Aid",
                    "values": student_loan_vals
                }
            ]
        }
    }

    plan_data = {
        "goal_seeking": False,
        "simulation_type": "regular",
        "user_name": "Jack",
        "user_age": 56,
        "user_retirement_age": 60,
        "user_age_death": 95,
        "is_married": True,
        "spouse_name": "Diane",
        "spouse_age": 53,
        "spouse_retirement_age": 57,
        "spouse_age_death": 103,
        "filing_status": "joint",
        "current_year": 2026,
        "begin_spending_age_type": "retirement",
        "begin_spending_age_specified": 60,
        "desired_spending": 120000.0,
        "survivor_spending": 108000.0,
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
            "user_amount": 4250.0,
            "user_freq": "monthly",
            "user_start_age": 70,
            "spouse_receiving": False,
            "spouse_future_entitled": True,
            "spouse_entitled": True,
            "spouse_amount": 2150.0,
            "spouse_freq": "monthly",
            "spouse_start_age": 62
        },
        "accounts": accounts,
        "balance_sheet": balance_sheet,
        "income_sources": [
            {
                "name": "Jack's Salary",
                "amount": 180000.0,
                "frequency": "annual",
                "start_age_type": "specified",
                "start_age_specified": 56,
                "end_age_type": "retirement",
                "end_age_specified": 60,
                "subject_to_tax": True,
                "is_social_security": False,
                "has_survivor_benefit": False,
                "survivor_benefit_pct": 0.0,
                "adjust_type": "inflation_less_pct",
                "adjust_val": 1.0,
                "adjust_start_age_type": "current_age",
                "adjust_start_age_specified": 56,
                "adjustments": [
                    {
                        "start_type": "current_age",
                        "start_spec": 56,
                        "end_type": "retirement",
                        "end_spec": 60,
                        "adjust_type": "inflation_less_pct",
                        "adjust_val": 1.0
                    }
                ]
            },
            {
                "name": "Diane's Salary",
                "amount": 130000.0,
                "frequency": "annual",
                "start_age_type": "spouse_specified",
                "start_age_specified": 53,
                "end_age_type": "spouse_retirement",
                "end_age_specified": 57,
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
                        "end_spec": 57,
                        "adjust_type": "inflation_less_pct",
                        "adjust_val": 1.0
                    }
                ]
            },
            {
                "name": "Jack's Pension",
                "amount": 3200.0,
                "frequency": "monthly",
                "start_age_type": "retirement",
                "start_age_specified": 60,
                "end_age_type": "death",
                "end_age_specified": 95,
                "subject_to_tax": True,
                "is_social_security": False,
                "has_survivor_benefit": True,
                "survivor_benefit_pct": 75.0,
                "adjust_type": "inflation",
                "adjust_val": 0.0,
                "adjust_start_age_type": "current_age",
                "adjust_start_age_specified": 56,
                "adjustments": [
                    {
                        "start_type": "current_age",
                        "start_spec": 56,
                        "end_type": "retirement",
                        "end_spec": 60,
                        "adjust_type": "inflation",
                        "adjust_val": 0.0
                    },
                    {
                        "start_type": "retirement",
                        "start_spec": 60,
                        "end_type": "death",
                        "end_spec": 95,
                        "adjust_type": "none",
                        "adjust_val": 0.0
                    }
                ]
            },
            {
                "name": "Diane's Inheritance",
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
        ],
        "additional_spending": [
            {
                "name": "Odd-Year Vacation (High Travel)",
                "amount": 12000.0,
                "start_age": 61,
                "start_age_type": "user",
                "interval": 2,
                "adjust_inflation": True
            },
            {
                "name": "Even-Year Vacation (Local/Relaxed)",
                "amount": 4000.0,
                "start_age": 62,
                "start_age_type": "user",
                "interval": 2,
                "adjust_inflation": True
            },
            {
                "name": "Car Purchase (Every 10 Years)",
                "amount": 42000.0,
                "start_age": 61,
                "start_age_type": "user",
                "interval": 10,
                "adjust_inflation": True
            }
        ],
        "other_taxes": [],
        "rebalancing": {
            "included_account_ids": [
                "acc_jack_403b",
                "acc_diane_pretax_ira",
                "acc_jack_roth_ira",
                "acc_diane_roth_401k",
                "acc_jack_hsa",
                "acc_joint_taxable"
            ],
            "tolerance_percent": 5.0,
            "rebalance_mode": "target",
            "cash_flow": 0.0,
            "asset_classes": [
                {
                    "id": "ac_stocks",
                    "name": "Stocks",
                    "target_percent": 65.0,
                    "color": "#3b82f6"
                },
                {
                    "id": "ac_bonds",
                    "name": "Bonds",
                    "target_percent": 20.0,
                    "color": "#10b981"
                },
                {
                    "id": "ac_reits",
                    "name": "REITs",
                    "target_percent": 10.0,
                    "color": "#8b5cf6"
                },
                {
                    "id": "ac_bitcoin",
                    "name": "Bitcoin",
                    "target_percent": 5.0,
                    "color": "#f59e0b"
                }
            ],
            "account_allocations": {}
        }
    }
    return plan_data

if __name__ == '__main__':
    data = build_jack_and_diane_plan()
    with open('/Users/Mike/Documents/GitHub/retire/saved json files/jack_and_diane_plan.json', 'w') as f:
        json.dump(data, f, indent=4)
    with open('/Users/Mike/Documents/GitHub/retire/saved json files/jack_and_diane.json', 'w') as f:
        json.dump(data, f, indent=4)
    print("Jack & Diane plan generated successfully with", len(data["balance_sheet"]["periods"]), "historical monthly periods.")
