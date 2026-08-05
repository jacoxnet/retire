import numpy as np
import numba

# IRS Uniform Lifetime Table (Table III) divisors for ages 72 through 119
# For age >= 120, the divisor is 2.0. If age < RMD start age, RMD is 0.
RMD_TABLE = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
    88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
    96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
    104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4,
    112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3
}

# 2026 Federal Income Tax Brackets
THRESHOLDS_2026_SINGLE = [12400, 50400, 105700, 201775, 256225, 640600]
THRESHOLDS_2026_JOINT = [24800, 100800, 211400, 403550, 512450, 768700]
THRESHOLDS_2026_HOH = [17700, 67450, 105700, 201775, 256225, 640600]

STD_DEDUCTION_2026_SINGLE = 16100
STD_DEDUCTION_2026_JOINT = 32200
STD_DEDUCTION_2026_HOH = 24150

TAX_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]

# Numba Pre-compiled Arrays
THRESHOLDS_SINGLE_ARR = np.array([12400.0, 50400.0, 105700.0, 201775.0, 256225.0, 640600.0], dtype=np.float64)
THRESHOLDS_JOINT_ARR = np.array([24800.0, 100800.0, 211400.0, 403550.0, 512450.0, 768700.0], dtype=np.float64)
THRESHOLDS_HOH_ARR = np.array([17700.0, 67450.0, 105700.0, 201775.0, 256225.0, 640600.0], dtype=np.float64)
TAX_RATES_ARR = np.array([0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37], dtype=np.float64)

RMD_TABLE_ARR = np.full(151, 2.0, dtype=np.float64)
for _age, _div in RMD_TABLE.items():
    RMD_TABLE_ARR[_age] = _div


def get_rmd_start_age(birth_year):
    if birth_year <= 1950:
        return 72
    elif 1951 <= birth_year <= 1959:
        return 73
    else:  # >= 1960
        return 75

def calculate_taxable_ss(agi_ex_ss, ss_benefits, filing_status):
    if ss_benefits <= 0:
        return 0.0
    if filing_status == 'joint':
        base_limit = 32000
        step_limit = 12000
    else:  # single or hoh
        base_limit = 25000
        step_limit = 9000
    
    line_2 = 0.5 * ss_benefits
    line_5 = agi_ex_ss + line_2
    line_7 = line_5  # Adjustments are ignored
    
    if line_7 <= base_limit:
        return 0.0
    
    line_9 = line_7 - base_limit
    line_10 = step_limit
    line_11 = max(0.0, line_9 - line_10)
    line_12 = min(line_9, line_10)
    line_13 = 0.5 * line_12
    line_14 = min(line_2, line_13)
    line_15 = 0.85 * line_11
    line_16 = line_14 + line_15
    line_17 = 0.85 * ss_benefits
    
    return min(line_16, line_17)

def calculate_tax(taxable_income, thresholds, rates):
    if taxable_income <= 0:
        return 0.0
    tax = 0.0
    prev_threshold = 0
    for threshold, rate in zip(thresholds, rates):
        if taxable_income > threshold:
            tax += (threshold - prev_threshold) * rate
            prev_threshold = threshold
        else:
            tax += (taxable_income - prev_threshold) * rate
            return tax
    tax += (taxable_income - prev_threshold) * rates[-1]
    return tax

def resolve_age(age_type, specified_val, user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death, default_val=100):
    if age_type == 'specified' or age_type == 'age':
        try:
            return int(specified_val)
        except (ValueError, TypeError):
            return default_val
    elif age_type == 'retirement':
        return user_ret_age
    elif age_type == 'spouse_retirement':
        if is_married:
            return spouse_ret_age + (user_age - spouse_age)
        return user_ret_age
    elif age_type == 'death':
        return user_age_death
    elif age_type == 'spouse_death':
        if is_married:
            return spouse_age_death + (user_age - spouse_age)
        return user_age_death
    elif age_type == 'first_death':
        if is_married:
            return min(user_age_death, spouse_age_death + (user_age - spouse_age))
        return user_age_death
    return default_val

