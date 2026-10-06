// Plan -> simulation inputs: extract_sim_inputs, prepare_numba_inputs and the age,
// contribution, income and life-insurance helpers they use (core/runs.py).
// Plan JSON is read with Python dict semantics (see py.ts) so that loosely-typed or
// legacy plans resolve exactly as they do in the Django app.
import { FILING_STATUS_MAP, getRmdStartAge } from './constants';
import { type Dict, get, pyBool, pyFloat, pyInt, pyMod } from './py';

type Num = ArrayLike<number>;

// ---------------------------------------------------------------------------
// Ages

/** Resolve an age selector ('specified', 'retirement', 'spouse_death', ...) to an age in user-age coordinates. */
export function resolveAge(
  ageType: any, specifiedVal: any,
  userAge = 60, userRetAge = 65, isMarried = false, spouseAge: number | null = null, spouseRetAge: number | null = null,
  userAgeDeath = 100, spouseAgeDeath = 100, defaultVal: any = 100,
): any {
  const toInt = (v: any) => {
    try {
      return pyInt(v);
    } catch {
      return null;
    }
  };
  switch (ageType) {
    case 'specified':
    case 'age':
    case 'user_specified': {
      const v = toInt(specifiedVal);
      return v === null ? defaultVal : v;
    }
    case 'spouse_specified': {
      const v = toInt(specifiedVal);
      if (v === null) return defaultVal;
      return isMarried ? v + (userAge - (spouseAge as number)) : v;
    }
    case 'retirement':
      return userRetAge;
    case 'spouse_retirement':
      return isMarried ? (spouseRetAge as number) + (userAge - (spouseAge as number)) : userRetAge;
    case 'death':
      return userAgeDeath;
    case 'spouse_death':
      return isMarried ? spouseAgeDeath + (userAge - (spouseAge as number)) : userAgeDeath;
    case 'first_death':
      return isMarried ? Math.min(userAgeDeath, spouseAgeDeath + (userAge - (spouseAge as number))) : userAgeDeath;
    default:
      return defaultVal;
  }
}

const START_TYPES = ['start', 'income_start', 'at_start'];
const NOW_TYPES = ['current_age', 'current_year', 'now'];

// ---------------------------------------------------------------------------
// Income streams

/**
 * Cumulative growth factor for an income stream at projection step t (user age
 * userAge + t). Supports a multi-period `adjustments` list or the legacy flat
 * adjust_* fields; customInflationRates gives per-year inflation (stress test).
 */
export function calculateIncomeGrowthFactor(
  item: Dict, t: number, userAge: number, userRetAge: number, isMarried: boolean, spouseAge: number, spouseRetAge: number,
  userAgeDeath: number, spouseAgeDeath: number, inflationRate: number, startAge: any = null,
  customInflationRates: Num | null = null,
): number {
  if (startAge === null) {
    startAge = resolveAge(get(item, 'start_age_type', 'retirement'), get(item, 'start_age_specified', 65),
      userAge, userRetAge, isMarried, spouseAge, spouseRetAge, userAgeDeath, spouseAgeDeath);
  }
  const endAge = resolveAge(get(item, 'end_age_type', 'death'), get(item, 'end_age_specified', 90),
    userAge, userRetAge, isMarried, spouseAge, spouseRetAge, userAgeDeath, spouseAgeDeath);

  const adjustments = get(item, 'adjustments');
  if (!pyBool(adjustments) || !Array.isArray(adjustments)) {
    const adjType = get(item, 'adjust_type', 'inflation');
    const adjVal = pyFloat(get(item, 'adjust_val', 0.0));
    const adjStartType = get(item, 'adjust_start_age_type', 'start');
    const adjStartSpec = get(item, 'adjust_start_age_specified', 65);

    if (adjType === 'none') return 1.0;

    let adjStartAge: number;
    if (START_TYPES.includes(adjStartType)) adjStartAge = startAge;
    else if (NOW_TYPES.includes(adjStartType)) adjStartAge = userAge;
    else {
      adjStartAge = resolveAge(adjStartType, adjStartSpec, userAge, userRetAge, isMarried, spouseAge, spouseRetAge,
        userAgeDeath, spouseAgeDeath, startAge);
    }

    const userAgeT = userAge + t;
    const yearsSinceAdj = Math.max(0, userAgeT - adjStartAge);
    const startT = Math.max(0, adjStartAge - userAge);

    if (customInflationRates !== null) {
      let factor = 1.0;
      for (let k = startT; k < t; k++) {
        const infK = k < customInflationRates.length ? customInflationRates[k] : inflationRate;
        if (adjType === 'inflation') factor *= 1.0 + infK / 100.0;
        else if (adjType === 'fixed_pct') factor *= 1.0 + adjVal / 100.0;
        else if (adjType === 'inflation_less_pct') factor *= 1.0 + Math.max(0.0, infK - adjVal) / 100.0;
      }
      return factor;
    }
    if (adjType === 'inflation') return (1.0 + inflationRate / 100.0) ** yearsSinceAdj;
    if (adjType === 'fixed_pct') return (1.0 + adjVal / 100.0) ** yearsSinceAdj;
    if (adjType === 'inflation_less_pct') {
      const rate = Math.max(0.0, inflationRate - adjVal);
      return (1.0 + rate / 100.0) ** yearsSinceAdj;
    }
    return 1.0;
  }

  // Multi-period resolution
  const periods = adjustments.map((p: Dict) => {
    const pStartType = get(p, 'start_type', 'current_age');
    const pStartSpec = get(p, 'start_spec', 65);
    let pStartAge: number;
    if (START_TYPES.includes(pStartType)) pStartAge = startAge;
    else if (NOW_TYPES.includes(pStartType)) pStartAge = userAge;
    else {
      pStartAge = resolveAge(pStartType, pStartSpec, userAge, userRetAge, isMarried, spouseAge, spouseRetAge,
        userAgeDeath, spouseAgeDeath, startAge);
    }
    const pEndAge = resolveAge(get(p, 'end_type', 'death'), get(p, 'end_spec', 90),
      userAge, userRetAge, isMarried, spouseAge, spouseRetAge, userAgeDeath, spouseAgeDeath, endAge);
    return {
      startAge: pStartAge,
      endAge: pEndAge,
      adjustType: get(p, 'adjust_type', 'inflation'),
      adjustVal: pyFloat(get(p, 'adjust_val', 0.0)),
    };
  });

  let factor = 1.0;
  for (let k = 0; k < t; k++) {
    const ageK = userAge + k;
    const p = periods.find((q: any) => q.startAge <= ageK && ageK < q.endAge);
    if (!p) continue; // gap period: 0% growth
    const infK = customInflationRates !== null && k < customInflationRates.length ? customInflationRates[k] : inflationRate;
    let rate: number;
    if (p.adjustType === 'inflation') rate = infK / 100.0;
    else if (p.adjustType === 'fixed_pct') rate = p.adjustVal / 100.0;
    else if (p.adjustType === 'inflation_less_pct') rate = Math.max(0.0, (infK - p.adjustVal) / 100.0);
    else rate = 0.0;
    factor *= 1.0 + rate;
  }
  return factor;
}

