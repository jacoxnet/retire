// Federal/state tax helpers and the RMD/tax/withdrawal waterfall shared by the
// deterministic engine and the Monte Carlo kernel (core/runs.py).
import {
  LTCG_RATES_ARR,
  LTCG_THRESHOLDS_HOH_ARR,
  LTCG_THRESHOLDS_JOINT_ARR,
  LTCG_THRESHOLDS_SINGLE_ARR,
  RMD_TABLE_ARR,
  STD_DEDUCTION_2026_HOH,
  STD_DEDUCTION_2026_JOINT,
  STD_DEDUCTION_2026_SINGLE,
  TAX_RATES_ARR,
  THRESHOLDS_HOH_ARR,
  THRESHOLDS_JOINT_ARR,
  THRESHOLDS_SINGLE_ARR,
} from './constants';

type Arr = ArrayLike<number>;

// ---------------------------------------------------------------------------
// Plain helpers (calculate_tax, calculate_preferential_tax, calculate_taxable_ss)

export function calculateTax(taxableIncome: number, thresholds: Arr, rates: Arr): number {
  if (taxableIncome <= 0) return 0.0;
  let tax = 0.0;
  let prev = 0;
  for (let i = 0; i < thresholds.length; i++) {
    const threshold = thresholds[i];
    const rate = rates[i];
    if (taxableIncome > threshold) {
      tax += (threshold - prev) * rate;
      prev = threshold;
    } else {
      tax += (taxableIncome - prev) * rate;
      return tax;
    }
  }
  tax += (taxableIncome - prev) * rates[rates.length - 1];
  return tax;
}

/** Tax on qualified dividends / LTCG stacked on top of ordinary taxable income. */
export function calculatePreferentialTax(taxableOrd: number, taxablePref: number, thresholds: Arr, rates: Arr): number {
  if (taxablePref <= 0.0) return 0.0;
  const yTot = taxableOrd + taxablePref;
  const t0 = thresholds[0];
  const t1 = thresholds[1];
  const amt1 = Math.max(0.0, Math.min(yTot, t1) - Math.max(taxableOrd, t0));
  let tax = amt1 * rates[1];
  const amt2 = Math.max(0.0, yTot - Math.max(taxableOrd, t1));
  tax += amt2 * rates[2];
  return tax;
}

function taxableSs(agiExSs: number, ssBenefits: number, joint: boolean): number {
  if (ssBenefits <= 0.0) return 0.0;
  const baseLimit = joint ? 32000.0 : 25000.0;
  const stepLimit = joint ? 12000.0 : 9000.0;
  const line2 = 0.5 * ssBenefits;
  const line7 = agiExSs + line2; // adjustments are ignored
  if (line7 <= baseLimit) return 0.0;
  const line9 = line7 - baseLimit;
  const line11 = Math.max(0.0, line9 - stepLimit);
  const line12 = Math.min(line9, stepLimit);
  const line14 = Math.min(line2, 0.5 * line12);
  const line16 = line14 + 0.85 * line11;
  return Math.min(line16, 0.85 * ssBenefits);
}

export function calculateTaxableSs(agiExSs: number, ssBenefits: number, filingStatus: string): number {
  return taxableSs(agiExSs, ssBenefits, filingStatus === 'joint' || filingStatus === 'married_filing_jointly');
}

// ---------------------------------------------------------------------------
// njit_* kernels. calculateTax already uses rates[n] for the top bracket, which is
// what njit_calculate_tax does (rates has one more entry than thresholds).

export const njitCalculateTax = calculateTax;
export const njitCalculatePreferentialTax = calculatePreferentialTax;

export function njitCalculateTaxableSs(agiExSs: number, ssBenefits: number, filingStatusCode: number): number {
  return taxableSs(agiExSs, ssBenefits, filingStatusCode === 1);
}

