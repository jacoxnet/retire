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

# Shared Numba-JIT kernel used by both the deterministic (simulate_step) and
# Monte Carlo (njit_simulate_path) engines, so the RMD/tax/withdrawal-waterfall
# and spousal-rollover logic is implemented exactly once.
@numba.njit
def njit_spousal_rollover(
    t, t_first_death, is_married, user_alive, spouse_alive, filing_status_code,
    pretax_user, pretax_spouse, hsa_user, hsa_spouse,
    contrib_pretax_user, contrib_pretax_spouse, contrib_hsa_user, contrib_hsa_spouse,
):
    filing_status_t = filing_status_code
    if is_married and t > t_first_death:
        filing_status_t = 0
        if user_alive and not spouse_alive:
            if pretax_spouse > 0.0:
                pretax_user += pretax_spouse
                pretax_spouse = 0.0
                contrib_pretax_spouse = 0.0
            if hsa_spouse > 0.0:
                hsa_user += hsa_spouse
                hsa_spouse = 0.0
                contrib_hsa_spouse = 0.0
        elif spouse_alive and not user_alive:
            if pretax_user > 0.0:
                pretax_spouse += pretax_user
                pretax_user = 0.0
                contrib_pretax_user = 0.0
            if hsa_user > 0.0:
                hsa_spouse += hsa_user
                hsa_user = 0.0
                contrib_hsa_user = 0.0
    return (filing_status_t, pretax_user, pretax_spouse, hsa_user, hsa_spouse,
            contrib_pretax_user, contrib_pretax_spouse, contrib_hsa_user, contrib_hsa_spouse)

@numba.njit
def njit_rmd_tax_withdraw(
    user_age_t, spouse_age_t, user_alive, spouse_alive, is_married,
    pretax_user_before, pretax_spouse_before, pretax_user_mid, pretax_spouse_mid,
    roth_mid, taxable_mid, hsa_user_mid, hsa_spouse_mid,
    user_rmd_start_age, spouse_rmd_start_age,
    filing_status_t_code, inf_factor,
    total_spending_target, taxable_income_sources, ss_benefits, nontaxable_income,
    other_taxes_t, state_tax_rate, state_ss_exempt_code,
    hsa_user_for_medical_code, hsa_spouse_for_medical_code,
):
    state_rate = state_tax_rate / 100.0
    total_income_sources = taxable_income_sources + ss_benefits + nontaxable_income

    user_rmd_t = 0.0
    if user_alive and user_age_t >= user_rmd_start_age:
        divisor = RMD_TABLE_ARR[user_age_t] if user_age_t <= 150 else 2.0
        user_rmd_t = min(pretax_user_before / divisor, pretax_user_mid) if pretax_user_before > 0.0 else 0.0

    spouse_rmd_t = 0.0
    if spouse_alive and spouse_age_t >= spouse_rmd_start_age:
        divisor = RMD_TABLE_ARR[spouse_age_t] if spouse_age_t <= 150 else 2.0
        spouse_rmd_t = min(pretax_spouse_before / divisor, pretax_spouse_mid) if pretax_spouse_before > 0.0 else 0.0

    rmd_t = user_rmd_t + spouse_rmd_t

    if filing_status_t_code == 1:
        thresholds_t = THRESHOLDS_JOINT_ARR * inf_factor
        std_deduction_t = STD_DEDUCTION_2026_JOINT * inf_factor
    elif filing_status_t_code == 2:
        thresholds_t = THRESHOLDS_HOH_ARR * inf_factor
        std_deduction_t = STD_DEDUCTION_2026_HOH * inf_factor
    else:
        thresholds_t = THRESHOLDS_SINGLE_ARR * inf_factor
        std_deduction_t = STD_DEDUCTION_2026_SINGLE * inf_factor

    base_agi_ex_ss = taxable_income_sources + rmd_t
    base_taxable_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t_code)
    base_taxable_income = max(0.0, base_agi_ex_ss + base_taxable_ss - std_deduction_t)
    base_tax = njit_calculate_tax(base_taxable_income, thresholds_t, TAX_RATES_ARR)

    base_st_ss = 0.0 if state_ss_exempt_code == 1 else base_taxable_ss
    base_st_taxable_income = max(0.0, base_agi_ex_ss + base_st_ss - std_deduction_t)
    base_state_tax = base_st_taxable_income * state_rate
    total_base_tax = base_tax + base_state_tax

    cash_inflows = total_income_sources + rmd_t
    cash_outflows = total_spending_target + total_base_tax + other_taxes_t
    net_base = cash_inflows - cash_outflows

    pretax_user_end = pretax_user_mid - user_rmd_t
    pretax_spouse_end = pretax_spouse_mid - spouse_rmd_t
    pretax_end = pretax_user_end + pretax_spouse_end
    roth_end = roth_mid
    taxable_end = taxable_mid
    hsa_user_end = hsa_user_mid
    hsa_spouse_end = hsa_spouse_mid

    w_pretax_extra = 0.0
    w_taxable = 0.0
    w_roth = 0.0
    w_hsa_user = 0.0
    w_hsa_spouse = 0.0
    final_fed_tax = base_tax
    final_state_tax = base_state_tax
    final_penalty = 0.0
    hsa_penalty_user = 0.0
    hsa_penalty_spouse = 0.0

    if net_base >= 0.0:
        taxable_end = taxable_mid + net_base
    else:
        deficit = -net_base

        # A. Taxable assets
        w_taxable = min(deficit, max(0.0, taxable_end))
        taxable_end = taxable_end - w_taxable
        deficit = deficit - w_taxable

        # B. Pre-tax extra withdrawals (gross-up solver)
        if deficit > 0.0 and pretax_end > 0.0:
            tot_pre = pretax_user_end + pretax_spouse_end
            u_ratio = (pretax_user_end / tot_pre) if tot_pre > 0.0 else 0.0
            s_ratio = 1.0 - u_ratio
            user_pen_rate = 0.10 if (user_alive and user_age_t < 59.5) else 0.0
            spouse_pen_rate = 0.10 if ((spouse_alive or not user_alive) and spouse_age_t < 59.5) else 0.0
            eff_pre_pen_rate = u_ratio * user_pen_rate + s_ratio * spouse_pen_rate

            agi_max = base_agi_ex_ss + pretax_end
            tax_ss_max = njit_calculate_taxable_ss(agi_max, ss_benefits, filing_status_t_code)
            fed_taxable_max = max(0.0, agi_max + tax_ss_max - std_deduction_t)
            fed_tax_max = njit_calculate_tax(fed_taxable_max, thresholds_t, TAX_RATES_ARR)
            st_ss_max = 0.0 if state_ss_exempt_code == 1 else tax_ss_max
            st_taxable_max = max(0.0, agi_max + st_ss_max - std_deduction_t)
            st_tax_max = st_taxable_max * state_rate
            pen_max = eff_pre_pen_rate * pretax_end
            net_cash_max = pretax_end - ((fed_tax_max + st_tax_max + pen_max) - total_base_tax)

            if net_cash_max <= deficit:
                w_pretax_extra = pretax_end
                pretax_end = 0.0
                deficit = deficit - net_cash_max
            else:
                low = 0.0
                high = pretax_end
                for _ in range(25):
                    mid = (low + high) / 2.0
                    agi = base_agi_ex_ss + mid
                    tax_ss = njit_calculate_taxable_ss(agi, ss_benefits, filing_status_t_code)
                    fed_taxable = max(0.0, agi + tax_ss - std_deduction_t)
                    fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
                    st_ss = 0.0 if state_ss_exempt_code == 1 else tax_ss
                    st_taxable = max(0.0, agi + st_ss - std_deduction_t)
                    st_tax = st_taxable * state_rate
                    penalty = eff_pre_pen_rate * mid
                    net_cash = mid - ((fed_tax + st_tax + penalty) - total_base_tax)
                    if net_cash < deficit:
                        low = mid
                    else:
                        high = mid
                w_pretax_extra = high
                pretax_end = pretax_end - w_pretax_extra
                deficit = 0.0

            base_agi_ex_ss += w_pretax_extra
            taxable_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t_code)
            fed_taxable = max(0.0, base_agi_ex_ss + taxable_ss - std_deduction_t)
            final_fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
            st_ss = 0.0 if state_ss_exempt_code == 1 else taxable_ss
            st_taxable = max(0.0, base_agi_ex_ss + st_ss - std_deduction_t)
            final_state_tax = st_taxable * state_rate
            final_penalty = eff_pre_pen_rate * w_pretax_extra
            total_base_tax = final_fed_tax + final_state_tax + final_penalty

            if tot_pre > 0.0 and w_pretax_extra > 0.0:
                w_u = w_pretax_extra * u_ratio
                w_s = w_pretax_extra - w_u
                pretax_user_end = max(0.0, pretax_user_end - w_u)
                pretax_spouse_end = max(0.0, pretax_spouse_end - w_s)

        # C. Roth assets
        if deficit > 0.0 and roth_end > 0.0:
            w_roth = min(deficit, max(0.0, roth_end))
            roth_end = roth_end - w_roth
            deficit = deficit - w_roth

        # D. HSA user (user HSA first, then spouse HSA)
        if deficit > 0.0 and hsa_user_end > 0.0:
            if hsa_user_for_medical_code == 1:
                w_hsa_user = min(deficit, max(0.0, hsa_user_end))
                hsa_user_end = hsa_user_end - w_hsa_user
                deficit = deficit - w_hsa_user
            else:
                agi_max = base_agi_ex_ss + hsa_user_end
                tax_ss_max = njit_calculate_taxable_ss(agi_max, ss_benefits, filing_status_t_code)
                fed_taxable_max = max(0.0, agi_max + tax_ss_max - std_deduction_t)
                fed_tax_max = njit_calculate_tax(fed_taxable_max, thresholds_t, TAX_RATES_ARR)
                st_ss_max = 0.0 if state_ss_exempt_code == 1 else tax_ss_max
                st_taxable_max = max(0.0, agi_max + st_ss_max - std_deduction_t)
                st_tax_max = st_taxable_max * state_rate
                pen_max = 0.20 * hsa_user_end if (user_alive and user_age_t < 65.0) else 0.0
                net_cash_max = hsa_user_end - ((fed_tax_max + st_tax_max + final_penalty + pen_max) - total_base_tax)

                if net_cash_max <= deficit:
                    w_hsa_user = hsa_user_end
                    hsa_user_end = 0.0
                    deficit = deficit - net_cash_max
                else:
                    low = 0.0
                    high = hsa_user_end
                    for _ in range(25):
                        mid = (low + high) / 2.0
                        agi = base_agi_ex_ss + mid
                        tax_ss = njit_calculate_taxable_ss(agi, ss_benefits, filing_status_t_code)
                        fed_taxable = max(0.0, agi + tax_ss - std_deduction_t)
                        fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
                        st_ss = 0.0 if state_ss_exempt_code == 1 else tax_ss
                        st_taxable = max(0.0, agi + st_ss - std_deduction_t)
                        st_tax = st_taxable * state_rate
                        penalty = 0.20 * mid if (user_alive and user_age_t < 65.0) else 0.0
                        net_cash = mid - ((fed_tax + st_tax + final_penalty + penalty) - total_base_tax)
                        if net_cash < deficit:
                            low = mid
                        else:
                            high = mid
                    w_hsa_user = high
                    hsa_user_end = hsa_user_end - w_hsa_user
                    deficit = 0.0

                base_agi_ex_ss += w_hsa_user
                taxable_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t_code)
                fed_taxable = max(0.0, base_agi_ex_ss + taxable_ss - std_deduction_t)
                final_fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
                st_ss = 0.0 if state_ss_exempt_code == 1 else taxable_ss
                st_taxable = max(0.0, base_agi_ex_ss + st_ss - std_deduction_t)
                final_state_tax = st_taxable * state_rate
                hsa_penalty_user = 0.20 * w_hsa_user if (user_alive and user_age_t < 65.0) else 0.0
                final_penalty = (eff_pre_pen_rate * w_pretax_extra) + hsa_penalty_user
                total_base_tax = final_fed_tax + final_state_tax + final_penalty

        # E. HSA spouse
        if deficit > 0.0 and hsa_spouse_end > 0.0 and (spouse_alive or not user_alive):
            if hsa_spouse_for_medical_code == 1:
                w_hsa_spouse = min(deficit, max(0.0, hsa_spouse_end))
                hsa_spouse_end = hsa_spouse_end - w_hsa_spouse
                deficit = deficit - w_hsa_spouse
            else:
                agi_max = base_agi_ex_ss + hsa_spouse_end
                tax_ss_max = njit_calculate_taxable_ss(agi_max, ss_benefits, filing_status_t_code)
                fed_taxable_max = max(0.0, agi_max + tax_ss_max - std_deduction_t)
                fed_tax_max = njit_calculate_tax(fed_taxable_max, thresholds_t, TAX_RATES_ARR)
                st_ss_max = 0.0 if state_ss_exempt_code == 1 else tax_ss_max
                st_taxable_max = max(0.0, agi_max + st_ss_max - std_deduction_t)
                st_tax_max = st_taxable_max * state_rate
                pen_max = 0.20 * hsa_spouse_end if ((spouse_alive or not user_alive) and spouse_age_t < 65.0) else 0.0
                net_cash_max = hsa_spouse_end - ((fed_tax_max + st_tax_max + final_penalty + pen_max) - total_base_tax)

                if net_cash_max <= deficit:
                    w_hsa_spouse = hsa_spouse_end
                    hsa_spouse_end = 0.0
                    deficit = deficit - net_cash_max
                else:
                    low = 0.0
                    high = hsa_spouse_end
                    for _ in range(25):
                        mid = (low + high) / 2.0
                        agi = base_agi_ex_ss + mid
                        tax_ss = njit_calculate_taxable_ss(agi, ss_benefits, filing_status_t_code)
                        fed_taxable = max(0.0, agi + tax_ss - std_deduction_t)
                        fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
                        st_ss = 0.0 if state_ss_exempt_code == 1 else tax_ss
                        st_taxable = max(0.0, agi + st_ss - std_deduction_t)
                        st_tax = st_taxable * state_rate
                        penalty = 0.20 * mid if ((spouse_alive or not user_alive) and spouse_age_t < 65.0) else 0.0
                        net_cash = mid - ((fed_tax + st_tax + final_penalty + penalty) - total_base_tax)
                        if net_cash < deficit:
                            low = mid
                        else:
                            high = mid
                    w_hsa_spouse = high
                    hsa_spouse_end = hsa_spouse_end - w_hsa_spouse
                    deficit = 0.0

                base_agi_ex_ss += w_hsa_spouse
                taxable_ss = njit_calculate_taxable_ss(base_agi_ex_ss, ss_benefits, filing_status_t_code)
                fed_taxable = max(0.0, base_agi_ex_ss + taxable_ss - std_deduction_t)
                final_fed_tax = njit_calculate_tax(fed_taxable, thresholds_t, TAX_RATES_ARR)
                st_ss = 0.0 if state_ss_exempt_code == 1 else taxable_ss
                st_taxable = max(0.0, base_agi_ex_ss + st_ss - std_deduction_t)
                final_state_tax = st_taxable * state_rate
                hsa_penalty_spouse = 0.20 * w_hsa_spouse if ((spouse_alive or not user_alive) and spouse_age_t < 65.0) else 0.0
                final_penalty = final_penalty + hsa_penalty_spouse
                total_base_tax = final_fed_tax + final_state_tax + final_penalty

        if deficit > 0.0:
            taxable_end = taxable_end - deficit

    return (
        pretax_user_end, pretax_spouse_end, roth_end, taxable_end, hsa_user_end, hsa_spouse_end,
        user_rmd_t, spouse_rmd_t,
        w_pretax_extra, w_taxable, w_roth, w_hsa_user, w_hsa_spouse,
        final_fed_tax, final_state_tax, final_penalty,
        hsa_penalty_user, hsa_penalty_spouse,
    )