/** Payout multiplier: 1.0 for the full benefit, the survivor % for a survivor benefit, 0.0 when inactive. */
export function calculateIncomeBenefitMultiplier(
  item: Dict, userAgeT: number, userAgeDeath: number, spouseAgeT: number | null, spouseAgeDeath: number,
  isMarried: boolean, startAge: number, endAge: number,
): number {
  const freq = get(item, 'frequency', 'monthly');
  const isOneTime = freq === 'one_time' || freq === 'one-time';
  const endType = get(item, 'end_age_type', 'death');
  const hasSurvivor = pyBool(get(item, 'has_survivor_benefit', false));
  const survivorPct = pyFloat(get(item, 'survivor_benefit_pct', 100.0)) / 100.0;

  const userAlive = userAgeT <= userAgeDeath;
  const spouseAlive = isMarried && spouseAgeT !== null && spouseAgeT <= spouseAgeDeath;

  if (isOneTime) return userAgeT === startAge && userAlive ? 1.0 : 0.0;

  if (endType === 'death' || endType === 'retirement') {
    // Primary recipient is the user
    if (userAlive && startAge <= userAgeT && userAgeT <= endAge) return 1.0;
    if (!userAlive && isMarried && spouseAlive && hasSurvivor && userAgeT >= startAge) return survivorPct;
    return 0.0;
  }
  if (endType === 'spouse_death' || endType === 'spouse_retirement') {
    // Primary recipient is the spouse
    if (spouseAlive && startAge <= userAgeT && userAgeT <= endAge) return 1.0;
    if (!spouseAlive && isMarried && userAlive && hasSurvivor && userAgeT >= startAge) return survivorPct;
    return 0.0;
  }
  // Fixed specified age or other
  return userAlive && startAge <= userAgeT && userAgeT <= endAge ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// Contributions

function singleAccountContributionsForYear(
  t: number, userAge: number, isMarried: boolean, spouseAge: number, _currentYear: number, assetData: Dict,
): number {
  const userAgeT = userAge + t;
  const isSpouse = pyBool(pyBool(get(assetData, 'is_spouse', false)) || get(assetData, 'owner') === 'spouse') && isMarried;

  const amount = pyFloat(get(assetData, 'contrib_amount', 0.0));
  const freq = get(assetData, 'contrib_freq', 'annual');
  const startAge = pyInt(get(assetData, 'contrib_start_age', 0));
  const adjustInf = pyBool(get(assetData, 'contrib_adjust_inflation', true));

  const endAgeType = get(assetData, 'contrib_end_age_type', isSpouse ? 'spouse_retirement' : 'retirement');
  const endAgeSpec = pyInt(get(assetData, 'contrib_end_age_specified', 0));

  const retAge = get(assetData, 'user_ret_age', 65);
  const spouseRetAge = get(assetData, 'spouse_ret_age', 65);

  const endAge = isSpouse && ['age', 'specified', 'spouse_specified'].includes(endAgeType)
    ? resolveAge('spouse_specified', endAgeSpec, userAge, retAge, isMarried, spouseAge, spouseRetAge, 100, 100)
    : resolveAge(endAgeType, endAgeSpec, userAge, retAge, isMarried, spouseAge, spouseRetAge, 100, 100);

  const startAgeUser = isSpouse ? startAge + (userAge - spouseAge) : startAge;

  let active: boolean;
  if (freq === 'one-time') {
    // One-time contributions can also be 'first_death' for taxable
    if (endAgeType === 'first_death') {
      const uDeath = get(assetData, 'user_age_death', 90);
      const sDeath = get(assetData, 'spouse_age_death', 90);
      const tFirstDeath = isMarried ? Math.min(uDeath - userAge, sDeath - spouseAge) : uDeath - userAge;
      active = t === tFirstDeath;
    } else {
      active = userAgeT === startAgeUser;
    }
  } else {
    active = startAgeUser <= userAgeT && userAgeT <= endAge;
  }
  if (!active) return 0.0;

  const baseVal = freq === 'monthly' ? amount * 12.0 : amount;
  if (adjustInf) {
    const inflationRate = get(assetData, 'inflation_rate', 2.5);
    return baseVal * (1.0 + inflationRate / 100.0) ** t;
  }
  return baseVal;
}

export function getContributionsForYear(
  t: number, userAge: number, isMarried: boolean, spouseAge: number, currentYear: number, assetData: any,
): number {
  if (assetData === null || typeof assetData !== 'object' || Array.isArray(assetData)) return 0.0;
  const sub = get(assetData, 'accounts');
  if (pyBool(sub) && Array.isArray(sub)) {
    let total = 0;
    for (const acc of sub) total += singleAccountContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, acc);
    return total;
  }
  return singleAccountContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, assetData);
}