/** Returns [ord_tax, pref_tax, total]. */
export function njitCalcFedTaxDual(
  totOrdIncome: number, prefIncome: number, stdDeduction: number,
  ordThresholds: Arr, ordRates: Arr, ltcgThresholds: Arr, ltcgRates: Arr,
): [number, number, number] {
  let taxableOrd: number;
  let taxablePref: number;
  if (totOrdIncome >= stdDeduction) {
    taxableOrd = totOrdIncome - stdDeduction;
    taxablePref = prefIncome;
  } else {
    taxableOrd = 0.0;
    taxablePref = Math.max(0.0, prefIncome - (stdDeduction - totOrdIncome));
  }
  const ordTax = calculateTax(taxableOrd, ordThresholds, ordRates);
  const prefTax = calculatePreferentialTax(taxableOrd, taxablePref, ltcgThresholds, ltcgRates);
  return [ordTax, prefTax, ordTax + prefTax];
}

/**
 * Federal and state tax with extraOrd of extra ordinary income (pretax and
 * non-medical HSA withdrawals) stacked on the base income and realized gains.
 * Returns [ord_tax, pref_tax, fed_tax, state_tax].
 */
export function njitExtraOrdinaryTaxes(
  extraOrd: number, baseAgiExSs: number, baseOrdExSs: number, realizedCg: number, curPrefIncome: number,
  ssBenefits: number, filingStatusCode: number, stdDeduction: number, thresholds: Arr, ltcgThresholds: Arr,
  stateSsExemptCode: number, stateRate: number,
): [number, number, number, number] {
  const agi = baseAgiExSs + realizedCg + extraOrd;
  const taxSs = njitCalculateTaxableSs(agi, ssBenefits, filingStatusCode);
  const totOrd = baseOrdExSs + taxSs + extraOrd;
  const [ordTax, prefTax, fedTax] = njitCalcFedTaxDual(
    totOrd, curPrefIncome, stdDeduction, thresholds, TAX_RATES_ARR, ltcgThresholds, LTCG_RATES_ARR,
  );
  const stSs = stateSsExemptCode === 1 ? 0.0 : taxSs;
  const stateTax = Math.max(0.0, agi + stSs - stdDeduction) * stateRate;
  return [ordTax, prefTax, fedTax, stateTax];
}

/**
 * Gross-up solver: the withdrawal from an ordinary-income account whose net cash
 * (after the added tax and a penRate penalty) covers the deficit.
 * Returns [withdrawal, remaining deficit].
 */
export function njitSolveOrdinaryWithdrawal(
  balance: number, penRate: number, deficit: number, extraOrd: number, penaltyBefore: number, totalBaseTax: number,
  baseAgiExSs: number, baseOrdExSs: number, realizedCg: number, curPrefIncome: number,
  ssBenefits: number, filingStatusCode: number, stdDeduction: number, thresholds: Arr, ltcgThresholds: Arr,
  stateSsExemptCode: number, stateRate: number,
): [number, number] {
  const mx = njitExtraOrdinaryTaxes(
    extraOrd + balance, baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
    ssBenefits, filingStatusCode, stdDeduction, thresholds, ltcgThresholds, stateSsExemptCode, stateRate,
  );
  const netCashMax = balance - ((mx[2] + mx[3] + penaltyBefore + penRate * balance) - totalBaseTax);
  if (netCashMax <= deficit) return [balance, deficit - netCashMax];

  let low = 0.0;
  let high = balance;
  for (let i = 0; i < 25; i++) {
    const mid = (low + high) / 2.0;
    const r = njitExtraOrdinaryTaxes(
      extraOrd + mid, baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
      ssBenefits, filingStatusCode, stdDeduction, thresholds, ltcgThresholds, stateSsExemptCode, stateRate,
    );
    const netCash = mid - ((r[2] + r[3] + penaltyBefore + penRate * mid) - totalBaseTax);
    if (netCash < deficit) low = mid;
    else high = mid;
  }
  return [high, 0.0];
}