def simulate_step(
    t, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
    filing_status, desired_spending_start_age, desired_spending, survivor_spending,
    adjust_spending_inflation, inflation_rate, additional_spending_list, income_sources_list,
    pretax_user, pretax_spouse, roth, taxable, hsa_user=0.0, hsa_user_for_medical=True,
    r_pretax_user=0.0, r_pretax_spouse=0.0, r_roth=0.0, r_taxable=0.0, r_hsa_user=0.0,
    contrib_pretax_user=0.0, contrib_pretax_spouse=0.0, contrib_roth=0.0, contrib_taxable=0.0, contrib_hsa_user=0.0,
    user_rmd_start_age=75, spouse_rmd_start_age=150, social_security_data=None,
    state_tax_rate=0.0, state_ss_exempt=True, other_taxes_list=None,
    hsa_spouse=0.0, hsa_spouse_for_medical=True, r_hsa_spouse=0.0, contrib_hsa_spouse=0.0,
    hsa=None, hsa_for_medical=None, r_hsa=None, contrib_hsa=None,
    user_ret_age=65, spouse_ret_age=65
):
    # Backwards-compatibility aliases
    if hsa is not None:
        hsa_user = hsa
    if hsa_for_medical is not None:
        hsa_user_for_medical = hsa_for_medical
    if r_hsa is not None:
        r_hsa_user = r_hsa
    if contrib_hsa is not None:
        contrib_hsa_user = contrib_hsa

    user_age_t = user_age + t
    spouse_age_t = spouse_age + t if is_married else None
    
    # 1. Determine active status and filing status
    user_alive = (user_age_t <= user_age_death)
    spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
    
    if not user_alive and not spouse_alive:
        # Both are dead, nothing to simulate
        return {
            'beginning_assets': {'pretax': 0.0, 'pretax_user': 0.0, 'pretax_spouse': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'hsa_user': 0.0, 'hsa_spouse': 0.0, 'total': 0.0},
            'ending_assets': {'pretax': 0.0, 'pretax_user': 0.0, 'pretax_spouse': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'hsa_user': 0.0, 'hsa_spouse': 0.0, 'total': 0.0},
            'contributions': {'pretax': 0.0, 'pretax_user': 0.0, 'pretax_spouse': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'hsa_user': 0.0, 'hsa_spouse': 0.0, 'total': 0.0},
            'growth': {'pretax': 0.0, 'pretax_user': 0.0, 'pretax_spouse': 0.0, 'roth': 0.0, 'taxable': 0.0, 'hsa': 0.0, 'hsa_user': 0.0, 'hsa_spouse': 0.0, 'total': 0.0},
            'income_sources_total': 0.0,
            'income_sources_breakdown': {},
            'taxes_paid': 0.0,
            'tax_breakdown': {'fed_tax': 0.0, 'state_tax': 0.0, 'penalty': 0.0, 'other_taxes': 0.0, 'other_taxes_breakdown': {}},
            'desired_spending': 0.0,
            'additional_spending': 0.0,
            'additional_spending_breakdown': {},
            'withdrawals': {'user_pretax_rmd': 0.0, 'spouse_pretax_rmd': 0.0, 'pretax_rmd': 0.0, 'pretax_extra': 0.0, 'taxable': 0.0, 'roth': 0.0, 'hsa_user': 0.0, 'hsa_spouse': 0.0, 'hsa': 0.0, 'total': 0.0}
        }
    
    t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else user_age_death - user_age

    # Spousal Rollover upon first death (shared kernel; also downgrades filing status)
    filing_status_code = {'joint': 1, 'hoh': 2}.get(filing_status, 0)
    (filing_status_t_code, pretax_user, pretax_spouse, hsa_user, hsa_spouse,
     contrib_pretax_user, contrib_pretax_spouse, contrib_hsa_user, contrib_hsa_spouse) = njit_spousal_rollover(
        t, t_first_death, is_married, user_alive, spouse_alive, filing_status_code,
        pretax_user, pretax_spouse, hsa_user, hsa_spouse,
        contrib_pretax_user, contrib_pretax_spouse, contrib_hsa_user, contrib_hsa_spouse,
    )

    # 2. Add Contributions
    pretax_user_before = max(0.0, pretax_user + contrib_pretax_user)
    pretax_spouse_before = max(0.0, pretax_spouse + contrib_pretax_spouse) if is_married else 0.0
    roth_before = max(0.0, roth + contrib_roth)
    taxable_before = taxable + contrib_taxable
    hsa_user_before = max(0.0, hsa_user + contrib_hsa_user)
    hsa_spouse_before = max(0.0, hsa_spouse + contrib_hsa_spouse) if is_married else 0.0
    
    # 3. Apply growth
    growth_pre_user = pretax_user_before * r_pretax_user
    growth_pre_spouse = pretax_spouse_before * r_pretax_spouse if is_married else 0.0
    growth_roth = roth_before * r_roth
    growth_taxable = taxable_before * r_taxable if taxable_before > 0.0 else 0.0
    growth_hsa_user = hsa_user_before * r_hsa_user
    growth_hsa_spouse = hsa_spouse_before * r_hsa_spouse if is_married else 0.0
    
    pretax_user_mid = pretax_user_before + growth_pre_user
    pretax_spouse_mid = pretax_spouse_before + growth_pre_spouse
    pretax_mid = pretax_user_mid + pretax_spouse_mid
    roth_mid = roth_before + growth_roth
    taxable_mid = taxable_before + growth_taxable
    hsa_user_mid = hsa_user_before + growth_hsa_user
    hsa_spouse_mid = hsa_spouse_before + growth_hsa_spouse
    hsa_mid = hsa_user_mid + hsa_spouse_mid
    
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
    add_spending_breakdown_t = {}
    for item in additional_spending_list:
        name = item.get('name') or 'Additional Expense'
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
            item_amt = amount * spending_factor
            add_spending_t += item_amt
            add_spending_breakdown_t[name] = add_spending_breakdown_t.get(name, 0.0) + item_amt
            
    total_spending_target = desired_spending_t + add_spending_t
    
    # 5b. Calculate Other Taxes
    other_taxes_t = 0.0
    other_taxes_breakdown_t = {}
    if other_taxes_list:
        for item in other_taxes_list:
            name = item.get('name') or 'Other Tax'
            freq = item.get('frequency', 'annual')
            raw_amt = float(item.get('amount', 0.0))
            start_age = resolve_age(item.get('start_age_type', 'retirement'), item.get('start_age_specified', 65), user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death)
            end_age = resolve_age(item.get('end_age_type', 'death'), item.get('end_age_specified', 90), user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death)
            
            is_one_time = (freq in ['one_time', 'one-time'])
            in_age_range = (user_age_t == start_age) if is_one_time else (start_age <= user_age_t <= end_age)
            active = False
            if in_age_range:
                if not user_alive and item.get('end_age_type') in ['death', 'retirement']:
                    active = False
                elif not spouse_alive and item.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                    active = False
                else:
                    active = True
                    
            if active:
                if freq == 'annual' or is_one_time:
                    amt = raw_amt
                else:
                    amt = raw_amt * 12.0
                    
                adj_type = item.get('adjust_type', 'inflation')
                adj_val = float(item.get('adjust_val', 0.0))
                adj_start_type = item.get('adjust_start_age_type', 'start')
                adj_start_spec = item.get('adjust_start_age_specified', 65)

                if adj_start_type in ['start', 'income_start', 'at_start']:
                    adj_start_age = start_age
                elif adj_start_type in ['current_age', 'current_year', 'now']:
                    adj_start_age = user_age
                elif adj_start_type == 'specified':
                    try:
                        adj_start_age = int(adj_start_spec)
                    except (ValueError, TypeError):
                        adj_start_age = start_age
                else:
                    adj_start_age = resolve_age(adj_start_type, adj_start_spec, user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death, default_val=start_age)

                years_since_adj = max(0, user_age_t - adj_start_age)

                if adj_type == 'inflation':
                    factor = (1.0 + inflation_rate / 100.0) ** years_since_adj
                elif adj_type == 'fixed_pct':
                    factor = (1.0 + adj_val / 100.0) ** years_since_adj
                elif adj_type == 'inflation_less_pct':
                    rate = max(0.0, inflation_rate - adj_val)
                    factor = (1.0 + rate / 100.0) ** years_since_adj
                else:
                    factor = 1.0

                item_tax = amt * factor
                other_taxes_t += item_tax
                other_taxes_breakdown_t[name] = other_taxes_breakdown_t.get(name, 0.0) + item_tax

    # 6. Calculate Income Sources
    taxable_income_sources = 0.0
    ss_benefits = 0.0
    nontaxable_income = 0.0
    income_breakdown = {}

    # Dedicated Social Security calculation
    if social_security_data is not None:
        u_entitled = bool(social_security_data.get('user_entitled', True))
        sp_entitled = bool(social_security_data.get('spouse_entitled', False)) and is_married
        u_start = int(social_security_data.get('user_start_age', 67))
        sp_start = int(social_security_data.get('spouse_start_age', 67))

        u_amt = float(social_security_data.get('user_amount', 2500.0))
        if social_security_data.get('user_freq', 'monthly') == 'monthly':
            u_amt *= 12.0
        u_ss_inf = (u_amt * ((1.0 + inflation_rate / 100.0) ** t)) if u_entitled else 0.0

        sp_amt = float(social_security_data.get('spouse_amount', 0.0))
        if social_security_data.get('spouse_freq', 'monthly') == 'monthly':
            sp_amt *= 12.0
        sp_ss_inf = (sp_amt * ((1.0 + inflation_rate / 100.0) ** t)) if sp_entitled else 0.0

        u_ss_active = user_alive and u_entitled and (user_age_t >= u_start)
        sp_ss_active = spouse_alive and sp_entitled and (spouse_age_t >= sp_start)

        u_ss_t = 0.0
        sp_ss_t = 0.0

        if u_ss_active and sp_ss_active:
            u_ss_t = u_ss_inf
            sp_ss_t = sp_ss_inf
        elif user_alive and not spouse_alive and is_married:
            if u_ss_active:
                u_ss_t = max(u_ss_inf, sp_ss_inf)
            elif sp_ss_inf > 0.0 and user_age_t >= 60:
                u_ss_t = sp_ss_inf
        elif spouse_alive and not user_alive and is_married:
            if sp_ss_active:
                sp_ss_t = max(sp_ss_inf, u_ss_inf)
            elif u_ss_inf > 0.0 and (spouse_age_t is not None and spouse_age_t >= 60):
                sp_ss_t = u_ss_inf
        elif u_ss_active:
            u_ss_t = u_ss_inf
        elif sp_ss_active:
            sp_ss_t = sp_ss_inf

        if u_ss_t > 0.0:
            ss_benefits += u_ss_t
            income_breakdown['Your Social Security'] = income_breakdown.get('Your Social Security', 0.0) + u_ss_t
        if sp_ss_t > 0.0:
            ss_benefits += sp_ss_t
            income_breakdown["Spouse's Social Security"] = income_breakdown.get("Spouse's Social Security", 0.0) + sp_ss_t

    for item in income_sources_list:
        name = item.get('name') or 'Income Stream'
        freq = item.get('frequency', 'monthly')
        raw_amt = float(item.get('amount', 0.0))
        start_age = resolve_age(item.get('start_age_type', 'retirement'), item.get('start_age_specified', 65), user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death)
        end_age = resolve_age(item.get('end_age_type', 'death'), item.get('end_age_specified', 90), user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death)
        
        is_one_time = (freq in ['one_time', 'one-time'])
        in_age_range = (user_age_t == start_age) if is_one_time else (start_age <= user_age_t <= end_age)
        active = False
        if in_age_range:
            if not user_alive and item.get('end_age_type') in ['death', 'retirement']:
                active = False
            elif not spouse_alive and item.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                active = False
            else:
                active = True
                
        if active:
            if freq == 'annual' or is_one_time:
                amt = raw_amt
            else:
                amt = raw_amt * 12.0
                
            adj_type = item.get('adjust_type', 'inflation')
            adj_val = float(item.get('adjust_val', 0.0))
            adj_start_type = item.get('adjust_start_age_type', 'start')
            adj_start_spec = item.get('adjust_start_age_specified', 65)

            if adj_start_type in ['start', 'income_start', 'at_start']:
                adj_start_age = start_age
            elif adj_start_type in ['current_age', 'current_year', 'now']:
                adj_start_age = user_age
            elif adj_start_type == 'specified':
                try:
                    adj_start_age = int(adj_start_spec)
                except (ValueError, TypeError):
                    adj_start_age = start_age
            else:
                adj_start_age = resolve_age(adj_start_type, adj_start_spec, user_age, user_ret_age, is_married, spouse_age, spouse_ret_age, user_age_death, spouse_age_death, default_val=start_age)

            years_since_adj = max(0, user_age_t - adj_start_age)

            if adj_type == 'inflation':
                factor = (1.0 + inflation_rate / 100.0) ** years_since_adj
            elif adj_type == 'fixed_pct':
                factor = (1.0 + adj_val / 100.0) ** years_since_adj
            elif adj_type == 'inflation_less_pct':
                rate = max(0.0, inflation_rate - adj_val)
                factor = (1.0 + rate / 100.0) ** years_since_adj
            else:
                factor = 1.0
                
            item_inc = amt * factor
            is_ss = bool(item.get('is_social_security', False))
            is_taxable = bool(item.get('subject_to_tax', True))
            
            if is_ss:
                ss_benefits += item_inc
            elif is_taxable:
                taxable_income_sources += item_inc
            else:
                nontaxable_income += item_inc
                
            income_breakdown[name] = income_breakdown.get(name, 0.0) + item_inc
            
    total_income_sources = taxable_income_sources + ss_benefits + nontaxable_income
    
    # 7-9. RMD calculation, tax computation, and withdrawal waterfall (shared kernel)
    inf_factor = (1.0 + inflation_rate / 100.0) ** t
    state_ss_exempt_code = 1 if state_ss_exempt else 0
    hsa_user_for_medical_code = 1 if hsa_user_for_medical else 0
    hsa_spouse_for_medical_code = 1 if hsa_spouse_for_medical else 0

    (pretax_user_end, pretax_spouse_end, roth_end, taxable_end, hsa_user_end, hsa_spouse_end,
     user_rmd_t, spouse_rmd_t,
     w_pretax_extra, w_taxable, w_roth, w_hsa_user, w_hsa_spouse,
     final_fed_tax, final_state_tax, final_penalty,
     hsa_penalty_user, hsa_penalty_spouse) = njit_rmd_tax_withdraw(
        user_age_t, spouse_age_t if is_married else user_age_t, user_alive, spouse_alive, is_married,
        pretax_user_before, pretax_spouse_before, pretax_user_mid, pretax_spouse_mid,
        roth_mid, taxable_mid, hsa_user_mid, hsa_spouse_mid,
        user_rmd_start_age, spouse_rmd_start_age,
        filing_status_t_code, inf_factor,
        total_spending_target, taxable_income_sources, ss_benefits, nontaxable_income,
        other_taxes_t, state_tax_rate, state_ss_exempt_code,
        hsa_user_for_medical_code, hsa_spouse_for_medical_code,
    )

    rmd_t = user_rmd_t + spouse_rmd_t
    hsa_penalty_total = hsa_penalty_user + hsa_penalty_spouse
    final_tax_and_penalty = final_fed_tax + final_state_tax + final_penalty + other_taxes_t

    # Calculate totals
    beg_assets = {
        'pretax': pretax_user + pretax_spouse,
        'pretax_user': pretax_user,
        'pretax_spouse': pretax_spouse,
        'roth': roth,
        'taxable': taxable,
        'hsa': hsa_user + hsa_spouse,
        'hsa_user': hsa_user,
        'hsa_spouse': hsa_spouse,
        'total': pretax_user + pretax_spouse + roth + taxable + hsa_user + hsa_spouse
    }
    
    end_assets = {
        'pretax': pretax_user_end + pretax_spouse_end,
        'pretax_user': pretax_user_end,
        'pretax_spouse': pretax_spouse_end,
        'roth': roth_end,
        'taxable': taxable_end,
        'hsa': hsa_user_end + hsa_spouse_end,
        'hsa_user': hsa_user_end,
        'hsa_spouse': hsa_spouse_end,
        'total': pretax_user_end + pretax_spouse_end + roth_end + taxable_end + hsa_user_end + hsa_spouse_end
    }
    
    conts = {
        'pretax': contrib_pretax_user + contrib_pretax_spouse,
        'pretax_user': contrib_pretax_user,
        'pretax_spouse': contrib_pretax_spouse,
        'roth': contrib_roth,
        'taxable': contrib_taxable,
        'hsa': contrib_hsa_user + contrib_hsa_spouse,
        'hsa_user': contrib_hsa_user,
        'hsa_spouse': contrib_hsa_spouse,
        'total': contrib_pretax_user + contrib_pretax_spouse + contrib_roth + contrib_taxable + contrib_hsa_user + contrib_hsa_spouse
    }
    
    growth = {
        'pretax': growth_pre_user + growth_pre_spouse,
        'pretax_user': growth_pre_user,
        'pretax_spouse': growth_pre_spouse,
        'roth': growth_roth,
        'taxable': growth_taxable,
        'hsa': growth_hsa_user + growth_hsa_spouse,
        'hsa_user': growth_hsa_user,
        'hsa_spouse': growth_hsa_spouse,
        'total': growth_pre_user + growth_pre_spouse + growth_roth + growth_taxable + growth_hsa_user + growth_hsa_spouse
    }
    
    withdrawals = {
        'user_pretax_rmd': user_rmd_t,
        'spouse_pretax_rmd': spouse_rmd_t,
        'pretax_rmd': rmd_t,
        'pretax_extra': w_pretax_extra,
        'taxable': w_taxable,
        'roth': w_roth,
        'hsa_user': w_hsa_user,
        'hsa_spouse': w_hsa_spouse,
        'hsa': w_hsa_user + w_hsa_spouse,
        'total': rmd_t + w_pretax_extra + w_taxable + w_roth + w_hsa_user + w_hsa_spouse
    }

    tax_breakdown = {
        'fed_tax': final_fed_tax,
        'state_tax': final_state_tax,
        'penalty': final_penalty,
        'hsa_penalty': hsa_penalty_total,
        'other_taxes': other_taxes_t,
        'other_taxes_breakdown': other_taxes_breakdown_t
    }
    
    return {
        'beginning_assets': beg_assets,
        'ending_assets': end_assets,
        'contributions': conts,
        'growth': growth,
        'income_sources_total': total_income_sources,
        'income_sources_breakdown': income_breakdown,
        'taxes_paid': final_tax_and_penalty,
        'tax_breakdown': tax_breakdown,
        'desired_spending': desired_spending_t,
        'additional_spending': add_spending_t,
        'additional_spending_breakdown': add_spending_breakdown_t,
        'withdrawals': withdrawals
    }

