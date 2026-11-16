import { describe, expect, it } from 'vitest';
import { computeResults, runStressTest, type RunProgress } from '../../src/lib/app/runResults';
import { resultsContext } from '../../src/lib/app/results';
import { runDeterministic } from '../../src/lib/engine/deterministic';
import { type ChunkRunner, localRunner } from '../../src/lib/engine/mc';
import { deepClose, FIXTURE_TOL, fixtureIndex, loadPlanFixture } from '../fixtures';

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

    expect(deepClose(r.det_rows, loadPlanFixture('syn_life_ins', 'det_rows'), FIXTURE_TOL)).toBeNull();
    expect(r.goal_seeking).toBe(false);
    expect(r.mc_spaghetti_paths).toHaveLength(500);
    // The fixtures' seed gives mc.json's statistics, however the runs are chunked.
    const { mc_spaghetti_paths, ...stats } = loadPlanFixture('syn_life_ins', 'mc').generate_runs;
    for (const [k, v] of Object.entries(stats)) expect(deepClose(r[k as keyof typeof r], v, FIXTURE_TOL), k).toBeNull();
    expect(deepClose(r.mc_spaghetti_paths.slice(0, 5), mc_spaghetti_paths, FIXTURE_TOL)).toBeNull();
    // The stress stage runs on its own derived seed; its scenario set-up matches stress.json.
    const { regular_results: _r, stress_results: _s, deltas: _d, ...stress } = loadPlanFixture('syn_life_ins', 'stress');
    for (const [k, v] of Object.entries(stress)) expect(deepClose(r.stress_test[k as keyof typeof r.stress_test], v, FIXTURE_TOL), k).toBeNull();
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

  it('a goal-seeking plan: capped search, full run at the solved spending, stress test against solved plan', async () => {
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
    const [mc, stress] = jobs.slice(r.searches!);
    expect(mc).toEqual({ paths: 600, testSpending: r.achieved_spending, stress: false });
    expect(stress).toEqual({ paths: 600, testSpending: null, stress: true });
    expect(jobs).toHaveLength(r.searches! + 2);
    // Solved deterministic rows and baseline rows
    expect(r.desired_spending).toBe(r.achieved_spending);
    expect(r.plan_data_json.desired_spending).toBe(r.achieved_spending);
    const activeRow = r.det_rows.find((row) => row.is_spending_active);
    expect(activeRow).toBeDefined();
    // The stress test compares with the solved spending
    expect(r.stress_test.desired_spending).toBe(r.achieved_spending);
    expect(r.stress_test.regular_results.run_success).toBe(r.run_success);
    checkProgress(seen, ['search', 'mc', 'stress']);
  }, 60_000);

  it('a guardrails plan solving its starting spending: search at 99%, full run and stress test under the rules', async () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    // The plan's own target (and a stale goal-seeking flag) must not matter in this mode.
    const gk = { ...plan, runs: 600, simulation_type: 'guyton_klinger', goal_seeking: true, target_success_rate: 50 };
    const { runner, jobs } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(gk, { runner, chunks: 2, seed: 3, goalSeekRunsCap: 200, onProgress: (p) => seen.push(p) });

    expect(r.simulation_type).toBe('guyton_klinger');
    expect(r.achieved_spending).toBeGreaterThan(0);
    expect(r.achieved_success_rate).toBeGreaterThanOrEqual(99);
    const search = jobs.slice(0, r.searches!);
    expect(search.every((j) => j.paths === 200 && j.testSpending !== null && !j.stress)).toBe(true);
    expect(jobs.slice(r.searches!)).toEqual([
      { paths: 600, testSpending: r.achieved_spending, stress: false },
      { paths: 600, testSpending: null, stress: true },
    ]);
    checkProgress(seen, ['search', 'mc', 'stress']);

    // The page's plan carries the solved spending, with the survivor's in proportion.
    expect(r.desired_spending).toBe(r.achieved_spending);
    expect(r.plan_data_json.desired_spending).toBe(r.achieved_spending);
    expect(r.plan_data_json.survivor_spending / r.achieved_spending!).toBeCloseTo(plan.survivor_spending / plan.desired_spending, 12);
    expect(r.original_plan_data_json?.desired_spending).toBe(plan.desired_spending);

    // Monte Carlo, the projection and the stress test all ran under the rules from that spending.
    const g = r.guardrails!;
    const inf = 1 + plan.inflation_rate / 100;
    expect(g.starting_withdrawal).toBeCloseTo(r.achieved_spending! * inf ** g.start_year_index, 6);
    expect(g.starting_withdrawal_real).toBeCloseTo(r.achieved_spending!, 6);
    expect(r.run_success).toBeGreaterThan(95);
    expect(r.det_rows).toEqual(runDeterministic(r.plan_data_json));
    expect(r.det_rows[g.start_year_index].desired_spending).toBeCloseTo(g.starting_withdrawal, 6);
    expect(r.det_rows.some((row) => row.milestones.some((m: string) => m.startsWith('Guardrails: Spending')))).toBe(true);
    expect(r.baseline_det_rows?.[g.start_year_index].desired_spending).toBeCloseTo(plan.desired_spending * inf ** g.start_year_index, 6);
    expect(r.stress_test.stress_results.guardrails?.starting_withdrawal).toBeCloseTo(g.starting_withdrawal, 6);
    expect(r.stress_test.regular_results.guardrails).toEqual(g);
    expect(r.stress_test.desired_spending).toBe(r.achieved_spending);

    // Another scenario keeps the rules and the baseline.
    const again = await runStressTest(r.plan_data_json, { scenarioKey: '1973_stagflation', assetAllocation: 'matched', crisisTiming: 'retirement' },
      r.stress_test.regular_results, { runner: localRunner, chunks: 1, seed: 9 });
    expect(again.regular_results.guardrails).toEqual(g);
    expect(again.stress_results.guardrails?.pct_runs_freeze).toBeGreaterThan(0);
  }, 60_000);

  it('a guardrails plan with its own spending: no search, the rules run from the plan\'s spending', async () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    const gk = { ...plan, runs: 400, simulation_type: 'guyton_klinger', gk_spending_mode: 'specified' };
    const { runner, jobs } = countingRunner();
    const seen: RunProgress[] = [];
    const r = await computeResults(gk, { runner, chunks: 2, seed: 3, onProgress: (p) => seen.push(p) });

    expect(jobs).toEqual([{ paths: 400, testSpending: null, stress: false }, { paths: 400, testSpending: null, stress: true }]);
    checkProgress(seen, ['mc', 'stress']);
    expect(r.achieved_spending).toBeUndefined();
    expect(r.baseline_det_rows).toBeUndefined();
    expect(r.desired_spending).toBe(plan.desired_spending);
    const g = r.guardrails!;
    expect(g.starting_withdrawal_real).toBeCloseTo(plan.desired_spending, 6);
    expect(r.det_rows[g.start_year_index].desired_spending).toBeCloseTo(g.starting_withdrawal, 6);
    expect(r.stress_test.stress_results.guardrails).toBeDefined();

    // The same plan in the regular mode has no guardrail statistics.
    const regular = await computeResults({ ...gk, simulation_type: 'regular' }, { runner: localRunner, chunks: 2, seed: 3 });
    expect(regular.guardrails).toBeUndefined();
    expect(regular.stress_test.regular_results.guardrails).toBeUndefined();
    expect(regular.det_rows.every((row) => !row.milestones.some((m: string) => m.startsWith('Guardrails')))).toBe(true);
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

  it('an earliest-retirement plan: search stage, full run at solved retirement ages, stress test against solved plan', async () => {
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
    expect(r.det_rows[0].desired_spending_start_age).toBe(r.achieved_user_ret_age);
    expect(r.baseline_det_rows?.[0].desired_spending_start_age).toBe(earliestPlan.user_retirement_age);
    expect(r.stress_test.regular_results.run_success).toBe(r.run_success);
    checkProgress(seen, ['search', 'mc', 'stress']);
  }, 60_000);
});