/**
 * After the first death a married couple files single, and the survivor's pretax and
 * HSA balances absorb the decedent's. Returns
 * [filing_status_t, pretax_user, pretax_spouse, hsa_user, hsa_spouse,
 *  contrib_pretax_user, contrib_pretax_spouse, contrib_hsa_user, contrib_hsa_spouse].
 */
export function njitSpousalRollover(
  t: number, tFirstDeath: number, isMarried: boolean, userAlive: boolean, spouseAlive: boolean, filingStatusCode: number,
  pretaxUser: number, pretaxSpouse: number, hsaUser: number, hsaSpouse: number,
  contribPretaxUser: number, contribPretaxSpouse: number, contribHsaUser: number, contribHsaSpouse: number,
): [number, number, number, number, number, number, number, number, number] {
  let filingStatusT = filingStatusCode;
  if (isMarried && t > tFirstDeath) {
    filingStatusT = 0;
    if (userAlive && !spouseAlive) {
      if (pretaxSpouse > 0.0) {
        pretaxUser += pretaxSpouse;
        pretaxSpouse = 0.0;
        contribPretaxSpouse = 0.0;
      }
      if (hsaSpouse > 0.0) {
        hsaUser += hsaSpouse;
        hsaSpouse = 0.0;
        contribHsaSpouse = 0.0;
      }
    } else if (spouseAlive && !userAlive) {
      if (pretaxUser > 0.0) {
        pretaxSpouse += pretaxUser;
        pretaxUser = 0.0;
        contribPretaxUser = 0.0;
      }
      if (hsaUser > 0.0) {
        hsaSpouse += hsaUser;
        hsaUser = 0.0;
        contribHsaUser = 0.0;
      }
    }
  }
  return [filingStatusT, pretaxUser, pretaxSpouse, hsaUser, hsaSpouse,
    contribPretaxUser, contribPretaxSpouse, contribHsaUser, contribHsaSpouse];
}

// ---------------------------------------------------------------------------
// njit_rmd_tax_withdraw

/** Indices into the 23-value result of njitRmdTaxWithdraw (same order as the Python tuple). */
export const RTW = {
  pretaxUserEnd: 0, pretaxSpouseEnd: 1, rothEnd: 2, taxableEnd: 3, hsaUserEnd: 4, hsaSpouseEnd: 5,
  userRmd: 6, spouseRmd: 7,
  wPretaxExtra: 8, wTaxable: 9, wRoth: 10, wHsaUser: 11, wHsaSpouse: 12,
  fedTax: 13, stateTax: 14, penalty: 15,
  hsaPenaltyUser: 16, hsaPenaltySpouse: 17,
  shortfall: 18,
  taxableBasisEnd: 19, realizedCg: 20, fedOrdTax: 21, fedPrefTax: 22,
} as const;
export const RTW_LEN = 23;

const STEP_PRETAX_FREE = 0;
const STEP_ROTH = 1;
const STEP_HSA_USER = 2;
const STEP_HSA_SPOUSE = 3;
const STEP_PRETAX_PENALIZED = 4;

// Scratch buffers for the inflation-adjusted brackets. Each worker runs one path at a
// time, so module-level buffers are safe and avoid allocating in the hot loop.
const thrScratch = new Float64Array(6);
const ltcgScratch = new Float64Array(2);
const order = new Int32Array(5);

/**
 * One year's RMDs, taxes and deficit-funding withdrawals. The result is written to
 * `out` (length RTW_LEN) when given, otherwise a new array; see RTW for the layout.
 */
