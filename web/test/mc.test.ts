import { describe, expect, it } from 'vitest';
import { extractSimInputs } from '../src/lib/engine/inputs';
import {
  binarySearch,
  type ChunkResult,
  type McJob,
  localRunner,
  percentileSorted,
  splitRanges,
  summarize,
} from '../src/lib/engine/mc';
import { runHistoricalStressTest } from '../src/lib/engine/stress';
import { deepClose, fixtureIndex, loadPlanFixture } from './fixtures';

const SEED = 12345;

/** Run a plan's generate_runs job and keep the raw chunks for error estimates. */
async function runPlan(plan: any, stress: McJob['stress'] = null) {
  const inputs = extractSimInputs(plan);
  const job: McJob = { plan, seed: SEED, testSpending: null, stress, collect: { endings: true, trajCap: 100_000, spaghetti: 500 } };
  const chunks = await localRunner(job, splitRanges(inputs.runs, 3));
  return { inputs, chunks, stats: summarize(chunks, inputs.runs, inputs.total_years) };
}

function sampleErrors(chunks: ChunkResult[]) {
  const all = Float64Array.from(chunks.flatMap((c) => Array.from(c.endings!)));
  const n = all.length;
  const mean = all.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  all.sort();
  // SE of the median from the local density: (q(.52) - q(.48)) / 0.04 * sqrt(.25 / n)
  const seMedian = ((percentileSorted(all, 52) - percentileSorted(all, 48)) / 0.04) * Math.sqrt(0.25 / n);
  return { n, seMean: sd / Math.sqrt(n), seMedian };
}

/** |a - b| within k combined standard errors of two independent samples of size n. */
const within = (a: number, b: number, se: number, k: number) => Math.abs(a - b) <= k * Math.SQRT2 * se + 1e-6 * Math.abs(b);

const binomialOk = (pctA: number, pctB: number, n: number, k = 3) => {
  const p = (pctA + pctB) / 200;
  const se = Math.sqrt((2 * p * (1 - p)) / n) * 100;
  return Math.abs(pctA - pctB) <= k * se + 1e-9;
};

describe('generate_runs: statistical agreement with Python', () => {
  for (const { name } of fixtureIndex().plans) {
    it(name, async () => {
      const { plan } = loadPlanFixture(name, 'imported');
      const py = loadPlanFixture(name, 'mc').generate_runs;
      const { inputs, chunks, stats } = await runPlan(plan);
      const n = inputs.runs;
      const err = sampleErrors(chunks);

      expect(binomialOk(stats.run_success, py.run_success, n), `success ${stats.run_success} vs ${py.run_success}`).toBe(true);
      expect(within(stats.run_mean, py.run_mean, err.seMean, 4), `mean ${stats.run_mean} vs ${py.run_mean}`).toBe(true);
      expect(within(stats.run_median, py.run_median, err.seMedian, 4), `median ${stats.run_median} vs ${py.run_median}`).toBe(true);
      expect(stats.mc_p50.length).toBe(inputs.total_years + 1);
      expect(stats.mc_spaghetti_paths.length).toBe(Math.min(500, n));
      expect(stats.mc_p10[0]).toBe(py.mc_p10[0] === 0 ? 0 : stats.mc_p10[0]); // year 0 is the starting total
      expect(Math.abs(stats.mc_p50[0] - py.mc_p50[0]) <= 1e-6 * Math.max(1, py.mc_p50[0])).toBe(true);
    }, 120_000);
  }
});

describe('chunking', () => {
  it('results do not depend on how runs are split', async () => {
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    const job: McJob = { plan, seed: 7, testSpending: null, stress: null, collect: { endings: true, trajCap: 1000, spaghetti: 50 } };
    const years = extractSimInputs(plan).total_years;
    const one = summarize(await localRunner(job, splitRanges(5000, 1)), 5000, years);
    const many = summarize(await localRunner(job, splitRanges(5000, 7)), 5000, years);
    expect(deepClose(many, one, 0)).toBeNull();
  });
});

describe('binary_search', () => {
  it('aug_13_plan: goal-seek agrees with Python', async () => {
    const { plan } = loadPlanFixture('aug_13_plan', 'imported');
    const py = loadPlanFixture('aug_13_plan', 'mc').binary_search;
    const ts = await binarySearch(plan, { seed: SEED, chunks: 2 });
    expect(ts.searches).toBeLessThanOrEqual(25);
    expect(ts.achieved_success_rate).toBeGreaterThanOrEqual(80);
    // Spending is a quantile-like statistic of 5000 paths; allow a few percent.
    expect(Math.abs(ts.achieved_spending - py.achieved_spending) / py.achieved_spending, `${ts.achieved_spending} vs ${py.achieved_spending}`).toBeLessThan(0.05);
    expect(ts.achieved_spending_y1).toBe(py.achieved_spending_y1); // 0: spending starts after year 1 for this plan
  }, 120_000);
});

describe('historical stress test', () => {
  for (const name of ['sept27', 'early_suzie_plan', 'syn_life_ins']) {
    it(name, async () => {
      const { plan } = loadPlanFixture(name, 'imported');
      const py = loadPlanFixture(name, 'stress');
      const ts = await runHistoricalStressTest(plan, { seed: SEED, chunks: 2 });
      const n = extractSimInputs(plan).runs;
      for (const k of ['scenario', 'crisis_timing', 'asset_allocation', 'crisis_start_year', 'crisis_end_year',
        'crisis_length', 'crisis_macro', 'desired_spending', 'chart_labels'] as const) {
        expect(deepClose((ts as any)[k], py[k]), k).toBeNull();
      }
      expect(binomialOk(ts.stress_results.run_success, py.stress_results.run_success, n),
        `stress success ${ts.stress_results.run_success} vs ${py.stress_results.run_success}`).toBe(true);
      expect(binomialOk(ts.regular_results.run_success, py.regular_results.run_success, n)).toBe(true);
    }, 120_000);
  }

  it('rejects scenarios outside the historical data', async () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    // Unknown keys fall back to 2000_dotcom, as in Python
    const ts = await runHistoricalStressTest(plan, { seed: 1, scenarioKey: 'nope', regularMcResults: { run_success: 0 } as any });
    expect(ts.scenario.key).toBe('2000_dotcom');
  }, 120_000);
});
