// Historical stress test (run_historical_stress_test in core/runs.py): Monte Carlo with
// a historical crisis replayed in place of the random draws for its duration.
import { crisisSetup, type CrisisMacroRow, type StressSpec } from './crisis';
import { CRISIS_SCENARIOS } from './historicalData';
import { extractSimInputs } from './inputs';
import { generateRuns, type McStats, randomSeed, type RunOptions } from './mc';
import type { Dict } from './py';

export type StressStats = Omit<McStats, 'mc_spaghetti_paths'>;

export interface StressResult {
  scenario: Dict;
  crisis_timing: string;
  asset_allocation: string;
  crisis_start_year: number;
  crisis_end_year: number;
  crisis_length: number;
  crisis_macro: CrisisMacroRow[];
  desired_spending: number;
  stress_results: StressStats;
  regular_results: StressStats;
  deltas: Record<string, number>;
  chart_labels: string[];
  scenarios_list: typeof CRISIS_SCENARIOS;
}

const statsOnly = ({ mc_spaghetti_paths: _, ...rest }: McStats): StressStats => rest;

export async function runHistoricalStressTest(
  plan: Dict,
  opts: RunOptions & Partial<StressSpec> & { regularMcResults?: McStats | StressStats | null } = {},
): Promise<StressResult> {
  const spec: StressSpec = {
    scenarioKey: opts.scenarioKey ?? '2000_dotcom',
    assetAllocation: opts.assetAllocation ?? 'matched',
    crisisTiming: opts.crisisTiming ?? 'retirement',
  };
  const inputs = extractSimInputs(plan);
  const years = inputs.total_years;
  const setup = crisisSetup(inputs, spec); // validates the scenario before any runs
  const seed = opts.seed ?? randomSeed();

  const stress = statsOnly(await generateRuns(plan, { ...opts, seed, stress: spec }));
  const regular: StressStats = opts.regularMcResults
    ? opts.regularMcResults
    : statsOnly(await generateRuns(plan, { ...opts, seed: (seed + 1) >>> 0 }));

  const deltas = {
    delta_success: stress.run_success - regular.run_success,
    delta_mean: stress.run_mean - regular.run_mean,
    delta_median: stress.run_median - regular.run_median,
    delta_25: stress.run_25 - regular.run_25,
    delta_10: stress.run_10 - regular.run_10,
    delta_max: stress.run_max - regular.run_max,
    delta_min: stress.run_min - regular.run_min,
  };

  const chartLabels: string[] = [];
  for (let t = 0; t <= years; t++) chartLabels.push(`Age ${inputs.user_age + t} (${inputs.current_year + t})`);

  return {
    scenario: setup.scenario,
    crisis_timing: spec.crisisTiming,
    asset_allocation: spec.assetAllocation,
    crisis_start_year: inputs.current_year + setup.crisisStartT,
    crisis_end_year: inputs.current_year + Math.max(setup.crisisStartT, setup.crisisEndT - 1),
    crisis_length: setup.crisisLength,
    crisis_macro: setup.macro,
    desired_spending: inputs.desired_spending,
    stress_results: stress,
    regular_results: {
      run_success: regular.run_success,
      run_mean: regular.run_mean,
      run_median: regular.run_median,
      run_10: regular.run_10,
      run_25: regular.run_25,
      run_min: regular.run_min,
      run_max: regular.run_max,
      mc_p10: regular.mc_p10,
      mc_p50: regular.mc_p50,
      mc_p90: regular.mc_p90,
    },
    deltas,
    chart_labels: chartLabels,
    scenarios_list: CRISIS_SCENARIOS,
  };
}