def get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, asset_data):
    user_age_t = user_age + t
    is_spouse = bool(asset_data.get('is_spouse', False)) and is_married
    
    amount = asset_data.get('contrib_amount', 0.0)
    freq = asset_data.get('contrib_freq', 'annual')
    start_age = asset_data.get('contrib_start_age', 0)
    adjust_inf = asset_data.get('contrib_adjust_inflation', True)
    
    # Resolve end age
    end_age_type = asset_data.get('contrib_end_age_type', 'spouse_retirement' if is_spouse else 'retirement')
    end_age_spec = asset_data.get('contrib_end_age_specified', 0)
    
    ret_age = asset_data.get('user_ret_age', 65) # fallback if not set
    spouse_ret_age = asset_data.get('spouse_ret_age', 65)
    
    end_age = resolve_age(
        end_age_type, end_age_spec, user_age, ret_age, is_married, spouse_age, spouse_ret_age, 100, 100
    )
    
    start_age_in_user_coords = start_age + (user_age - spouse_age) if is_spouse else start_age

    active = False
    if freq == 'one-time':
        # One time contributions can also be 'first_death' for taxable
        if end_age_type == 'first_death':
            user_age_death = asset_data.get('user_age_death', 90)
            spouse_age_death = asset_data.get('spouse_age_death', 90)
            t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else user_age_death - user_age
            active = (t == t_first_death)
        else:
            active = (user_age_t == start_age_in_user_coords)
    else:
        active = (start_age_in_user_coords <= user_age_t <= end_age)
        
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
    
    # Assets: Pretax User, Pretax Spouse, Roth, Taxable, HSA User, HSA Spouse
    pretax_data = raw.get('pretax_assets', {})
    spouse_pretax_data = raw.get('spouse_pretax_assets', {}) if is_married else {}
    roth_data = raw.get('roth_assets', {})
    taxable_data = raw.get('taxable_assets', {})
    hsa_data = raw.get('hsa_assets', {})
    spouse_hsa_data = raw.get('spouse_hsa_assets', {}) if is_married else {}
    
    if pretax_data:
        pretax_data['is_spouse'] = False
    if spouse_pretax_data:
        spouse_pretax_data['is_spouse'] = True
    if roth_data:
        roth_data['is_spouse'] = False
    if taxable_data:
        taxable_data['is_spouse'] = False
    if hsa_data:
        hsa_data['is_spouse'] = False
    if spouse_hsa_data:
        spouse_hsa_data['is_spouse'] = True

    # Inject metadata to assets for contribution calculation
    for asset in [pretax_data, spouse_pretax_data, roth_data, taxable_data, hsa_data, spouse_hsa_data]:
        if asset:
            asset['user_ret_age'] = user_ret_age
            asset['spouse_ret_age'] = spouse_ret_age
            asset['user_age_death'] = user_age_death
            asset['spouse_age_death'] = spouse_age_death
            asset['inflation_rate'] = inflation_rate
        
    hsa_for_medical = bool(hsa_data.get('hsa_for_medical', True))
    spouse_hsa_for_medical = bool(spouse_hsa_data.get('hsa_for_medical', True)) if is_married else True
    
    # Lists
    additional_spending = raw.get('additional_spending', [])
    income_sources = raw.get('income_sources', [])
    
    # Timeline
    user_span = user_age_death - user_age + 1
    spouse_span = (spouse_age_death - spouse_age + 1) if is_married else 0
    total_years = max(user_span, spouse_span)
    
    # Birth Years & RMD Start Ages
    user_birth_year = current_year - user_age
    user_rmd_start_age = get_rmd_start_age(user_birth_year)
    spouse_birth_year = current_year - spouse_age if is_married else current_year
    spouse_rmd_start_age = get_rmd_start_age(spouse_birth_year) if is_married else 150
    
    state_tax_rate = float(raw.get('state_tax_rate', 0.0))
    state_ss_exempt = bool(raw.get('state_ss_exempt', True))
    other_taxes = raw.get('other_taxes', [])

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
        'spouse_pretax_data': spouse_pretax_data,
        'roth_data': roth_data,
        'taxable_data': taxable_data,
        'hsa_data': hsa_data,
        'spouse_hsa_data': spouse_hsa_data,
        'hsa_for_medical': hsa_for_medical,
        'spouse_hsa_for_medical': spouse_hsa_for_medical,
        'additional_spending': additional_spending,
        'income_sources': income_sources,
        'other_taxes': other_taxes,
        'state_tax_rate': state_tax_rate,
        'state_ss_exempt': state_ss_exempt,
        'social_security': raw.get('social_security', {}),
        'total_years': total_years,
        'user_rmd_start_age': user_rmd_start_age,
        'spouse_rmd_start_age': spouse_rmd_start_age,
        'rmd_start_age': user_rmd_start_age
    }

