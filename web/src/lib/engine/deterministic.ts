// Deterministic projection: simulate_step, run_simulation_path and run_deterministic
// (core/runs.py). Produces the year-by-year rows behind the projections and cash-flow
// tables. Shares the RMD/tax/withdrawal waterfall with the Monte Carlo kernel.
import { FILING_STATUS_MAP } from './constants';
import {
  calculateIncomeBenefitMultiplier,
  calculateIncomeGrowthFactor,
  extractSimInputs,
  getContributionsForYear,
  getLifeInsuranceRouting,
  resolveAge,
  type SimInputs,
} from './inputs';
import { type Dict, get, pyBool, pyFloat, pyInt, pyMod, pyRound } from './py';
import { njitRmdTaxWithdraw, njitSpousalRollover, RTW_LEN } from './tax';

export interface AssetBlock {
  pretax: number;
  pretax_user: number;
  pretax_spouse: number;
  roth: number;
  taxable: number;
  hsa: number;
  hsa_user: number;
  hsa_spouse: number;
  total: number;
  taxable_basis?: number;
  terminal_life_insurance?: number;
}

/** Result of one simulate_step year (keys match the Python dict). */
export type StepResult = Dict;

export interface StepParams {
  t: number;
  user_age: number;
  is_married: boolean;
  spouse_age: number;
  user_age_death: number;
  spouse_age_death: number;
  filing_status: string;
  desired_spending_start_age: number;
  desired_spending: number;
  survivor_spending: number | null;
  adjust_spending_inflation: boolean;
  inflation_rate: number;
  additional_spending_list: Dict[];
  income_sources_list: Dict[];
  pretax_user: number;
  pretax_spouse: number;
  roth: number;
  taxable: number;
  hsa_user?: number;
  hsa_user_for_medical?: boolean;
  r_pretax_user?: number;
  r_pretax_spouse?: number;
  r_roth?: number;
  r_taxable?: number;
  r_hsa_user?: number;
  contrib_pretax_user?: number;
  contrib_pretax_spouse?: number;
  contrib_roth?: number;
  contrib_taxable?: number;
  contrib_hsa_user?: number;
  user_rmd_start_age?: number;
  spouse_rmd_start_age?: number;
  social_security_data?: Dict | null;
  state_tax_rate?: number;
  state_ss_exempt?: boolean;
  other_taxes_list?: Dict[] | null;
  hsa_spouse?: number;
  hsa_spouse_for_medical?: boolean;
  r_hsa_spouse?: number;
  contrib_hsa_spouse?: number;
  user_ret_age?: number;
  spouse_ret_age?: number;
  life_insurance_payout?: number;
  taxable_dividend_yield?: number;
  taxable_qualified_dividend_pct?: number;
  taxable_interest_yield?: number;
  taxable_capital_gains_dist_rate?: number;
  taxable_cost_basis_ratio?: number;
  taxable_cost_basis?: number | null;
  is_community_property?: boolean;
}

const START_TYPES = ['start', 'income_start', 'at_start'];
const NOW_TYPES = ['current_age', 'current_year', 'now'];

function bothDeadResult(): StepResult {
  const assets = () => ({ pretax: 0.0, pretax_user: 0.0, pretax_spouse: 0.0, roth: 0.0, taxable: 0.0, hsa: 0.0, hsa_user: 0.0, hsa_spouse: 0.0, total: 0.0 });
  return {
    beginning_assets: assets(),
    ending_assets: { ...assets(), taxable_basis: 0.0 },
    withdrawals: { pretax: 0.0, pretax_user: 0.0, pretax_spouse: 0.0, pretax_rmd: 0.0, user_pretax_rmd: 0.0, spouse_pretax_rmd: 0.0, pretax_extra: 0.0, taxable: 0.0, roth: 0.0, hsa: 0.0, hsa_user: 0.0, hsa_spouse: 0.0, total: 0.0 },
    taxes: { federal_tax: 0.0, state_tax: 0.0, early_withdrawal_penalty: 0.0, hsa_penalty_user: 0.0, hsa_penalty_spouse: 0.0, other_taxes: 0.0, total_tax: 0.0 },
    tax_breakdown: { fed_tax: 0.0, fed_ordinary_tax: 0.0, fed_ltcg_tax: 0.0, state_tax: 0.0, penalty: 0.0, hsa_penalty: 0.0, other_taxes: 0.0, other_taxes_breakdown: {} },
    cash_flow: { desired_spending: 0.0, additional_spending: 0.0, total_spending: 0.0, net_inflows: 0.0, total_income: 0.0, deficit: 0.0, surplus: 0.0 },
    income_sources_total: 0.0,
    income_sources_breakdown: {},
    investment_income: { interest: 0.0, ordinary_dividends: 0.0, qualified_dividends: 0.0, capital_gains_distributions: 0.0, realized_capital_gains: 0.0, total: 0.0 },
    contributions_total: 0.0,
    life_insurance_payout: 0.0,
  };
}

