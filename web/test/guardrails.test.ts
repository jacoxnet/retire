// The Guyton-Klinger guardrail rules (engine/guardrails.ts): the yearly decision on
// hand-worked cases, the Monte Carlo kernel against the deterministic projection, and
// the statistics a guardrails run reports.
import { describe, expect, it } from 'vitest';
import { meanReturns, runDeterministic, runSimulationPath } from '../src/lib/engine/deterministic';
import {
  addGuardrailPath, GK_EVENT_CUT, GK_EVENT_CUT_LIMITED, GK_EVENT_FREEZE, GK_EVENT_RAISE, GK_EVENT_START, GK_SIMULATION_TYPE,
  type GuardrailConfig, guardrailConfig, guardrailMaxCuts, guardrailSolves, guardrailStats, guardrailYear, isGuardrailPlan,
  newGuardrailState, newGuardrailTotals,
} from '../src/lib/engine/guardrails';
import { extractSimInputs, prepareNumbaInputs } from '../src/lib/engine/inputs';
import { binarySearch, generateRuns, localRunner, type McJob, splitRanges, summarize } from '../src/lib/engine/mc';
import { kernelParams, simulatePath } from '../src/lib/engine/montecarlo';
import { runHistoricalStressTest } from '../src/lib/engine/stress';
import { deepClose, fixtureIndex, loadPlanFixture } from './fixtures';

const SEED = fixtureIndex().generated_with.mc_seed;
const INF = 1.03;

/** A 30-year plan retiring in year 1 on $40,000 (today's dollars) with 3% inflation: 29 retirement years, 2 cuts. */
function config(over: Partial<GuardrailConfig> = {}): GuardrailConfig {
  const years = 30;
  return {
    startT: 1,
    noCutFromT: years - 15,
    maxCuts: 2,
    baseSpending: 40000,
    tFirstDeath: Infinity,
    survivorScale: 1,
    adjustInflation: true,
    infFactors: Float64Array.from({ length: years }, (_, t) => INF ** t),
    ...over,
  };
}

/** State after Retirement Year 0 on a $1,000,000 portfolio: spending $41,200, IWR 4.12%. */
function started(c: GuardrailConfig) {
  const s = newGuardrailState();
  expect(guardrailYear(c, s, 0, 950000, 0)).toBe(0);
  expect(guardrailYear(c, s, 1, 1000000, 50000)).toBeCloseTo(41200, 9);
  return s;
}