def simulate_step(
    t, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
    filing_status, desired_spending_start_age, desired_spending, survivor_spending,
    adjust_spending_inflation, inflation_rate, additional_spending_list, income_sources_list,
    pretax, roth, taxable, hsa, hsa_for_medical,
    r_pretax, r_roth, r_taxable, r_hsa,
    contrib_pretax, contrib_roth, contrib_taxable, contrib_hsa,
    rmd_start_age
):
    user_age_t = user_age + t
    spouse_age_t = spouse_age + t if is_married else None
    
    # 1. Determine active status and filing status
    user_alive = (user_age_t <= user_age_death)
    spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
    
    if not user_alive and not spouse_alive:
        # Both are dead, nothing to simulate
        return {
            'beginning_assets': {'pretax': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'total': 0.0},
            'ending_assets': {'pretax': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'total': 0.0},
            'contributions': {'pretax': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'total': 0.0},
            'growth': {'pretax': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'total': 0.0},
            'income_sources_total': 0.0,
            'income_sources_breakdown': {},
            'taxes_paid': 0.0,
            'desired_spending': 0.0,
            'additional_spending': 0.0,
            'withdrawals': {'pretax_rmd': 0.0, 'pretax_extra': 0.0, 'taxable': 0.0, 'roth': 0.0, 'hsa': 0.0, 'total': 0.0}
        }
    
    t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else user_age_death - user_age
    
    filing_status_t = filing_status
    if is_married and t > t_first_death:
        filing_status_t = 'single'
        
    # 2. Add Contributions
    pretax_before = max(0.0, pretax + contrib_pretax)
    roth_before = max(0.0, roth + contrib_roth)
    taxable_before = max(0.0, taxable + contrib_taxable)
    hsa_before = max(0.0, hsa + contrib_hsa)
    
    # 3. Apply growth
    growth_pre = pretax_before * r_pretax
    growth_roth = roth_before * r_roth
    growth_taxable = taxable_before * r_taxable
    growth_hsa = hsa_before * r_hsa
    
    pretax_mid = pretax_before + growth_pre
    roth_mid = roth_before + growth_roth
    taxable_mid = taxable_before + growth_taxable
    hsa_mid = hsa_before + growth_hsa
    
    # 4. Calculate Desired Spending
    is_spending_active = (user_age_t >= desired_spending_start_age)
    if is_spending_active:
        base_spending = desired_spending
        if is_married and t > t_first_death:
            base_spending = survivor_spending if survivor_spending is not None else desired_spending
        
        spending_factor = (1.0 + inflation_rate / 100.0) ** t if adjust_spending_inflation else 1.0
        desired_spending_t = base_spending * spending_factor
    else:
        desired_spending_t = 0.0
        
    # 5. Calculate Additional Spending
    add_spending_t = 0.0
    for item in additional_spending_list:
        start_age = item.get('start_age', 0)
        interval = item.get('interval', 0)
        amount = item.get('amount', 0.0)
        adjust_inf = item.get('adjust_inflation', True)
        
        occurs = False
        if user_age_t >= start_age:
            if interval == 0:
                occurs = (user_age_t == start_age)
            else:
                occurs = ((user_age_t - start_age) % interval == 0)
                
        if occurs:
            spending_factor = (1.0 + inflation_rate / 100.0) ** t if adjust_inf else 1.0
            add_spending_t += amount * spending_factor
            
    total_spending_target = desired_spending_t + add_spending_t
    
    # 6. Calculate Income Sources
    taxable_income_sources = 0.0
    ss_benefits = 0.0
    nontaxable_income = 0.0
    income_breakdown = {}
    
    for inc in income_sources_list:
        name = inc.get('name', 'Income')
        # resolve start/end age
        start_age = resolve_age(inc.get('start_age_type', 'retirement'), inc.get('start_age_specified', 0), user_age, desired_spending_start_age, is_married, spouse_age, spouse_age, user_age_death, spouse_age_death) # fallback to spending start or ret age
        end_age = resolve_age(inc.get('end_age_type', 'death'), inc.get('end_age_specified', 0), user_age, desired_spending_start_age, is_married, spouse_age, spouse_age, user_age_death, spouse_age_death)
        
        # Check active
        active = False
        if start_age <= user_age_t <= end_age:
            # check survivor rules if spouse dies or user dies
            # If User is dead, only spouse-related stream or streams ending at spouse death are active
            if not user_alive and inc.get('end_age_type') in ['death', 'retirement']:
                active = False
            elif not spouse_alive and inc.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                active = False
            else:
                active = True
                
        if active:
            amt = inc.get('amount', 0.0) * 12.0
            adj_type = inc.get('adjust_type', 'inflation')
            adj_val = inc.get('adjust_val', 0.0)
            
            if adj_type == 'inflation':
                factor = (1.0 + inflation_rate / 100.0) ** t
            elif adj_type == 'fixed_pct':
                factor = (1.0 + adj_val / 100.0) ** t
            elif adj_type == 'inflation_less_pct':
                rate = max(0.0, inflation_rate - adj_val)
                factor = (1.0 + rate / 100.0) ** t
            else:
                factor = 1.0
                
            inc_amount_t = amt * factor
            income_breakdown[name] = inc_amount_t
            
            if inc.get('is_social_security', False):
                ss_benefits += inc_amount_t
            elif inc.get('subject_to_tax', True):
                taxable_income_sources += inc_amount_t
            else:
                nontaxable_income += inc_amount_t
                
    total_income_sources = taxable_income_sources + ss_benefits + nontaxable_income
    
    # 7. Calculate RMD
    rmd_t = 0.0
    if user_alive and user_age_t >= rmd_start_age:
        divisor = RMD_TABLE.get(user_age_t, 2.0)
        rmd_t = min(pretax_mid / divisor, pretax_mid) if pretax_mid > 0 else 0.0
        
    # 8. Circular Tax calculations and Withdrawal Ordering
    # Inflate tax thresholds & standard deduction
    inf_factor = (1.0 + inflation_rate / 100.0) ** t
    if filing_status_t == 'joint':
        thresholds_t = [val * inf_factor for val in THRESHOLDS_2026_JOINT]
        std_deduction_t = STD_DEDUCTION_2026_JOINT * inf_factor
    elif filing_status_t == 'hoh':
        thresholds_t = [val * inf_factor for val in THRESHOLDS_2026_HOH]
        std_deduction_t = STD_DEDUCTION_2026_HOH * inf_factor
    else:  # single
        thresholds_t = [val * inf_factor for val in THRESHOLDS_2026_SINGLE]
        std_deduction_t = STD_DEDUCTION_2026_SINGLE * inf_factor
        
    # Base Tax Calculation (includes RMD, which is mandatory and taxed)
    base_agi_ex_ss = taxable_income_sources + rmd_t
    base_taxable_ss = calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
    base_taxable_income = base_agi_ex_ss + base_taxable_ss - std_deduction_t
    base_tax = calculate_tax(base_taxable_income, thresholds_t, TAX_RATES)
    
    # Check early withdrawal penalties for Pretax RMD? RMD is always after age 59.5, so no penalty.
    total_base_tax = base_tax
    
    # Cash inflows and outflows under base assumptions
    cash_inflows = total_income_sources + rmd_t
    cash_outflows = total_spending_target + total_base_tax
    
    net_base = cash_inflows - cash_outflows
    
    w_pretax_rmd = rmd_t
    w_pretax_extra = 0.0
    w_taxable = 0.0
    w_roth = 0.0
    w_hsa = 0.0
    final_tax_and_penalty = total_base_tax
    
    pretax_end = pretax_mid - rmd_t
    roth_end = roth_mid
    taxable_end = taxable_mid
    hsa_end = hsa_mid
    
    if net_base >= 0:
        # Surplus cash: Add surplus to Taxable Assets
        taxable_end = taxable_mid + net_base
    else:
        # Deficit cash: We must withdraw from assets to make up the difference
        deficit = -net_base
        
        # A. Taxable Assets
        w_taxable = min(deficit, max(0.0, taxable_end))
        taxable_end = taxable_end - w_taxable
        deficit = deficit - w_taxable
        
        # B. Pretax Assets (beyond RMD)
        if deficit > 0.0 and pretax_end > 0.0:
            # We must solve for extra pretax withdrawal using bisection
            # base_agi_ex_ss and base_tax are updated to include W_pre
            def get_net_cash_from_pretax(W):
                # W is the extra pretax withdrawal
                agi_ex_ss = base_agi_ex_ss + W
                taxable_ss = calculate_taxable_ss(agi_ex_ss, ss_benefits, filing_status_t)
                taxable_income = agi_ex_ss + taxable_ss - std_deduction_t
                tax = calculate_tax(taxable_income, thresholds_t, TAX_RATES)
                penalty = 0.10 * W if (user_alive and user_age_t < 59.5) else 0.0
                total_tax_and_pen = tax + penalty
                # Cash gained = Withdrawal - tax drag
                return W - (total_tax_and_pen - total_base_tax)
                
            if get_net_cash_from_pretax(pretax_end) <= deficit:
                # Deplete all Pretax
                w_pretax_extra = pretax_end
                gained = get_net_cash_from_pretax(pretax_end)
                pretax_end = 0.0
                deficit = deficit - gained
                # Update base for subsequent steps
                base_agi_ex_ss += w_pretax_extra
                # recalculate total_base_tax
                taxable_ss = calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                base_taxable_income = base_agi_ex_ss + taxable_ss - std_deduction_t
                penalty = 0.10 * w_pretax_extra if (user_alive and user_age_t < 59.5) else 0.0
                total_base_tax = calculate_tax(base_taxable_income, thresholds_t, TAX_RATES) + penalty
                final_tax_and_penalty = total_base_tax
            else:
                # Search for correct withdrawal amount
                low = 0.0
                high = pretax_end
                for _ in range(25):
                    mid = (low + high) / 2
                    if get_net_cash_from_pretax(mid) < deficit:
                        low = mid
                    else:
                        high = mid
                w_pretax_extra = high
                pretax_end = pretax_end - w_pretax_extra
                # Update base
                base_agi_ex_ss += w_pretax_extra
                taxable_ss = calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                base_taxable_income = base_agi_ex_ss + taxable_ss - std_deduction_t
                penalty = 0.10 * w_pretax_extra if (user_alive and user_age_t < 59.5) else 0.0
                total_base_tax = calculate_tax(base_taxable_income, thresholds_t, TAX_RATES) + penalty
                final_tax_and_penalty = total_base_tax
                deficit = 0.0
                
        # C. Roth Assets
        if deficit > 0.0 and roth_end > 0.0:
            w_roth = min(deficit, max(0.0, roth_end))
            roth_end = roth_end - w_roth
            deficit = deficit - w_roth
            
        # D. HSA Assets
        if deficit > 0.0 and hsa_end > 0.0:
            if hsa_for_medical:
                w_hsa = min(deficit, max(0.0, hsa_end))
                hsa_end = hsa_end - w_hsa
                deficit = deficit - w_hsa
            else:
                # HSA withdrawals are taxable (and have 20% penalty if user age < 65)
                def get_net_cash_from_hsa(W):
                    # W is the taxable HSA withdrawal
                    agi_ex_ss = base_agi_ex_ss + W
                    taxable_ss = calculate_taxable_ss(agi_ex_ss, ss_benefits, filing_status_t)
                    taxable_income = agi_ex_ss + taxable_ss - std_deduction_t
                    tax = calculate_tax(taxable_income, thresholds_t, TAX_RATES)
                    penalty = 0.20 * W if (user_alive and user_age_t < 65.0) else 0.0
                    total_tax_and_pen = tax + penalty
                    return W - (total_tax_and_pen - total_base_tax)
                    
                if get_net_cash_from_hsa(hsa_end) <= deficit:
                    w_hsa = hsa_end
                    gained = get_net_cash_from_hsa(hsa_end)
                    hsa_end = 0.0
                    deficit = deficit - gained
                    base_agi_ex_ss += w_hsa
                    taxable_ss = calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                    base_taxable_income = base_agi_ex_ss + taxable_ss - std_deduction_t
                    penalty = 0.20 * w_hsa if (user_alive and user_age_t < 65.0) else 0.0
                    total_base_tax = calculate_tax(base_taxable_income, thresholds_t, TAX_RATES) + penalty
                    final_tax_and_penalty = total_base_tax
                else:
                    low = 0.0
                    high = hsa_end
                    for _ in range(25):
                        mid = (low + high) / 2
                        if get_net_cash_from_hsa(mid) < deficit:
                            low = mid
                        else:
                            high = mid
                    w_hsa = high
                    hsa_end = hsa_end - w_hsa
                    base_agi_ex_ss += w_hsa
                    taxable_ss = calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                    base_taxable_income = base_agi_ex_ss + taxable_ss - std_deduction_t
                    penalty = 0.20 * w_hsa if (user_alive and user_age_t < 65.0) else 0.0
                    total_base_tax = calculate_tax(base_taxable_income, thresholds_t, TAX_RATES) + penalty
                    final_tax_and_penalty = total_base_tax
                    deficit = 0.0
                    
        # E. Still have a deficit? Subtract from taxable (goes negative to indicate failure)
        if deficit > 0.0:
            taxable_end = taxable_end - deficit
            
    # Calculate totals
    beg_assets = {
        'pretax': pretax,
        'roth': roth,
        'taxable': taxable,
        'hsa': hsa,
        'total': pretax + roth + taxable + hsa
    }
    
    end_assets = {
        'pretax': pretax_end,
        'roth': roth_end,
        'taxable': taxable_end,
        'hsa': hsa_end,
        'total': pretax_end + roth_end + taxable_end + hsa_end
    }
    
    conts = {
        'pretax': contrib_pretax,
        'roth': contrib_roth,
        'taxable': contrib_taxable,
        'hsa': contrib_hsa,
        'total': contrib_pretax + contrib_roth + contrib_taxable + contrib_hsa
    }
    
    growth = {
        'pretax': growth_pre,
        'roth': growth_roth,
        'taxable': growth_taxable,
        'hsa': growth_hsa,
        'total': growth_pre + growth_roth + growth_taxable + growth_hsa
    }
    
    withdrawals = {
        'pretax_rmd': w_pretax_rmd,
        'pretax_extra': w_pretax_extra,
        'taxable': w_taxable,
        'roth': w_roth,
        'hsa': w_hsa,
        'total': w_pretax_rmd + w_pretax_extra + w_taxable + w_roth + w_hsa
    }
    
    return {
        'beginning_assets': beg_assets,
        'ending_assets': end_assets,
        'contributions': conts,
        'growth': growth,
        'income_sources_total': total_income_sources,
        'income_sources_breakdown': income_breakdown,
        'taxes_paid': final_tax_and_penalty,
        'desired_spending': desired_spending_t,
        'additional_spending': add_spending_t,
        'withdrawals': withdrawals
    }

