// Monte Carlo path kernel: njit_simulate_path / njit_simulate_all_paths (core/runs.py)
// over typed arrays. One call simulates one path of per-year returns; the worker pool
// (C4) generates returns path by path, so no runs x years matrices are needed.
import {
  INH_PRE_SPOUSE, INH_PRE_USER, INH_ROTH_SPOUSE, INH_ROTH_USER, type InheritedAccounts, type InheritedLedger,
  inheritedLedger, ledgerRequired, ledgerSettle, ledgerTotals, ledgerTransfer, resetLedger,
} from './inherited';
import type { NumbaInputs, SimInputs } from './inputs';
import { njitRmdTaxWithdraw, njitSpousalRollover, RTW_LEN } from './tax';

/** Everything the kernel needs that is fixed for a plan (and a test-spending / inflation variant). */
export interface KernelParams {
  totalYears: number;
  userAge: number;
  isMarried: boolean;
  spouseAge: number;
  userAgeDeath: number;
  spouseAgeDeath: number;
  filingStatusCode: number;
  desiredSpendingStartAge: number;
  desiredSpending: number;
  survivorSpending: number;
  adjustSpendingInflation: boolean;
  inflationRate: number;
  hsaUserForMedicalCode: number;
  hsaSpouseForMedicalCode: number;
  userRmdStartAge: number;
  spouseRmdStartAge: number;
  pretaxUserInit: number;
  pretaxSpouseInit: number;
  rothInit: number;
  taxableInit: number;
  hsaUserInit: number;
  hsaSpouseInit: number;
  cPreUser: Float64Array;
  cPreSpouse: Float64Array;
  cRoth: Float64Array;
  cTax: Float64Array;
  cHsaUser: Float64Array;
  cHsaSpouse: Float64Array;
  addSpending: Float64Array;
  incTaxable: Float64Array;
  incSs: Float64Array;
  incNontaxable: Float64Array;
  stateTaxRate: number;
  stateSsExemptCode: number;
  otherTaxes: Float64Array;
  /** Per-year inflation factors; null means (1 + inflationRate/100)^t. */
  infFactors: Float64Array | null;
  taxableDepositT: number;
  taxableDepositAmt: number;
  terminalLifeInsEstate: number;
  taxableDivYield: number;
  taxableQualPct: number;
  taxableIntYield: number;
  taxableCgDistRate: number;
  taxableBasisInit: number;
  isCommunityPropertyCode: number;
  inherited: InheritedAccounts;
}

const f64 = (a: ArrayLike<number>) => (a instanceof Float64Array ? a : Float64Array.from(a));

