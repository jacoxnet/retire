import { describe, expect, it } from 'vitest';
import { computeResults, runStressTest, type RunProgress } from '../../src/lib/app/runResults';
import { resultsContext } from '../../src/lib/app/results';
import { type ChunkRunner, localRunner } from '../../src/lib/engine/mc';
import { deepClose, loadPlanFixture } from '../fixtures';

/** The local runner, recording how many paths each job ran. */
function countingRunner() {
  const jobs: Array<{ paths: number; testSpending: number | null; stress: boolean }> = [];
  const runner: ChunkRunner = (job, ranges, onProgress) => {
    jobs.push({ paths: ranges.reduce((n, [, c]) => n + c, 0), testSpending: job.testSpending, stress: job.stress !== null });
    return localRunner(job, ranges, onProgress);
  };
  return { runner, jobs };
}

function checkProgress(seen: RunProgress[], stages: string[]) {
  expect([...new Set(seen.map((p) => p.stage))]).toEqual(stages);
  for (const stage of stages) {
    const fr = seen.filter((p) => p.stage === stage).map((p) => p.fraction);
    expect(fr.at(-1)).toBe(1);
    fr.forEach((f, i) => i && expect(f).toBeGreaterThanOrEqual(fr[i - 1]));
  }
  expect(seen.every((p) => p.steps === stages.length && p.step === stages.indexOf(p.stage) + 1)).toBe(true);
}

describe('computeResults', () => {
  it('a regular plan: deterministic rows, Monte Carlo and the default stress test against the same baseline', async () => {
    const { plan } = loadPlanFixture('syn_life_ins', 'imported');
    const fixtureMc = loadPlanFixture('syn_life_ins', 'mc').generate_runs;
    const { runner, jobs } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(plan, { runner, chunks: 4, seed: 11, onProgress: (p) => seen.push(p) });

    expect(deepClose(r.det_rows, loadPlanFixture('syn_life_ins', 'det_rows'))).toBeNull();
    expect(r.goal_seeking).toBe(false);
    expect(r.mc_spaghetti_paths).toHaveLength(500);
    // Same plan, different random paths: agrees with Python within sampling error.
    const p = fixtureMc.run_success / 100;
    expect(Math.abs(r.run_success - fixtureMc.run_success) / 100).toBeLessThan(3 * Math.sqrt((2 * p * (1 - p)) / plan.runs) + 1e-9);
    // The stress test's baseline is this run, not a second one.
    expect(jobs.map((j) => [j.paths, j.stress])).toEqual([[plan.runs, false], [plan.runs, true]]);
    expect(r.stress_test.regular_results.run_success).toBe(r.run_success);
    expect(r.stress_test.regular_results.mc_p50).toEqual(r.mc_p50);
    expect(r.stress_test.scenario.key).toBe('2000_dotcom');
    expect('scenarios_list' in r.stress_test).toBe(false);
    checkProgress(seen, ['mc', 'stress']);

    // The page's context is resultsContext over these pieces.
    const { stress_test, ...rest } = r;
    const again = resultsContext(plan, r.det_rows, r, null, stress_test);
    expect(again).toEqual({ ...rest, stress_test });
  }, 60_000);

  it('a goal-seeking plan: capped search, full run at the solved spending, baseline at the plan spending', async () => {
    const { plan } = loadPlanFixture('aug_13_plan', 'imported');
    const small = { ...plan, runs: 600 };
    const { runner, jobs } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(small, { runner, chunks: 2, seed: 3, goalSeekRunsCap: 200, onProgress: (p) => seen.push(p) });

    expect(r.goal_seeking).toBe(true);
    expect(r.achieved_spending).toBeGreaterThan(0);
    expect(r.searches).toBeGreaterThan(5);
    const search = jobs.slice(0, r.searches!);
    expect(search.every((j) => j.paths === 200 && j.testSpending !== null && !j.stress)).toBe(true);
    const [mc, baseline, stress] = jobs.slice(r.searches!);
    expect(mc).toEqual({ paths: 600, testSpending: r.achieved_spending, stress: false });
    expect(baseline).toEqual({ paths: 600, testSpending: null, stress: false });
    expect(stress).toEqual({ paths: 600, testSpending: null, stress: true });
    expect(jobs).toHaveLength(r.searches! + 3);
    // The stress test compares with the plan's own spending.
    expect(r.stress_test.desired_spending).toBe(plan.desired_spending);
    expect(r.stress_test.regular_results.run_success).not.toBe(r.run_success);
    checkProgress(seen, ['search', 'mc', 'baseline', 'stress']);
  }, 60_000);

  it('a stress test for another scenario reuses the given baseline', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const small = { ...plan, runs: 300 };
    const r = await computeResults(small, { runner: localRunner, chunks: 1, seed: 1 });
    const { runner, jobs } = countingRunner();
    const stress = await runStressTest(small, { scenarioKey: '2008_gfc', assetAllocation: '60_40', crisisTiming: 'current' },
      r.stress_test.regular_results, { runner, chunks: 1, seed: 2 });
    expect(jobs).toHaveLength(1);
    expect(stress.scenario.key).toBe('2008_gfc');
    expect(stress.asset_allocation).toBe('60_40');
    expect(stress.crisis_timing).toBe('current');
    expect(stress.regular_results.run_success).toBe(r.run_success);
    expect(stress.deltas.delta_success).toBeCloseTo(stress.stress_results.run_success - r.run_success, 12);
  }, 60_000);
});