describe('guardrailYear', () => {
  it('pre-retirement years have no regular spending and leave the state alone', () => {
    const s = newGuardrailState();
    expect(guardrailYear(config(), s, 0, 950000, -1)).toBe(0);
    expect(s).toEqual(newGuardrailState());
  });

  it('Retirement Year 0 sets spending and the initial withdrawal rate, with no adjustment', () => {
    const s = started(config());
    expect(s.iwr).toBeCloseTo(0.0412, 12);
    expect(s.event).toBe(GK_EVENT_START);
    expect(s.startPortfolio).toBe(1000000);
    expect([s.cuts, s.raises, s.freezes]).toEqual([0, 0, 0]);
  });

  it('inside the guardrails, spending rises with inflation', () => {
    const c = config();
    const s = started(c);
    // 42,436 / 1,000,000 = 4.24%, between 3.30% and 4.94%
    expect(guardrailYear(c, s, 2, 1000000, 50000)).toBeCloseTo(41200 * INF, 9);
    expect(s.event).toBe(0);
  });

  it('skips the inflation raise after a negative return when the withdrawal rate is above the initial rate', () => {
    const c = config();
    const s = started(c);
    // 41,200 / 900,000 = 4.58% > 4.12% (and below the 4.94% upper guardrail)
    expect(guardrailYear(c, s, 2, 900000, -100000)).toBeCloseTo(41200, 9);
    expect(s.event).toBe(GK_EVENT_FREEZE);
    // The skipped raise is not made up: the next raise is one year's inflation.
    expect(guardrailYear(c, s, 3, 1000000, 100000)).toBeCloseTo(41200 * INF, 9);
    expect(s.freezes).toBe(1);
  });

  it('still raises for inflation after a negative return when the withdrawal rate is not above the initial rate', () => {
    const c = config();
    const s = started(c);
    // 41,200 / 1,100,000 = 3.75% <= 4.12%
    expect(guardrailYear(c, s, 2, 1100000, -10)).toBeCloseTo(41200 * INF, 9);
    expect(s.event).toBe(0);
  });

  it('a positive return never skips the raise, whatever the withdrawal rate', () => {
    const c = config();
    const s = started(c);
    // 42,436 / 880,000 = 4.82%: above the initial rate, below the upper guardrail
    expect(guardrailYear(c, s, 2, 880000, 1)).toBeCloseTo(41200 * INF, 9);
    expect(s.event).toBe(0);
  });

  it('cuts 10% above the upper guardrail', () => {
    const c = config();
    const s = started(c);
    // 42,436 / 700,000 = 6.06% > 4.94%
    expect(guardrailYear(c, s, 2, 700000, 1)).toBeCloseTo(41200 * INF * 0.9, 9);
    expect(s.event).toBe(GK_EVENT_CUT);
    expect(s.cuts).toBe(1);
  });

  it('can skip the raise and cut in the same year', () => {
    const c = config();
    const s = started(c);
    expect(guardrailYear(c, s, 2, 700000, -300000)).toBeCloseTo(41200 * 0.9, 9);
    expect(s.event).toBe(GK_EVENT_FREEZE | GK_EVENT_CUT);
  });

  it('raises 10% below the lower guardrail', () => {
    const c = config();
    const s = started(c);
    // 42,436 / 1,500,000 = 2.83% < 3.30%
    expect(guardrailYear(c, s, 2, 1500000, 1)).toBeCloseTo(41200 * INF * 1.1, 9);
    expect(s.event).toBe(GK_EVENT_RAISE);
    expect(s.raises).toBe(1);
  });

  it('makes no cuts in the final 15 years, but still raises', () => {
    const c = config();
    const s = started(c);
    // Year 14 is the last year a cut can happen in a 30-year plan.
    for (let t = 2; t < 14; t++) guardrailYear(c, s, t, 1e6 * INF ** (t - 1), 1);
    const before = s.spending;
    expect(guardrailYear(c, s, 14, 100000, 1)).toBeCloseTo(before * INF * 0.9, 6);
    expect(s.event).toBe(GK_EVENT_CUT);
    const afterCut = s.spending;
    expect(guardrailYear(c, s, 15, 100000, 1)).toBeCloseTo(afterCut * INF, 6);
    expect(s.event).toBe(0);
    // A negative return still skips the raise there.
    expect(guardrailYear(c, s, 16, 100000, -1)).toBeCloseTo(afterCut * INF, 6);
    expect(s.event).toBe(GK_EVENT_FREEZE);
    expect(guardrailYear(c, s, 17, 1e9, 1)).toBeCloseTo(afterCut * INF * INF * 1.1, 6);
    expect(s.event).toBe(GK_EVENT_RAISE);
    expect(s.cuts).toBe(1);
  });

  it('makes at most maxCuts cuts; after that the upper guardrail no longer cuts, but raises go on', () => {
    const c = config();
    const s = started(c);
    expect(guardrailYear(c, s, 2, 500000, 1)).toBeCloseTo(41200 * INF * 0.9, 9);
    expect(guardrailYear(c, s, 3, 400000, 1)).toBeCloseTo(41200 * INF ** 2 * 0.81, 9);
    expect(s.cuts).toBe(2);
    // A third breach: no cut, just the inflation raise.
    expect(guardrailYear(c, s, 4, 300000, 1)).toBeCloseTo(41200 * INF ** 3 * 0.81, 9);
    expect(s.event).toBe(GK_EVENT_CUT_LIMITED);
    expect([s.cuts, s.limitedCuts]).toEqual([2, 1]);
    // A raise still happens, and doesn't give a cut back.
    expect(guardrailYear(c, s, 5, 1e7, 1)).toBeCloseTo(41200 * INF ** 4 * 0.81 * 1.1, 9);
    expect(s.event).toBe(GK_EVENT_RAISE);
    expect(guardrailYear(c, s, 6, 300000, 1)).toBeCloseTo(41200 * INF ** 5 * 0.81 * 1.1, 9);
    expect(s.event).toBe(GK_EVENT_CUT_LIMITED);
    expect([s.cuts, s.limitedCuts, s.raises]).toEqual([2, 2, 1]);
  });

  it('a breach in the final 15 years is neither a cut nor a limited cut', () => {
    const c = config({ maxCuts: 0 });
    const s = started(c);
    expect(guardrailYear(c, s, 2, 500000, 1)).toBeCloseTo(41200 * INF, 9);
    expect(s.event).toBe(GK_EVENT_CUT_LIMITED);
    for (let t = 3; t < 15; t++) guardrailYear(c, s, t, 1e6 * INF ** (t - 1), 1);
    guardrailYear(c, s, 15, 100000, 1);
    expect(s.event).toBe(0);
    expect([s.cuts, s.limitedCuts]).toEqual([0, 1]);
  });

  it('allows one cut for every 10 retirement years, rounded down', () => {
    expect([0, 9, 10, 19, 29, 30, 34, 40, 41].map(guardrailMaxCuts)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 4]);
  });

  it('with no portfolio in Retirement Year 0, the initial rate is set in the first year there is one', () => {
    const c = config();
    const s = newGuardrailState();
    expect(guardrailYear(c, s, 1, 0, 1)).toBeCloseTo(41200, 9);
    expect([s.iwr, s.event]).toEqual([0, 0]);
    // Until then spending follows inflation, even after a loss.
    expect(guardrailYear(c, s, 2, 0, -1)).toBeCloseTo(41200 * INF, 9);
    expect([s.iwr, s.event]).toEqual([0, 0]);
    const y3 = guardrailYear(c, s, 3, 800000, 1);
    expect(y3).toBeCloseTo(41200 * INF * INF, 9);
    expect(s.event).toBe(GK_EVENT_START);
    expect(s.iwr).toBeCloseTo(y3 / 800000, 12);
    expect(s.startPortfolio).toBe(0);
  });

  it('an empty portfolio is an unbounded withdrawal rate: cuts (up to the limit) until the final 15 years', () => {
    const c = config();
    const s = started(c);
    expect(guardrailYear(c, s, 2, 0, 1)).toBeCloseTo(41200 * INF * 0.9, 9);
    expect(guardrailYear(c, s, 3, -5000, -1)).toBeCloseTo(41200 * INF * 0.9 * 0.9, 9);
    expect(s.event).toBe(GK_EVENT_FREEZE | GK_EVENT_CUT);
  });

  it('after the first death, spending is scaled for the survivor and the rate uses the scaled amount', () => {
    const c = config({ tFirstDeath: 2, survivorScale: 0.75 });
    const s = started(c);
    expect(guardrailYear(c, s, 2, 1000000, 1)).toBeCloseTo(41200 * INF, 9);
    // Year 3: 0.75 x 43,709 = 32,782 on 1,000,000 = 3.28% < 3.30%: raise.
    expect(guardrailYear(c, s, 3, 1000000, 1)).toBeCloseTo(41200 * INF * INF * 1.1 * 0.75, 9);
    expect(s.event).toBe(GK_EVENT_RAISE);
    expect(s.finalNominal).toBeCloseTo(s.spending * 0.75, 9);
  });

  it('without inflation adjustment, spending moves only on the guardrails', () => {
    const c = config({ adjustInflation: false });
    const s = newGuardrailState();
    expect(guardrailYear(c, s, 1, 1000000, 1)).toBe(40000);
    expect(guardrailYear(c, s, 2, 1000000, 1)).toBe(40000);
    expect(guardrailYear(c, s, 3, 900000, -1)).toBe(40000);
    expect(s.freezes).toBe(0);
    expect(guardrailYear(c, s, 4, 500000, 1)).toBe(36000);
  });

  it('records the starting, final, highest and lowest spending, in nominal and real dollars', () => {
    const c = config();
    const s = started(c);
    guardrailYear(c, s, 2, 700000, 1); // cut
    guardrailYear(c, s, 3, 1000000, 1);
    guardrailYear(c, s, 4, 3000000, 1); // raise
    const y = [41200, 41200 * INF * 0.9, 41200 * INF ** 2 * 0.9, 41200 * INF ** 3 * 0.9 * 1.1];
    expect(s.startNominal).toBeCloseTo(y[0], 9);
    expect(s.startReal).toBeCloseTo(40000, 9);
    expect(s.finalNominal).toBeCloseTo(y[3], 9);
    expect(s.finalReal).toBeCloseTo(40000 * 0.9 * 1.1, 9);
    expect(s.peakNominal).toBeCloseTo(y[3], 9);
    expect(s.peakReal).toBeCloseTo(40000, 9);
    expect(s.lowNominal).toBeCloseTo(y[1], 9);
    expect(s.lowReal).toBeCloseTo(36000, 9);
    expect([s.cuts, s.raises, s.freezes]).toEqual([1, 1, 0]);
  });
});

