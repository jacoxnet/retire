// Running the simulations behind the Results page (results_view and the stress-test
// API in core/views.py), on any ChunkRunner: the worker pool in the browser, the
// local runner in tests.
import type { StressSpec } from '../engine/crisis';
import { runDeterministic } from '../engine/deterministic';
import { binarySearch, type ChunkRunner, generateRuns, type GoalSeekResult, type McStats } from '../engine/mc';
import type { Dict } from '../engine/py';
import { runHistoricalStressTest } from '../engine/stress';
import { resultsContext, type Results, type StressData } from './results';

/**
 * Goal-seek searches with at most this many paths per candidate (up to 25 of them),
 * then runs the full number of paths once at the solved spending. At 1M runs a full
 * search would take minutes.
 */
export const GOAL_SEEK_RUNS_CAP = 100_000;

export type RunStage = 'search' | 'mc' | 'baseline' | 'stress';

export const STAGE_LABELS: Record<RunStage, string> = {
  search: 'Solving for maximum spending',
  mc: 'Monte Carlo simulation',
  baseline: 'Regular simulation for the stress test',
  stress: 'Historical stress test',
};

export interface RunProgress {
  stage: RunStage;
  /** 1-based step and the number of steps in this run. */
  step: number;
  steps: number;
  /** Progress within the step, 0..1. */
  fraction: number;
}

export interface RunEngine {
  runner: ChunkRunner;
  chunks: number;
}

export interface RunOptions extends RunEngine {
  onProgress?: (p: RunProgress) => void;
  seed?: number;
  goalSeekRunsCap?: number;
}

const stripSpaghetti = ({ mc_spaghetti_paths: _, ...rest }: McStats) => rest;

/** Everything the Results page shows for a plan (a plain, cloneable plan object). */
export async function computeResults(plan: Dict, opts: RunOptions): Promise<Results> {
  const { runner, chunks } = opts;
  const goal = Boolean(plan.goal_seeking);
  const stages: RunStage[] = goal ? ['search', 'mc', 'baseline', 'stress'] : ['mc', 'stress'];
  const report = (stage: RunStage) => (done: number, total: number) =>
    opts.onProgress?.({ stage, step: stages.indexOf(stage) + 1, steps: stages.length, fraction: total > 0 ? Math.min(1, done / total) : 1 });
  // Run a stage and report it complete (a goal search can stop before its 25 steps).
  const stage = async <T>(name: RunStage, work: (onProgress: (done: number, total: number) => void) => Promise<T>): Promise<T> => {
    const out = await work(report(name));
    report(name)(1, 1);
    return out;
  };
  const seed = (n: number) => (opts.seed === undefined ? undefined : (opts.seed + n) >>> 0);

  const detRows = runDeterministic(plan);

  let mc: McStats;
  let solved: GoalSeekResult | null = null;
  let baseline: Omit<McStats, 'mc_spaghetti_paths'>;
  if (!goal) {
    mc = await stage('mc', (onProgress) => generateRuns(plan, { runner, chunks, seed: seed(0), onProgress }));
    baseline = stripSpaghetti(mc);
  } else {
    const cap = opts.goalSeekRunsCap ?? GOAL_SEEK_RUNS_CAP;
    const searchPlan = Number(plan.runs) > cap ? { ...plan, runs: cap } : plan;
    const found = await stage('search', (onProgress) => binarySearch(searchPlan, { runner, chunks, seed: seed(1), onProgress }));
    solved = found;
    mc = await stage('mc', (onProgress) =>
      generateRuns(plan, { runner, chunks, seed: seed(2), testSpending: found.achieved_spending, onProgress }));
    // The stress test compares against the plan's own spending, not the solved one.
    baseline = stripSpaghetti(await stage('baseline', (onProgress) => generateRuns(plan, { runner, chunks, seed: seed(3), onProgress })));
  }

  const stress = await stage('stress', (onProgress) =>
    runStressTest(plan, { scenarioKey: '2000_dotcom', assetAllocation: 'matched', crisisTiming: 'retirement' },
      baseline, { runner, chunks, seed: seed(4), onProgress: (p) => onProgress(p.fraction, 1) }));
  return resultsContext(plan, detRows, mc, solved, stress);
}

/**
 * The stress test for a scenario (the /api/stress_test/ endpoint), compared with an
 * already computed regular simulation at the plan's spending.
 */
export async function runStressTest(
  plan: Dict, spec: StressSpec, regular: StressData['regular_results'], opts: RunOptions,
): Promise<StressData> {
  const { runner, chunks } = opts;
  const res = await runHistoricalStressTest(plan, {
    ...spec,
    runner,
    chunks,
    seed: opts.seed,
    regularMcResults: regular,
    onProgress: (done, total) => opts.onProgress?.({ stage: 'stress', step: 1, steps: 1, fraction: total > 0 ? done / total : 1 }),
  });
  const { scenarios_list: _, ...stress } = res;
  return stress;
}
