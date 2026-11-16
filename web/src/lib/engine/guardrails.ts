// Guyton-Klinger guardrails: the dynamic spending rules of the fourth simulation mode.
//
// Regular retirement spending stops being a fixed, inflation-indexed amount and becomes
// a per-path state. It is set in Retirement Year 0 (the first year of regular retirement
// spending) and then, at the beginning of every later year:
//   1. Inflation rule: raise it by the year's inflation, unless the prior year's total
//      portfolio return was negative and the withdrawal rate (before the raise) is above
//      the initial withdrawal rate. A skipped raise is never made up.
//   2. Current withdrawal rate = max(0, net portfolio demand) / beginning-of-year portfolio,
//      where net demand = regular spending + other scheduled outflows - non-portfolio income.
//   3. Guardrails: above 120% of the initial rate, cut regular spending 10% (never in the
//      final 15 years of the plan); below 80%, raise it 10%.
// Years before Retirement Year 0 run under the ordinary accumulation rules.
//
// guardrailYear is the single implementation of these rules; the Monte Carlo kernel
// (montecarlo.ts) and the deterministic projection (deterministic.ts) both call it.
import type { NumbaInputs, SimInputs } from './inputs';

/** Plan.simulation_type for this mode. */
export const GK_SIMULATION_TYPE = 'guyton_klinger';
/** Success rate (%) the starting spending is solved for. */
export const GK_TARGET_SUCCESS_RATE = 99.0;
/** A withdrawal rate above this multiple of the initial rate triggers a cut. */
export const GK_UPPER_GUARDRAIL = 1.2;
/** A withdrawal rate below this multiple of the initial rate triggers a raise. */
export const GK_LOWER_GUARDRAIL = 0.8;
export const GK_CUT = 0.1;
export const GK_RAISE = 0.1;
/** No cuts in this many final years of the plan. */
export const GK_NO_CUT_YEARS = 15;

// GuardrailState.event flags for a year
/** The inflation raise was skipped. */
export const GK_EVENT_FREEZE = 1;
export const GK_EVENT_CUT = 2;
export const GK_EVENT_RAISE = 4;
/** The initial withdrawal rate was established this year. */
export const GK_EVENT_START = 8;

/** True when the plan runs under the guardrail rules. */
export const isGuardrailPlan = (plan: Record<string, any> | null | undefined): boolean =>
  plan?.simulation_type === GK_SIMULATION_TYPE;

/** True when the starting spending is solved for (rather than taken from the plan). */
export const guardrailSolves = (plan: Record<string, any> | null | undefined): boolean =>
  isGuardrailPlan(plan) && plan?.gk_spending_mode !== 'specified';

/** What the rules need that is fixed for a plan (and a test-spending / inflation variant). */
export interface GuardrailConfig {
  /** Year index of Retirement Year 0; >= totalYears when regular spending never starts. */
  startT: number;
  /** Cuts apply only before this year index. */
  noCutFromT: number;
  /** Regular spending in today's dollars (the plan's, or the candidate being tested). */
  baseSpending: number;
  /** Last year index with both spouses alive (Infinity when single). */
  tFirstDeath: number;
  /** Survivor spending as a fraction of regular spending, applied after the first death. */
  survivorScale: number;
  adjustInflation: boolean;
  /** Cumulative inflation factor of each year. */
  infFactors: Float64Array;
  /** Each year's additional spending + other scheduled taxes - non-portfolio income. */
  otherNet: Float64Array;
}

export function guardrailConfig(inputs: SimInputs, nb: NumbaInputs): GuardrailConfig {
  const years = inputs.total_years;
  const otherNet = new Float64Array(years);
  for (let t = 0; t < years; t++) {
    otherNet[t] = nb.add_spending_arr[t] + nb.other_taxes_arr[t]
      - (nb.inc_taxable_arr[t] + nb.inc_ss_arr[t] + nb.inc_nontaxable_arr[t]);
  }
  return {
    startT: Math.max(0, inputs.desired_spending_start_age - inputs.user_age),
    noCutFromT: years - GK_NO_CUT_YEARS,
    baseSpending: nb.desired_spending,
    tFirstDeath: inputs.is_married
      ? Math.min(inputs.user_age_death - inputs.user_age, inputs.spouse_age_death - inputs.spouse_age)
      : Infinity,
    survivorScale: nb.desired_spending > 0.0 ? nb.survivor_spending / nb.desired_spending : 1.0,
    adjustInflation: inputs.adjust_spending_inflation,
    infFactors: nb.inf_factors,
    otherNet,
  };
}

/** One path's spending state and what it has done so far. */
export interface GuardrailState {
  /** This year's regular spending before the survivor adjustment (nominal). */
  spending: number;
  /** Initial withdrawal rate as a fraction; 0 until established. */
  iwr: number;
  /** GK_EVENT_* flags for the year just evaluated. */
  event: number;
  /** Portfolio at the beginning of Retirement Year 0. */
  startPortfolio: number;
  /** Regular spending paid: Retirement Year 0, the latest year, and the highest and lowest year. */
  startNominal: number;
  startReal: number;
  finalNominal: number;
  finalReal: number;
  peakNominal: number;
  peakReal: number;
  lowNominal: number;
  lowReal: number;
  cuts: number;
  raises: number;
  freezes: number;
}