def run_simulation_path(inputs, returns_pretax, returns_roth, returns_taxable, returns_hsa, test_spending=None, returns_pretax_spouse=None, returns_hsa_spouse=None):
    # runs a single path of simulation
    # if test_spending is provided, we override the desired_spending with it (used for goal seeking)
    pretax_user = inputs['pretax_data'].get('present_balance', 0.0)
    pretax_spouse = inputs['spouse_pretax_data'].get('present_balance', 0.0) if inputs['is_married'] else 0.0
    roth = inputs['roth_data'].get('present_balance', 0.0)
    taxable = inputs['taxable_data'].get('present_balance', 0.0)
    hsa_user = inputs['hsa_data'].get('present_balance', 0.0)
    hsa_spouse = inputs['spouse_hsa_data'].get('present_balance', 0.0) if inputs['is_married'] else 0.0
    
    if returns_pretax_spouse is None:
        returns_pretax_spouse = returns_pretax
    if returns_hsa_spouse is None:
        returns_hsa_spouse = returns_hsa

    desired_spending = test_spending if test_spending is not None else inputs['desired_spending']
    # If married, the survivor spending needs to scale proportionally if we are goal-seeking
    survivor_spending = inputs['survivor_spending']
    if test_spending is not None and inputs['desired_spending'] > 0:
        ratio = test_spending / inputs['desired_spending']
        survivor_spending = inputs['survivor_spending'] * ratio
        
    year_results = []
    
    for t in range(inputs['total_years']):
        # contributions for this year
        c_pre_user = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['pretax_data'])
        c_pre_spouse = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['spouse_pretax_data']) if inputs['is_married'] else 0.0
        c_roth = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['roth_data'])
        c_tax = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['taxable_data'])
        c_hsa_user = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['hsa_data'])
        c_hsa_spouse = get_contributions_for_year(t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['current_year'], inputs['spouse_hsa_data']) if inputs['is_married'] else 0.0
        
        # returns for this year
        r_pre_user = returns_pretax[t]
        r_pre_spouse = returns_pretax_spouse[t]
        r_roth = returns_roth[t]
        r_tax = returns_taxable[t]
        r_hsa_user = returns_hsa[t]
        r_hsa_spouse = returns_hsa_spouse[t]
        
        res = simulate_step(
            t, inputs['user_age'], inputs['is_married'], inputs['spouse_age'],
            inputs['user_age_death'], inputs['spouse_age_death'], inputs['filing_status'],
            inputs['desired_spending_start_age'], desired_spending, survivor_spending,
            inputs['adjust_spending_inflation'], inputs['inflation_rate'],
            inputs['additional_spending'], inputs['income_sources'],
            pretax_user, pretax_spouse, roth, taxable, hsa_user, inputs['hsa_for_medical'],
            r_pre_user, r_pre_spouse, r_roth, r_tax, r_hsa_user,
            c_pre_user, c_pre_spouse, c_roth, c_tax, c_hsa_user,
            inputs['user_rmd_start_age'], inputs['spouse_rmd_start_age'],
            inputs.get('social_security', {}),
            inputs.get('state_tax_rate', 0.0), inputs.get('state_ss_exempt', True),
            inputs.get('other_taxes', []),
            hsa_spouse=hsa_spouse, hsa_spouse_for_medical=inputs.get('spouse_hsa_for_medical', True),
            r_hsa_spouse=r_hsa_spouse, contrib_hsa_spouse=c_hsa_spouse,
            user_ret_age=inputs.get('user_ret_age', 65), spouse_ret_age=inputs.get('spouse_ret_age', 65)
        )
        
        year_results.append(res)
        pretax_user = res['ending_assets']['pretax_user']
        pretax_spouse = res['ending_assets']['pretax_spouse']
        roth = res['ending_assets']['roth']
        taxable = res['ending_assets']['taxable']
        hsa_user = res['ending_assets']['hsa_user']
        hsa_spouse = res['ending_assets']['hsa_spouse']
        
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
    adjust_spending_inflation, inflation_rate, hsa_user_for_medical_code, user_rmd_start_age, spouse_rmd_start_age,
    pretax_user_init, pretax_spouse_init, roth_init, taxable_init, hsa_user_init,
    c_pre_user, c_pre_spouse, c_roth, c_tax, c_hsa_user,
    add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
    r_pre_user, r_pre_spouse, r_roth, r_tax, r_hsa_user, r_hsa_spouse,
    state_tax_rate, state_ss_exempt_code, other_taxes_arr,
    hsa_spouse_init, c_hsa_spouse, hsa_spouse_for_medical_code,
    trajectory_arr=None,
    inf_factors=None
):
    pretax_user = pretax_user_init
    pretax_spouse = pretax_spouse_init
    roth = roth_init
    taxable = taxable_init
    hsa_user = hsa_user_init
    hsa_spouse = hsa_spouse_init
    
    if trajectory_arr is not None:
        trajectory_arr[0] = pretax_user + pretax_spouse + roth + taxable + hsa_user + hsa_spouse

    t_first_death = min(user_age_death - user_age, spouse_age_death - spouse_age) if is_married else (user_age_death - user_age)

    for t in range(total_years):
        user_age_t = user_age + t
        spouse_age_t = spouse_age + t if is_married else user_age_t
        
        user_alive = (user_age_t <= user_age_death)
        spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
        
        if not user_alive and not spouse_alive:
            pretax_user = 0.0
            pretax_spouse = 0.0
            roth = 0.0
            taxable = 0.0
            hsa_user = 0.0
            hsa_spouse = 0.0
            if trajectory_arr is not None:
                trajectory_arr[t + 1] = 0.0
            continue
            
        (filing_status_t, pretax_user, pretax_spouse, hsa_user, hsa_spouse,
         c_pre_user_t, c_pre_spouse_t, c_hsa_user_t, c_hsa_spouse_t) = njit_spousal_rollover(
            t, t_first_death, is_married, user_alive, spouse_alive, filing_status_code,
            pretax_user, pretax_spouse, hsa_user, hsa_spouse,
            c_pre_user[t], c_pre_spouse[t], c_hsa_user[t], c_hsa_spouse[t],
        )

        pretax_user_before = max(0.0, pretax_user + c_pre_user_t)
        pretax_spouse_before = max(0.0, pretax_spouse + c_pre_spouse_t) if is_married else 0.0
        roth_before = max(0.0, roth + c_roth[t])
        taxable_before = taxable + c_tax[t]
        hsa_user_before = max(0.0, hsa_user + c_hsa_user_t)
        hsa_spouse_before = max(0.0, hsa_spouse + c_hsa_spouse_t) if is_married else 0.0
        
        growth_pre_user = pretax_user_before * r_pre_user[t]
        growth_pre_spouse = pretax_spouse_before * r_pre_spouse[t] if is_married else 0.0
        growth_roth = roth_before * r_roth[t]
        growth_taxable = taxable_before * r_tax[t] if taxable_before > 0.0 else 0.0
        growth_hsa_user = hsa_user_before * r_hsa_user[t]
        growth_hsa_spouse = hsa_spouse_before * r_hsa_spouse[t] if is_married else 0.0
        
        pretax_user_mid = pretax_user_before + growth_pre_user
        pretax_spouse_mid = pretax_spouse_before + growth_pre_spouse
        roth_mid = roth_before + growth_roth
        taxable_mid = taxable_before + growth_taxable
        hsa_user_mid = hsa_user_before + growth_hsa_user
        hsa_spouse_mid = hsa_spouse_before + growth_hsa_spouse
        
        if inf_factors is not None:
            inf_factor = inf_factors[t]
        else:
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
        
        (pretax_user_end, pretax_spouse_end, roth_end, taxable_end, hsa_user_end, hsa_spouse_end,
         user_rmd_t, spouse_rmd_t,
         w_pretax_extra, w_taxable, w_roth, w_hsa_u, w_hsa_s,
         final_fed_tax, final_state_tax, final_penalty,
         hsa_penalty_user, hsa_penalty_spouse) = njit_rmd_tax_withdraw(
            user_age_t, spouse_age_t, user_alive, spouse_alive, is_married,
            pretax_user_before, pretax_spouse_before, pretax_user_mid, pretax_spouse_mid,
            roth_mid, taxable_mid, hsa_user_mid, hsa_spouse_mid,
            user_rmd_start_age, spouse_rmd_start_age,
            filing_status_t, inf_factor,
            total_spending_target, taxable_income_sources, ss_benefits, nontaxable_income,
            other_taxes_arr[t], state_tax_rate, state_ss_exempt_code,
            hsa_user_for_medical_code, hsa_spouse_for_medical_code,
        )

        pretax_user = pretax_user_end
        pretax_spouse = pretax_spouse_end
        roth = roth_end
        taxable = taxable_end
        hsa_user = hsa_user_end
        hsa_spouse = hsa_spouse_end

        if trajectory_arr is not None:
            trajectory_arr[t + 1] = pretax_user + pretax_spouse + roth + taxable + hsa_user + hsa_spouse
        
    return pretax_user + pretax_spouse + roth + taxable + hsa_user + hsa_spouse