/** Kernel parameters from extractSimInputs + prepareNumbaInputs, as generate_runs passes them. */
export function kernelParams(inputs: SimInputs, nb: NumbaInputs): KernelParams {
  return {
    totalYears: inputs.total_years,
    userAge: inputs.user_age,
    isMarried: inputs.is_married,
    spouseAge: inputs.spouse_age,
    userAgeDeath: inputs.user_age_death,
    spouseAgeDeath: inputs.spouse_age_death,
    filingStatusCode: nb.filing_status_code,
    desiredSpendingStartAge: inputs.desired_spending_start_age,
    desiredSpending: nb.desired_spending,
    survivorSpending: nb.survivor_spending,
    adjustSpendingInflation: inputs.adjust_spending_inflation,
    inflationRate: inputs.inflation_rate,
    hsaUserForMedicalCode: nb.hsa_user_for_medical_code,
    hsaSpouseForMedicalCode: nb.hsa_spouse_for_medical_code,
    userRmdStartAge: nb.user_rmd_start_age,
    spouseRmdStartAge: nb.spouse_rmd_start_age,
    pretaxUserInit: nb.pretax_user_init,
    pretaxSpouseInit: nb.pretax_spouse_init,
    rothInit: nb.roth_init,
    taxableInit: nb.taxable_init,
    hsaUserInit: nb.hsa_user_init,
    hsaSpouseInit: nb.hsa_spouse_init,
    cPreUser: f64(nb.c_pre_user),
    cPreSpouse: f64(nb.c_pre_spouse),
    cRoth: f64(nb.c_roth),
    cTax: f64(nb.c_tax),
    cHsaUser: f64(nb.c_hsa_user),
    cHsaSpouse: f64(nb.c_hsa_spouse),
    addSpending: f64(nb.add_spending_arr),
    incTaxable: f64(nb.inc_taxable_arr),
    incSs: f64(nb.inc_ss_arr),
    incNontaxable: f64(nb.inc_nontaxable_arr),
    stateTaxRate: nb.state_tax_rate,
    stateSsExemptCode: nb.state_ss_exempt_code,
    otherTaxes: f64(nb.other_taxes_arr),
    infFactors: f64(nb.inf_factors),
    taxableDepositT: nb.taxable_deposit_t,
    taxableDepositAmt: nb.taxable_deposit_amt,
    terminalLifeInsEstate: nb.terminal_life_ins_estate,
    taxableDivYield: nb.taxable_div_yield,
    taxableQualPct: nb.taxable_qual_pct,
    taxableIntYield: nb.taxable_int_yield,
    taxableCgDistRate: nb.taxable_cg_dist_rate,
    taxableBasisInit: nb.taxable_basis_init,
    isCommunityPropertyCode: nb.is_community_property_code,
    inherited: { bucket: f64(nb.inh_acct_bucket), balance: f64(nb.inh_acct_balance), frac: f64(nb.inh_acct_frac) },
  };
}

/** One path's returns for each bucket, indexed by year. */
export interface PathReturns {
  preUser: ArrayLike<number>;
  preSpouse: ArrayLike<number>;
  roth: ArrayLike<number>;
  taxable: ArrayLike<number>;
  hsaUser: ArrayLike<number>;
  hsaSpouse: ArrayLike<number>;
  inhPreUser?: ArrayLike<number>;
  inhPreSpouse?: ArrayLike<number>;
  inhRothUser?: ArrayLike<number>;
  inhRothSpouse?: ArrayLike<number>;
}

export interface PathResult {
  /** Ending portfolio plus any terminal life-insurance payout. */
  terminalEstate: number;
  /** 1 when the plan never had a shortfall and ended non-negative, else 0. */
  success: number;
}

const rtw = new Float64Array(RTW_LEN);
const inhBal = new Float64Array(4);
const inhRet = new Float64Array(4);
const inhReq = new Float64Array(4);
const inhEnd = new Float64Array(4);
let ledger: InheritedLedger | null = null;

/**
 * Simulate one path. When `trajectory` is given (length totalYears + 1) it receives the
 * start-of-plan total, each year's ending total, and finally the terminal estate.
 * The returned object is reused between calls.
 */