export function newGuardrailState(): GuardrailState {
  return {
    spending: 0.0, iwr: 0.0, event: 0, startPortfolio: 0.0,
    startNominal: 0.0, startReal: 0.0, finalNominal: 0.0, finalReal: 0.0,
    peakNominal: 0.0, peakReal: 0.0, lowNominal: 0.0, lowReal: 0.0,
    cuts: 0, raises: 0, freezes: 0,
  };
}

export function resetGuardrailState(s: GuardrailState): void {
  s.spending = s.iwr = s.startPortfolio = 0.0;
  s.startNominal = s.startReal = s.finalNominal = s.finalReal = 0.0;
  s.peakNominal = s.peakReal = s.lowNominal = s.lowReal = 0.0;
  s.event = s.cuts = s.raises = s.freezes = 0;
}

/** Withdrawal rate of a net demand on a portfolio (unbounded when the portfolio is gone). */
function withdrawalRate(netDemand: number, portfolio: number): number {
  if (netDemand <= 0.0) return 0.0;
  return portfolio > 0.0 ? netDemand / portfolio : Infinity;
}

/**
 * Regular spending for year t (nominal; 0 before Retirement Year 0), advancing the
 * path's state. `portfolio` is the total at the beginning of year t and `priorGrowth`
 * the prior year's total investment growth in dollars (its sign is the sign of the
 * prior year's portfolio return). Call once per year, in order.
 *
 * The initial withdrawal rate is established in Retirement Year 0. If the portfolio
 * isn't drawn on that year (income covers spending), it is established in the first
 * year that it is; until then spending just follows inflation.
 */
export function guardrailYear(c: GuardrailConfig, s: GuardrailState, t: number, portfolio: number, priorGrowth: number): number {
  s.event = 0;
  if (t < c.startT) return 0.0;
  const scale = t > c.tFirstDeath ? c.survivorScale : 1.0;
  const other = c.otherNet[t];

  if (t === c.startT) {
    s.spending = c.baseSpending * (c.adjustInflation ? c.infFactors[t] : 1.0);
    s.startPortfolio = portfolio;
  } else if (c.adjustInflation) {
    // Step 1: the inflation rule
    if (s.iwr > 0.0 && priorGrowth < 0.0 && withdrawalRate(s.spending * scale + other, portfolio) > s.iwr) {
      s.event |= GK_EVENT_FREEZE;
      s.freezes += 1;
    } else {
      s.spending *= c.infFactors[t] / c.infFactors[t - 1];
    }
  }

  if (s.iwr > 0.0) {
    // Steps 2 and 3: the current withdrawal rate against the guardrails
    const cwr = withdrawalRate(s.spending * scale + other, portfolio);
    if (cwr > GK_UPPER_GUARDRAIL * s.iwr) {
      if (t < c.noCutFromT) {
        s.spending *= 1.0 - GK_CUT;
        s.event |= GK_EVENT_CUT;
        s.cuts += 1;
      }
    } else if (cwr < GK_LOWER_GUARDRAIL * s.iwr) {
      s.spending *= 1.0 + GK_RAISE;
      s.event |= GK_EVENT_RAISE;
      s.raises += 1;
    }
  } else {
    const net = s.spending * scale + other;
    if (net > 0.0 && portfolio > 0.0) {
      s.iwr = net / portfolio;
      s.event |= GK_EVENT_START;
    }
  }

  const nominal = s.spending * scale;
  const real = nominal / c.infFactors[t];
  if (t === c.startT) {
    s.startNominal = s.peakNominal = s.lowNominal = nominal;
    s.startReal = s.peakReal = s.lowReal = real;
  } else {
    if (nominal > s.peakNominal) s.peakNominal = nominal;
    if (nominal < s.lowNominal) s.lowNominal = nominal;
    if (real > s.peakReal) s.peakReal = real;
    if (real < s.lowReal) s.lowReal = real;
  }
  s.finalNominal = nominal;
  s.finalReal = real;
  return nominal;
}

// ---------------------------------------------------------------------------
// Statistics across paths

/** Mean, lowest and highest of a per-path amount. */
export interface WithdrawalStat {
  mean: number;
  min: number;
  max: number;
}

/** What the Results card shows for a guardrails run. Amounts are regular spending per year. */
export interface GuardrailStats {
  /** Year index of Retirement Year 0. */
  start_year_index: number;
  /** Regular spending in Retirement Year 0, in that year's dollars and in today's. */
  starting_withdrawal: number;
  starting_withdrawal_real: number;
  /** Mean portfolio at the beginning of Retirement Year 0. */
  starting_portfolio: number;
  /** starting_withdrawal as a percentage of starting_portfolio. */
  starting_withdrawal_pct: number;
  /** Mean initial withdrawal rate (%) the guardrails are measured against (net of income). */
  initial_withdrawal_rate: number;
  final_withdrawal: WithdrawalStat;
  final_withdrawal_real: WithdrawalStat;
  peak_withdrawal: WithdrawalStat;
  peak_withdrawal_real: WithdrawalStat;
  lowest_withdrawal: WithdrawalStat;
  lowest_withdrawal_real: WithdrawalStat;
  /** Percentage of paths with at least one cut, raise, or skipped inflation raise. */
  pct_runs_cut: number;
  pct_runs_raise: number;
  pct_runs_freeze: number;
}