@numba.njit(parallel=True)
def njit_simulate_all_paths(
    runs, total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
    filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
    adjust_spending_inflation, inflation_rate, hsa_user_for_medical_code, user_rmd_start_age, spouse_rmd_start_age,
    pretax_user_init, pretax_spouse_init, roth_init, taxable_init, hsa_user_init,
    c_pre_user, c_pre_spouse, c_roth, c_tax, c_hsa_user,
    add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
    returns_pre_user, returns_pre_spouse, returns_roth, returns_taxable, returns_hsa_user, returns_hsa_spouse,
    state_tax_rate, state_ss_exempt_code, other_taxes_arr,
    hsa_spouse_init, c_hsa_spouse, hsa_spouse_for_medical_code,
    ending_wealths,
    trajectories=None,
    inf_factors=None
):
    for i in numba.prange(runs):
        if trajectories is not None:
            ending_wealths[i] = njit_simulate_path(
                total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
                filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
                adjust_spending_inflation, inflation_rate, hsa_user_for_medical_code, user_rmd_start_age, spouse_rmd_start_age,
                pretax_user_init, pretax_spouse_init, roth_init, taxable_init, hsa_user_init,
                c_pre_user, c_pre_spouse, c_roth, c_tax, c_hsa_user,
                add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
                returns_pre_user[i], returns_pre_spouse[i], returns_roth[i], returns_taxable[i], returns_hsa_user[i], returns_hsa_spouse[i],
                state_tax_rate, state_ss_exempt_code, other_taxes_arr,
                hsa_spouse_init, c_hsa_spouse, hsa_spouse_for_medical_code,
                trajectories[i],
                inf_factors
            )
        else:
            ending_wealths[i] = njit_simulate_path(
                total_years, user_age, is_married, spouse_age, user_age_death, spouse_age_death,
                filing_status_code, desired_spending_start_age, desired_spending, survivor_spending,
                adjust_spending_inflation, inflation_rate, hsa_user_for_medical_code, user_rmd_start_age, spouse_rmd_start_age,
                pretax_user_init, pretax_spouse_init, roth_init, taxable_init, hsa_user_init,
                c_pre_user, c_pre_spouse, c_roth, c_tax, c_hsa_user,
                add_spending_arr, inc_taxable_arr, inc_ss_arr, inc_nontaxable_arr,
                returns_pre_user[i], returns_pre_spouse[i], returns_roth[i], returns_taxable[i], returns_hsa_user[i], returns_hsa_spouse[i],
                state_tax_rate, state_ss_exempt_code, other_taxes_arr,
                hsa_spouse_init, c_hsa_spouse, hsa_spouse_for_medical_code,
                None,
                inf_factors
            )