const addTo = (o: Record<string, number>, k: string, v: number) => {
  o[k] = (o[k] ?? 0.0) + v;
};

const rtwOut = new Float64Array(RTW_LEN);

/** One projection year: contributions, growth, spending, income, then RMDs, taxes and withdrawals. */
export function simulateStep(p: StepParams): StepResult {
  const {
    t, user_age: userAge, is_married: isMarried, spouse_age: spouseAge,
    user_age_death: userAgeDeath, spouse_age_death: spouseAgeDeath,
    filing_status: filingStatus, desired_spending_start_age: desiredSpendingStartAge,
    desired_spending: desiredSpending, survivor_spending: survivorSpending,
    adjust_spending_inflation: adjustSpendingInflation, inflation_rate: inflationRate,
    additional_spending_list: additionalSpendingList, income_sources_list: incomeSourcesList,
    roth, taxable,
    hsa_user_for_medical: hsaUserForMedical = true,
    r_pretax_user: rPretaxUser = 0.0, r_pretax_spouse: rPretaxSpouse = 0.0, r_roth: rRoth = 0.0,
    r_taxable: rTaxable = 0.0, r_hsa_user: rHsaUser = 0.0,
    contrib_roth: contribRoth = 0.0, contrib_taxable: contribTaxable = 0.0,
    user_rmd_start_age: userRmdStartAge = 75, spouse_rmd_start_age: spouseRmdStartAge = 150,
    social_security_data: ssData = null,
    state_tax_rate: stateTaxRate = 0.0, state_ss_exempt: stateSsExempt = true,
    other_taxes_list: otherTaxesList = null,
    hsa_spouse_for_medical: hsaSpouseForMedical = true, r_hsa_spouse: rHsaSpouse = 0.0,
    user_ret_age: userRetAge = 65, spouse_ret_age: spouseRetAge = 65,
    life_insurance_payout: lifeInsurancePayout = 0.0,
    taxable_dividend_yield: taxableDividendYield = 0.0, taxable_qualified_dividend_pct: taxableQualifiedDividendPct = 100.0,
    taxable_interest_yield: taxableInterestYield = 0.0, taxable_capital_gains_dist_rate: taxableCgDistRate = 0.0,
    taxable_cost_basis_ratio: taxableCostBasisRatio = 100.0, taxable_cost_basis: taxableCostBasis = null,
    is_community_property: isCommunityProperty = false,
  } = p;
  let pretaxUser = p.pretax_user;
  let pretaxSpouse = p.pretax_spouse;
  let hsaUser = p.hsa_user ?? 0.0;
  let hsaSpouse = p.hsa_spouse ?? 0.0;
  let contribPretaxUser = p.contrib_pretax_user ?? 0.0;
  let contribPretaxSpouse = p.contrib_pretax_spouse ?? 0.0;
  let contribHsaUser = p.contrib_hsa_user ?? 0.0;
  let contribHsaSpouse = p.contrib_hsa_spouse ?? 0.0;

  const userAgeT = userAge + t;
  const spouseAgeT: number | null = isMarried ? spouseAge + t : null;

  // 1. Active status and filing status
  const userAlive = userAgeT <= userAgeDeath;
  const spouseAlive = isMarried && (spouseAgeT as number) <= spouseAgeDeath;
  if (!userAlive && !spouseAlive) return bothDeadResult();

  const defaultStatus = isMarried ? 'joint' : 'single';
  const filingStatusCode = FILING_STATUS_MAP[filingStatus] ?? FILING_STATUS_MAP[defaultStatus] ?? 0;
  const tFirstDeath = isMarried ? Math.min(userAgeDeath - userAge, spouseAgeDeath - spouseAge) : userAgeDeath - userAge;

  // Spousal rollover upon first death (also downgrades filing status)
  let filingStatusTCode: number;
  [filingStatusTCode, pretaxUser, pretaxSpouse, hsaUser, hsaSpouse,
    contribPretaxUser, contribPretaxSpouse, contribHsaUser, contribHsaSpouse] = njitSpousalRollover(
    t, tFirstDeath, isMarried, userAlive, spouseAlive, filingStatusCode,
    pretaxUser, pretaxSpouse, hsaUser, hsaSpouse,
    contribPretaxUser, contribPretaxSpouse, contribHsaUser, contribHsaSpouse,
  );

  const pretaxUserPrior = Math.max(0.0, pretaxUser);
  const pretaxSpousePrior = isMarried ? Math.max(0.0, pretaxSpouse) : 0.0;

  // Basis initialization and tracking
  let taxableBasisCurr = taxableCostBasis === null
    ? Math.max(0.0, taxable) * (pyFloat(taxableCostBasisRatio) / 100.0)
    : Math.max(0.0, pyFloat(taxableCostBasis));

  // Step-up in basis on first death (100% in community property states, 50% otherwise)
  if (isMarried && t === tFirstDeath && taxable > 0.0) {
    taxableBasisCurr = isCommunityProperty
      ? Math.max(0.0, taxable)
      : 0.5 * taxableBasisCurr + 0.5 * Math.max(0.0, taxable);
  }

  // 2. Contributions and any life insurance payout
  const pretaxUserBefore = Math.max(0.0, pretaxUser + contribPretaxUser);
  const pretaxSpouseBefore = isMarried ? Math.max(0.0, pretaxSpouse + contribPretaxSpouse) : 0.0;
  const rothBefore = Math.max(0.0, roth + contribRoth);
  const taxableBefore = taxable + contribTaxable + Math.max(0.0, lifeInsurancePayout);
  const taxableBasisBefore = taxableBasisCurr + contribTaxable + Math.max(0.0, lifeInsurancePayout);
  const hsaUserBefore = Math.max(0.0, hsaUser + contribHsaUser);
  const hsaSpouseBefore = isMarried ? Math.max(0.0, hsaSpouse + contribHsaSpouse) : 0.0;

  // 3. Growth
  const growthPreUser = pretaxUserBefore * rPretaxUser;
  const growthPreSpouse = isMarried ? pretaxSpouseBefore * rPretaxSpouse : 0.0;
  const growthRoth = rothBefore * rRoth;
  const growthTaxable = taxableBefore > 0.0 ? taxableBefore * rTaxable : 0.0;
  const growthHsaUser = hsaUserBefore * rHsaUser;
  const growthHsaSpouse = isMarried ? hsaSpouseBefore * rHsaSpouse : 0.0;

  const pretaxUserMid = pretaxUserBefore + growthPreUser;
  const pretaxSpouseMid = pretaxSpouseBefore + growthPreSpouse;
  const rothMid = rothBefore + growthRoth;
  const taxableMid = taxableBefore + growthTaxable;
  const hsaUserMid = hsaUserBefore + growthHsaUser;
  const hsaSpouseMid = hsaSpouseBefore + growthHsaSpouse;

  // Taxable account yields
  let yInt = 0.0;
  let totDiv = 0.0;
  let yDivQual = 0.0;
  let yDivOrd = 0.0;
  let yCgDist = 0.0;
  if (taxableBefore > 0.0) {
    yInt = taxableBefore * (pyFloat(taxableInterestYield) / 100.0);
    totDiv = taxableBefore * (pyFloat(taxableDividendYield) / 100.0);
    yDivQual = totDiv * (pyFloat(taxableQualifiedDividendPct) / 100.0);
    yDivOrd = totDiv - yDivQual;
    yCgDist = taxableBefore * (pyFloat(taxableCgDistRate) / 100.0);
  }
  const taxableBasisMid = taxableBasisBefore + yInt + totDiv + yCgDist;

  const inflPow = (n: number) => (1.0 + inflationRate / 100.0) ** n;

  // 4. Desired spending
  let desiredSpendingT = 0.0;
  if (userAgeT >= desiredSpendingStartAge) {
    let baseSpending = desiredSpending;
    if (isMarried && t > tFirstDeath) baseSpending = survivorSpending !== null ? survivorSpending : desiredSpending;
    desiredSpendingT = baseSpending * (adjustSpendingInflation ? inflPow(t) : 1.0);
  }

  // 5. Additional spending
  let addSpendingT = 0.0;
  const addSpendingBreakdown: Record<string, number> = {};
  for (const item of additionalSpendingList) {
    const name = get(item, 'name') || 'Additional Expense';
    const startAge = get(item, 'start_age', 0);
    const startUser = get(item, 'start_age_type', 'user') === 'spouse' && isMarried ? startAge + (userAge - spouseAge) : startAge;
    const interval = get(item, 'interval', 0);
    const amount = get(item, 'amount', 0.0);
    const adjustInf = get(item, 'adjust_inflation', true);
    let occurs = false;
    if (userAgeT >= startUser) {
      occurs = interval === 0 ? userAgeT === startUser : pyMod(userAgeT - startUser, interval) === 0;
    }
    if (occurs) {
      const itemAmt = amount * (pyBool(adjustInf) ? inflPow(t) : 1.0);
      addSpendingT += itemAmt;
      addTo(addSpendingBreakdown, name, itemAmt);
    }
  }
  const totalSpendingTarget = desiredSpendingT + addSpendingT;

  const resolve = (type: any, spec: any, dflt: any = 100) =>
    resolveAge(type, spec, userAge, userRetAge, isMarried, spouseAge, spouseRetAge, userAgeDeath, spouseAgeDeath, dflt);

  // 5b. Other taxes
  let otherTaxesT = 0.0;
  const otherTaxesBreakdown: Record<string, number> = {};
  if (pyBool(otherTaxesList)) {
    for (const item of otherTaxesList as Dict[]) {
      const name = get(item, 'name') || 'Other Tax';
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
      let factor: number;
      if (adjType === 'inflation') factor = inflPow(yearsSinceAdj);
      else if (adjType === 'fixed_pct') factor = (1.0 + adjVal / 100.0) ** yearsSinceAdj;
      else if (adjType === 'inflation_less_pct') factor = (1.0 + Math.max(0.0, inflationRate - adjVal) / 100.0) ** yearsSinceAdj;
      else factor = 1.0;

      const itemTax = amt * factor;
      otherTaxesT += itemTax;
      addTo(otherTaxesBreakdown, name, itemTax);
    }
  }

  // 6. Income sources
  let taxableIncomeSources = 0.0;
  let ssBenefits = 0.0;
  let nontaxableIncome = 0.0;
  const incomeBreakdown: Record<string, number> = {};

  // Dedicated Social Security calculation
  if (ssData !== null) {
    const uReceiving = pyBool(get(ssData, 'user_receiving', false));
    const uFutureEntitled = pyBool(get(ssData, 'user_future_entitled', get(ssData, 'user_entitled', true)));
    const uEntitled = uReceiving || uFutureEntitled;
    const spReceiving = isMarried ? pyBool(get(ssData, 'spouse_receiving', false)) : false;
    const spFutureEntitled = isMarried ? pyBool(get(ssData, 'spouse_future_entitled', get(ssData, 'spouse_entitled', false))) : false;
    const spEntitled = (spReceiving || spFutureEntitled) && isMarried;

    const uStart = pyInt(get(ssData, 'user_start_age', 67));
    const spStart = pyInt(get(ssData, 'spouse_start_age', 67));

    let uAmt = pyFloat(get(ssData, 'user_amount', 2500.0));
    if (get(ssData, 'user_freq', 'monthly') === 'monthly') uAmt *= 12.0;
    const uSsInf = uEntitled ? uAmt * inflPow(t) : 0.0;

    let spAmt = pyFloat(get(ssData, 'spouse_amount', 0.0));
    if (get(ssData, 'spouse_freq', 'monthly') === 'monthly') spAmt *= 12.0;
    const spSsInf = spEntitled ? spAmt * inflPow(t) : 0.0;

    const uSsActive = userAlive && (uReceiving || (uFutureEntitled && userAgeT >= uStart));
    const spSsActive = spouseAlive && (spReceiving || (spFutureEntitled && (spouseAgeT as number) >= spStart));

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
      else if (uSsInf > 0.0 && spouseAgeT !== null && spouseAgeT >= 60) spSsT = uSsInf;
    } else if (uSsActive) {
      uSsT = uSsInf;
    } else if (spSsActive) {
      spSsT = spSsInf;
    }

    if (uSsT > 0.0) {
      ssBenefits += uSsT;
      addTo(incomeBreakdown, 'Your Social Security', uSsT);
    }
    if (spSsT > 0.0) {
      ssBenefits += spSsT;
      addTo(incomeBreakdown, "Spouse's Social Security", spSsT);
    }
  }

  for (const item of incomeSourcesList) {
    const name = get(item, 'name') || 'Income Stream';
    const freq = get(item, 'frequency', 'monthly');
    const rawAmt = pyFloat(get(item, 'amount', 0.0));
    const startAge = resolve(get(item, 'start_age_type', 'retirement'), get(item, 'start_age_specified', 65));
    const endAge = resolve(get(item, 'end_age_type', 'death'), get(item, 'end_age_specified', 90));
    const isOneTime = freq === 'one_time' || freq === 'one-time';
    const multiplier = calculateIncomeBenefitMultiplier(item, userAgeT, userAgeDeath, spouseAgeT, spouseAgeDeath,
      isMarried, startAge, endAge);
    if (multiplier > 0.0) {
      const amt = freq === 'annual' || isOneTime ? rawAmt : rawAmt * 12.0;
      const factor = calculateIncomeGrowthFactor(item, t, userAge, userRetAge, isMarried, spouseAge, spouseRetAge,
        userAgeDeath, spouseAgeDeath, inflationRate, startAge);
      const itemInc = amt * factor * multiplier;
      if (pyBool(get(item, 'is_social_security', false))) ssBenefits += itemInc;
      else if (pyBool(get(item, 'subject_to_tax', true))) taxableIncomeSources += itemInc;
      else nontaxableIncome += itemInc;
      addTo(incomeBreakdown, name, itemInc);
    }
  }
  const totalIncomeSources = taxableIncomeSources + ssBenefits + nontaxableIncome;

  // 7-9. RMDs, tax computation and the withdrawal waterfall (shared kernel)
  const r = njitRmdTaxWithdraw(
    userAgeT, isMarried ? (spouseAgeT as number) : userAgeT, userAlive, spouseAlive, isMarried,
    pretaxUserPrior, pretaxSpousePrior, pretaxUserMid, pretaxSpouseMid,
    rothMid, taxableMid, hsaUserMid, hsaSpouseMid,
    userRmdStartAge, spouseRmdStartAge,
    filingStatusTCode, inflPow(t),
    totalSpendingTarget, taxableIncomeSources, ssBenefits, nontaxableIncome,
    otherTaxesT, stateTaxRate, stateSsExempt ? 1 : 0,
    hsaUserForMedical ? 1 : 0, hsaSpouseForMedical ? 1 : 0,
    taxableBasisMid, yInt, yDivOrd, yDivQual, yCgDist,
    rtwOut,
  );
  const [pretaxUserEnd, pretaxSpouseEnd, rothEnd, taxableEnd, hsaUserEnd, hsaSpouseEnd,
    userRmdT, spouseRmdT, wPretaxExtra, wTaxable, wRoth, wHsaUser, wHsaSpouse,
    finalFedTax, finalStateTax, finalPenalty, hsaPenaltyUser, hsaPenaltySpouse,
    shortfall, taxableBasisEnd, realizedCg, finalFedOrdTax, finalFedPrefTax] = r;

  const rmdT = userRmdT + spouseRmdT;

  return {
    beginning_assets: {
      pretax: pretaxUser + pretaxSpouse,
      pretax_user: pretaxUser,
      pretax_spouse: pretaxSpouse,
      roth,
      taxable,
      hsa: hsaUser + hsaSpouse,
      hsa_user: hsaUser,
      hsa_spouse: hsaSpouse,
      total: pretaxUser + pretaxSpouse + roth + taxable + hsaUser + hsaSpouse,
      taxable_basis: taxableBasisCurr,
    },
    ending_assets: {
      pretax: pretaxUserEnd + pretaxSpouseEnd,
      pretax_user: pretaxUserEnd,
      pretax_spouse: pretaxSpouseEnd,
      roth: rothEnd,
      taxable: taxableEnd,
      hsa: hsaUserEnd + hsaSpouseEnd,
      hsa_user: hsaUserEnd,
      hsa_spouse: hsaSpouseEnd,
      total: pretaxUserEnd + pretaxSpouseEnd + rothEnd + taxableEnd + hsaUserEnd + hsaSpouseEnd,
      taxable_basis: taxableBasisEnd,
    },
    contributions: {
      pretax: contribPretaxUser + contribPretaxSpouse,
      pretax_user: contribPretaxUser,
      pretax_spouse: contribPretaxSpouse,
      roth: contribRoth,
      taxable: contribTaxable,
      hsa: contribHsaUser + contribHsaSpouse,
      hsa_user: contribHsaUser,
      hsa_spouse: contribHsaSpouse,
      total: contribPretaxUser + contribPretaxSpouse + contribRoth + contribTaxable + contribHsaUser + contribHsaSpouse,
    },
    growth: {
      pretax: growthPreUser + growthPreSpouse,
      pretax_user: growthPreUser,
      pretax_spouse: growthPreSpouse,
      roth: growthRoth,
      taxable: growthTaxable,
      hsa: growthHsaUser + growthHsaSpouse,
      hsa_user: growthHsaUser,
      hsa_spouse: growthHsaSpouse,
      total: growthPreUser + growthPreSpouse + growthRoth + growthTaxable + growthHsaUser + growthHsaSpouse,
    },
    income_sources_total: totalIncomeSources,
    income_sources_breakdown: incomeBreakdown,
    investment_income: {
      interest: yInt,
      ordinary_dividends: yDivOrd,
      qualified_dividends: yDivQual,
      capital_gains_distributions: yCgDist,
      realized_capital_gains: realizedCg,
      total: yInt + yDivOrd + yDivQual + yCgDist + realizedCg,
    },
    taxes_paid: finalFedTax + finalStateTax + finalPenalty + otherTaxesT,
    tax_breakdown: {
      fed_tax: finalFedTax,
      fed_ordinary_tax: finalFedOrdTax,
      fed_ltcg_tax: finalFedPrefTax,
      state_tax: finalStateTax,
      penalty: finalPenalty,
      hsa_penalty: hsaPenaltyUser + hsaPenaltySpouse,
      other_taxes: otherTaxesT,
      other_taxes_breakdown: otherTaxesBreakdown,
    },
    desired_spending: desiredSpendingT,
    additional_spending: addSpendingT,
    additional_spending_breakdown: addSpendingBreakdown,
    withdrawals: {
      user_pretax_rmd: userRmdT,
      spouse_pretax_rmd: spouseRmdT,
      pretax_rmd: rmdT,
      pretax_extra: wPretaxExtra,
      taxable: wTaxable,
      roth: wRoth,
      hsa_user: wHsaUser,
      hsa_spouse: wHsaSpouse,
      hsa: wHsaUser + wHsaSpouse,
      total: rmdT + wPretaxExtra + wTaxable + wRoth + wHsaUser + wHsaSpouse,
    },
    life_insurance_payout: lifeInsurancePayout,
    shortfall,
  };
}