// A chunk's totals travel between threads as one Float64Array: a header, then
// (sum, min, max) for each tracked amount. Sums are added chunk by chunk, so the last
// bits of a mean depend on how the runs were split (unlike the ending-wealth statistics).
const H_PATHS = 0;
const H_CUT = 1;
const H_RAISE = 2;
const H_FREEZE = 3;
const H_IWR_SUM = 4;
const H_IWR_PATHS = 5;
const H_PORTFOLIO_SUM = 6;
const COUNTS = 7;
/** Year index of Retirement Year 0 (the same in every chunk). */
const H_START_T = 7;
const HEADER = 8;
const AMOUNTS = ['startNominal', 'startReal', 'finalNominal', 'finalReal', 'peakNominal', 'peakReal', 'lowNominal', 'lowReal'] as const;
const TOTALS_LEN = HEADER + 3 * AMOUNTS.length;

export function newGuardrailTotals(startT: number): Float64Array {
  const a = new Float64Array(TOTALS_LEN);
  a[H_START_T] = startT;
  for (let i = 0; i < AMOUNTS.length; i++) {
    a[HEADER + 3 * i + 1] = Infinity;
    a[HEADER + 3 * i + 2] = -Infinity;
  }
  return a;
}

/** Add one finished path to a chunk's totals. */
export function addGuardrailPath(totals: Float64Array, s: GuardrailState): void {
  totals[H_PATHS] += 1;
  if (s.cuts > 0) totals[H_CUT] += 1;
  if (s.raises > 0) totals[H_RAISE] += 1;
  if (s.freezes > 0) totals[H_FREEZE] += 1;
  if (s.iwr > 0.0) {
    totals[H_IWR_SUM] += s.iwr;
    totals[H_IWR_PATHS] += 1;
  }
  totals[H_PORTFOLIO_SUM] += s.startPortfolio;
  for (let i = 0; i < AMOUNTS.length; i++) {
    const v = s[AMOUNTS[i]];
    const at = HEADER + 3 * i;
    totals[at] += v;
    if (v < totals[at + 1]) totals[at + 1] = v;
    if (v > totals[at + 2]) totals[at + 2] = v;
  }
}

/** Combine the chunks' totals (in the order given) into the run's statistics. */
export function guardrailStats(chunkTotals: Float64Array[]): GuardrailStats {
  const all = newGuardrailTotals(chunkTotals.length ? chunkTotals[0][H_START_T] : 0);
  for (const c of chunkTotals) {
    for (let i = 0; i < COUNTS; i++) all[i] += c[i];
    for (let i = 0; i < AMOUNTS.length; i++) {
      const at = HEADER + 3 * i;
      all[at] += c[at];
      all[at + 1] = Math.min(all[at + 1], c[at + 1]);
      all[at + 2] = Math.max(all[at + 2], c[at + 2]);
    }
  }
  const n = all[H_PATHS];
  const stat = (name: (typeof AMOUNTS)[number]): WithdrawalStat => {
    const at = HEADER + 3 * AMOUNTS.indexOf(name);
    return n > 0 ? { mean: all[at] / n, min: all[at + 1], max: all[at + 2] } : { mean: 0.0, min: 0.0, max: 0.0 };
  };
  const pct = (count: number) => (n > 0 ? (count / n) * 100.0 : 0.0);
  // Retirement Year 0 spending is the same on every path.
  const start = stat('startNominal').max;
  const portfolio = n > 0 ? all[H_PORTFOLIO_SUM] / n : 0.0;
  return {
    start_year_index: all[H_START_T],
    starting_withdrawal: start,
    starting_withdrawal_real: stat('startReal').max,
    starting_portfolio: portfolio,
    starting_withdrawal_pct: portfolio > 0.0 ? (start / portfolio) * 100.0 : 0.0,
    initial_withdrawal_rate: all[H_IWR_PATHS] > 0 ? (all[H_IWR_SUM] / all[H_IWR_PATHS]) * 100.0 : 0.0,
    final_withdrawal: stat('finalNominal'),
    final_withdrawal_real: stat('finalReal'),
    peak_withdrawal: stat('peakNominal'),
    peak_withdrawal_real: stat('peakReal'),
    lowest_withdrawal: stat('lowNominal'),
    lowest_withdrawal_real: stat('lowReal'),
    pct_runs_cut: pct(all[H_CUT]),
    pct_runs_raise: pct(all[H_RAISE]),
    pct_runs_freeze: pct(all[H_FREEZE]),
  };
}
