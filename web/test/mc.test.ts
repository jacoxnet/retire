// Seeded Monte Carlo and goal-seek for every plan: exact snapshots in mc.json (the same seed always gives the same paths,
// however the runs are chunked), plus sanity checks that don't depend on the snapshot.
import { describe, expect, it } from 'vitest';
import { extractSimInputs } from '../src/lib/engine/inputs';
import { binarySearch, generateRuns, localRunner, type McJob, splitRanges, summarize } from '../src/lib/engine/mc';
import { deepClose, expectPlanFixture, fixtureIndex, loadPlanFixture } from './fixtures';

const SEED = fixtureIndex().generated_with.mc_seed;
const CHUNKS = 3;

describe('generate_runs / binary_search (mc.json)', () => {
  for (const { name } of fixtureIndex().plans) {
    it(name, async () => {
      const { plan } = loadPlanFixture(name, 'imported');
      const inputs = extractSimInputs(plan);
      const n = inputs.runs;
      const stats = await generateRuns(plan, { seed: SEED, chunks: CHUNKS });

      expect(stats.run_success).toBeGreaterThanOrEqual(0);
      expect(stats.run_success).toBeLessThanOrEqual(100);
      expect(stats.run_min).toBeLessThanOrEqual(stats.run_10);
      expect(stats.run_10).toBeLessThanOrEqual(stats.run_25);
      expect(stats.run_25).toBeLessThanOrEqual(stats.run_median);
      expect(stats.run_median).toBeLessThanOrEqual(stats.run_max);
      expect(stats.mc_p50.length).toBe(inputs.total_years + 1);
      expect(stats.mc_spaghetti_paths.length).toBe(Math.min(500, n));
      // Year 0 is the starting total on every path.
      expect(stats.mc_p10[0]).toBe(stats.mc_p90[0]);

      const goalSeeking = Boolean(plan.goal_seeking);
      let search = null;
      if (goalSeeking) {
        const r = await binarySearch(plan, { seed: SEED, chunks: CHUNKS });
        expect(r.searches).toBeLessThanOrEqual(25);
        search = {
          achieved_spending: r.achieved_spending,
          achieved_success_rate: r.achieved_success_rate,
          searches: r.searches,
          achieved_spending_y1: r.achieved_spending_y1,
        };
      }
      expectPlanFixture({
        seed: SEED,
        runs: n,
        goal_seeking: goalSeeking,
        generate_runs: { ...stats, mc_spaghetti_paths: stats.mc_spaghetti_paths.slice(0, 5) },
        ...(search && { binary_search: search }),
      }, name, 'mc');
    }, 300_000);
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
  it('aug_13_plan: reaches the target success rate', async () => {
    const { plan } = loadPlanFixture('aug_13_plan', 'imported');
    const { binary_search: r } = loadPlanFixture('aug_13_plan', 'mc');
    expect(r.achieved_success_rate).toBeGreaterThanOrEqual(80);
    expect(r.achieved_spending).toBeGreaterThan(0);
    expect(r.achieved_spending_y1).toBe(0); // spending starts after year 1 for this plan
    // ...and the solved spending, run again, still meets the target.
    const check = await generateRuns({ ...plan, goal_seeking: false, desired_spending: r.achieved_spending }, { seed: SEED, chunks: CHUNKS });
    expect(check.run_success).toBeGreaterThanOrEqual(80);
  }, 120_000);
});