type Series = ArrayLike<number>;

/**
 * Run one path of per-year returns through simulateStep. testSpending overrides
 * desired spending (goal seeking) and scales survivor spending in proportion.
 */
export function runSimulationPath(
  inputs: SimInputs, returnsPretax: Series, returnsRoth: Series, returnsTaxable: Series, returnsHsa: Series,
  testSpending: number | null = null, returnsPretaxSpouse: Series | null = null, returnsHsaSpouse: Series | null = null,
): StepResult[] {
  const isMarried = inputs.is_married;
  let pretaxUser = get(inputs.pretax_data, 'present_balance', 0.0);
  let pretaxSpouse = isMarried ? get(inputs.spouse_pretax_data, 'present_balance', 0.0) : 0.0;
  let roth = get(inputs.roth_data, 'present_balance', 0.0);
  let taxable = get(inputs.taxable_data, 'present_balance', 0.0);
  let hsaUser = get(inputs.hsa_data, 'present_balance', 0.0);
  let hsaSpouse = isMarried ? get(inputs.spouse_hsa_data, 'present_balance', 0.0) : 0.0;

  const rPreSpouse = returnsPretaxSpouse ?? returnsPretax;
  const rHsaSpouse = returnsHsaSpouse ?? returnsHsa;

  const desiredSpending = testSpending !== null ? testSpending : inputs.desired_spending;
  let survivorSpending = inputs.survivor_spending;
  if (testSpending !== null && inputs.desired_spending > 0) {
    survivorSpending = inputs.survivor_spending * (testSpending / inputs.desired_spending);
  }

  const routing = getLifeInsuranceRouting(inputs as unknown as Dict);

  const taxData: Dict = get(inputs, 'taxable_data', {});
  const divYield = pyFloat(get(taxData, 'dividend_yield', 2.0));
  const qualPct = pyFloat(get(taxData, 'qualified_dividend_pct', 85.0));
  const intYield = pyFloat(get(taxData, 'interest_yield', 0.0));
  const cgDistRate = pyFloat(get(taxData, 'capital_gains_dist_rate', 0.5));
  const costBasisRatio = pyFloat(get(taxData, 'cost_basis_ratio', 70.0));
  let taxableBasis = 'initial_cost_basis' in taxData
    ? pyFloat(taxData.initial_cost_basis)
    : Math.max(0.0, taxable) * (costBasisRatio / 100.0);

  const { user_age: userAge, spouse_age: spouseAge, current_year: currentYear } = inputs;
  const contrib = (t: number, d: Dict) => getContributionsForYear(t, userAge, isMarried, spouseAge, currentYear, d);

  const results: StepResult[] = [];
  for (let t = 0; t < inputs.total_years; t++) {
    const res = simulateStep({
      t,
      user_age: userAge,
      is_married: isMarried,
      spouse_age: spouseAge,
      user_age_death: inputs.user_age_death,
      spouse_age_death: inputs.spouse_age_death,
      filing_status: inputs.filing_status,
      desired_spending_start_age: inputs.desired_spending_start_age,
      desired_spending: desiredSpending,
      survivor_spending: survivorSpending,
      adjust_spending_inflation: inputs.adjust_spending_inflation,
      inflation_rate: inputs.inflation_rate,
      additional_spending_list: inputs.additional_spending,
      income_sources_list: inputs.income_sources,
      pretax_user: pretaxUser,
      pretax_spouse: pretaxSpouse,
      roth,
      taxable,
      hsa_user: hsaUser,
      hsa_user_for_medical: inputs.hsa_for_medical,
      r_pretax_user: returnsPretax[t],
      r_pretax_spouse: rPreSpouse[t],
      r_roth: returnsRoth[t],
      r_taxable: returnsTaxable[t],
      r_hsa_user: returnsHsa[t],
      contrib_pretax_user: contrib(t, inputs.pretax_data),
      contrib_pretax_spouse: isMarried ? contrib(t, inputs.spouse_pretax_data) : 0.0,
      contrib_roth: contrib(t, inputs.roth_data),
      contrib_taxable: contrib(t, inputs.taxable_data),
      contrib_hsa_user: contrib(t, inputs.hsa_data),
      user_rmd_start_age: inputs.user_rmd_start_age,
      spouse_rmd_start_age: inputs.spouse_rmd_start_age,
      social_security_data: get(inputs, 'social_security', {}),
      state_tax_rate: get(inputs, 'state_tax_rate', 0.0),
      state_ss_exempt: get(inputs, 'state_ss_exempt', true),
      other_taxes_list: get(inputs, 'other_taxes', []),
      hsa_spouse: hsaSpouse,
      hsa_spouse_for_medical: get(inputs, 'spouse_hsa_for_medical', true),
      r_hsa_spouse: rHsaSpouse[t],
      contrib_hsa_spouse: isMarried ? contrib(t, inputs.spouse_hsa_data) : 0.0,
      user_ret_age: get(inputs, 'user_ret_age', 65),
      spouse_ret_age: get(inputs, 'spouse_ret_age', 65),
      life_insurance_payout: t === routing.taxable_deposit_t ? routing.taxable_deposit_amt : 0.0,
      taxable_dividend_yield: divYield,
      taxable_qualified_dividend_pct: qualPct,
      taxable_interest_yield: intYield,
      taxable_capital_gains_dist_rate: cgDistRate,
      taxable_cost_basis_ratio: costBasisRatio,
      taxable_cost_basis: taxableBasis,
      is_community_property: get(inputs, 'is_community_property', false),
    });
    results.push(res);
    const end = res.ending_assets;
    pretaxUser = end.pretax_user;
    pretaxSpouse = end.pretax_spouse;
    roth = end.roth;
    taxable = end.taxable;
    hsaUser = end.hsa_user;
    hsaSpouse = end.hsa_spouse;
    taxableBasis = get(end, 'taxable_basis', 0.0);
  }

  const terminal = routing.terminal_life_ins_estate;
  if (results.length && terminal > 0.0) {
    const last = results[results.length - 1].ending_assets;
    last.terminal_life_insurance = terminal;
    last.total = last.total + terminal;
  }
  return results;
}