def get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, asset_data):
    user_age_t = user_age + t
    
    amount = asset_data.get('contrib_amount', 0.0)
    freq = asset_data.get('contrib_freq', 'annual')
    start_age = asset_data.get('contrib_start_age', 0)
    adjust_inf = asset_data.get('contrib_adjust_inflation', True)
    
    # Resolve end age
    end_age_type = asset_data.get('contrib_end_age_type', 'age')
    end_age_spec = asset_data.get('contrib_end_age_specified', 0)
    
    # We need user retirement age etc. to resolve
    # Let's pass a custom resolver
    ret_age = asset_data.get('user_ret_age', 65) # fallback if not set
    spouse_ret_age = asset_data.get('spouse_ret_age', 65)
    
    end_age = resolve_age(
        end_age_type, end_age_spec, user_age, ret_age, is_married, spouse_age, spouse_ret_age, 100, 100
    )
    
    active = False
    if freq == 'one-time':
        # One time contributions can also be 'first_death' for taxable
        if end_age_type == 'first_death':
            # occurs on the first death year
            # we need user_age_death and spouse_age_death
            user_age_death = asset_data.get('user_age_death', 90)
            spouse_age_death = asset_data.get('spouse_age_death', 90)
            t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else user_age_death - user_age
            active = (t == t_first_death)
        else:
            active = (user_age_t == start_age)
    else:
        active = (start_age <= user_age_t <= end_age)
        
    if not active:
        return 0.0
        
    base_val = amount * 12.0 if freq == 'monthly' else amount
    if adjust_inf:
        inflation_rate = asset_data.get('inflation_rate', 2.5)
        return base_val * (1.0 + inflation_rate / 100.0) ** t
    return base_val

