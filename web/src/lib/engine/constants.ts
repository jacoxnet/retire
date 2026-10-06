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