describe('guardrailConfig', () => {
  const { plan } = loadPlanFixture('sept27', 'imported');
  const inputs = extractSimInputs({ ...plan, simulation_type: GK_SIMULATION_TYPE });
  const nb = prepareNumbaInputs(inputs);
  const c = guardrailConfig(inputs, nb);

  it('Retirement Year 0 is the first year of regular spending; the final 15 years end the plan', () => {
    expect(c.startT).toBe(Math.max(0, inputs.desired_spending_start_age - inputs.user_age));
    expect(c.noCutFromT).toBe(inputs.total_years - 15);
    expect(c.maxCuts).toBe(Math.floor((inputs.total_years - c.startT) / 10));
    expect(c.baseSpending).toBe(inputs.desired_spending);
    expect(c.survivorScale).toBeCloseTo(inputs.survivor_spending / inputs.desired_spending, 12);
  });

  it('a candidate spending keeps the survivor proportion', () => {
    const half = guardrailConfig(inputs, prepareNumbaInputs(inputs, inputs.desired_spending / 2));
    expect(half.baseSpending).toBe(inputs.desired_spending / 2);
    expect(half.survivorScale).toBeCloseTo(c.survivorScale, 12);
  });

  it('only plans in the guardrails mode use the rules', () => {
    expect(isGuardrailPlan(plan)).toBe(false);
    expect(extractSimInputs(plan).guardrails).toBeUndefined();
    expect(kernelParams(extractSimInputs(plan), prepareNumbaInputs(extractSimInputs(plan))).gk).toBeNull();
    expect(inputs.guardrails).toBe(true);
    expect(guardrailSolves({ simulation_type: GK_SIMULATION_TYPE })).toBe(true);
    expect(guardrailSolves({ simulation_type: GK_SIMULATION_TYPE, gk_spending_mode: 'specified' })).toBe(false);
    expect(guardrailSolves({ simulation_type: 'regular', gk_spending_mode: 'solve' })).toBe(false);
  });
});