const result: PathResult = { terminalEstate: 0, success: 0 };
export function simulatePath(p: KernelParams, r: PathReturns, trajectory: Float64Array | null = null): PathResult {
  const { totalYears, userAge, isMarried, spouseAge, userAgeDeath, spouseAgeDeath } = p;
  let pretaxUser = p.pretaxUserInit;
  let pretaxSpouse = p.pretaxSpouseInit;
  let roth = p.rothInit;
  let taxable = p.taxableInit;
  let hsaUser = p.hsaUserInit;
  let hsaSpouse = p.hsaSpouseInit;
  let taxableBasis = p.taxableBasisInit >= 0.0 ? p.taxableBasisInit : Math.max(0.0, p.taxableInit) * 0.70;
  if (ledger === null || ledger.acc !== p.inherited) ledger = inheritedLedger(p.inherited, totalYears);
  else resetLedger(ledger);
  ledgerTotals(ledger, inhBal);
  let inhPreUser = inhBal[INH_PRE_USER];
  let inhPreSpouse = inhBal[INH_PRE_SPOUSE];
  let inhRothUser = inhBal[INH_ROTH_USER];
  let inhRothSpouse = inhBal[INH_ROTH_SPOUSE];

  let everDepleted = false;
  if (trajectory) trajectory[0] = pretaxUser + pretaxSpouse + roth + taxable + hsaUser + hsaSpouse + inhPreUser + inhPreSpouse + inhRothUser + inhRothSpouse;

  const tFirstDeath = isMarried ? Math.min(userAgeDeath - userAge, spouseAgeDeath - spouseAge) : userAgeDeath - userAge;
  const intYield = p.taxableIntYield / 100.0;
  const divYield = p.taxableDivYield / 100.0;
  const qualPct = p.taxableQualPct / 100.0;
  const cgDistRate = p.taxableCgDistRate / 100.0;

  for (let t = 0; t < totalYears; t++) {
    const userAgeT = userAge + t;
    const spouseAgeT = isMarried ? spouseAge + t : userAgeT;
    const userAlive = userAgeT <= userAgeDeath;
    const spouseAlive = isMarried && spouseAgeT <= spouseAgeDeath;

    if (!userAlive && !spouseAlive) {
      pretaxUser = pretaxSpouse = roth = taxable = taxableBasis = hsaUser = hsaSpouse = inhPreUser = inhPreSpouse = inhRothUser = inhRothSpouse = 0.0;
      if (trajectory) trajectory[t + 1] = 0.0;
      continue;
    }

    const ro = njitSpousalRollover(
      t, tFirstDeath, isMarried, userAlive, spouseAlive, p.filingStatusCode,
      pretaxUser, pretaxSpouse, hsaUser, hsaSpouse,
      p.cPreUser[t], p.cPreSpouse[t], p.cHsaUser[t], p.cHsaSpouse[t],
    );
    const filingStatusT = ro[0];
    pretaxUser = ro[1];
    pretaxSpouse = ro[2];
    hsaUser = ro[3];
    hsaSpouse = ro[4];
    const cPreUserT = ro[5];
    const cPreSpouseT = ro[6];
    const cHsaUserT = ro[7];
    const cHsaSpouseT = ro[8];

    if (isMarried && t > tFirstDeath) {
      ledgerTransfer(ledger, userAlive, spouseAlive);
      ledgerTotals(ledger, inhBal);
      inhPreUser = inhBal[INH_PRE_USER];
      inhPreSpouse = inhBal[INH_PRE_SPOUSE];
      inhRothUser = inhBal[INH_ROTH_USER];
      inhRothSpouse = inhBal[INH_ROTH_SPOUSE];
    }

    if (isMarried && t === tFirstDeath && taxable > 0.0) {
      taxableBasis = p.isCommunityPropertyCode !== 0
        ? Math.max(0.0, taxable)
        : 0.5 * taxableBasis + 0.5 * Math.max(0.0, taxable);
    }

    if (t === p.taxableDepositT && p.taxableDepositAmt > 0.0) {
      taxable += p.taxableDepositAmt;
      taxableBasis += p.taxableDepositAmt;
    }

    const pretaxUserPrior = Math.max(0.0, pretaxUser);
    const pretaxSpousePrior = isMarried ? Math.max(0.0, pretaxSpouse) : 0.0;
    const inhPreUserPrior = Math.max(0.0, inhPreUser);
    const inhPreSpousePrior = isMarried ? Math.max(0.0, inhPreSpouse) : 0.0;
    const inhRothUserPrior = Math.max(0.0, inhRothUser);
    const inhRothSpousePrior = isMarried ? Math.max(0.0, inhRothSpouse) : 0.0;

    const pretaxUserBefore = Math.max(0.0, pretaxUser + cPreUserT);
    const pretaxSpouseBefore = isMarried ? Math.max(0.0, pretaxSpouse + cPreSpouseT) : 0.0;
    const rothBefore = Math.max(0.0, roth + p.cRoth[t]);
    const taxableBefore = taxable + p.cTax[t];
    const taxableBasisBefore = taxableBasis + p.cTax[t];
    const hsaUserBefore = Math.max(0.0, hsaUser + cHsaUserT);
    const hsaSpouseBefore = isMarried ? Math.max(0.0, hsaSpouse + cHsaSpouseT) : 0.0;

    const rInhPreU = r.inhPreUser ? r.inhPreUser[t] : (r.preUser ? r.preUser[t] : 0.0);
    const rInhPreS = r.inhPreSpouse ? r.inhPreSpouse[t] : (r.preSpouse ? r.preSpouse[t] : 0.0);
    const rInhRothU = r.inhRothUser ? r.inhRothUser[t] : (r.roth ? r.roth[t] : 0.0);
    const rInhRothS = r.inhRothSpouse ? r.inhRothSpouse[t] : (r.roth ? r.roth[t] : 0.0);

    const pretaxUserMid = pretaxUserBefore + pretaxUserBefore * r.preUser[t];
    const pretaxSpouseMid = pretaxSpouseBefore + (isMarried ? pretaxSpouseBefore * r.preSpouse[t] : 0.0);
    const rothMid = rothBefore + rothBefore * r.roth[t];
    const taxableMid = taxableBefore + (taxableBefore > 0.0 ? taxableBefore * r.taxable[t] : 0.0);
    const hsaUserMid = hsaUserBefore + hsaUserBefore * r.hsaUser[t];
    const hsaSpouseMid = hsaSpouseBefore + (isMarried ? hsaSpouseBefore * r.hsaSpouse[t] : 0.0);
    const inhPreUserMid = inhPreUserPrior + inhPreUserPrior * rInhPreU;
    const inhPreSpouseMid = inhPreSpousePrior + (isMarried ? inhPreSpousePrior * rInhPreS : 0.0);
    const inhRothUserMid = inhRothUserPrior + inhRothUserPrior * rInhRothU;
    const inhRothSpouseMid = inhRothSpousePrior + (isMarried ? inhRothSpousePrior * rInhRothS : 0.0);

    let yInt = 0.0;
    let totDiv = 0.0;
    let yDivQual = 0.0;
    let yDivOrd = 0.0;
    let yCgDist = 0.0;
    if (taxableBefore > 0.0) {
      yInt = Math.max(0.0, taxableBefore * intYield);
      totDiv = Math.max(0.0, taxableBefore * divYield);
      yDivQual = totDiv * qualPct;
      yDivOrd = totDiv - yDivQual;
      yCgDist = Math.max(0.0, taxableBefore * cgDistRate);
    }
    const taxableBasisMid = taxableBasisBefore + yInt + totDiv + yCgDist;

    const infFactor = p.infFactors !== null ? p.infFactors[t] : (1.0 + p.inflationRate / 100.0) ** t;

    let desiredSpendingT = 0.0;
    if (userAgeT >= p.desiredSpendingStartAge) {
      const baseSpending = isMarried && t > tFirstDeath ? p.survivorSpending : p.desiredSpending;
      desiredSpendingT = baseSpending * (p.adjustSpendingInflation ? infFactor : 1.0);
    }
    const totalSpendingTarget = desiredSpendingT + p.addSpending[t];

    inhRet[INH_PRE_USER] = rInhPreU;
    inhRet[INH_PRE_SPOUSE] = rInhPreS;
    inhRet[INH_ROTH_USER] = rInhRothU;
    inhRet[INH_ROTH_SPOUSE] = rInhRothS;
    ledgerRequired(ledger, t, inhRet, userAlive, spouseAlive, inhReq);

    njitRmdTaxWithdraw(
      userAgeT, spouseAgeT, userAlive, spouseAlive, isMarried,
      pretaxUserPrior, pretaxSpousePrior, pretaxUserMid, pretaxSpouseMid,
      rothMid, taxableMid, hsaUserMid, hsaSpouseMid,
      p.userRmdStartAge, p.spouseRmdStartAge,
      filingStatusT, infFactor,
      totalSpendingTarget, p.incTaxable[t], p.incSs[t], p.incNontaxable[t],
      p.otherTaxes[t], p.stateTaxRate, p.stateSsExemptCode,
      p.hsaUserForMedicalCode, p.hsaSpouseForMedicalCode,
      taxableBasisMid, yInt, yDivOrd, yDivQual, yCgDist,
      rtw,
      inhPreUserPrior, inhPreSpousePrior, inhPreUserMid, inhPreSpouseMid,
      inhRothUserPrior, inhRothSpousePrior, inhRothUserMid, inhRothSpouseMid,
      inhReq[INH_PRE_USER], inhReq[INH_PRE_SPOUSE], inhReq[INH_ROTH_USER], inhReq[INH_ROTH_SPOUSE],
    );

    if (rtw[18] > 0.0) everDepleted = true;

    pretaxUser = rtw[0];
    pretaxSpouse = rtw[1];
    roth = rtw[2];
    taxable = rtw[3];
    hsaUser = rtw[4];
    hsaSpouse = rtw[5];
    taxableBasis = rtw[19];
    inhPreUser = rtw[23];
    inhPreSpouse = rtw[24];
    inhRothUser = rtw[25];
    inhRothSpouse = rtw[26];
    inhEnd[INH_PRE_USER] = inhPreUser;
    inhEnd[INH_PRE_SPOUSE] = inhPreSpouse;
    inhEnd[INH_ROTH_USER] = inhRothUser;
    inhEnd[INH_ROTH_SPOUSE] = inhRothSpouse;
    ledgerSettle(ledger, inhEnd);

    if (trajectory) trajectory[t + 1] = pretaxUser + pretaxSpouse + roth + taxable + hsaUser + hsaSpouse + inhPreUser + inhPreSpouse + inhRothUser + inhRothSpouse;
  }

  const endingPortfolio = pretaxUser + pretaxSpouse + roth + taxable + hsaUser + hsaSpouse + inhPreUser + inhPreSpouse + inhRothUser + inhRothSpouse;
  const terminalEstate = endingPortfolio + p.terminalLifeInsEstate;
  if (trajectory) trajectory[totalYears] = terminalEstate;
  result.terminalEstate = terminalEstate;
  result.success = !everDepleted && endingPortfolio >= 0.0 ? 1.0 : 0.0;
  return result;
}