def extract_sim_inputs(sim_input):
    # Extracts a flat or structured clean input dict with fallbacks
    if hasattr(sim_input, 'to_dict'):
        raw = sim_input.to_dict()
    elif isinstance(sim_input, dict):
        raw = sim_input
    else:
        raw = {}
    
    # Demographics
    user_age = int(raw.get('user_age', 60))
    user_ret_age = int(raw.get('user_retirement_age', 65))
    user_age_death = int(raw.get('user_age_death', 90))
    
    is_married = bool(raw.get('is_married', False))
    spouse_age = int(raw.get('spouse_age', 60)) if is_married else 60
    spouse_ret_age = int(raw.get('spouse_retirement_age', 65)) if is_married else 65
    spouse_age_death = int(raw.get('spouse_age_death', 90)) if is_married else 90
    
    filing_status = raw.get('filing_status', 'single')
    if is_married and filing_status == 'single':
        filing_status = 'joint' # Default married to MFJ
        
    current_year = int(raw.get('current_year', 2026))
    
    # Spending Start
    begin_spending_age_type = raw.get('begin_spending_age_type', 'retirement')
    begin_spending_age_specified = int(raw.get('begin_spending_age_specified', 65))
    
    desired_spending_start_age = user_ret_age
    if begin_spending_age_type == 'specified':
        desired_spending_start_age = begin_spending_age_specified
    elif begin_spending_age_type == 'spouse_retirement' and is_married:
        desired_spending_start_age = spouse_ret_age + (user_age - spouse_age)
        
    desired_spending = float(raw.get('desired_spending', 40000.0))
    survivor_spending = float(raw.get('survivor_spending', desired_spending)) if is_married else desired_spending
    adjust_spending_inflation = bool(raw.get('adjust_spending_inflation', True))
    
    inflation_rate = float(raw.get('inflation_rate', 2.5))
    runs = int(raw.get('runs', 100))
    target_success_rate = float(raw.get('target_success_rate', 80.0))
    
    # Assets: Pretax, Roth, Taxable, HSA
    pretax_data = raw.get('pretax_assets', {})
    roth_data = raw.get('roth_assets', {})
    taxable_data = raw.get('taxable_assets', {})
    hsa_data = raw.get('hsa_assets', {})
    
    # Inject metadata to assets for contribution calculation
    for asset in [pretax_data, roth_data, taxable_data, hsa_data]:
        asset['user_ret_age'] = user_ret_age
        asset['spouse_ret_age'] = spouse_ret_age
        asset['user_age_death'] = user_age_death
        asset['spouse_age_death'] = spouse_age_death
        asset['inflation_rate'] = inflation_rate
        
    hsa_for_medical = bool(hsa_data.get('hsa_for_medical', True))
    
    # Lists
    additional_spending = raw.get('additional_spending', [])
    income_sources = raw.get('income_sources', [])
    
    # Timeline
    user_span = user_age_death - user_age + 1
    spouse_span = (spouse_age_death - spouse_age + 1) if is_married else 0
    total_years = max(user_span, spouse_span)
    
    # Birth Year
    birth_year = current_year - user_age
    rmd_start_age = get_rmd_start_age(birth_year)
    
    return {
        'user_age': user_age,
        'user_ret_age': user_ret_age,
        'user_age_death': user_age_death,
        'is_married': is_married,
        'spouse_age': spouse_age,
        'spouse_ret_age': spouse_ret_age,
        'spouse_age_death': spouse_age_death,
        'filing_status': filing_status,
        'current_year': current_year,
        'desired_spending_start_age': desired_spending_start_age,
        'desired_spending': desired_spending,
        'survivor_spending': survivor_spending,
        'adjust_spending_inflation': adjust_spending_inflation,
        'inflation_rate': inflation_rate,
        'runs': runs,
        'target_success_rate': target_success_rate,
        'pretax_data': pretax_data,
        'roth_data': roth_data,
        'taxable_data': taxable_data,
        'hsa_data': hsa_data,
        'hsa_for_medical': hsa_for_medical,
        'additional_spending': additional_spending,
        'income_sources': income_sources,
        'total_years': total_years,
        'rmd_start_age': rmd_start_age
    }