export function njitRmdTaxWithdraw(
  userAgeT: number, spouseAgeT: number, userAlive: boolean, spouseAlive: boolean, isMarried: boolean,
  pretaxUserPrior: number, pretaxSpousePrior: number, pretaxUserMid: number, pretaxSpouseMid: number,
  rothMid: number, taxableMid: number, hsaUserMid: number, hsaSpouseMid: number,
  userRmdStartAge: number, spouseRmdStartAge: number,
  filingStatusCode: number, infFactor: number,
  totalSpendingTarget: number, taxableIncomeSources: number, ssBenefits: number, nontaxableIncome: number,
  otherTaxesT: number, stateTaxRate: number, stateSsExemptCode: number,
  hsaUserForMedicalCode: number, hsaSpouseForMedicalCode: number,
  taxableBasisMid = 0.0,
  taxableYieldInterest = 0.0,
  taxableYieldDivOrd = 0.0,
  taxableYieldDivQual = 0.0,
  taxableYieldCgDist = 0.0,
  out?: Float64Array,
): Float64Array {
  const stateRate = stateTaxRate / 100.0;
  const totalIncomeSources = taxableIncomeSources + ssBenefits + nontaxableIncome;

  let userRmdT = 0.0;
  if (userAlive && userAgeT >= userRmdStartAge) {
    const divisor = userAgeT <= 150 ? RMD_TABLE_ARR[userAgeT] : 2.0;
    userRmdT = pretaxUserPrior > 0.0 ? Math.min(pretaxUserPrior / divisor, pretaxUserMid) : 0.0;
  }
  let spouseRmdT = 0.0;
  if (spouseAlive && spouseAgeT >= spouseRmdStartAge) {
    const divisor = spouseAgeT <= 150 ? RMD_TABLE_ARR[spouseAgeT] : 2.0;
    spouseRmdT = pretaxSpousePrior > 0.0 ? Math.min(pretaxSpousePrior / divisor, pretaxSpouseMid) : 0.0;
  }
  const rmdT = userRmdT + spouseRmdT;

  let baseThr: Float64Array;
  let baseLtcg: Float64Array;
  let stdDeductionT: number;
  if (filingStatusCode === 1) {
    baseThr = THRESHOLDS_JOINT_ARR;
    baseLtcg = LTCG_THRESHOLDS_JOINT_ARR;
    stdDeductionT = STD_DEDUCTION_2026_JOINT * infFactor;
  } else if (filingStatusCode === 2) {
    baseThr = THRESHOLDS_HOH_ARR;
    baseLtcg = LTCG_THRESHOLDS_HOH_ARR;
    stdDeductionT = STD_DEDUCTION_2026_HOH * infFactor;
  } else {
    baseThr = THRESHOLDS_SINGLE_ARR;
    baseLtcg = LTCG_THRESHOLDS_SINGLE_ARR;
    stdDeductionT = STD_DEDUCTION_2026_SINGLE * infFactor;
  }
  const thresholdsT = thrScratch;
  const ltcgThresholdsT = ltcgScratch;
  for (let i = 0; i < 6; i++) thresholdsT[i] = baseThr[i] * infFactor;
  ltcgThresholdsT[0] = baseLtcg[0] * infFactor;
  ltcgThresholdsT[1] = baseLtcg[1] * infFactor;

  // Investment yields breakdown
  const yOrdInv = taxableYieldInterest + taxableYieldDivOrd;
  const yPrefInv = taxableYieldDivQual + taxableYieldCgDist;

  const baseOrdExSs = taxableIncomeSources + rmdT + yOrdInv;
  const baseAgiExSs = baseOrdExSs + yPrefInv;

  // Social Security provisional income includes total AGI ex SS (including LTCG/QD)
  const baseTaxableSs = njitCalculateTaxableSs(baseAgiExSs, ssBenefits, filingStatusCode);
  const totOrdIncome = baseOrdExSs + baseTaxableSs;
  let curPrefIncome = yPrefInv;

  const [ordTax, prefTax, baseTax] = njitCalcFedTaxDual(
    totOrdIncome, curPrefIncome, stdDeductionT, thresholdsT, TAX_RATES_ARR, ltcgThresholdsT, LTCG_RATES_ARR,
  );

  const baseStSs = stateSsExemptCode === 1 ? 0.0 : baseTaxableSs;
  const baseStTaxableIncome = Math.max(0.0, baseAgiExSs + baseStSs - stdDeductionT);
  const baseStateTax = baseStTaxableIncome * stateRate;
  let totalBaseTax = baseTax + baseStateTax;

  const cashInflows = totalIncomeSources + rmdT;
  const cashOutflows = totalSpendingTarget + totalBaseTax + otherTaxesT;
  const netBase = cashInflows - cashOutflows;

  let pretaxUserEnd = pretaxUserMid - userRmdT;
  let pretaxSpouseEnd = pretaxSpouseMid - spouseRmdT;
  let rothEnd = rothMid;
  let taxableEnd = taxableMid;
  let taxableBasisEnd = taxableBasisMid;
  let hsaUserEnd = hsaUserMid;
  let hsaSpouseEnd = hsaSpouseMid;

  let wPretaxExtra = 0.0;
  let wTaxable = 0.0;
  let wRoth = 0.0;
  let wHsaUser = 0.0;
  let wHsaSpouse = 0.0;
  let finalFedTax = baseTax;
  let finalFedOrdTax = ordTax;
  let finalFedPrefTax = prefTax;
  let finalStateTax = baseStateTax;
  let finalPenalty = 0.0;
  let hsaPenaltyUser = 0.0;
  let hsaPenaltySpouse = 0.0;
  let realizedCg = 0.0;
  let shortfall = 0.0; // Numba zero-initializes this on the surplus branch

  if (netBase >= 0.0) {
    taxableEnd = taxableMid + netBase;
    taxableBasisEnd = taxableBasisMid + netBase;
  } else {
    let deficit = -netBase;

    // A. Taxable assets (with realized capital gains and gross-up)
    if (taxableEnd > 0.0 && deficit > 0.0) {
      const basisRatio = Math.min(1.0, Math.max(0.0, taxableBasisEnd / taxableEnd));
      const gainRatio = 1.0 - basisRatio;
      if (gainRatio <= 0.0001) {
        wTaxable = Math.min(deficit, taxableEnd);
        taxableEnd = taxableEnd - wTaxable;
        taxableBasisEnd = Math.max(0.0, taxableBasisEnd - wTaxable);
        deficit = deficit - wTaxable;
      } else {
        const gMax = taxableEnd * gainRatio;
        const fedTaxGmax = njitCalcFedTaxDual(
          totOrdIncome, curPrefIncome + gMax, stdDeductionT, thresholdsT, TAX_RATES_ARR, ltcgThresholdsT, LTCG_RATES_ARR,
        )[2];
        const extraFedGmax = fedTaxGmax - baseTax;
        const extraStGmax = gMax * stateRate;
        const netCashMax = taxableEnd - (extraFedGmax + extraStGmax);

        if (netCashMax <= deficit) {
          wTaxable = taxableEnd;
          realizedCg = gMax;
          taxableEnd = 0.0;
          taxableBasisEnd = 0.0;
          deficit = deficit - netCashMax;
          curPrefIncome += realizedCg;
          [finalFedOrdTax, finalFedPrefTax, finalFedTax] = njitCalcFedTaxDual(
            totOrdIncome, curPrefIncome, stdDeductionT, thresholdsT, TAX_RATES_ARR, ltcgThresholdsT, LTCG_RATES_ARR,
          );
          finalStateTax += extraStGmax;
          totalBaseTax = finalFedTax + finalStateTax;
        } else {
          let low = 0.0;
          let high = taxableEnd;
          for (let i = 0; i < 25; i++) {
            const mid = (low + high) / 2.0;
            const g = mid * gainRatio;
            const fedMid = njitCalcFedTaxDual(
              totOrdIncome, curPrefIncome + g, stdDeductionT, thresholdsT, TAX_RATES_ARR, ltcgThresholdsT, LTCG_RATES_ARR,
            )[2];
            const stMid = g * stateRate;
            const netCash = mid - ((fedMid - baseTax) + stMid);
            if (netCash < deficit) low = mid;
            else high = mid;
          }
          wTaxable = high;
          realizedCg = wTaxable * gainRatio;
          taxableBasisEnd = Math.max(0.0, taxableBasisEnd - (wTaxable * basisRatio));
          taxableEnd = Math.max(0.0, taxableEnd - wTaxable);
          curPrefIncome += realizedCg;
          [finalFedOrdTax, finalFedPrefTax, finalFedTax] = njitCalcFedTaxDual(
            totOrdIncome, curPrefIncome, stdDeductionT, thresholdsT, TAX_RATES_ARR, ltcgThresholdsT, LTCG_RATES_ARR,
          );
          finalStateTax += realizedCg * stateRate;
          totalBaseTax = finalFedTax + finalStateTax;
          deficit = 0.0;
        }
      }
    }

    // Remaining deficit is drawn in step order. Pretax is split by owner: an owner
    // under 59.5 (10% penalty) has pretax deferred until after Roth and any
    // penalty-free HSAs, but ahead of HSAs whose non-medical withdrawals would incur
    // the 20% under-65 penalty.
    const userPrePen = userAlive && userAgeT < 59.5;
    const spousePrePen = (spouseAlive || !userAlive) && spouseAgeT < 59.5;
    const hsaUserPen = hsaUserForMedicalCode === 0 && userAlive && userAgeT < 65.0;
    const hsaSpousePen = hsaSpouseForMedicalCode === 0 && (spouseAlive || !userAlive) && spouseAgeT < 65.0;
    // HSAs keep user-then-spouse order unless penalized pretax must slot between them
    const pretaxDeferred = (userPrePen && pretaxUserEnd > 0.0) || (spousePrePen && pretaxSpouseEnd > 0.0);
    const hsaUserLate = pretaxDeferred && hsaUserPen;
    const hsaSpouseLate = pretaxDeferred && hsaSpousePen;

    let nSteps = 0;
    order[nSteps++] = STEP_PRETAX_FREE;
    order[nSteps++] = STEP_ROTH;
    if (!hsaUserLate) order[nSteps++] = STEP_HSA_USER;
    if (!hsaSpouseLate) order[nSteps++] = STEP_HSA_SPOUSE;
    order[nSteps++] = STEP_PRETAX_PENALIZED;
    if (hsaUserLate) order[nSteps++] = STEP_HSA_USER;
    if (hsaSpouseLate) order[nSteps++] = STEP_HSA_SPOUSE;

    // Ordinary income from pretax and non-medical HSA withdrawals so far
    let extraOrd = 0.0;

    for (let k = 0; k < nSteps; k++) {
      if (deficit <= 0.0) break;
      const step = order[k];
      let wStep = 0.0;
      let taxedStep = false;

      if (step === STEP_PRETAX_FREE || step === STEP_PRETAX_PENALIZED) {
        // Pre-tax extra withdrawals (gross-up solver), pro-rata across the owners in this pass
        const penalizedPass = step === STEP_PRETAX_PENALIZED;
        const poolU = userPrePen === penalizedPass ? pretaxUserEnd : 0.0;
        const poolS = spousePrePen === penalizedPass ? pretaxSpouseEnd : 0.0;
        const pool = poolU + poolS;
        if (pool <= 0.0) continue;
        const penRate = penalizedPass ? 0.10 : 0.0;
        [wStep, deficit] = njitSolveOrdinaryWithdrawal(
          pool, penRate, deficit, extraOrd, finalPenalty, totalBaseTax,
          baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
          ssBenefits, filingStatusCode, stdDeductionT, thresholdsT, ltcgThresholdsT, stateSsExemptCode, stateRate,
        );
        const wU = wStep * (poolU / pool);
        const wS = wStep - wU;
        pretaxUserEnd = Math.max(0.0, pretaxUserEnd - wU);
        pretaxSpouseEnd = Math.max(0.0, pretaxSpouseEnd - wS);
        wPretaxExtra += wStep;
        finalPenalty += penRate * wStep;
        taxedStep = true;
      } else if (step === STEP_ROTH) {
        if (rothEnd > 0.0) {
          wRoth = Math.min(deficit, Math.max(0.0, rothEnd));
          rothEnd = rothEnd - wRoth;
          deficit = deficit - wRoth;
        }
      } else if (step === STEP_HSA_USER) {
        if (hsaUserEnd > 0.0) {
          if (hsaUserForMedicalCode === 1) {
            wHsaUser = Math.min(deficit, Math.max(0.0, hsaUserEnd));
            hsaUserEnd = hsaUserEnd - wHsaUser;
            deficit = deficit - wHsaUser;
          } else {
            const penRate = hsaUserPen ? 0.20 : 0.0;
            [wHsaUser, deficit] = njitSolveOrdinaryWithdrawal(
              hsaUserEnd, penRate, deficit, extraOrd, finalPenalty, totalBaseTax,
              baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
              ssBenefits, filingStatusCode, stdDeductionT, thresholdsT, ltcgThresholdsT, stateSsExemptCode, stateRate,
            );
            hsaUserEnd = hsaUserEnd - wHsaUser;
            wStep = wHsaUser;
            hsaPenaltyUser = penRate * wHsaUser;
            finalPenalty += hsaPenaltyUser;
            taxedStep = true;
          }
        }
      } else if (step === STEP_HSA_SPOUSE) {
        if (hsaSpouseEnd > 0.0 && (spouseAlive || !userAlive)) {
          if (hsaSpouseForMedicalCode === 1) {
            wHsaSpouse = Math.min(deficit, Math.max(0.0, hsaSpouseEnd));
            hsaSpouseEnd = hsaSpouseEnd - wHsaSpouse;
            deficit = deficit - wHsaSpouse;
          } else {
            const penRate = hsaSpousePen ? 0.20 : 0.0;
            [wHsaSpouse, deficit] = njitSolveOrdinaryWithdrawal(
              hsaSpouseEnd, penRate, deficit, extraOrd, finalPenalty, totalBaseTax,
              baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
              ssBenefits, filingStatusCode, stdDeductionT, thresholdsT, ltcgThresholdsT, stateSsExemptCode, stateRate,
            );
            hsaSpouseEnd = hsaSpouseEnd - wHsaSpouse;
            wStep = wHsaSpouse;
            hsaPenaltySpouse = penRate * wHsaSpouse;
            finalPenalty += hsaPenaltySpouse;
            taxedStep = true;
          }
        }
      }

      if (taxedStep) {
        extraOrd += wStep;
        [finalFedOrdTax, finalFedPrefTax, finalFedTax, finalStateTax] = njitExtraOrdinaryTaxes(
          extraOrd, baseAgiExSs, baseOrdExSs, realizedCg, curPrefIncome,
          ssBenefits, filingStatusCode, stdDeductionT, thresholdsT, ltcgThresholdsT, stateSsExemptCode, stateRate,
        );
        totalBaseTax = finalFedTax + finalStateTax + finalPenalty;
      }
    }

    shortfall = deficit > 0.0 ? deficit : 0.0;
    taxableEnd = Math.max(0.0, taxableEnd);
  }

  const r = out ?? new Float64Array(RTW_LEN);
  r[0] = pretaxUserEnd; r[1] = pretaxSpouseEnd; r[2] = rothEnd; r[3] = taxableEnd;
  r[4] = hsaUserEnd; r[5] = hsaSpouseEnd;
  r[6] = userRmdT; r[7] = spouseRmdT;
  r[8] = wPretaxExtra; r[9] = wTaxable; r[10] = wRoth; r[11] = wHsaUser; r[12] = wHsaSpouse;
  r[13] = finalFedTax; r[14] = finalStateTax; r[15] = finalPenalty;
  r[16] = hsaPenaltyUser; r[17] = hsaPenaltySpouse;
  r[18] = shortfall;
  r[19] = taxableBasisEnd; r[20] = realizedCg; r[21] = finalFedOrdTax; r[22] = finalFedPrefTax;
  return r;
}