/** A single retiree with $1,000,000, no other income and nothing but regular spending. */
const simplePlan = (over: Record<string, unknown> = {}) => ({
  user_age: 65, user_retirement_age: 65, user_age_death: 95, desired_spending: 40000, inflation_rate: 3, runs: 2000,
  social_security: { user_future_entitled: false, user_entitled: false, user_amount: 0 },
  pretax_assets: { present_balance: 600000, return_mean: 6, return_std: 12 },
  roth_assets: { present_balance: 100000, return_mean: 6, return_std: 12 },
  taxable_assets: { present_balance: 300000, return_mean: 6, return_std: 12 },
  simulation_type: GK_SIMULATION_TYPE,
  gk_spending_mode: 'specified',
  ...over,
});

const gkPlan = (name: string, over: Record<string, unknown> = {}) =>
  ({ ...loadPlanFixture(name, 'imported').plan, goal_seeking: false, simulation_type: GK_SIMULATION_TYPE, gk_spending_mode: 'specified', ...over });

/** The kernel's and the projection's year-end totals on the same returns: worst relative difference. */
function kernelVsProjection(plan: Record<string, any>, returns: (t: number) => number): { worst: number; events: number } {
  const inputs = extractSimInputs(plan);
  const years = inputs.total_years;
  const m = meanReturns(inputs);
  const s = (v: number) => Float64Array.from({ length: years }, (_, t) => v + returns(t));
  const r = {
    preUser: s(m.pretax), preSpouse: s(m.pretaxSpouse), roth: s(m.roth),
    taxable: s(m.taxable), hsaUser: s(m.hsa), hsaSpouse: s(m.hsaSpouse),
  };
  const traj = new Float64Array(years + 1);
  const res = simulatePath(kernelParams(inputs, prepareNumbaInputs(inputs)), r, traj);
  const path = runSimulationPath(inputs, r.preUser, r.roth, r.taxable, r.hsaUser, null, r.preSpouse, r.hsaSpouse);
  let worst = 0;
  let events = 0;
  let cuts = 0;
  let raises = 0;
  let freezes = 0;
  let limited = 0;
  path.forEach((step, t) => {
    const e = step.ending_assets.total - (t === years - 1 ? step.ending_assets.terminal_life_insurance ?? 0 : 0);
    const k = traj[t + 1] - (t === years - 1 ? step.ending_assets.terminal_life_insurance ?? 0 : 0);
    worst = Math.max(worst, Math.abs(e - k) / Math.max(1, Math.abs(e)));
    const ev: number = step.guardrail.event;
    if (ev & ~GK_EVENT_START) events++;
    if (ev & GK_EVENT_CUT) cuts++;
    if (ev & GK_EVENT_RAISE) raises++;
    if (ev & GK_EVENT_FREEZE) freezes++;
    if (ev & GK_EVENT_CUT_LIMITED) limited++;
  });
  // The kernel counted the same decisions.
  const g = res.guardrails!;
  expect([g.cuts, g.raises, g.freezes, g.limitedCuts]).toEqual([cuts, raises, freezes, limited]);
  expect(cuts).toBeLessThanOrEqual(guardrailConfig(inputs, prepareNumbaInputs(inputs)).maxCuts);
  return { worst, events };
}