def run_simulation_path(inputs, returns_pretax, returns_roth, returns_taxable, returns_hsa, test_spending=None):
    # runs a single path of simulation
    # if test_spending is provided, we override the desired_spending with it (used for goal seeking)
    pretax = inputs['pretax_data'].get('present_balance', 0.0)
    roth = inputs['roth_data'].get('present_balance', 0.0)
    taxable = inputs['taxable_data'].get('present_balance', 0.0)
    hsa = inputs['hsa_data'].get('present_balance', 0.0)
    
    desired_spending = test_spending if test_spending is not None else inputs['desired_spending']
    # If married, the survivor spending needs to scale proportionally if we are goal-seeking
    survivor_spending = inputs['survivor_spending']
    if test_spending is not None and inputs['desired_spending'] > 0:
        ratio = test_spending / inputs['desired_spending']
        survivor_spending = inputs['survivor_spending'] * ratio
        
    year_results = []
    
    for t in range(inputs['total_years']):
        # contributions for this year
        c_pre = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['pretax_data'])
        c_roth = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['roth_data'])
        c_tax = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['taxable_data'])
        c_hsa = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['hsa_data'])
        
        # returns for this year
        r_pre = returns_pretax[t]
        r_roth = returns_roth[t]
        r_tax = returns_taxable[t]
        r_hsa = returns_hsa[t]
        
        res = simulate_step(
            t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'],
            inputs['user_age_death'], inputs['spouse_age_death'], inputs['filing_status'],
            inputs['desired_spending_start_age'], desired_spending, survivor_spending,
            inputs['adjust_spending_inflation'], inputs['inflation_rate'],
            inputs['additional_spending'], inputs['income_sources'],
            pretax, roth, taxable, hsa, inputs['hsa_for_medical'],
            r_pre, r_roth, r_tax, r_hsa,
            c_pre, c_roth, c_tax, c_hsa,
            inputs['rmd_start_age']
        )
        
        year_results.append(res)
        pretax = res['ending_assets']['pretax']
        roth = res['ending_assets']['roth']
        taxable = res['ending_assets']['taxable']
        hsa = res['ending_assets']['hsa']
        
    return year_results

# Numba JIT compiled helper functions
@numba.njit
def njit_calculate_tax(taxable_income, thresholds, rates):
    if taxable_income <= 0.0:
        return 0.0
    tax = 0.0
    prev_threshold = 0.0
    n = len(thresholds)
    for i in range(n):
        threshold = thresholds[i]
        rate = rates[i]
        if taxable_income > threshold:
            tax += (threshold - prev_threshold) * rate
            prev_threshold = threshold
        else:
            tax += (taxable_income - prev_threshold) * rate
            return tax
    tax += (taxable_income - prev_threshold) * rates[n]
    return tax

@numba.njit
def njit_calculate_taxable_ss(agi_ex_ss, ss_benefits, filing_status_code):
    if ss_benefits <= 0.0:
        return 0.0
    if filing_status_code == 1:
        base_limit = 32000.0
        step_limit = 12000.0
    else:
        base_limit = 25000.0
        step_limit = 9000.0
    
    line_2 = 0.5 * ss_benefits
    line_5 = agi_ex_ss + line_2
    line_7 = line_5
    
    if line_7 <= base_limit:
        return 0.0
    
    line_9 = line_7 - base_limit
    line_10 = step_limit
    line_11 = max(0.0, line_9 - line_10)
    line_12 = min(line_9, line_10)
    line_13 = 0.5 * line_12
    line_14 = min(line_2, line_13)
    line_15 = 0.85 * line_11
    line_16 = line_14 + line_15
    line_17 = 0.85 * ss_benefits
    
    return min(line_16, line_17)