// ---------------------------------------------------------------------------
// Life insurance

export interface LifeInsuranceRouting {
  /** Year index when a death benefit goes into the survivor's taxable account (-1 if none). */
  taxable_deposit_t: number;
  taxable_deposit_amt: number;
  /** Amount paid to the estate at the final household death. */
  terminal_life_ins_estate: number;
  user_policy_active: boolean;
  spouse_policy_active: boolean;
}

export function getLifeInsuranceRouting(inputs: Dict): LifeInsuranceRouting {
  const userAge = pyInt(get(inputs, 'user_age', 60));
  const userAgeDeath = pyInt(get(inputs, 'user_age_death', 90));
  const isMarried = pyBool(get(inputs, 'is_married', false));
  const spouseAge = isMarried ? pyInt(get(inputs, 'spouse_age', 60)) : 60;
  const spouseAgeDeath = isMarried ? pyInt(get(inputs, 'spouse_age_death', 90)) : 90;

  const userSpan = userAgeDeath - userAge + 1;
  const spouseSpan = isMarried ? spouseAgeDeath - spouseAge + 1 : 0;
  const totalYears = Math.max(userSpan, spouseSpan);

  const userAmt = pyFloat(get(inputs, 'user_life_insurance_amount', 0.0));
  const userType = String(get(inputs, 'user_life_insurance_type', 'permanent'));
  const userTermAge = pyInt(get(inputs, 'user_life_insurance_term_age', 70));
  const userPolicyActive = userType === 'permanent' || userAgeDeath <= userTermAge;

  const spouseAmt = isMarried ? pyFloat(get(inputs, 'spouse_life_insurance_amount', 0.0)) : 0.0;
  const spouseType = isMarried ? String(get(inputs, 'spouse_life_insurance_type', 'permanent')) : 'permanent';
  const spouseTermAge = isMarried ? pyInt(get(inputs, 'spouse_life_insurance_term_age', 70)) : 70;
  const spousePolicyActive = isMarried && (spouseType === 'permanent' || spouseAgeDeath <= spouseTermAge);

  let taxableDepositT = -1;
  let taxableDepositAmt = 0.0;
  let terminal = 0.0;

  const tUserDeath = userAgeDeath - userAge + 1;
  const tSpouseDeath = isMarried ? spouseAgeDeath - spouseAge + 1 : 0;

  if (isMarried) {
    if (tUserDeath < tSpouseDeath) {
      // User dies first -> spouse survives
      if (userPolicyActive && userAmt > 0.0 && tUserDeath < totalYears) {
        taxableDepositT = tUserDeath;
        taxableDepositAmt = userAmt;
      }
      if (spousePolicyActive && spouseAmt > 0.0) terminal = spouseAmt;
    } else if (tSpouseDeath < tUserDeath) {
      // Spouse dies first -> user survives
      if (spousePolicyActive && spouseAmt > 0.0 && tSpouseDeath < totalYears) {
        taxableDepositT = tSpouseDeath;
        taxableDepositAmt = spouseAmt;
      }
      if (userPolicyActive && userAmt > 0.0) terminal = userAmt;
    } else {
      // Both die together
      if (userPolicyActive && userAmt > 0.0) terminal += userAmt;
      if (spousePolicyActive && spouseAmt > 0.0) terminal += spouseAmt;
    }
  } else if (userPolicyActive && userAmt > 0.0) {
    terminal = userAmt;
  }

  return {
    taxable_deposit_t: taxableDepositT,
    taxable_deposit_amt: taxableDepositAmt,
    terminal_life_ins_estate: terminal,
    user_policy_active: userPolicyActive,
    spouse_policy_active: spousePolicyActive,
  };
}

// ---------------------------------------------------------------------------
// extract_sim_inputs