describe('MC kernel under guardrails == deterministic projection under guardrails', () => {
  let total = 0;
  for (const { name } of fixtureIndex().plans) {
    it(`${name}: mean returns`, () => {
      const { worst, events } = kernelVsProjection(gkPlan(name), () => 0);
      expect(worst).toBeLessThan(1e-12);
      total += events;
    });
    it(`${name}: a volatile path`, () => {
      // A crash every few years, so raises are skipped and cuts made
      const { worst, events } = kernelVsProjection(gkPlan(name), (t) => (t % 4 === 1 ? -0.3 : t % 4 === 3 ? 0.12 : 0));
      expect(worst).toBeLessThan(1e-12);
      total += events;
    });
  }
  it('the guardrails acted on these paths', () => {
    expect(total).toBeGreaterThan(50);
  });
});

describe('deterministic projection under guardrails', () => {
  const plan = gkPlan('sept27');
  const rows = runDeterministic(plan);
  const inputs = extractSimInputs(plan);
  const startT = Math.max(0, inputs.desired_spending_start_age - inputs.user_age);

  it('starts regular spending in Retirement Year 0 at the plan\'s spending, indexed to that year', () => {
    for (const r of rows.slice(0, startT)) expect(r.desired_spending).toBe(0);
    expect(rows[startT].desired_spending).toBeCloseTo(inputs.desired_spending * (1 + inputs.inflation_rate / 100) ** startT, 6);
    expect(rows[startT].milestones.some((m: string) => /^Guardrails Set \(Initial Withdrawal Rate \d+\.\d%\)$/.test(m))).toBe(true);
  });

  it('each later year follows from the one before by the year\'s events', () => {
    const inf = 1 + inputs.inflation_rate / 100;
    const tFirstDeath = Math.min(inputs.user_age_death - inputs.user_age, inputs.spouse_age_death - inputs.spouse_age);
    const scale = (t: number) => (inputs.is_married && t > tFirstDeath ? inputs.survivor_spending / inputs.desired_spending : 1);
    let seen = 0;
    for (let t = startT + 1; t < rows.length; t++) {
      const ev: number = rows[t].guardrail.event;
      let factor = ev & GK_EVENT_FREEZE ? 1 : inf;
      if (ev & GK_EVENT_CUT) factor *= 0.9;
      if (ev & GK_EVENT_RAISE) factor *= 1.1;
      expect(rows[t].desired_spending / scale(t)).toBeCloseTo((rows[t - 1].desired_spending / scale(t - 1)) * factor, 4);
      expect(rows[t].milestones.includes('Guardrails: Spending Cut 10%')).toBe(Boolean(ev & GK_EVENT_CUT));
      expect(rows[t].milestones.includes('Guardrails: Spending Raised 10%')).toBe(Boolean(ev & GK_EVENT_RAISE));
      expect(rows[t].milestones.includes('Guardrails: Inflation Raise Skipped')).toBe(Boolean(ev & GK_EVENT_FREEZE));
      expect(rows[t].milestones.some((m: string) => /^Guardrails: Cut Not Made \(Limit of \d+ Cuts Reached\)$/.test(m)))
        .toBe(Boolean(ev & GK_EVENT_CUT_LIMITED));
      if (ev & (GK_EVENT_CUT | GK_EVENT_RAISE)) seen++;
      // Mean returns are positive, so no raise is skipped; no cuts in the final 15 years.
      expect(ev & GK_EVENT_FREEZE).toBe(0);
      if (t >= rows.length - 15) expect(ev & GK_EVENT_CUT).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('the plan outside the guardrails mode is unchanged', () => {
    const regular = runDeterministic(loadPlanFixture('sept27', 'imported').plan);
    expect(deepClose(regular, loadPlanFixture('sept27', 'det_rows'), 1e-6)).toBeNull();
    expect(regular.every((r) => !('guardrail' in r))).toBe(true);
  });

  it('the withdrawal rate is regular spending only: a lumpy expense or a one-time receipt acts only through the portfolio', () => {
    // Retire at 65 on $40,000 from $1,000,000 (4%). At 67 a one-time $200,000 expense; at 70 a $300,000 inheritance.
    const quiet = runDeterministic(simplePlan());
    const lumpy = runDeterministic(simplePlan({
      additional_spending: [{ name: 'Roof', amount: 200000, start_age: 67, start_age_type: 'user', interval: 0, adjust_inflation: false }],
      income_sources: [{
        name: 'Inheritance', amount: 300000, frequency: 'one_time', start_age_type: 'user_specified', start_age_specified: 70,
        end_age_type: 'user_specified', end_age_specified: 70, subject_to_tax: false, adjust_type: 'none', adjust_val: 0,
      }],
    }));
    expect([2, 3, 4, 5].map((t) => quiet[t].guardrail.event)).toEqual([0, 0, 0, 0]);
    // In their own year neither moves the rate (the year's beginning portfolio is the same as without them)...
    expect(lumpy[2].guardrail.event).toBe(0);
    expect(lumpy[2].desired_spending).toBeCloseTo(quiet[2].desired_spending, 6);
    expect(lumpy[5].guardrail.event & GK_EVENT_RAISE).toBe(0);
    // ...but the smaller portfolio after the expense does.
    expect(lumpy[3].guardrail.event & GK_EVENT_CUT).toBe(GK_EVENT_CUT);
  });
});

describe('Monte Carlo under guardrails', () => {
  const plan = gkPlan('sept27', { runs: 3000 });
  const inputs = extractSimInputs(plan);
  const startT = Math.max(0, inputs.desired_spending_start_age - inputs.user_age);

  it('reports the guardrail statistics', async () => {
    const stats = await generateRuns(plan, { seed: SEED, chunks: 3 });
    const g = stats.guardrails!;
    expect(g.start_year_index).toBe(startT);
    expect(g.starting_withdrawal).toBeCloseTo(inputs.desired_spending * (1 + inputs.inflation_rate / 100) ** startT, 6);
    expect(g.starting_withdrawal_real).toBeCloseTo(inputs.desired_spending, 6);
    expect(g.starting_portfolio).toBeGreaterThan(0);
    expect(g.starting_withdrawal_pct).toBeCloseTo((g.starting_withdrawal / g.starting_portfolio) * 100, 9);
    expect(g.initial_withdrawal_rate).toBeGreaterThan(0);
    for (const k of ['final_withdrawal', 'peak_withdrawal', 'lowest_withdrawal'] as const) {
      for (const s of [g[k], g[`${k}_real`]]) {
        expect(s.min).toBeLessThanOrEqual(s.mean);
        expect(s.mean).toBeLessThanOrEqual(s.max);
        expect(s.min).toBeGreaterThanOrEqual(0);
      }
    }
    // On every path: lowest <= start <= peak, lowest <= final <= peak.
    expect(g.lowest_withdrawal.max).toBeLessThanOrEqual(g.starting_withdrawal + 1e-6);
    expect(g.peak_withdrawal.min).toBeGreaterThanOrEqual(g.starting_withdrawal - 1e-6);
    expect(g.final_withdrawal.mean).toBeLessThanOrEqual(g.peak_withdrawal.mean);
    expect(g.final_withdrawal.mean).toBeGreaterThanOrEqual(g.lowest_withdrawal.mean);
    for (const p of [g.pct_runs_cut, g.pct_runs_raise, g.pct_runs_freeze]) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    // The outcome differs from the same spending without the rules.
    const regular = await generateRuns({ ...plan, simulation_type: 'regular' }, { seed: SEED, chunks: 3 });
    expect(regular.guardrails).toBeUndefined();
    expect(regular.run_median).not.toBe(stats.run_median);
  }, 60_000);

  it('does not depend on how the runs are split (beyond the last bits of the means)', async () => {
    const job: McJob = { plan, seed: 7, testSpending: null, stress: null, collect: { endings: true, trajCap: 500, spaghetti: 20 } };
    const years = inputs.total_years;
    const one = summarize(await localRunner(job, splitRanges(3000, 1)), 3000, years);
    const many = summarize(await localRunner(job, splitRanges(3000, 7)), 3000, years);
    expect(one.guardrails).toBeDefined();
    expect(deepClose(many, one, 1e-12)).toBeNull();
    const { guardrails: _a, ...restOne } = one;
    const { guardrails: _b, ...restMany } = many;
    expect(deepClose(restMany, restOne, 0)).toBeNull();
  }, 60_000);

  it('a retiree living on the portfolio alone: the textbook behaviour', async () => {
    const p = simplePlan();
    const stats = await generateRuns(p, { seed: SEED });
    const g = stats.guardrails!;
    expect(g.start_year_index).toBe(0);
    expect(g.starting_withdrawal).toBe(40000);
    expect(g.starting_portfolio).toBe(1000000);
    expect(g.starting_withdrawal_pct).toBeCloseTo(4, 12);
    expect(g.initial_withdrawal_rate).toBeCloseTo(4, 12);
    expect(g.lowest_withdrawal.max).toBe(40000);
    expect(g.peak_withdrawal.min).toBeGreaterThanOrEqual(40000);
    // 30 retirement years: at most 3 cuts on any path.
    expect(g.max_cuts).toBe(3);
    // Nominal spending falls only by a cut.
    expect(g.lowest_withdrawal.min).toBeGreaterThanOrEqual(40000 * 0.9 ** 3 - 1e-6);
    expect(g.pct_runs_max_cuts).toBeGreaterThan(0);
    expect(g.pct_runs_max_cuts).toBeLessThan(g.pct_runs_cut);
    // Some paths are cut, some raised, but not all of either.
    for (const pct of [g.pct_runs_cut, g.pct_runs_raise]) {
      expect(pct).toBeGreaterThan(20);
      expect(pct).toBeLessThan(95);
    }
    expect(g.cuts_distribution.length).toBeGreaterThanOrEqual(1);
    expect(g.cuts_distribution[0].pct).toBe(g.pct_runs_cut);
    if (g.cuts_distribution.length > 1) {
      expect(g.cuts_distribution[1].pct).toBeLessThanOrEqual(g.cuts_distribution[0].pct);
    }
    expect(g.raises_distribution.length).toBeGreaterThanOrEqual(1);
    expect(g.raises_distribution[0].pct).toBe(g.pct_runs_raise);
    expect(g.freezes_distribution.length).toBeGreaterThanOrEqual(1);
    expect(g.freezes_distribution[0].pct).toBe(g.pct_runs_freeze);
    // Adapting the spending rescues most of the paths that fixed spending would sink.
    const fixed = await generateRuns({ ...p, simulation_type: 'regular' }, { seed: SEED });
    expect(stats.run_success).toBeGreaterThan(fixed.run_success + 20);
    // So a 99% success rate supports a much higher starting spending than a fixed amount does.
    const withRules = await binarySearch(p, { seed: SEED, targetSuccessRate: 99 });
    const without = await binarySearch({ ...p, simulation_type: 'regular' }, { seed: SEED, targetSuccessRate: 99 });
    expect(withRules.achieved_success_rate).toBeGreaterThanOrEqual(99);
    expect(withRules.achieved_spending).toBeGreaterThan(without.achieved_spending * 1.5);
  }, 120_000);

  it('solves the starting spending for a 99% success rate', async () => {
    const small = { ...plan, runs: 1000 };
    const found = await binarySearch(small, { seed: SEED, chunks: 2, targetSuccessRate: 99 });
    expect(found.achieved_success_rate).toBeGreaterThanOrEqual(99);
    expect(found.achieved_spending).toBeGreaterThan(0);
    // The same paths at the solved spending succeed at that rate; a little more spending falls short.
    const at = async (spending: number) => {
      const job: McJob = { plan: small, seed: SEED, testSpending: spending, stress: null, collect: { endings: false, trajCap: 0, spaghetti: 0 } };
      return (await localRunner(job, splitRanges(1000, 1)))[0].successes / 10;
    };
    expect(await at(found.achieved_spending)).toBe(found.achieved_success_rate);
    expect(await at(found.achieved_spending * 1.05)).toBeLessThan(99);
    // The plan's own target is used without the override.
    const own = await binarySearch(small, { seed: SEED, chunks: 2 });
    expect(own.achieved_spending).toBeGreaterThan(found.achieved_spending);
  }, 120_000);

  it('the stress test applies the rules on the crisis returns and inflation', async () => {
    const res = await runHistoricalStressTest(simplePlan(), { seed: SEED, scenarioKey: '1973_stagflation' });
    const stress = res.stress_results.guardrails!;
    const regular = res.regular_results.guardrails!;
    expect(stress.start_year_index).toBe(0);
    expect(stress.starting_withdrawal).toBe(regular.starting_withdrawal);
    // A crisis at retirement means more paths are cut, and real spending falls further.
    expect(stress.pct_runs_cut).toBeGreaterThan(regular.pct_runs_cut);
    expect(stress.lowest_withdrawal_real.mean).toBeLessThan(regular.lowest_withdrawal_real.mean);
    expect(stress.final_withdrawal_real.mean).toBeLessThan(regular.final_withdrawal_real.mean);
    // Real amounts are deflated by the crisis years' own inflation, not the plan's rate.
    expect(stress.final_withdrawal.mean / stress.final_withdrawal_real.mean)
      .toBeGreaterThan(regular.final_withdrawal.mean / regular.final_withdrawal_real.mean);
  }, 60_000);
});