@numba.njit
def njit_simulate_path(
    total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
    filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
    adjust_spending_inflation, inflation_rate, hsa_for_medical, rmd_start_age,
    pretax_init, roth_init, taxable_init, hsa_init,
    c_pre, c_roth, c_tax, c_hsa,
    add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
    r_pre, r_roth, r_tax, r_hsa
):
    pretax = pretax_init
    roth = roth_init
    taxable = taxable_init
    hsa = hsa_init
    
    t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else (user_age_death - user_age)
    
    for t in range(total_years):
        user_age_t = user_age + t
        spouse_age_t = spouse_age + t if is_married else user_age_t
        
        user_alive = (user_age_t <= user_age_death)
        spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
        
        if not user_alive and not spouse_alive:
            pretax = 0.0
            roth = 0.0
            taxable = 0.0
            hsa = 0.0
            continue
            
        filing_status_t = filing_status_code
        if is_married and t > t_first_death:
            filing_status_t = 0
            
        pretax_before = max(0.0, pretax + c_pre[t])
        roth_before = max(0.0, roth + c_roth[t])
        taxable_before = max(0.0, taxable + c_tax[t])
        hsa_before = max(0.0, hsa + c_hsa[t])
        
        growth_pre = pretax_before * r_pre[t]
        growth_roth = roth_before * r_roth[t]
        growth_taxable = taxable_before * r_tax[t]
        growth_hsa = hsa_before * r_hsa[t]
        
        pretax_mid = pretax_before + growth_pre
        roth_mid = roth_before + growth_roth
        taxable_mid = taxable_before + growth_taxable
        hsa_mid = hsa_before + growth_hsa
        
        inf_factor = (1.0 + inflation_rate / 100.0) ** t
        is_spending_active = (user_age_t >= desired_spending_start_age)
        if is_spending_active:
            base_spending = desired_spending
            if is_married and t > t_first_death:
                base_spending = survivor_spending
            spending_factor = inf_factor if adjust_spending_inflation else 1.0
            desired_spending_t = base_spending * spending_factor
        else:
            desired_spending_t = 0.0
            
        total_spending_target = desired_spending_t + add_spending_arr[t]
        
        taxable_income_sources = inc_taxable_arr[t]
        ss_benefits = inc_ss_arr[t]
        nontaxable_income = inc_nontaxable_arr[t]
        total_income_sources = taxable_income_sources + ss_benefits + nontaxable_income
        
        rmd_t = 0.0
        if user_alive and user_age_t >= rmd_start_age:
            divisor = RMD_TABLE_ARR[user_age_t] if user_age_t <= 150 else 2.0
            rmd_t = min(pretax_mid / divisor, pretax_mid) if pretax_mid > 0.0 else 0.0
            
        if filing_status_t == 1:
            thresholds_t = THRESHOLDS_JOINT_ARR * inf_factor
            std_deduction_t = STD_DEDUCTION_2026_JOINT * inf_factor
        elif filing_status_t == 2:
            thresholds_t = THRESHOLDS_HOH_ARR * inf_factor
            std_deduction_t = STD_DEDUCTION_2026_HOH * inf_factor
        else:
            thresholds_t = THRESHOLDS_SINGLE_ARR * inf_factor
            std_deduction_t = STD_DEDUCTION_2026_SINGLE * inf_factor
            
        base_agi_ex_ss = taxable_income_sources + rmd_t
        base_taxable_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
        base_taxable_income = base_agi_ex_ss + base_taxable_ss - std_deduction_t
        base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR)
        total_base_tax = base_tax
        
        cash_inflows = total_income_sources + rmd_t
        cash_outflows = total_spending_target + total_base_tax
        net_base = cash_inflows - cash_outflows
        
        pretax_end = pretax_mid - rmd_t
        roth_end = roth_mid
        taxable_end = taxable_mid
        hsa_end = hsa_mid
        
        if net_base >= 0.0:
            taxable_end = taxable_mid + net_base
        else:
            deficit = -net_base
            
            w_taxable = min(deficit, max(0.0, taxable_end))
            taxable_end -= w_taxable
            deficit -= w_taxable
            
            if deficit > 0.0 and pretax_end > 0.0:
                agi_max = base_agi_ex_ss + pretax_end
                tax_ss_max = njit_calculate_taxable_ss(agi_max, ss_benefits, filing_status_t)
                tax_inc_max = agi_max + tax_ss_max - std_deduction_t
                tax_max = njit_calculate_tax(tax_inc_max, thresholds_t, TAX_RATES_ARR)
                pen_max = 0.10 * pretax_end if (user_alive and user_age_t < 59.5) else 0.0
                net_cash_max = pretax_end - ((tax_max + pen_max) - total_base_tax)
                
                if net_cash_max <= deficit:
                    w_pretax_extra = pretax_end
                    pretax_end = 0.0
                    deficit -= net_cash_max
                    base_agi_ex_ss += w_pretax_extra
                    tax_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                    base_taxable_income = base_agi_ex_ss + tax_ss - std_deduction_t
                    penalty = 0.10 * w_pretax_extra if (user_alive and user_age_t < 59.5) else 0.0
                    total_base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR) + penalty
                else:
                    low = 0.0
                    high = pretax_end
                    for _ in range(25):
                        mid = (low + high) / 2.0
                        agi = base_agi_ex_ss + mid
                        tax_ss = njit_calculate_taxable_ss(agi, ss_benefits, filing_status_t)
                        tax_inc = agi + tax_ss - std_deduction_t
                        tax = njit_calculate_tax(tax_inc, thresholds_t, TAX_RATES_ARR)
                        penalty = 0.10 * mid if (user_alive and user_age_t < 59.5) else 0.0
                        net_cash = mid - ((tax + penalty) - total_base_tax)
                        if net_cash < deficit:
                            low = mid
                        else:
                            high = mid
                    w_pretax_extra = high
                    pretax_end -= w_pretax_extra
                    base_agi_ex_ss += w_pretax_extra
                    tax_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                    base_taxable_income = base_agi_ex_ss + tax_ss - std_deduction_t
                    penalty = 0.10 * w_pretax_extra if (user_alive and user_age_t < 59.5) else 0.0
                    total_base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR) + penalty
                    deficit = 0.0
                    
            if deficit > 0.0 and roth_end > 0.0:
                w_roth = min(deficit, max(0.0, roth_end))
                roth_end -= w_roth
                deficit -= w_roth
                
            if deficit > 0.0 and hsa_end > 0.0:
                if hsa_for_medical:
                    w_hsa = min(deficit, max(0.0, hsa_end))
                    hsa_end -= w_hsa
                    deficit -= w_hsa
                else:
                    agi_max = base_agi_ex_ss + hsa_end
                    tax_ss_max = njit_calculate_taxable_ss(agi_max, ss_benefits, filing_status_t)
                    tax_inc_max = agi_max + tax_ss_max - std_deduction_t
                    tax_max = njit_calculate_tax(tax_inc_max, thresholds_t, TAX_RATES_ARR)
                    pen_max = 0.20 * hsa_end if (user_alive and user_age_t < 65.0) else 0.0
                    net_cash_max = hsa_end - ((tax_max + pen_max) - total_base_tax)
                    
                    if net_cash_max <= deficit:
                        w_hsa = hsa_end
                        hsa_end = 0.0
                        deficit -= net_cash_max
                        base_agi_ex_ss += w_hsa
                        tax_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                        base_taxable_income = base_agi_ex_ss + tax_ss - std_deduction_t
                        penalty = 0.20 * w_hsa if (user_alive and user_age_t < 65.0) else 0.0
                        total_base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR) + penalty
                    else:
                        low = 0.0
                        high = hsa_end
                        for _ in range(25):
                            mid = (low + high) / 2.0
                            agi = base_agi_ex_ss + mid
                            tax_ss = njit_calculate_taxable_ss(agi, ss_benefits, filing_status_t)
                            tax_inc = agi + tax_ss - std_deduction_t
                            tax = njit_calculate_tax(tax_inc, thresholds_t, TAX_RATES_ARR)
                            penalty = 0.20 * mid if (user_alive and user_age_t < 65.0) else 0.0
                            net_cash = mid - ((tax + penalty) - total_base_tax)
                            if net_cash < deficit:
                                low = mid
                            else:
                                high = mid
                        w_hsa = high
                        hsa_end -= w_hsa
                        base_agi_ex_ss += w_hsa
                        tax_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t)
                        base_taxable_income = base_agi_ex_ss + tax_ss - std_deduction_t
                        penalty = 0.20 * w_hsa if (user_alive and user_age_t < 65.0) else 0.0
                        total_base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR) + penalty
                        deficit = 0.0
                        
            if deficit > 0.0:
                taxable_end -= deficit
                
        pretax = pretax_end
        roth = roth_end
        taxable = taxable_end
        hsa = hsa_end
        
    return pretax + roth + taxable + hsa