/** Output of extract_sim_inputs. Asset dicts keep the plan's loose shape plus injected metadata. */
export interface SimInputs {
  user_age: number;
  user_ret_age: number;
  user_age_death: number;
  is_married: boolean;
  spouse_age: number;
  spouse_ret_age: number;
  spouse_age_death: number;
  filing_status: string;
  current_year: number;
  desired_spending_start_age: number;
  desired_spending: number;
  survivor_spending: number;
  adjust_spending_inflation: boolean;
  inflation_rate: number;
  runs: number;
  target_success_rate: number;
  pretax_data: Dict;
  spouse_pretax_data: Dict;
  roth_data: Dict;
  taxable_data: Dict;
  is_community_property: boolean;
  hsa_data: Dict;
  spouse_hsa_data: Dict;
  hsa_for_medical: boolean;
  spouse_hsa_for_medical: boolean;
  additional_spending: Dict[];
  income_sources: Dict[];
  other_taxes: Dict[];
  state_tax_rate: number;
  state_ss_exempt: boolean;
  social_security: Dict;
  total_years: number;
  user_rmd_start_age: number;
  spouse_rmd_start_age: number;
  rmd_start_age: number;
  user_life_insurance_amount: number;
  user_life_insurance_type: string;
  user_life_insurance_term_age: number;
  spouse_life_insurance_amount: number;
  spouse_life_insurance_type: string;
  spouse_life_insurance_term_age: number;
}

/**
 * Clean, defaulted simulation inputs from a plan. Python mutates the plan's asset
 * dicts in place; this works on a deep copy, so `plan` is left untouched.
 */