def prepare_numba_inputs(inputs, test_spending=None, custom_inflation_rates=None):
    desired_spending = test_spending if test_spending is not None else inputs['desired_spending']
    survivor_spending = inputs['survivor_spending']
    if test_spending is not None and inputs['desired_spending'] > 0:
        ratio = test_spending / inputs['desired_spending']
        survivor_spending = inputs['survivor_spending'] * ratio
        
    filing_status_map = {'single': 0, 'joint': 1, 'hoh': 2}
    filing_status_code = filing_status_map.get(inputs['filing_status'], 0)
    
    total_years = inputs['total_years']
    inflation_rate = float(inputs['inflation_rate'])
    
    if custom_inflation_rates is not None:
        inf_rates = np.array(custom_inflation_rates, dtype=np.float64)
        inf_factors = np.zeros(total_years, dtype=np.float64)
        inf_factors[0] = 1.0
        for t in range(1, total_years):
            inf_factors[t] = inf_factors[t - 1] * (1.0 + inf_rates[t - 1] / 100.0)
    else:
        inf_factors = (1.0 + inflation_rate / 100.0) ** np.arange(total_years, dtype=np.float64)

    c_pre_user = np.zeros(total_years, dtype=np.float64)
    c_pre_spouse = np.zeros(total_years, dtype=np.float64)
    c_roth = np.zeros(total_years, dtype=np.float64)
    c_tax = np.zeros(total_years, dtype=np.float64)
    c_hsa_user = np.zeros(total_years, dtype=np.float64)
    c_hsa_spouse = np.zeros(total_years, dtype=np.float64)
    
    add_spending_arr = np.zeros(total_years, dtype=np.float64)
    inc_taxable_arr = np.zeros(total_years, dtype=np.float64)
    inc_ss_arr = np.zeros(total_years, dtype=np.float64)
    inc_nontaxable_arr = np.zeros(total_years, dtype=np.float64)
    other_taxes_arr = np.zeros(total_years, dtype=np.float64)
    
    user_age = inputs['user_age']
    is_married = inputs['is_married']
    spouse_age = inputs['spouse_age']
    current_year = inputs['current_year']
    desired_spending_start_age = inputs['desired_spending_start_age']
    user_age_death = inputs['user_age_death']
    spouse_age_death = inputs['spouse_age_death']
    
    state_tax_rate = float(inputs.get('state_tax_rate', 0.0))
    state_ss_exempt = bool(inputs.get('state_ss_exempt', True))
    state_ss_exempt_code = 1 if state_ss_exempt else 0
    other_taxes_list = inputs.get('other_taxes', [])
    
    for t in range(total_years):
        user_age_t = user_age + t
        spouse_age_t = spouse_age + t if is_married else user_age_t
        user_alive = (user_age_t <= user_age_death)
        spouse_alive = is_married and (spouse_age_t <= spouse_age_death)
        
        c_pre_user[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['pretax_data'])
        c_pre_spouse[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['spouse_pretax_data']) if is_married else 0.0
        c_roth[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['roth_data'])
        c_tax[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['taxable_data'])
        c_hsa_user[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['hsa_data'])
        c_hsa_spouse[t] = get_contributions_for_year(t, user_age, is_married, spouse_age, current_year, inputs['spouse_hsa_data']) if is_married else 0.0
        
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
                factor = inf_factors[t] if adjust_inf else 1.0
                add_s += amount * factor
        add_spending_arr[t] = add_s
        
        ot_s = 0.0
        for item in other_taxes_list:
            freq = item.get('frequency', 'annual')
            raw_amt = float(item.get('amount', 0.0))
            start_age = resolve_age(item.get('start_age_type', 'retirement'), item.get('start_age_specified', 65), user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death)
            end_age = resolve_age(item.get('end_age_type', 'death'), item.get('end_age_specified', 90), user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death)
            
            is_one_time = (freq in ['one_time', 'one-time'])
            in_age_range = (user_age_t == start_age) if is_one_time else (start_age <= user_age_t <= end_age)
            active = False
            if in_age_range:
                if not user_alive and item.get('end_age_type') in ['death', 'retirement']:
                    active = False
                elif not spouse_alive and item.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                    active = False
                else:
                    active = True
                    
            if active:
                if freq == 'annual' or is_one_time:
                    amt = raw_amt
                else:
                    amt = raw_amt * 12.0
                    
                adj_type = item.get('adjust_type', 'inflation')
                adj_val = float(item.get('adjust_val', 0.0))
                adj_start_type = item.get('adjust_start_age_type', 'start')
                adj_start_spec = item.get('adjust_start_age_specified', 65)

                if adj_start_type in ['start', 'income_start', 'at_start']:
                    adj_start_age = start_age
                elif adj_start_type in ['current_age', 'current_year', 'now']:
                    adj_start_age = user_age
                elif adj_start_type == 'specified':
                    try:
                        adj_start_age = int(adj_start_spec)
                    except (ValueError, TypeError):
                        adj_start_age = start_age
                else:
                    adj_start_age = resolve_age(adj_start_type, adj_start_spec, user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death, default_val=start_age)

                years_since_adj = max(0, user_age_t - adj_start_age)
                start_t = max(0, min(total_years - 1, adj_start_age - user_age))

                if adj_type == 'inflation':
                    factor = (inf_factors[t] / inf_factors[start_t]) if inf_factors[start_t] > 0 else inf_factors[t]
                elif adj_type == 'fixed_pct':
                    factor = (1.0 + adj_val / 100.0) ** years_since_adj
                elif adj_type == 'inflation_less_pct':
                    rate = max(0.0, inflation_rate - adj_val)
                    factor = (1.0 + rate / 100.0) ** years_since_adj
                else:
                    factor = 1.0

                ot_s += amt * factor
        other_taxes_arr[t] = ot_s
        
        tax_inc = 0.0
        ss_inc = 0.0
        nontax_inc = 0.0

        # Dedicated Social Security calculation in Numba inputs pre-compilation
        ss_data = inputs.get('social_security', {})
        u_entitled = ss_data.get('user_entitled', True)
        u_amt = float(ss_data.get('user_amount', 2500.0))
        u_freq = ss_data.get('user_freq', 'monthly')
        u_start_age = int(ss_data.get('user_start_age', 67))

        sp_entitled = ss_data.get('spouse_entitled', False) if is_married else False
        sp_amt = float(ss_data.get('spouse_amount', 0.0)) if is_married else 0.0
        sp_freq = ss_data.get('spouse_freq', 'monthly')
        sp_start_age = int(ss_data.get('spouse_start_age', 67)) if is_married else 67

        inf_factor = inf_factors[t]

        u_base = u_amt * 12.0 if u_freq == 'monthly' else u_amt
        sp_base = sp_amt * 12.0 if sp_freq == 'monthly' else sp_amt

        u_ss_inf = (u_base * inf_factor) if u_entitled else 0.0
        sp_ss_inf = (sp_base * inf_factor) if (sp_entitled and is_married) else 0.0

        u_ss_active = user_alive and u_entitled and (user_age_t >= u_start_age)
        sp_ss_active = spouse_alive and sp_entitled and is_married and (spouse_age_t >= sp_start_age)

        u_ss_t = 0.0
        sp_ss_t = 0.0

        if u_ss_active and sp_ss_active:
            u_ss_t = u_ss_inf
            sp_ss_t = sp_ss_inf
        elif user_alive and not spouse_alive and is_married:
            if u_ss_active:
                u_ss_t = max(u_ss_inf, sp_ss_inf)
            elif sp_ss_inf > 0.0 and user_age_t >= 60:
                u_ss_t = sp_ss_inf
        elif spouse_alive and not user_alive and is_married:
            if sp_ss_active:
                sp_ss_t = max(sp_ss_inf, u_ss_inf)
            elif u_ss_inf > 0.0 and spouse_age_t >= 60:
                sp_ss_t = u_ss_inf
        elif u_ss_active:
            u_ss_t = u_ss_inf
        elif sp_ss_active:
            sp_ss_t = sp_ss_inf

        ss_inc += (u_ss_t + sp_ss_t)

        for inc in inputs['income_sources']:
            freq = inc.get('frequency', 'monthly')
            raw_amt = inc.get('amount', 0.0)
            start_age = resolve_age(inc.get('start_age_type', 'retirement'), inc.get('start_age_specified', 0), user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death)
            end_age = resolve_age(inc.get('end_age_type', 'death'), inc.get('end_age_specified', 0), user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death)
            
            active = False
            is_one_time = (freq in ['one_time', 'one-time'])
            in_age_range = (user_age_t == start_age) if is_one_time else (start_age <= user_age_t <= end_age)
            
            if in_age_range:
                if not user_alive and inc.get('end_age_type') in ['death', 'retirement']:
                    active = False
                elif not spouse_alive and inc.get('end_age_type') in ['spouse_death', 'spouse_retirement']:
                    active = False
                else:
                    active = True
                    
            if active:
                if freq == 'annual' or is_one_time:
                    amt = raw_amt
                else:
                    amt = raw_amt * 12.0
                    
                adj_type = inc.get('adjust_type', 'inflation')
                adj_val = inc.get('adjust_val', 0.0)
                adj_start_type = inc.get('adjust_start_age_type', 'start')
                adj_start_spec = inc.get('adjust_start_age_specified', 65)

                if adj_start_type in ['start', 'income_start', 'at_start']:
                    adj_start_age = start_age
                elif adj_start_type in ['current_age', 'current_year', 'now']:
                    adj_start_age = user_age
                elif adj_start_type == 'specified':
                    try:
                        adj_start_age = int(adj_start_spec)
                    except (ValueError, TypeError):
                        adj_start_age = start_age
                else:
                    adj_start_age = resolve_age(adj_start_type, adj_start_spec, user_age, inputs['user_ret_age'], is_married, spouse_age, inputs['spouse_ret_age'], user_age_death, spouse_age_death, default_val=start_age)

                years_since_adj = max(0, user_age_t - adj_start_age)
                start_t = max(0, min(total_years - 1, adj_start_age - user_age))

                if adj_type == 'inflation':
                    factor = (inf_factors[t] / inf_factors[start_t]) if inf_factors[start_t] > 0 else inf_factors[t]
                elif adj_type == 'fixed_pct':
                    factor = (1.0 + adj_val / 100.0) ** years_since_adj
                elif adj_type == 'inflation_less_pct':
                    rate = max(0.0, inflation_rate - adj_val)
                    factor = (1.0 + rate / 100.0) ** years_since_adj
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
        
    pretax_user_init = float(inputs['pretax_data'].get('present_balance', 0.0))
    pretax_spouse_init = float(inputs['spouse_pretax_data'].get('present_balance', 0.0)) if is_married else 0.0
    roth_init = float(inputs['roth_data'].get('present_balance', 0.0))
    taxable_init = float(inputs['taxable_data'].get('present_balance', 0.0))
    hsa_user_init = float(inputs['hsa_data'].get('present_balance', 0.0))
    hsa_spouse_init = float(inputs['spouse_hsa_data'].get('present_balance', 0.0)) if is_married else 0.0
    hsa_user_for_medical_code = 1 if inputs.get('hsa_for_medical', True) else 0
    hsa_spouse_for_medical_code = 1 if inputs.get('spouse_hsa_for_medical', True) else 0
    
    return {
        'desired_spending': float(desired_spending),
        'survivor_spending': float(survivor_spending),
        'filing_status_code': filing_status_code,
        'c_pre_user': c_pre_user,
        'c_pre_spouse': c_pre_spouse,
        'c_roth': c_roth,
        'c_tax': c_tax,
        'c_hsa': c_hsa_user,
        'c_hsa_user': c_hsa_user,
        'c_hsa_spouse': c_hsa_spouse,
        'add_spending_arr': add_spending_arr,
        'inc_taxable_arr': inc_taxable_arr,
        'inc_ss_arr': inc_ss_arr,
        'inc_nontaxable_arr': inc_nontaxable_arr,
        'state_tax_rate': state_tax_rate,
        'state_ss_exempt_code': state_ss_exempt_code,
        'other_taxes_arr': other_taxes_arr,
        'pretax_user_init': pretax_user_init,
        'pretax_spouse_init': pretax_spouse_init,
        'roth_init': roth_init,
        'taxable_init': taxable_init,
        'hsa_init': hsa_user_init,
        'hsa_user_init': hsa_user_init,
        'hsa_spouse_init': hsa_spouse_init,
        'hsa_user_for_medical_code': hsa_user_for_medical_code,
        'hsa_spouse_for_medical_code': hsa_spouse_for_medical_code,
        'user_rmd_start_age': inputs['user_rmd_start_age'],
        'spouse_rmd_start_age': inputs['spouse_rmd_start_age'],
        'inf_factors': inf_factors
    }

