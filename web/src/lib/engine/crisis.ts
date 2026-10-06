// Historical-crisis overrides for the stress test (first half of
// run_historical_stress_test in core/runs.py): which plan years replay history, the
// blended bucket returns for those years, and the per-year inflation series.
import { inferAssetAllocation } from './constants';
import {
  blendReturn,
  CRISIS_SCENARIOS,
  type CrisisScenario,
  HISTORICAL_RETURNS,
  MAX_HISTORICAL_YEAR,
  MIN_HISTORICAL_YEAR,
} from './historicalData';
import type { SimInputs } from './inputs';
import { get } from './py';

export type AssetAllocation = 'matched' | '100_stock' | '80_20' | '60_40' | '40_60' | '100_bond';
export type CrisisTiming = 'retirement' | 'immediate';

export interface StressSpec {
  scenarioKey: string;
  assetAllocation: AssetAllocation | string;
  crisisTiming: CrisisTiming | string;
}

export interface CrisisMacroRow {
  plan_year: number;
  user_age: number;
  historical_year: number;
  stocks: number;
  bonds: number;
  inflation: number;
}

export interface CrisisSetup {
  scenario: CrisisScenario & { key: string };
  crisisStartT: number;
  crisisEndT: number;
  crisisLength: number;
  /** Per-year inflation (%), historical inside the crisis window. */
  inflationRates: Float64Array;
  /** Crisis-year returns, 6 per year in bucket order (preUser, preSpouse, roth, taxable, hsaUser, hsaSpouse). */
  overrides: Float64Array;
  macro: CrisisMacroRow[];
}

function allocationWeights(allocation: string, accMean: number): [number, number, number] {
  switch (allocation) {
    case '100_stock': return [100.0, 0.0, 0.0];
    case '80_20': return [80.0, 20.0, 0.0];
    case '60_40': return [60.0, 40.0, 0.0];
    case '40_60': return [40.0, 60.0, 0.0];
    case '100_bond': return [0.0, 100.0, 0.0];
    default: return inferAssetAllocation(accMean);
  }
}

export function crisisSetup(inputs: SimInputs, spec: StressSpec): CrisisSetup {
  const years = inputs.total_years;
  const key = spec.scenarioKey in CRISIS_SCENARIOS ? spec.scenarioKey : '2000_dotcom';
  const scenario = { ...CRISIS_SCENARIOS[key], key };

  const startYr = scenario.start_year;
  const endYr = scenario.end_year ?? startYr + (scenario.length ?? 10) - 1;
  const crisisLength = scenario.length ?? endYr - startYr + 1;
  if (startYr < MIN_HISTORICAL_YEAR || endYr > MAX_HISTORICAL_YEAR) {
    throw new RangeError(
      `Crisis scenario '${key}' spans ${startYr}–${endYr}, which exceeds verified historical data ` +
        `(${MIN_HISTORICAL_YEAR}–${MAX_HISTORICAL_YEAR}).`,
    );
  }

  const tRet = Math.max(0, inputs.user_ret_age - inputs.user_age);
  const crisisStartT = spec.crisisTiming === 'retirement' ? tRet : 0;
  const crisisEndT = Math.min(years, crisisStartT + crisisLength);

  const baseInf = inputs.inflation_rate;
  const inflationRates = new Float64Array(years).fill(baseInf);
  const overrides = new Float64Array(6 * years);

  const mean = (d: Record<string, any>) => get(d, 'return_mean', 6.0);
  const married = inputs.is_married;
  const wPre = allocationWeights(spec.assetAllocation, mean(inputs.pretax_data));
  const wPreSp = married ? allocationWeights(spec.assetAllocation, mean(inputs.spouse_pretax_data)) : wPre;
  const wRoth = allocationWeights(spec.assetAllocation, mean(inputs.roth_data));
  const wTax = allocationWeights(spec.assetAllocation, mean(inputs.taxable_data));
  const wHsa = allocationWeights(spec.assetAllocation, mean(inputs.hsa_data));
  const wHsaSp = married ? allocationWeights(spec.assetAllocation, mean(inputs.spouse_hsa_data)) : wHsa;
  const weights = [wPre, wPreSp, wRoth, wTax, wHsa, wHsaSp];

  const macro: CrisisMacroRow[] = [];
  for (let t = crisisStartT; t < crisisEndT; t++) {
    const histYr = startYr + (t - crisisStartT);
    const h = HISTORICAL_RETURNS[histYr] ?? { stocks: 7.0, bonds: 4.0, cash: 2.0, inflation: baseInf };
    inflationRates[t] = h.inflation;
    for (let b = 0; b < 6; b++) {
      const w = weights[b];
      overrides[t * 6 + b] = blendReturn(w[0], w[1], w[2], h.stocks, h.bonds, h.cash) / 100.0;
    }
    macro.push({
      plan_year: inputs.current_year + t,
      user_age: inputs.user_age + t,
      historical_year: histYr,
      stocks: h.stocks,
      bonds: h.bonds,
      inflation: h.inflation,
    });
  }

  return { scenario, crisisStartT, crisisEndT, crisisLength, inflationRates, overrides, macro };
}