export function extractSimInputs(plan: Dict | null | undefined): SimInputs {
  const raw: Dict = plan && typeof plan === 'object' ? structuredClone(plan) : {};

  // Demographics
  const userAge = pyInt(get(raw, 'user_age', 60));
  const userRetAge = pyInt(get(raw, 'user_retirement_age', 65));
  const userAgeDeath = pyInt(get(raw, 'user_age_death', 90));

  const isMarried = pyBool(get(raw, 'is_married', false));
  const spouseAge = isMarried ? pyInt(get(raw, 'spouse_age', 60)) : 60;
  const spouseRetAge = isMarried ? pyInt(get(raw, 'spouse_retirement_age', 65)) : 65;
  const spouseAgeDeath = isMarried ? pyInt(get(raw, 'spouse_age_death', 90)) : 90;

  let filingStatus = get(raw, 'filing_status', 'single');
  if (isMarried && filingStatus === 'single') filingStatus = 'joint'; // default married to MFJ

  const currentYear = pyInt(get(raw, 'current_year', 2026));

  // Spending start
  const beginType = get(raw, 'begin_spending_age_type', 'retirement');
  const beginSpecified = pyInt(get(raw, 'begin_spending_age_specified', 65));
  let desiredSpendingStartAge = userRetAge;
  if (beginType === 'specified') desiredSpendingStartAge = beginSpecified;
  else if (beginType === 'spouse_retirement' && isMarried) desiredSpendingStartAge = spouseRetAge + (userAge - spouseAge);

  const desiredSpending = pyFloat(get(raw, 'desired_spending', 40000.0));
  const survivorSpending = isMarried ? pyFloat(get(raw, 'survivor_spending', desiredSpending)) : desiredSpending;
  const adjustSpendingInflation = pyBool(get(raw, 'adjust_spending_inflation', true));

  const inflationRate = pyFloat(get(raw, 'inflation_rate', 2.5));
  const runs = pyInt(get(raw, 'runs', 10000));
  const targetSuccessRate = pyFloat(get(raw, 'target_success_rate', 80.0));

  // Assets: pretax user, pretax spouse, Roth, taxable, HSA user, HSA spouse
  const pretaxData = get(raw, 'pretax_assets', {});
  const spousePretaxData = isMarried ? get(raw, 'spouse_pretax_assets', {}) : {};
  const rothData = get(raw, 'roth_assets', {});
  let taxableData = get(raw, 'taxable_assets', {});
  if (taxableData === null) taxableData = {};
  const setDefault = (k: string, v: any) => {
    if (!(k in taxableData)) taxableData[k] = v;
  };
  setDefault('dividend_yield', 2.0);
  setDefault('qualified_dividend_pct', 85.0);
  setDefault('interest_yield', 0.0);
  setDefault('capital_gains_dist_rate', 0.5);
  setDefault('cost_basis_ratio', 70.0);
  if (!('initial_cost_basis' in taxableData)) {
    const bal = pyFloat(get(taxableData, 'present_balance', 0.0));
    const cbr = pyFloat(get(taxableData, 'cost_basis_ratio', 70.0));
    taxableData.initial_cost_basis = bal * (cbr / 100.0);
  }
  const isCommProp = pyBool(pyBool(get(taxableData, 'is_community_property', false)) || get(raw, 'is_community_property', false));

  const hsaData = get(raw, 'hsa_assets', {});
  const spouseHsaData = isMarried ? get(raw, 'spouse_hsa_assets', {}) : {};

  if (pyBool(pretaxData)) pretaxData.is_spouse = false;
  if (pyBool(spousePretaxData)) spousePretaxData.is_spouse = true;
  if (pyBool(rothData)) rothData.is_spouse = false;
  if (pyBool(taxableData)) taxableData.is_spouse = false;
  if (pyBool(hsaData)) hsaData.is_spouse = false;
  if (pyBool(spouseHsaData)) spouseHsaData.is_spouse = true;

  // Inject metadata into assets for the contribution calculation
  for (const asset of [pretaxData, spousePretaxData, rothData, taxableData, hsaData, spouseHsaData]) {
    if (!pyBool(asset)) continue;
    asset.user_ret_age = userRetAge;
    asset.spouse_ret_age = spouseRetAge;
    asset.user_age_death = userAgeDeath;
    asset.spouse_age_death = spouseAgeDeath;
    asset.inflation_rate = inflationRate;
    if ('accounts' in asset && Array.isArray(asset.accounts)) {
      for (const sub of asset.accounts) {
        if (sub === null || typeof sub !== 'object' || Array.isArray(sub)) continue;
        sub.user_ret_age = userRetAge;
        sub.spouse_ret_age = spouseRetAge;
        sub.user_age_death = userAgeDeath;
        sub.spouse_age_death = spouseAgeDeath;
        sub.inflation_rate = inflationRate;
        if (!('is_spouse' in sub)) sub.is_spouse = get(asset, 'is_spouse', false);
      }
    }
  }

  const hsaForMedical = pyBool(get(hsaData, 'hsa_for_medical', true));
  const spouseHsaForMedical = isMarried ? pyBool(get(spouseHsaData, 'hsa_for_medical', true)) : true;

  // Timeline
  const userSpan = userAgeDeath - userAge + 1;
  const spouseSpan = isMarried ? spouseAgeDeath - spouseAge + 1 : 0;
  const totalYears = Math.max(userSpan, spouseSpan);

  // Birth years and RMD start ages
  const userRmdStartAge = getRmdStartAge(currentYear - userAge);
  const spouseRmdStartAge = isMarried ? getRmdStartAge(currentYear - spouseAge) : 150;

  const married = (k: string, dflt: any, conv: (v: any) => any, single: any) => (isMarried ? conv(get(raw, k, dflt)) : single);

  return {
    user_age: userAge,
    user_ret_age: userRetAge,
    user_age_death: userAgeDeath,
    is_married: isMarried,
    spouse_age: spouseAge,
    spouse_ret_age: spouseRetAge,
    spouse_age_death: spouseAgeDeath,
    filing_status: filingStatus,
    current_year: currentYear,
    desired_spending_start_age: desiredSpendingStartAge,
    desired_spending: desiredSpending,
    survivor_spending: survivorSpending,
    adjust_spending_inflation: adjustSpendingInflation,
    inflation_rate: inflationRate,
    runs,
    target_success_rate: targetSuccessRate,
    pretax_data: pretaxData,
    spouse_pretax_data: spousePretaxData,
    roth_data: rothData,
    taxable_data: taxableData,
    is_community_property: isCommProp,
    hsa_data: hsaData,
    spouse_hsa_data: spouseHsaData,
    hsa_for_medical: hsaForMedical,
    spouse_hsa_for_medical: spouseHsaForMedical,
    additional_spending: get(raw, 'additional_spending', []),
    income_sources: get(raw, 'income_sources', []),
    other_taxes: get(raw, 'other_taxes', []),
    state_tax_rate: pyFloat(get(raw, 'state_tax_rate', 0.0)),
    state_ss_exempt: pyBool(get(raw, 'state_ss_exempt', true)),
    social_security: get(raw, 'social_security', {}),
    total_years: totalYears,
    user_rmd_start_age: userRmdStartAge,
    spouse_rmd_start_age: spouseRmdStartAge,
    rmd_start_age: userRmdStartAge,
    user_life_insurance_amount: pyFloat(get(raw, 'user_life_insurance_amount', 0.0)),
    user_life_insurance_type: String(get(raw, 'user_life_insurance_type', 'permanent')),
    user_life_insurance_term_age: pyInt(get(raw, 'user_life_insurance_term_age', 70)),
    spouse_life_insurance_amount: married('spouse_life_insurance_amount', 0.0, pyFloat, 0.0),
    spouse_life_insurance_type: married('spouse_life_insurance_type', 'permanent', String, 'permanent'),
    spouse_life_insurance_term_age: married('spouse_life_insurance_term_age', 70, pyInt, 70),
  };
}

// ---------------------------------------------------------------------------
// prepare_numba_inputs