@numba.njit(parallel=True)
def njit_simulate_all_paths(
    runs, total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
    filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
    adjust_spending_inflation, inflation_rate, hsa_for_medical, rmd_start_age,
    pretax_init, roth_init, taxable_init, hsa_init,
    c_pre, c_roth, c_tax, c_hsa,
    add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
    returns_pre, returns_roth, returns_taxable, returns_hsa,
    ending_wealths
):
    for i in numba.prange(runs):
        ending_wealths[i] = njit_simulate_path(
            total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
            filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
            adjust_spending_inflation, inflation_rate, hsa_for_medical, rmd_start_age,
            pretax_init, roth_init, taxable_init, hsa_init,
            c_pre, c_roth, c_tax, c_hsa,
            add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
            returns_pre[i], returns_roth[i], returns_taxable[i], returns_hsa[i]
        )

def prepare_numba_inputs(inputs, test_spending=None):
    desired_spending = test_spending if test_spending is not None else inputs['desired_spending']
    survivor_spending = inputs['survivor_spending']
    if test_spending is not None and inputs['desired_spending'] > 0:
        ratio = test_spending / inputs['desired_spending']
        survivor_spending = inputs['survivor_spending'] * ratio
        
    filing_status_map = {'single': 0, 'joint': 1, 'hoh': 2}
    filing_status_code = filing_status_map.get(inputs['filing_status'], 0)
    
    total_years = inputs['total_years']
    c_pre = np.zeros(total_years, dtype=np.float64)
    c_roth = np.zeros(total_years, dtype=np.float64)
    c_tax = np.zeros(total_years, dtype=np.float64)
    c_hsa = np.zeros(total_years, dtype=np.float64)
    
    add_spending_arr = np.zeros(total_years, dtype=np.float64)
    inc_taxable_arr = np.zeros(total_years, dtype=np.float64)
    inc_ss_arr = np.zeros(total_years, dtype=np.float64)
    inc_nontaxable_arr = np.zeros(total_years, dtype=np.float64)
    
    user_age = inputs['user_age']
    is_married = inputs['is_married']
    spouse_age = inputs['spouse_age']
    current_year = inputs['current_year']
    desired_spending_start_age = inputs['desired_spending_start_age']
    user_age_death = inputs['user_age_death']
    spouse_age_death = inputs['spouse_age_death']
    inflation_rate = inputs['inflation_rate']
    
    for t in range(total_years):
        user_age_t = user_age + t
        spouse_age_t = spouse_age + t if is_married else user_age_t
        user_alive = (user_age_t <= user_age_death)
        spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
        
        c_pre[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['pretax_data'])
        c_roth[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['roth_data'])
        c_tax[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['taxable_data'])
        c_hsa[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['hsa_data'])
        
        add_s = 0.0
        for item in inputs['additional_spending']:
            start_age = item.get('start_age', 0)
            interval = item.get('interval', 0)
            amount = item.get('amount', 0.0)
            adjust_inf = item.get('adjust_inflation', True)
            occurs = False
            if user_age_t >= start_age:
                if interval == 0:
                    occurs = (user_age_t == start_age)
                else:
                    occurs = ((user_age_t - start_age) % interval == 0)
            if occurs:
                factor = (1.0 + inflation_rate / 100.0) ** t if adjust_inf else 1.0
                add_s += amount * factor
        add_spending_arr[t] = add_s
        
        tax_inc = 0.0
        ss_inc = 0.0
        nontax_inc = 0.0
        for inc in inputs['income_sources']:
            start_age = resolve_age(inc.get('start_age_type', 'retirement'), inc.get('start_age_specified', 0), user_age, desired_spending_start_age, is_married, spouse_age, spouse_age, user_age_death, spouse_age_death)
            end_age = resolve_age(inc.get('end_age_type', 'death'), inc.get('end_age_specified', 0), user_age, desired_spending_start_age, is_married, spouse_age, spouse_age, user_age_death, spouse_age_death)
            active = False
            if start_age <= user_age_t <= end_age:
                if not user_alive and inc.get('end_age_type') in ['death', 'retirement']:
                    active = False
                elif not spouse_alive and inc.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                    active = False
                else:
                    active = True
            if active:
                amt = inc.get('amount', 0.0) * 12.0
                adj_type = inc.get('adjust_type', 'inflation')
                adj_val = inc.get('adjust_val', 0.0)
                if adj_type == 'inflation':
                    factor = (1.0 + inflation_rate / 100.0) ** t
                elif adj_type == 'fixed_pct':
                    factor = (1.0 + adj_val / 100.0) ** t
                elif adj_type == 'inflation_less_pct':
                    rate = max(0.0, inflation_rate - adj_val)
                    factor = (1.0 + rate / 100.0) ** t
                else:
                    factor = 1.0
                inc_amt_t = amt * factor
                if inc.get('is_social_security', False):
                    ss_inc += inc_amt_t
                elif inc.get('subject_to_tax', True):
                    tax_inc += inc_amt_t
                else:
                    nontax_inc += inc_amt_t
        inc_taxable_arr[t] = tax_inc
        inc_ss_arr[t] = ss_inc
        inc_nontaxable_arr[t] = nontax_inc
        
    pretax_init = float(inputs['pretax_data'].get('present_balance', 0.0))
    roth_init = float(inputs['roth_data'].get('present_balance', 0.0))
    taxable_init = float(inputs['taxable_data'].get('present_balance', 0.0))
    hsa_init = float(inputs['hsa_data'].get('present_balance', 0.0))
    
    return {
        'desired_spending': float(desired_spending),
        'survivor_spending': float(survivor_spending),
        'filing_status_code': filing_status_code,
        'c_pre': c_pre,
        'c_roth': c_roth,
        'c_tax': c_tax,
        'c_hsa': c_hsa,
        'add_spending_arr': add_spending_arr,
        'inc_taxable_arr': inc_taxable_arr,
        'inc_ss_arr': inc_ss_arr,
        'inc_nontaxable_arr': inc_nontaxable_arr,
        'pretax_init': pretax_init,
        'roth_init': roth_init,
        'taxable_init': taxable_init,
        'hsa_init': hsa_init
    }