def generate_runs(sim_input, test_spending=None):
    inputs = extract_sim_inputs(sim_input)
    
    rng = np.random.default_rng()
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    pretax_s = inputs['pretax_data'].get('return_std', 10.0) / 100.0
    pretax_sp_m = inputs['spouse_pretax_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else pretax_m
    pretax_sp_s = inputs['spouse_pretax_data'].get('return_std', 10.0) / 100.0 if inputs['is_married'] else pretax_s
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    roth_s = inputs['roth_data'].get('return_std', 10.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    taxable_s = inputs['taxable_data'].get('return_std', 10.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_s = inputs['hsa_data'].get('return_std', 10.0) / 100.0
    hsa_sp_m = inputs['spouse_hsa_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else hsa_m
    hsa_sp_s = inputs['spouse_hsa_data'].get('return_std', 10.0) / 100.0 if inputs['is_married'] else hsa_s
    
    runs = inputs['runs']
    years = inputs['total_years']
    
    returns_pre_user = rng.normal(pretax_m, pretax_s, size=(runs, years))
    returns_pre_spouse = rng.normal(pretax_sp_m, pretax_sp_s, size=(runs, years))
    returns_roth = rng.normal(roth_m, roth_s, size=(runs, years))
    returns_taxable = rng.normal(taxable_m, taxable_s, size=(runs, years))
    returns_hsa_user = rng.normal(hsa_m, hsa_s, size=(runs, years))
    returns_hsa_spouse = rng.normal(hsa_sp_m, hsa_sp_s, size=(runs, years))
    
    nb_inp = prepare_numba_inputs(inputs, test_spending=test_spending)
    ending_wealths = np.empty(runs, dtype=np.float64)
    trajectories = np.empty((runs, years + 1), dtype=np.float64)
    
    njit_simulate_all_paths(
        runs, years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
        nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
        inputs['adjust_spending_inflation'], inputs['inflation_rate'], nb_inp['hsa_user_for_medical_code'], nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
        nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_user_init'],
        nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa_user'],
        nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
        returns_pre_user, returns_pre_spouse, returns_roth, returns_taxable, returns_hsa_user, returns_hsa_spouse,
        nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
        nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code'],
        ending_wealths,
        trajectories,
        nb_inp['inf_factors']
    )
    
    successes = float(np.sum(ending_wealths >= 0.0))
    success_rate = (successes / runs) * 100.0
    
    mc_p10 = [float(val) for val in np.percentile(trajectories, 10, axis=0)]
    mc_p50 = [float(val) for val in np.percentile(trajectories, 50, axis=0)]
    mc_p90 = [float(val) for val in np.percentile(trajectories, 90, axis=0)]
    
    sample_size = min(runs, 500)
    spaghetti_paths = [[float(v) for v in row] for row in trajectories[:sample_size]]
    
    return {
        'run_mean': float(np.mean(ending_wealths)),
        'run_median': float(np.median(ending_wealths)),
        'run_10': float(np.percentile(ending_wealths, 10)),
        'run_25': float(np.percentile(ending_wealths, 25)),
        'run_min': float(np.min(ending_wealths)),
        'run_max': float(np.max(ending_wealths)),
        'run_success': float(success_rate),
        'mc_p10': mc_p10,
        'mc_p50': mc_p50,
        'mc_p90': mc_p90,
        'mc_spaghetti_paths': spaghetti_paths
    }

def binary_search(sim_input):
    inputs = extract_sim_inputs(sim_input)
    
    rng = np.random.default_rng()
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    pretax_s = inputs['pretax_data'].get('return_std', 10.0) / 100.0
    pretax_sp_m = inputs['spouse_pretax_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else pretax_m
    pretax_sp_s = inputs['spouse_pretax_data'].get('return_std', 10.0) / 100.0 if inputs['is_married'] else pretax_s
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    roth_s = inputs['roth_data'].get('return_std', 10.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    taxable_s = inputs['taxable_data'].get('return_std', 8.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_s = inputs['hsa_data'].get('return_std', 8.0) / 100.0
    hsa_sp_m = inputs['spouse_hsa_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else hsa_m
    hsa_sp_s = inputs['spouse_hsa_data'].get('return_std', 8.0) / 100.0 if inputs['is_married'] else hsa_s
    
    runs = inputs['runs']
    years = inputs['total_years']
    
    returns_pre_user = rng.normal(pretax_m, pretax_s, size=(runs, years))
    returns_pre_spouse = rng.normal(pretax_sp_m, pretax_sp_s, size=(runs, years))
    returns_roth = rng.normal(roth_m, roth_s, size=(runs, years))
    returns_taxable = rng.normal(taxable_m, taxable_s, size=(runs, years))
    returns_hsa_user = rng.normal(hsa_m, hsa_s, size=(runs, years))
    returns_hsa_spouse = rng.normal(hsa_sp_m, hsa_sp_s, size=(runs, years))
    
    total_wealth = (
        inputs['pretax_data'].get('present_balance', 0.0) +
        inputs['spouse_pretax_data'].get('present_balance', 0.0) +
        inputs['roth_data'].get('present_balance', 0.0) +
        inputs['taxable_data'].get('present_balance', 0.0) +
        inputs['hsa_data'].get('present_balance', 0.0) +
        inputs['spouse_hsa_data'].get('present_balance', 0.0)
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
            inputs['adjust_spending_inflation'], inputs['inflation_rate'], nb_inp['hsa_user_for_medical_code'], nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
            nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_user_init'],
            nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa_user'],
            nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
            returns_pre_user, returns_pre_spouse, returns_roth, returns_taxable, returns_hsa_user, returns_hsa_spouse,
            nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
            nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code'],
            ending_wealths,
            None,
            nb_inp['inf_factors']
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
    det_pre_sp_r = [pretax_sp_m] * years
    det_roth_r = [roth_m] * years
    det_taxable_r = [taxable_m] * years
    det_hsa_r = [hsa_m] * years
    det_hsa_sp_r = [hsa_sp_m] * years
    
    det_results = run_simulation_path(
        inputs, det_pretax_r, det_roth_r, det_taxable_r, det_hsa_r,
        test_spending=solved_spending, returns_pretax_spouse=det_pre_sp_r, returns_hsa_spouse=det_hsa_sp_r
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
    pretax_sp_m = inputs['spouse_pretax_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else pretax_m
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_sp_m = inputs['spouse_hsa_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else hsa_m
    
    det_pretax_r = [pretax_m] * years
    det_pre_sp_r = [pretax_sp_m] * years
    det_roth_r = [roth_m] * years
    det_taxable_r = [taxable_m] * years
    det_hsa_r = [hsa_m] * years
    det_hsa_sp_r = [hsa_sp_m] * years
    
    path_results = run_simulation_path(
        inputs, det_pretax_r, det_roth_r, det_taxable_r, det_hsa_r,
        returns_pretax_spouse=det_pre_sp_r, returns_hsa_spouse=det_hsa_sp_r
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
            
        milestones = []
        if user_alive and user_age_t == inputs['user_rmd_start_age']:
            milestones.append(f"Your RMDs Start ({user_age_t})")
        if spouse_alive and spouse_age_t == inputs['spouse_rmd_start_age']:
            milestones.append(f"Spouse RMDs Start ({spouse_age_t})")
        if user_alive and user_age_t == inputs['user_ret_age']:
            milestones.append(f"You Retire ({user_age_t})")
        if spouse_alive and spouse_age_t == inputs['spouse_ret_age']:
            milestones.append(f"Spouse Retires ({spouse_age_t})")
        if user_alive and user_age_t == inputs['user_age_death']:
            milestones.append(f"Your Final Year ({user_age_t})")
        if spouse_alive and spouse_age_t == inputs['spouse_age_death']:
            milestones.append(f"Spouse Final Year ({spouse_age_t})")

        rows.append({
            'year_index': t,
            'year': year,
            'user_age': user_age_t,
            'spouse_age': spouse_age_t if inputs['is_married'] else None,
            'user_alive': user_alive,
            'spouse_alive': spouse_alive,
            'milestones': milestones,
            'beg_assets': res['beginning_assets'],
            'contribs': res['contributions'],
            'growth': res['growth'],
            'income': res['income_sources_total'],
            'income_breakdown': res['income_sources_breakdown'],
            'taxes': res['taxes_paid'],
            'tax_breakdown': res.get('tax_breakdown', {}),
            'desired_spending': res['desired_spending'],
            'additional_spending': res['additional_spending'],
            'additional_spending_breakdown': res['additional_spending_breakdown'],
            'ending_assets': res['ending_assets'],
            'withdrawals': res['withdrawals']
        })
        
    return rows


def infer_asset_allocation(mean_return):
    """
    Infers continuous stock/bond/cash percentage based on user's expected return.
    Assumes nominal baseline returns: 7.0% for stocks, 4.0% for intermediate bonds, 2.5% for cash.
    """
    if mean_return >= 7.0:
        return 100.0, 0.0, 0.0
    elif mean_return >= 4.0:
        stock_pct = ((mean_return - 4.0) / 3.0) * 100.0
        return float(stock_pct), float(100.0 - stock_pct), 0.0
    elif mean_return >= 2.5:
        bond_pct = ((mean_return - 2.5) / 1.5) * 100.0
        return 0.0, float(bond_pct), float(100.0 - bond_pct)
    else:
        return 0.0, 0.0, 100.0


def run_historical_stress_test(sim_input, scenario_key='2000_dotcom', asset_allocation='matched', crisis_timing='retirement', regular_mc_results=None):
    """
    Conducts a Monte Carlo simulation applying historical returns & inflation for the specified crisis duration,
    and regular Monte Carlo stochastic draws for all other years of the plan.
    """
    from core.historical_data import HISTORICAL_RETURNS, CRISIS_SCENARIOS, blend_return

    inputs = extract_sim_inputs(sim_input)
    years = inputs['total_years']
    runs = inputs['runs']

    if scenario_key in CRISIS_SCENARIOS:
        scenario_info = dict(CRISIS_SCENARIOS[scenario_key])
        scenario_info['key'] = scenario_key
    else:
        scenario_info = dict(CRISIS_SCENARIOS['2000_dotcom'])
        scenario_info['key'] = '2000_dotcom'

    start_yr = scenario_info['start_year']
    end_yr = scenario_info.get('end_year', start_yr + scenario_info.get('length', 10) - 1)
    crisis_length = scenario_info.get('length', end_yr - start_yr + 1)

    t_ret = max(0, inputs['user_ret_age'] - inputs['user_age'])
    if crisis_timing == 'retirement':
        crisis_start_t = t_ret
    else:
        crisis_start_t = 0
    crisis_end_t = min(years, crisis_start_t + crisis_length)

    rng = np.random.default_rng()
    pretax_m = inputs['pretax_data'].get('return_mean', 6.0) / 100.0
    pretax_s = inputs['pretax_data'].get('return_std', 10.0) / 100.0
    pretax_sp_m = inputs['spouse_pretax_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else pretax_m
    pretax_sp_s = inputs['spouse_pretax_data'].get('return_std', 10.0) / 100.0 if inputs['is_married'] else pretax_s
    roth_m = inputs['roth_data'].get('return_mean', 6.0) / 100.0
    roth_s = inputs['roth_data'].get('return_std', 10.0) / 100.0
    taxable_m = inputs['taxable_data'].get('return_mean', 6.0) / 100.0
    taxable_s = inputs['taxable_data'].get('return_std', 10.0) / 100.0
    hsa_m = inputs['hsa_data'].get('return_mean', 6.0) / 100.0
    hsa_s = inputs['hsa_data'].get('return_std', 10.0) / 100.0
    hsa_sp_m = inputs['spouse_hsa_data'].get('return_mean', 6.0) / 100.0 if inputs['is_married'] else hsa_m
    hsa_sp_s = inputs['spouse_hsa_data'].get('return_std', 10.0) / 100.0 if inputs['is_married'] else hsa_s

    returns_pre_user = rng.normal(pretax_m, pretax_s, size=(runs, years))
    returns_pre_spouse = rng.normal(pretax_sp_m, pretax_sp_s, size=(runs, years))
    returns_roth = rng.normal(roth_m, roth_s, size=(runs, years))
    returns_taxable = rng.normal(taxable_m, taxable_s, size=(runs, years))
    returns_hsa_user = rng.normal(hsa_m, hsa_s, size=(runs, years))
    returns_hsa_spouse = rng.normal(hsa_sp_m, hsa_sp_s, size=(runs, years))

    base_inf = float(inputs['inflation_rate'])
    inflation_rates = np.full(years, base_inf, dtype=np.float64)

    def get_allocation_weights(acc_mean):
        if asset_allocation == '100_stock':
            return 100.0, 0.0, 0.0
        elif asset_allocation == '80_20':
            return 80.0, 20.0, 0.0
        elif asset_allocation == '60_40':
            return 60.0, 40.0, 0.0
        elif asset_allocation == '40_60':
            return 40.0, 60.0, 0.0
        elif asset_allocation == '100_bond':
            return 0.0, 100.0, 0.0
        else:
            return infer_asset_allocation(acc_mean)

    w_pre = get_allocation_weights(inputs['pretax_data'].get('return_mean', 6.0))
    w_pre_spouse = get_allocation_weights(inputs['spouse_pretax_data'].get('return_mean', 6.0)) if inputs['is_married'] else w_pre
    w_roth = get_allocation_weights(inputs['roth_data'].get('return_mean', 6.0))
    w_tax = get_allocation_weights(inputs['taxable_data'].get('return_mean', 6.0))
    w_hsa = get_allocation_weights(inputs['hsa_data'].get('return_mean', 6.0))
    w_hsa_spouse = get_allocation_weights(inputs['spouse_hsa_data'].get('return_mean', 6.0)) if inputs['is_married'] else w_hsa

    crisis_macro_summary = []
    for t in range(crisis_start_t, crisis_end_t):
        k = t - crisis_start_t
        hist_yr = start_yr + k
        h_data = HISTORICAL_RETURNS.get(hist_yr, {'stocks': 7.0, 'bonds': 4.0, 'cash': 2.0, 'inflation': base_inf})
        s_val = h_data['stocks']
        b_val = h_data['bonds']
        c_val = h_data['cash']
        inf_val = h_data['inflation']

        inflation_rates[t] = inf_val

        r_pre_hist = blend_return(w_pre[0], w_pre[1], w_pre[2], s_val, b_val, c_val) / 100.0
        r_pre_sp_hist = blend_return(w_pre_spouse[0], w_pre_spouse[1], w_pre_spouse[2], s_val, b_val, c_val) / 100.0
        r_roth_hist = blend_return(w_roth[0], w_roth[1], w_roth[2], s_val, b_val, c_val) / 100.0
        r_tax_hist = blend_return(w_tax[0], w_tax[1], w_tax[2], s_val, b_val, c_val) / 100.0
        r_hsa_hist = blend_return(w_hsa[0], w_hsa[1], w_hsa[2], s_val, b_val, c_val) / 100.0
        r_hsa_sp_hist = blend_return(w_hsa_spouse[0], w_hsa_spouse[1], w_hsa_spouse[2], s_val, b_val, c_val) / 100.0

        returns_pre_user[:, t] = r_pre_hist
        returns_pre_spouse[:, t] = r_pre_sp_hist
        returns_roth[:, t] = r_roth_hist
        returns_taxable[:, t] = r_tax_hist
        returns_hsa_user[:, t] = r_hsa_hist
        returns_hsa_spouse[:, t] = r_hsa_sp_hist

        crisis_macro_summary.append({
            'plan_year': inputs['current_year'] + t,
            'user_age': inputs['user_age'] + t,
            'historical_year': hist_yr,
            'stocks': s_val,
            'bonds': b_val,
            'inflation': inf_val
        })

    nb_inp = prepare_numba_inputs(inputs, custom_inflation_rates=inflation_rates)
    ending_wealths = np.empty(runs, dtype=np.float64)
    trajectories = np.empty((runs, years + 1), dtype=np.float64)

    njit_simulate_all_paths(
        runs, years, inputs['user_age'], inputs['is_married'], inputs['spouse_age'], inputs['user_age_death'], inputs['spouse_age_death'],
        nb_inp['filing_status_code'], inputs['desired_spending_start_age'], nb_inp['desired_spending'], nb_inp['survivor_spending'],
        inputs['adjust_spending_inflation'], inputs['inflation_rate'], nb_inp['hsa_user_for_medical_code'], nb_inp['user_rmd_start_age'], nb_inp['spouse_rmd_start_age'],
        nb_inp['pretax_user_init'], nb_inp['pretax_spouse_init'], nb_inp['roth_init'], nb_inp['taxable_init'], nb_inp['hsa_user_init'],
        nb_inp['c_pre_user'], nb_inp['c_pre_spouse'], nb_inp['c_roth'], nb_inp['c_tax'], nb_inp['c_hsa_user'],
        nb_inp['add_spending_arr'], nb_inp['inc_taxable_arr'], nb_inp['inc_ss_arr'], nb_inp['inc_nontaxable_arr'],
        returns_pre_user, returns_pre_spouse, returns_roth, returns_taxable, returns_hsa_user, returns_hsa_spouse,
        nb_inp['state_tax_rate'], nb_inp['state_ss_exempt_code'], nb_inp['other_taxes_arr'],
        nb_inp['hsa_spouse_init'], nb_inp['c_hsa_spouse'], nb_inp['hsa_spouse_for_medical_code'],
        ending_wealths,
        trajectories,
        nb_inp['inf_factors']
    )

    successes = float(np.sum(ending_wealths >= 0.0))
    stress_success = (successes / runs) * 100.0

    mc_p10 = [float(val) for val in np.percentile(trajectories, 10, axis=0)]
    mc_p50 = [float(val) for val in np.percentile(trajectories, 50, axis=0)]
    mc_p90 = [float(val) for val in np.percentile(trajectories, 90, axis=0)]

    stress_stats = {
        'run_mean': float(np.mean(ending_wealths)),
        'run_median': float(np.median(ending_wealths)),
        'run_10': float(np.percentile(ending_wealths, 10)),
        'run_25': float(np.percentile(ending_wealths, 25)),
        'run_min': float(np.min(ending_wealths)),
        'run_max': float(np.max(ending_wealths)),
        'run_success': float(stress_success),
        'mc_p10': mc_p10,
        'mc_p50': mc_p50,
        'mc_p90': mc_p90
    }

    if regular_mc_results is None:
        regular_mc_results = generate_runs(sim_input)

    deltas = {
        'delta_success': stress_stats['run_success'] - regular_mc_results['run_success'],
        'delta_mean': stress_stats['run_mean'] - regular_mc_results['run_mean'],
        'delta_median': stress_stats['run_median'] - regular_mc_results['run_median'],
        'delta_25': stress_stats['run_25'] - regular_mc_results['run_25'],
        'delta_10': stress_stats['run_10'] - regular_mc_results['run_10'],
        'delta_max': stress_stats['run_max'] - regular_mc_results['run_max'],
        'delta_min': stress_stats['run_min'] - regular_mc_results['run_min'],
    }

    chart_labels = [f"Age {inputs['user_age'] + t} ({inputs['current_year'] + t})" for t in range(years + 1)]
    actual_crisis_start_year = inputs['current_year'] + crisis_start_t
    actual_crisis_end_year = inputs['current_year'] + max(crisis_start_t, crisis_end_t - 1)

    return {
        'scenario': scenario_info,
        'crisis_timing': crisis_timing,
        'asset_allocation': asset_allocation,
        'crisis_start_year': actual_crisis_start_year,
        'crisis_end_year': actual_crisis_end_year,
        'crisis_length': crisis_length,
        'crisis_macro': crisis_macro_summary,
        'desired_spending': float(inputs['desired_spending']),
        'stress_results': stress_stats,
        'regular_results': {
            'run_success': regular_mc_results['run_success'],
            'run_mean': regular_mc_results['run_mean'],
            'run_median': regular_mc_results['run_median'],
            'run_10': regular_mc_results['run_10'],
            'run_25': regular_mc_results['run_25'],
            'run_min': regular_mc_results['run_min'],
            'run_max': regular_mc_results['run_max'],
            'mc_p10': regular_mc_results['mc_p10'],
            'mc_p50': regular_mc_results['mc_p50'],
            'mc_p90': regular_mc_results['mc_p90'],
        },
        'deltas': deltas,
        'chart_labels': chart_labels,
        'scenarios_list': CRISIS_SCENARIOS
    }