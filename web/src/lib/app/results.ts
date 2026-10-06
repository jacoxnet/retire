// The Results page's data: a port of core/views.py results_context, which assembles
// the template context from the engine outputs. Keys keep the template's names.
import { getLifeInsuranceRouting } from '../engine/inputs';
import { CRISIS_SCENARIOS } from '../engine/historicalData';
import type { GoalSeekResult, McStats } from '../engine/mc';
import { get, type Dict } from '../engine/py';
import type { StressResult } from '../engine/stress';

/** One year of run_deterministic (the projection and cash-flow tables). */
export type DetRow = Dict;

/** The stress test as the page receives it (the engine's result, scenarios list optional). */
export type StressData = Omit<StressResult, 'scenarios_list'> & { scenarios_list?: StressResult['scenarios_list'] };

export interface Results extends McStats, Partial<GoalSeekResult> {
  goal_seeking: boolean;
  initial_wealth: number;
  years: number;
  runs: number;
  inflation_rate: number;
  desired_spending: number;
  target_success_rate: number;
  user_name: string;
  user_age: number;
  user_retirement_age: number;
  user_age_death: number;
  is_married: boolean;
  spouse_name: string;
  spouse_age: number;
  spouse_retirement_age: number;
  spouse_age_death: number;
  current_year: number;
  social_security: Dict;
  desired_spending_start_age: number;
  det_rows: DetRow[];
  pretax_assets: Dict;
  spouse_pretax_assets: Dict;
  roth_assets: Dict;
  taxable_assets: Dict;
  hsa_assets: Dict;
  spouse_hsa_assets: Dict;
  /** The plan the results were computed from. */
  plan_data_json: Dict;
  stress_test: StressData;
  scenarios_list: typeof CRISIS_SCENARIOS;
  terminal_life_insurance: number;
  taxable_deposit_amt: number;
  taxable_deposit_t: number;
}

/**
 * results_context: the page's data from the deterministic rows, generate_runs'
 * statistics, the goal-seek result (null for a regular simulation) and the default
 * stress test.
 */
export function resultsContext(
  data: Dict, detRows: DetRow[], mcStats: McStats, goal: GoalSeekResult | null, stressTest: StressData,
): Results {
  const isGoal = get(data, 'goal_seeking', false);
  const married = get(data, 'is_married');
  const bal = (key: string, onlyIfMarried = false) =>
    onlyIfMarried && !married ? 0.0 : get(get(data, key, {}), 'present_balance', 0.0);
  const initialWealth = bal('pretax_assets') + bal('spouse_pretax_assets', true) + bal('roth_assets') +
    bal('taxable_assets') + bal('hsa_assets') + bal('spouse_hsa_assets', true);

  const results: Results = {
    goal_seeking: isGoal,
    initial_wealth: initialWealth,
    years: detRows.length,
    runs: get(data, 'runs', 10000),
    inflation_rate: get(data, 'inflation_rate', 2.5),
    desired_spending: get(data, 'desired_spending', 0.0),
    target_success_rate: get(data, 'target_success_rate', 80.0),
    user_name: get(data, 'user_name', 'You'),
    user_age: get(data, 'user_age', 60),
    user_retirement_age: get(data, 'user_retirement_age', 65),
    user_age_death: get(data, 'user_age_death', 90),
    is_married: get(data, 'is_married', false),
    spouse_name: get(data, 'spouse_name', 'Spouse'),
    spouse_age: get(data, 'spouse_age', 60),
    spouse_retirement_age: get(data, 'spouse_retirement_age', 65),
    spouse_age_death: get(data, 'spouse_age_death', 90),
    current_year: get(data, 'current_year', 2026),
    social_security: get(data, 'social_security', {}),
    desired_spending_start_age: detRows.length
      ? get(detRows[0], 'desired_spending_start_age', get(data, 'user_retirement_age', 65))
      : get(data, 'user_retirement_age', 65),
    det_rows: detRows,
    pretax_assets: get(data, 'pretax_assets', {}),
    spouse_pretax_assets: get(data, 'spouse_pretax_assets', {}),
    roth_assets: get(data, 'roth_assets', {}),
    taxable_assets: get(data, 'taxable_assets', {}),
    hsa_assets: get(data, 'hsa_assets', {}),
    spouse_hsa_assets: get(data, 'spouse_hsa_assets', {}),
    plan_data_json: data,
    ...mcStats,
    stress_test: stressTest,
    scenarios_list: CRISIS_SCENARIOS,
    terminal_life_insurance: 0,
    taxable_deposit_amt: 0,
    taxable_deposit_t: -1,
  };
  if (isGoal && goal) Object.assign(results, goal);

  const routing = getLifeInsuranceRouting(data);
  results.terminal_life_insurance = get(routing, 'terminal_life_ins_estate', 0.0);
  results.taxable_deposit_amt = get(routing, 'taxable_deposit_amt', 0.0);
  results.taxable_deposit_t = get(routing, 'taxable_deposit_t', -1);
  return results;
}

/**
 * The plan as the engine sees it: everything but the balance sheet and rebalancing
 * blocks, which only the Enter page reads (balance-sheet edits reach the engine
 * through the accounts when the plan is saved). Results computed from a plan with
 * the same key are still valid.
 */
export function engineKey(plan: Dict): string {
  const { balance_sheet: _bs, rebalancing: _rb, ...rest } = plan;
  return JSON.stringify(rest);
}
