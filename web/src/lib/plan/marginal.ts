// Combined federal + state marginal tax rate shown on the balance sheet
// (calculate_marginal_tax_rate / calculate_taxable_ss_forms in core/forms.py).
import { pyFloat, pyRound } from '../engine/py';
import { calculateTaxableSs } from '../engine/tax';
import { getBool } from './coerce';
import { get, isObj, or, type Obj } from './pyutil';

const THRESHOLDS: Record<string, number[]> = {
  single: [12400, 50400, 105700, 201775, 256225, 640600],
  joint: [24800, 100800, 211400, 403550, 512450, 768700],
  hoh: [17700, 67450, 105700, 201775, 256225, 640600],
};
const STANDARD_DEDUCTION: Record<string, number> = { single: 16100, joint: 32200, hoh: 24150 };
const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

/** Same IRS worksheet as the engine's calculate_taxable_ss. */
export const calculateTaxableSsForms = calculateTaxableSs;

/**
 * Marginal rate (percent, 2 decimals) from the plan's filing status, taxable income
 * streams, Social Security, desired spending and state tax, unless a valid manual
 * override (0–100) is set on the plan or its balance sheet.
 */
export function calculateMarginalTaxRate(data: unknown): number {
  if (!isObj(data)) return 24.0;

  let override = get(data, 'marginal_tax_rate_override');
  if (override === null && isObj(data.balance_sheet)) override = get(data.balance_sheet, 'marginal_tax_rate_override');
  if (override !== null) {
    try {
      const v = pyFloat(override);
      if (v >= 0.0 && v <= 100.0) return pyRound(v, 2);
    } catch {
      // not a number: ignore the override
    }
  }

  const isMarried = getBool(data.is_married);
  let status = get(data, 'filing_status', isMarried ? 'joint' : 'single');
  status = ({ married_filing_jointly: 'joint', head_of_household: 'hoh' } as Obj)[status] ?? status;
  if (!(status in THRESHOLDS)) status = isMarried ? 'joint' : 'single';

  let streams = 0.0;
  const incomes = get(data, 'income_sources', []);
  if (Array.isArray(incomes)) {
    for (const inc of incomes) {
      if (!isObj(inc)) continue;
      const stt = get(inc, 'subject_to_tax');
      if (stt === false || String(stt === null ? 'None' : stt).toLowerCase() === 'false') continue;
      let amt = pyFloat(or(get(inc, 'amount', 0.0), 0.0));
      const freq = get(inc, 'frequency', 'monthly');
      if (freq === 'monthly') amt *= 12.0;
      else if (freq === 'one_time' || freq === 'one-time') amt = 0.0;
      streams += amt;
    }
  }

  const ss = get(data, 'social_security', {});
  let totalSs = 0.0;
  if (isObj(ss)) {
    const uEnt = getBool(get(ss, 'user_receiving', false)) || getBool(get(ss, 'user_future_entitled', false)) || getBool(get(ss, 'user_entitled', true));
    if (uEnt) {
      let a = pyFloat(or(get(ss, 'user_amount', 0.0), 0.0));
      if (get(ss, 'user_freq', 'monthly') === 'monthly') a *= 12.0;
      totalSs += a;
    }
    const spEnt = getBool(get(ss, 'spouse_receiving', false)) || getBool(get(ss, 'spouse_future_entitled', false)) || getBool(get(ss, 'spouse_entitled', false));
    if (isMarried && spEnt) {
      let a = pyFloat(or(get(ss, 'spouse_amount', 0.0), 0.0));
      if (get(ss, 'spouse_freq', 'monthly') === 'monthly') a *= 12.0;
      totalSs += a;
    }
  }

  const guaranteed = streams + calculateTaxableSsForms(streams, totalSs, status);
  const desired = pyFloat(or(get(data, 'desired_spending', 60000.0), 0.0));
  const base = Math.max(desired, guaranteed);
  const taxable = Math.max(0.0, base - (STANDARD_DEDUCTION[status] ?? 16100));

  let fedRate = RATES[0];
  for (const [i, threshold] of THRESHOLDS[status].entries()) {
    if (taxable > threshold) fedRate = i + 1 < RATES.length ? RATES[i + 1] : RATES[RATES.length - 1];
    else break;
  }
  const stateRate = pyFloat(or(get(data, 'state_tax_rate', 0.0), 0.0)) / 100.0;
  return pyRound((fedRate + stateRate) * 100.0, 2);
}