/** Return matrices for many paths: each bucket is a runs x years row-major Float64Array. */
export interface ReturnMatrices {
  runs: number;
  years: number;
  preUser: Float64Array;
  preSpouse: Float64Array;
  roth: Float64Array;
  taxable: Float64Array;
  hsaUser: Float64Array;
  hsaSpouse: Float64Array;
  inhPreUser?: Float64Array;
  inhPreSpouse?: Float64Array;
  inhRothUser?: Float64Array;
  inhRothSpouse?: Float64Array;
}

/**
 * njit_simulate_all_paths: run every path in `m`, filling endingWealths and
 * successFlags (length runs) and, if given, trajectories (runs x (years + 1), row-major).
 */
export function simulateAllPaths(
  p: KernelParams, m: ReturnMatrices,
  endingWealths: Float64Array, successFlags: Float64Array, trajectories: Float64Array | null = null,
): void {
  const { runs, years } = m;
  for (let i = 0; i < runs; i++) {
    const a = i * years;
    const b = a + years;
    const r: PathReturns = {
      preUser: m.preUser.subarray(a, b),
      preSpouse: m.preSpouse.subarray(a, b),
      roth: m.roth.subarray(a, b),
      taxable: m.taxable.subarray(a, b),
      hsaUser: m.hsaUser.subarray(a, b),
      hsaSpouse: m.hsaSpouse.subarray(a, b),
      inhPreUser: m.inhPreUser ? m.inhPreUser.subarray(a, b) : undefined,
      inhPreSpouse: m.inhPreSpouse ? m.inhPreSpouse.subarray(a, b) : undefined,
      inhRothUser: m.inhRothUser ? m.inhRothUser.subarray(a, b) : undefined,
      inhRothSpouse: m.inhRothSpouse ? m.inhRothSpouse.subarray(a, b) : undefined,
    };
    const traj = trajectories ? trajectories.subarray(i * (years + 1), (i + 1) * (years + 1)) : null;
    const res = simulatePath(p, r, traj);
    endingWealths[i] = res.terminalEstate;
    successFlags[i] = res.success;
  }
}