/** Python's f"{x:,.0f}". */
function fmtCommas0(x: number): string {
  const r = pyRound(x, 0);
  const s = Math.abs(r).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (r < 0 || Object.is(r, -0) ? '-' : '') + s;
}

/** Mean-return series for each bucket, as run_deterministic and binary_search use. */
export function meanReturns(inputs: SimInputs) {
  const m = (d: Dict) => get(d, 'return_mean', 6.0) / 100.0;
  const pretax = m(inputs.pretax_data);
  const hsa = m(inputs.hsa_data);
  return {
    pretax,
    pretaxSpouse: inputs.is_married ? m(inputs.spouse_pretax_data) : pretax,
    roth: m(inputs.roth_data),
    taxable: m(inputs.taxable_data),
    hsa,
    hsaSpouse: inputs.is_married ? m(inputs.spouse_hsa_data) : hsa,
  };
}

/** Year-by-year projection at each account's mean return, formatted for the results tables. */
export function runDeterministic(plan: Dict): Dict[] {
  const inputs = extractSimInputs(plan);
  const years = inputs.total_years;
  const m = meanReturns(inputs);
  const series = (v: number) => new Array<number>(years).fill(v);

  const path = runSimulationPath(inputs, series(m.pretax), series(m.roth), series(m.taxable), series(m.hsa),
    null, series(m.pretaxSpouse), series(m.hsaSpouse));

  const routing = getLifeInsuranceRouting(inputs as unknown as Dict);
  const { taxable_deposit_t: depositT, taxable_deposit_amt: depositAmt, terminal_life_ins_estate: terminal } = routing;

  const ss: Dict = get(inputs, 'social_security', {});
  const married = pyBool(get(inputs, 'is_married'));
  const uReceiving = pyBool(get(ss, 'user_receiving', false));
  const uFutureEntitled = pyBool(get(ss, 'user_future_entitled', get(ss, 'user_entitled', true)));
  const uStartAge = pyInt(get(ss, 'user_start_age', 67));
  const spReceiving = married ? pyBool(get(ss, 'spouse_receiving', false)) : false;
  const spFutureEntitled = married ? pyBool(get(ss, 'spouse_future_entitled', get(ss, 'spouse_entitled', false))) : false;
  const spStartAge = married ? pyInt(get(ss, 'spouse_start_age', 67)) : 67;

  const rows: Dict[] = [];
  for (let t = 0; t < years; t++) {
    const res = path[t];
    const userAgeT = inputs.user_age + t;
    const spouseAgeT = inputs.is_married ? inputs.spouse_age + t : null;
    const userAlive = userAgeT <= inputs.user_age_death;
    const spouseAlive = inputs.is_married && (spouseAgeT as number) <= inputs.spouse_age_death;
    if (!userAlive && !spouseAlive) continue;

    const milestones: string[] = [];
    if (userAlive && userAgeT === inputs.user_ret_age) milestones.push(`You Retire (${userAgeT})`);
    if (spouseAlive && spouseAgeT === inputs.spouse_ret_age) milestones.push(`Spouse Retires (${spouseAgeT})`);
    if (userAlive && uFutureEntitled && !uReceiving && userAgeT === uStartAge) milestones.push(`You Claim SS (${userAgeT})`);
    if (spouseAlive && spFutureEntitled && !spReceiving && married && spouseAgeT === spStartAge) {
      milestones.push(`Spouse Claims SS (${spouseAgeT})`);
    }
    if (userAlive && userAgeT === inputs.user_rmd_start_age) milestones.push(`Your RMDs Start (${userAgeT})`);
    if (spouseAlive && spouseAgeT === inputs.spouse_rmd_start_age) milestones.push(`Spouse RMDs Start (${spouseAgeT})`);
    if (userAlive && userAgeT === inputs.user_age_death) milestones.push(`Your Final Year (${userAgeT})`);
    if (spouseAlive && spouseAgeT === inputs.spouse_age_death) milestones.push(`Spouse Final Year (${spouseAgeT})`);
    if (t === depositT && depositAmt > 0) {
      if (userAlive && !spouseAlive) milestones.push(`Life Insurance Payout from Spouse Policy (+$${fmtCommas0(depositAmt)})`);
      else if (spouseAlive && !userAlive) milestones.push(`Life Insurance Payout to Spouse (+$${fmtCommas0(depositAmt)})`);
    }
    if (t === years - 1 && terminal > 0) milestones.push(`Life Insurance Payout to Estate / Heirs (+$${fmtCommas0(terminal)})`);

    rows.push({
      year_index: t,
      year: inputs.current_year + t,
      user_age: userAgeT,
      spouse_age: inputs.is_married ? spouseAgeT : null,
      user_alive: userAlive,
      spouse_alive: spouseAlive,
      is_spending_active: userAgeT >= inputs.desired_spending_start_age,
      desired_spending_start_age: inputs.desired_spending_start_age,
      milestones,
      beg_assets: res.beginning_assets,
      contribs: res.contributions,
      growth: res.growth,
      income: res.income_sources_total,
      income_breakdown: res.income_sources_breakdown,
      investment_income: get(res, 'investment_income', {}),
      taxes: res.taxes_paid,
      tax_breakdown: get(res, 'tax_breakdown', {}),
      desired_spending: res.desired_spending,
      additional_spending: res.additional_spending,
      additional_spending_breakdown: res.additional_spending_breakdown,
      ending_assets: res.ending_assets,
      withdrawals: res.withdrawals,
      shortfall: get(res, 'shortfall', 0.0),
    });
  }
  return rows;
}