def generate_runs(sim_input):
    inputs = extract_sim_inputs(sim_input)
    
    # Generate random returns
    rng = np.random.default_rng()
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    pretax_s = inputs['pretax_data'].get('return_std', 10.0) / 100.0
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    roth_s = inputs['roth_data'].get('return_std', 10.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    taxable_s = inputs['taxable_data'].get('return_std', 10.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_s = inputs['hsa_data'].get('return_std', 10.0) / 100.0
    
    runs = inputs['runs']
    years = inputs['total_years']
    
    returns_pre = rng.normal(pretax_m, pretax_s, size=(runs, years))
    returns_roth = rng.normal(roth_m, roth_s, size=(runs, years))
    returns_taxable = rng.normal(taxable_m, taxable_s, size=(runs, years))
    returns_hsa = rng.normal(hsa_m, hsa_s, size=(runs, years))
    
    nb_inp = prepare_numba_inputs(inputs)
    ending_wealths = np.empty(runs, dtype=np.float64)
    
    njit_simulate_all_paths(
        runs, years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
        nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
        inputs['adjust_spending_inflation'], inputs['inflation_rate'], inputs['hsa_for_medical'], inputs['rmd_start_age'],
        nb_inp['pretax_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_init'],
        nb_inp['c_pre'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa'],
        nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
        returns_pre, returns_roth, returns_taxable, returns_hsa,
        ending_wealths
    )
    
    successes = float(np.sum(ending_wealths >= 0.0))
    success_rate = (successes / runs) * 100.0
    
    return {
        'run_mean': float(np.mean(ending_wealths)),
        'run_median': float(np.median(ending_wealths)),
        'run_10': float(np.percentile(ending_wealths, 10)),
        'run_25': float(np.percentile(ending_wealths, 25)),
        'run_min': float(np.min(ending_wealths)),
        'run_max': float(np.max(ending_wealths)),
        'run_success': float(success_rate)
    }

def binary_search(sim_input):
    inputs = extract_sim_inputs(sim_input)
    
    # Generate random returns once
    rng = np.random.default_rng()
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    pretax_s = inputs['pretax_data'].get('return_std', 10.0) / 100.0
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    roth_s = inputs['roth_data'].get('return_std', 10.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    taxable_s = inputs['taxable_data'].get('return_std', 8.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_s = inputs['hsa_data'].get('return_std', 8.0) / 100.0
    
    runs = inputs['runs']
    years = inputs['total_years']
    
    returns_pre = rng.normal(pretax_m, pretax_s, size=(runs, years))
    returns_roth = rng.normal(roth_m, roth_s, size=(runs, years))
    returns_taxable = rng.normal(taxable_m, taxable_s, size=(runs, years))
    returns_hsa = rng.normal(hsa_m, hsa_s, size=(runs, years))
    
    total_wealth = (
        inputs['pretax_data'].get('present_balance', 0.0) +
        inputs['roth_data'].get('present_balance', 0.0) +
        inputs['taxable_data'].get('present_balance', 0.0) +
        inputs['hsa_data'].get('present_balance', 0.0)
    )
    
    lower_limit = 0.0
    upper_limit = max(1000000.0, total_wealth)
    
    target_srate = inputs['target_success_rate'] / 100.0
    
    ending_wealths = np.empty(runs, dtype=np.float64)
    
    best_mid = 0.0
    best_srate = 0.0
    searches = 0
    max_searches = 25
    
    while (upper_limit - lower_limit) > 1.0 and searches < max_searches:
        searches += 1
        mid = (upper_limit + lower_limit) / 2.0
        nb_inp = prepare_numba_inputs(inputs, test_spending=mid)
        
        njit_simulate_all_paths(
            runs, years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
            nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
            inputs['adjust_spending_inflation'], inputs['inflation_rate'], inputs['hsa_for_medical'], inputs['rmd_start_age'],
            nb_inp['pretax_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_init'],
            nb_inp['c_pre'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa'],
            nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
            returns_pre, returns_roth, returns_taxable, returns_hsa,
            ending_wealths
        )
        
        success_rate = float(np.mean(ending_wealths >= 0.0))
        
        if success_rate >= target_srate:
            best_mid = mid
            best_srate = success_rate
            lower_limit = mid
        else:
            upper_limit = mid
            
    solved_spending = best_mid if best_mid > 0 else lower_limit
    solved_srate = best_srate if best_mid > 0 else success_rate
    
    det_pretax_r = [pretax_m] * years
    det_roth_r = [roth_m] * years
    det_taxable_r = [taxable_m] * years
    det_hsa_r = [hsa_m] * years
    
    det_results = run_simulation_path(
        inputs, det_pretax_r, det_roth_r, det_taxable_r, det_hsa_r, test_spending=solved_spending
    )
    
    first_year = det_results[0]
    first_year_withdrawal = first_year['withdrawals']['total']
    first_year_income = first_year['income_sources_total']
    first_year_taxes = first_year['taxes_paid']
    
    achieved_spending_y1 = first_year_withdrawal + first_year_income - first_year_taxes
    
    return float(solved_spending), float(solved_srate * 100.0), searches, float(achieved_spending_y1)

def run_deterministic(sim_input):
    inputs = extract_sim_inputs(sim_input)
    years = inputs['total_years']
    
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    
    det_pretax_r = [pretax_m] * years
    det_roth_r = [roth_m] * years
    det_taxable_r = [taxable_m] * years
    det_hsa_r = [hsa_m] * years
    
    path_results = run_simulation_path(
        inputs, det_pretax_r, det_roth_r, det_taxable_r, det_hsa_r
    )
    
    # Format results for the deterministic tables
    rows = []
    for t in range(years):
        res = path_results[t]
        year = inputs['current_year'] + t
        user_age_t = inputs['user_age'] + t
        spouse_age_t = (inputs['spouse_age'] + t) if inputs['is_married'] else None
        
        # User or spouse is alive check
        user_alive = (user_age_t <= inputs['user_age_death'])
        spouse_alive = inputs['is_married'] and (spouse_age_t <= inputs['spouse_age_death'])
        
        if not user_alive and not spouse_alive:
            continue
            
        rows.append({
            'year_index': t,
            'year': year,
            'user_age': user_age_t if user_alive else None,
            'spouse_age': spouse_age_t if spouse_alive else None,
            'beg_assets': res['beginning_assets'],
            'contribs': res['contributions'],
            'growth': res['growth'],
            'income': res['income_sources_total'],
            'income_breakdown': res['income_sources_breakdown'],
            'taxes': res['taxes_paid'],
            'desired_spending': res['desired_spending'],
            'additional_spending': res['additional_spending'],
            'ending_assets': res['ending_assets'],
            'withdrawals': res['withdrawals']
        })
        
    return rows