/** Flat per-year arrays and scalars consumed by the simulation kernels. */
export interface NumbaInputs {
  desired_spending: number;
  survivor_spending: number;
  filing_status_code: number;
  c_pre_user: Float64Array;
  c_pre_spouse: Float64Array;
  c_roth: Float64Array;
  c_tax: Float64Array;
  c_hsa: Float64Array;
  c_hsa_user: Float64Array;
  c_hsa_spouse: Float64Array;
  add_spending_arr: Float64Array;
  inc_taxable_arr: Float64Array;
  inc_ss_arr: Float64Array;
  inc_nontaxable_arr: Float64Array;
  state_tax_rate: number;
  state_ss_exempt_code: number;
  other_taxes_arr: Float64Array;
  pretax_user_init: number;
  pretax_spouse_init: number;
  roth_init: number;
  taxable_init: number;
  hsa_init: number;
  hsa_user_init: number;
  hsa_spouse_init: number;
  hsa_user_for_medical_code: number;
  hsa_spouse_for_medical_code: number;
  taxable_div_yield: number;
  taxable_qual_pct: number;
  taxable_int_yield: number;
  taxable_cg_dist_rate: number;
  taxable_basis_init: number;
  is_community_property_code: number;
  user_rmd_start_age: number;
  spouse_rmd_start_age: number;
  inf_factors: Float64Array;
  taxable_deposit_t: number;
  taxable_deposit_amt: number;
  terminal_life_ins_estate: number;
}

