import { describe, expect, it } from 'vitest';
import { computeResults, runStressTest, type RunProgress } from '../../src/lib/app/runResults';
import { resultsContext } from '../../src/lib/app/results';
import { type ChunkRunner, localRunner } from '../../src/lib/engine/mc';
import { deepClose, fixtureIndex, loadPlanFixture } from '../fixtures';

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
    const { runner, jobs } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(plan, { runner, chunks: 4, seed: fixtureIndex().generated_with.mc_seed, onProgress: (p) => seen.push(p) });

    expect(deepClose(r.det_rows, loadPlanFixture('syn_life_ins', 'det_rows'))).toBeNull();
    expect(r.goal_seeking).toBe(false);
    expect(r.mc_spaghetti_paths).toHaveLength(500);
    // The fixtures' seed gives mc.json's statistics, however the runs are chunked.
    const { mc_spaghetti_paths, ...stats } = loadPlanFixture('syn_life_ins', 'mc').generate_runs;
    for (const [k, v] of Object.entries(stats)) expect(deepClose(r[k as keyof typeof r], v, 0), k).toBeNull();
    expect(deepClose(r.mc_spaghetti_paths.slice(0, 5), mc_spaghetti_paths, 0)).toBeNull();
    // The stress stage runs on its own derived seed; its scenario set-up matches stress.json.
    const { regular_results: _r, stress_results: _s, deltas: _d, ...stress } = loadPlanFixture('syn_life_ins', 'stress');
    for (const [k, v] of Object.entries(stress)) expect(deepClose(r.stress_test[k as keyof typeof r.stress_test], v, 0), k).toBeNull();
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

  it('an earliest-retirement plan: search stage, full run at solved retirement ages, baseline at plan age', async () => {
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    const earliestPlan = {
      ...plan,
      runs: 400,
      simulation_type: 'earliest_retirement',
      target_success_rate: 80.0,
    };
    const { runner } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(earliestPlan, { runner, chunks: 1, seed: 5, goalSeekRunsCap: 200, onProgress: (p) => seen.push(p) });

    expect(r.simulation_type).toBe('earliest_retirement');
    expect(r.achieved_user_ret_age).toBeGreaterThanOrEqual(earliestPlan.user_age);
    expect(r.achieved_success_rate).toBeGreaterThanOrEqual(80.0);
    expect(r.det_rows.length).toBeGreaterThan(0);
    checkProgress(seen, ['search', 'mc', 'baseline', 'stress']);
  }, 60_000);
});
