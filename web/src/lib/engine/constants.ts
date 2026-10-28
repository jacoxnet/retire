// Tax brackets, RMD table and asset-class correlation (top of core/runs.py).

// IRS Uniform Lifetime Table (Table III) divisors for ages 72 through 119.
// For age >= 120 the divisor is 2.0.
export const RMD_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
  104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4,
  112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
};

export const RMD_TABLE_ARR = new Float64Array(151).fill(2.0);
for (const [age, div] of Object.entries(RMD_TABLE)) RMD_TABLE_ARR[Number(age)] = div;

// IRS Single Life Expectancy Table (Table I, Treas. Reg. § 1.401(a)(9)-9(b))
// Used for Inherited IRAs (stretch beneficiaries and 10-year rule post-RBD annual RMDs).
export const SINGLE_LIFE_TABLE: Record<number, number> = {
  0: 84.6, 1: 83.7, 2: 82.8, 3: 81.8, 4: 80.8, 5: 79.8, 6: 78.8, 7: 77.9, 8: 76.9, 9: 75.9,
  10: 74.9, 11: 73.9, 12: 72.9, 13: 71.9, 14: 70.9, 15: 69.9, 16: 69.0, 17: 68.0, 18: 67.0, 19: 66.0,
  20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2, 26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3,
  30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5, 34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.6, 39: 46.7,
  40: 45.7, 41: 44.8, 42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.1, 47: 39.1, 48: 38.1, 49: 37.1,
  50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0,
  60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9, 66: 22.0, 67: 21.2, 68: 20.4, 69: 19.6,
  70: 18.8, 71: 18.0, 72: 17.2, 73: 16.4, 74: 15.6, 75: 14.8, 76: 14.1, 77: 13.3, 78: 12.6, 79: 11.9,
  80: 11.2, 81: 10.5, 82: 9.9, 83: 9.3, 84: 8.7, 85: 8.1, 86: 7.6, 87: 7.1, 88: 6.6, 89: 6.1,
  90: 5.7, 91: 5.3, 92: 4.9, 93: 4.6, 94: 4.3, 95: 4.0, 96: 3.7, 97: 3.4, 98: 3.2, 99: 3.0,
  100: 2.8, 101: 2.6, 102: 2.5, 103: 2.3, 104: 2.2, 105: 2.1, 106: 2.1, 107: 2.1, 108: 2.0, 109: 2.0,
  110: 2.0, 111: 2.0, 112: 2.0, 113: 1.9, 114: 1.9, 115: 1.8, 116: 1.8, 117: 1.6, 118: 1.4, 119: 1.1,
  120: 1.0,
};

export const SINGLE_LIFE_TABLE_ARR = new Float64Array(151).fill(1.0);
for (const [age, div] of Object.entries(SINGLE_LIFE_TABLE)) SINGLE_LIFE_TABLE_ARR[Number(age)] = div;

/**
 * Returns the Single Life Table divisor for a given initial age and years elapsed since death,
 * applying the non-recalculation / subtract-1 method (Treas. Reg. § 1.401(a)(9)-5).
 */
export function getSingleLifeDivisor(initialAge: number, yearsElapsed: number): number {
  const boundedAge = Math.min(120, Math.max(0, Math.trunc(initialAge)));
  const initialDivisor = SINGLE_LIFE_TABLE_ARR[boundedAge];
  // Year 1 (yearsElapsed = 1): initialDivisor. Each subsequent year subtracts 1.0.
  const divisor = initialDivisor - Math.max(0, yearsElapsed - 1);
  return Math.max(1.0, divisor);
}

// 2026 federal income tax brackets
export const STD_DEDUCTION_2026_SINGLE = 16100;
export const STD_DEDUCTION_2026_JOINT = 32200;
export const STD_DEDUCTION_2026_HOH = 24150;

export const THRESHOLDS_SINGLE_ARR = new Float64Array([12400.0, 50400.0, 105700.0, 201775.0, 256225.0, 640600.0]);
export const THRESHOLDS_JOINT_ARR = new Float64Array([24800.0, 100800.0, 211400.0, 403550.0, 512450.0, 768700.0]);
export const THRESHOLDS_HOH_ARR = new Float64Array([17700.0, 67450.0, 105700.0, 201775.0, 256225.0, 640600.0]);
export const TAX_RATES_ARR = new Float64Array([0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);

// 2026 preferential long-term capital gains / qualified dividends brackets
export const LTCG_THRESHOLDS_SINGLE_ARR = new Float64Array([48350.0, 533400.0]);
export const LTCG_THRESHOLDS_JOINT_ARR = new Float64Array([96700.0, 600050.0]);
export const LTCG_THRESHOLDS_HOH_ARR = new Float64Array([64750.0, 566700.0]);
export const LTCG_RATES_ARR = new Float64Array([0.0, 0.15, 0.20]);

/** Ordinary and LTCG thresholds by filing-status string, for the non-njit helpers. */
export const THRESHOLDS_BY_STATUS: Record<string, [Float64Array, Float64Array]> = {
  single: [THRESHOLDS_SINGLE_ARR, LTCG_THRESHOLDS_SINGLE_ARR],
  joint: [THRESHOLDS_JOINT_ARR, LTCG_THRESHOLDS_JOINT_ARR],
  hoh: [THRESHOLDS_HOH_ARR, LTCG_THRESHOLDS_HOH_ARR],
};

// Cross-asset-class correlation (stocks, bonds, cash) for the Monte Carlo draws.
export const ASSET_CLASS_CORRELATION: number[][] = [
  [1.0, -0.1, 0.0],
  [-0.1, 1.0, 0.2],
  [0.0, 0.2, 1.0],
];

/** Lower Cholesky factor, computed the same way numpy.linalg.cholesky does for a 3x3 SPD matrix. */
function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const l = a.map(() => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    let s = a[j][j];
    for (let k = 0; k < j; k++) s -= l[j][k] * l[j][k];
    l[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) {
      let t = a[i][j];
      for (let k = 0; k < j; k++) t -= l[i][k] * l[j][k];
      l[i][j] = t / l[j][j];
    }
  }
  return l;
}

export const ASSET_CLASS_CHOLESKY = cholesky(ASSET_CLASS_CORRELATION);

export const FILING_STATUS_MAP: Record<string, number> = {
  single: 0,
  joint: 1,
  married_filing_jointly: 1,
  hoh: 2,
  head_of_household: 2,
};

export function getRmdStartAge(birthYear: number): number {
  if (birthYear <= 1950) return 72;
  if (birthYear >= 1951 && birthYear <= 1959) return 73;
  return 75;
}

/**
 * Stock/bond/cash percentages inferred from an account's expected return, assuming
 * 7.0% stocks, 4.0% bonds, 2.5% cash.
 */
export function inferAssetAllocation(meanReturn: number): [number, number, number] {
  if (meanReturn >= 7.0) return [100.0, 0.0, 0.0];
  if (meanReturn >= 4.0) {
    const stockPct = ((meanReturn - 4.0) / 3.0) * 100.0;
    return [stockPct, 100.0 - stockPct, 0.0];
  }
  if (meanReturn >= 2.5) {
    const bondPct = ((meanReturn - 2.5) / 1.5) * 100.0;
    return [0.0, bondPct, 100.0 - bondPct];
  }
  return [0.0, 0.0, 100.0];
}