export function prepareNumbaInputs(
  inputs: SimInputs, testSpending: number | null = null, customInflationRates: Num | null = null,
): NumbaInputs {
  const desiredSpending = testSpending !== null ? testSpending : inputs.desired_spending;
  let survivorSpending = inputs.survivor_spending;
  if (testSpending !== null && inputs.desired_spending > 0) {
    survivorSpending = inputs.survivor_spending * (testSpending / inputs.desired_spending);
  }

  const filingStatusCode = FILING_STATUS_MAP[inputs.filing_status] ?? 0;
  const totalYears = inputs.total_years;
  const inflationRate = pyFloat(inputs.inflation_rate);

  const infFactors = new Float64Array(totalYears);
  if (customInflationRates !== null) {
    infFactors[0] = 1.0;
    for (let t = 1; t < totalYears; t++) infFactors[t] = infFactors[t - 1] * (1.0 + customInflationRates[t - 1] / 100.0);
  } else {
    const base = 1.0 + inflationRate / 100.0;
    for (let t = 0; t < totalYears; t++) infFactors[t] = base ** t;
  }

  const zeros = () => new Float64Array(totalYears);
  const cPreUser = zeros();
  const cPreSpouse = zeros();
  const cRoth = zeros();
  const cTax = zeros();
  const cHsaUser = zeros();
  const cHsaSpouse = zeros();
  const addSpendingArr = zeros();
  const incTaxableArr = zeros();
  const incSsArr = zeros();
  const incNontaxableArr = zeros();
  const otherTaxesArr = zeros();

  const userAge = inputs.user_age;
  const isMarried = inputs.is_married;
  const spouseAge = inputs.spouse_age;
  const currentYear = inputs.current_year;
  const userAgeDeath = inputs.user_age_death;
  const spouseAgeDeath = inputs.spouse_age_death;
  const userRetAge = inputs.user_ret_age;
  const spouseRetAge = inputs.spouse_ret_age;

  const stateTaxRate = pyFloat(get(inputs, 'state_tax_rate', 0.0));
  const stateSsExemptCode = pyBool(get(inputs, 'state_ss_exempt', true)) ? 1 : 0;
  const otherTaxesList: Dict[] = get(inputs, 'other_taxes', []);

  const resolve = (type: any, spec: any, dflt: any = 100) =>
    resolveAge(type, spec, userAge, userRetAge, isMarried, spouseAge, spouseRetAge, userAgeDeath, spouseAgeDeath, dflt);

  // Social Security settings don't change per year.
  const ss: Dict = get(inputs, 'social_security', {});
  const uReceiving = pyBool(get(ss, 'user_receiving', false));
  const uFutureEntitled = pyBool(get(ss, 'user_future_entitled', get(ss, 'user_entitled', true)));
  const uEntitled = uReceiving || uFutureEntitled;
  const uAmt = pyFloat(get(ss, 'user_amount', 2500.0));
  const uFreq = get(ss, 'user_freq', 'monthly');
  const uStartAge = pyInt(get(ss, 'user_start_age', 67));
  const spReceiving = isMarried ? pyBool(get(ss, 'spouse_receiving', false)) : false;
  const spFutureEntitled = isMarried ? pyBool(get(ss, 'spouse_future_entitled', get(ss, 'spouse_entitled', false))) : false;
  const spEntitled = (spReceiving || spFutureEntitled) && isMarried;
  const spAmt = isMarried ? pyFloat(get(ss, 'spouse_amount', 0.0)) : 0.0;
  const spFreq = get(ss, 'spouse_freq', 'monthly');
  const spStartAge = isMarried ? pyInt(get(ss, 'spouse_start_age', 67)) : 67;
  const uBase = uFreq === 'monthly' ? uAmt * 12.0 : uAmt;
  const spBase = spFreq === 'monthly' ? spAmt * 12.0 : spAmt;

  for (let t = 0; t < totalYears; t++) {
    const userAgeT = userAge + t;
    const spouseAgeT = isMarried ? spouseAge + t : userAgeT;
    const userAlive = userAgeT <= userAgeDeath;
    const spouseAlive = isMarried && spouseAgeT <= spouseAgeDeath;

    cPreUser[t] = getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.pretax_data);
    cPreSpouse[t] = isMarried ? getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.spouse_pretax_data) : 0.0;
    cRoth[t] = getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.roth_data);
    cTax[t] = getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.taxable_data);
    cHsaUser[t] = getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.hsa_data);
    cHsaSpouse[t] = isMarried ? getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, inputs.spouse_hsa_data) : 0.0;

    // Additional spending
    let addS = 0.0;
    for (const item of inputs.additional_spending) {
      const startAge = get(item, 'start_age', 0);
      const startAgeType = get(item, 'start_age_type', 'user');
      const startUser = startAgeType === 'spouse' && isMarried ? startAge + (userAge - spouseAge) : startAge;
      const interval = get(item, 'interval', 0);
      const amount = get(item, 'amount', 0.0);
      const adjustInf = get(item, 'adjust_inflation', true);
      let occurs = false;
      if (userAgeT >= startUser) {
        occurs = interval === 0 ? userAgeT === startUser : pyMod(userAgeT - startUser, interval) === 0;
      }
      if (occurs) addS += amount * (pyBool(adjustInf) ? infFactors[t] : 1.0);
    }
    addSpendingArr[t] = addS;

    // Other taxes
    let otS = 0.0;
    for (const item of otherTaxesList) {
      const freq = get(item, 'frequency', 'annual');
      const rawAmt = pyFloat(get(item, 'amount', 0.0));
      const startAge = resolve(get(item, 'start_age_type', 'retirement'), get(item, 'start_age_specified', 65));
      const endAge = resolve(get(item, 'end_age_type', 'death'), get(item, 'end_age_specified', 90));
      const isOneTime = freq === 'one_time' || freq === 'one-time';
      const inRange = isOneTime ? userAgeT === startAge : startAge <= userAgeT && userAgeT <= endAge;
      let active = false;
      if (inRange) {
        const endType = get(item, 'end_age_type');
        if (!userAlive && (endType === 'death' || endType === 'retirement')) active = false;
        else if (!spouseAlive && (endType === 'spouse_death' || endType === 'spouse_retirement')) active = false;
        else active = true;
      }
      if (!active) continue;

      const amt = freq === 'annual' || isOneTime ? rawAmt : rawAmt * 12.0;
      const adjType = get(item, 'adjust_type', 'inflation');
      const adjVal = pyFloat(get(item, 'adjust_val', 0.0));
      const adjStartType = get(item, 'adjust_start_age_type', 'start');
      const adjStartSpec = get(item, 'adjust_start_age_specified', 65);

      let adjStartAge: number;
      if (START_TYPES.includes(adjStartType)) adjStartAge = startAge;
      else if (NOW_TYPES.includes(adjStartType)) adjStartAge = userAge;
      else if (adjStartType === 'specified') {
        try {
          adjStartAge = pyInt(adjStartSpec);
        } catch {
          adjStartAge = startAge;
        }
      } else adjStartAge = resolve(adjStartType, adjStartSpec, startAge);

      const yearsSinceAdj = Math.max(0, userAgeT - adjStartAge);

      // Same rule as simulateStep: grow for every year since the adjustment start,
      // including years before the plan starts (an adjustment that began in the past is
      // applied retroactively; one that hasn't begun yet gives 1.0). With custom
      // (stress-test) inflation, pre-plan years use the base rate and plan years use the
      // per-year rates.
      const compound = (rateFn: (r: number) => number) => {
        if (yearsSinceAdj <= 0) return 1.0;
        let f = (1.0 + rateFn(inflationRate) / 100.0) ** Math.max(0, userAge - adjStartAge);
        for (let k = Math.max(0, adjStartAge - userAge); k < t; k++) {
          const infK = k < customInflationRates!.length ? customInflationRates![k] : inflationRate;
          f *= 1.0 + rateFn(infK) / 100.0;
        }
        return f;
      };

      let factor: number;
      if (adjType === 'inflation') {
        factor = customInflationRates !== null
          ? compound((r) => r)
          : (1.0 + inflationRate / 100.0) ** yearsSinceAdj;
      } else if (adjType === 'fixed_pct') {
        factor = (1.0 + adjVal / 100.0) ** yearsSinceAdj;
      } else if (adjType === 'inflation_less_pct') {
        factor = customInflationRates !== null
          ? compound((r) => Math.max(0.0, r - adjVal))
          : (1.0 + Math.max(0.0, inflationRate - adjVal) / 100.0) ** yearsSinceAdj;
      } else {
        factor = 1.0;
      }
      otS += amt * factor;
    }
    otherTaxesArr[t] = otS;

    // Social Security
    const infFactor = infFactors[t];
    const uSsInf = uEntitled ? uBase * infFactor : 0.0;
    const spSsInf = spEntitled ? spBase * infFactor : 0.0;
    const uSsActive = userAlive && (uReceiving || (uFutureEntitled && userAgeT >= uStartAge));
    const spSsActive = spouseAlive && spEntitled && (spReceiving || (spFutureEntitled && spouseAgeT >= spStartAge));

    let uSsT = 0.0;
    let spSsT = 0.0;
    if (uSsActive && spSsActive) {
      uSsT = uSsInf;
      spSsT = spSsInf;
    } else if (userAlive && !spouseAlive && isMarried) {
      if (uSsActive) uSsT = Math.max(uSsInf, spSsInf);
      else if (spSsInf > 0.0 && userAgeT >= 60) uSsT = spSsInf;
    } else if (spouseAlive && !userAlive && isMarried) {
      if (spSsActive) spSsT = Math.max(spSsInf, uSsInf);
      else if (uSsInf > 0.0 && spouseAgeT >= 60) spSsT = uSsInf;
    } else if (uSsActive) {
      uSsT = uSsInf;
    } else if (spSsActive) {
      spSsT = spSsInf;
    }

    let taxInc = 0.0;
    let ssInc = uSsT + spSsT;
    let nontaxInc = 0.0;

    // Income sources
    for (const inc of inputs.income_sources) {
      const freq = get(inc, 'frequency', 'monthly');
      const rawAmt = get(inc, 'amount', 0.0);
      const startAge = resolve(get(inc, 'start_age_type', 'retirement'), get(inc, 'start_age_specified', 0));
      const endAge = resolve(get(inc, 'end_age_type', 'death'), get(inc, 'end_age_specified', 0));
      const isOneTime = freq === 'one_time' || freq === 'one-time';
      const multiplier = calculateIncomeBenefitMultiplier(inc, userAgeT, userAgeDeath, spouseAgeT, spouseAgeDeath,
        isMarried, startAge, endAge);
      if (multiplier > 0.0) {
        const amt = freq === 'annual' || isOneTime ? rawAmt : rawAmt * 12.0;
        const factor = calculateIncomeGrowthFactor(inc, t, userAge, userRetAge, isMarried, spouseAge, spouseRetAge,
          userAgeDeath, spouseAgeDeath, inflationRate, startAge, customInflationRates);
        const incAmtT = amt * factor * multiplier;
        if (pyBool(get(inc, 'is_social_security', false))) ssInc += incAmtT;
        else if (pyBool(get(inc, 'subject_to_tax', true))) taxInc += incAmtT;
        else nontaxInc += incAmtT;
      }
    }
    incTaxableArr[t] = taxInc;
    incSsArr[t] = ssInc;
    incNontaxableArr[t] = nontaxInc;
  }

  const bal = (d: Dict) => pyFloat(get(d, 'present_balance', 0.0));
  const pretaxUserInit = bal(inputs.pretax_data);
  const pretaxSpouseInit = isMarried ? bal(inputs.spouse_pretax_data) : 0.0;
  const rothInit = bal(inputs.roth_data);
  const taxableInit = bal(inputs.taxable_data);
  const hsaUserInit = bal(inputs.hsa_data);
  const hsaSpouseInit = isMarried ? bal(inputs.spouse_hsa_data) : 0.0;

  const taxData: Dict = get(inputs, 'taxable_data', {});
  const costBasisRatio = pyFloat(get(taxData, 'cost_basis_ratio', 70.0));
  const taxableBasisInit = 'initial_cost_basis' in taxData
    ? pyFloat(taxData.initial_cost_basis)
    : Math.max(0.0, taxableInit) * (costBasisRatio / 100.0);

  const routing = getLifeInsuranceRouting(inputs as unknown as Dict);

  return {
    desired_spending: pyFloat(desiredSpending),
    survivor_spending: pyFloat(survivorSpending),
    filing_status_code: filingStatusCode,
    c_pre_user: cPreUser,
    c_pre_spouse: cPreSpouse,
    c_roth: cRoth,
    c_tax: cTax,
    c_hsa: cHsaUser,
    c_hsa_user: cHsaUser,
    c_hsa_spouse: cHsaSpouse,
    add_spending_arr: addSpendingArr,
    inc_taxable_arr: incTaxableArr,
    inc_ss_arr: incSsArr,
    inc_nontaxable_arr: incNontaxableArr,
    state_tax_rate: stateTaxRate,
    state_ss_exempt_code: stateSsExemptCode,
    other_taxes_arr: otherTaxesArr,
    pretax_user_init: pretaxUserInit,
    pretax_spouse_init: pretaxSpouseInit,
    roth_init: rothInit,
    taxable_init: taxableInit,
    hsa_init: hsaUserInit,
    hsa_user_init: hsaUserInit,
    hsa_spouse_init: hsaSpouseInit,
    hsa_user_for_medical_code: pyBool(get(inputs, 'hsa_for_medical', true)) ? 1 : 0,
    hsa_spouse_for_medical_code: pyBool(get(inputs, 'spouse_hsa_for_medical', true)) ? 1 : 0,
    taxable_div_yield: pyFloat(get(taxData, 'dividend_yield', 2.0)),
    taxable_qual_pct: pyFloat(get(taxData, 'qualified_dividend_pct', 85.0)),
    taxable_int_yield: pyFloat(get(taxData, 'interest_yield', 0.0)),
    taxable_cg_dist_rate: pyFloat(get(taxData, 'capital_gains_dist_rate', 0.5)),
    taxable_basis_init: taxableBasisInit,
    is_community_property_code: pyBool(get(inputs, 'is_community_property', false)) ? 1 : 0,
    user_rmd_start_age: inputs.user_rmd_start_age,
    spouse_rmd_start_age: inputs.spouse_rmd_start_age,
    inf_factors: infFactors,
    taxable_deposit_t: routing.taxable_deposit_t,
    taxable_deposit_amt: routing.taxable_deposit_amt,
    terminal_life_ins_estate: routing.terminal_life_ins_estate,
  };
}
