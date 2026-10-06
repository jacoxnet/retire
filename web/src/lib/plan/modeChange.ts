// Results-page edits: the simulation mode switch and the Simulation Inputs card
// (apply_mode_change in core/views.py). Inputs arrive as entered (strings or numbers).
import { pyRound } from '../engine/py';
import { syncAccountsToBalanceSheet } from './balanceSheet';
import { getFloat, getInt } from './coerce';
import type { Plan } from './types';
import { deathAgeErrors } from './validate';

/** Field values from the Results page; absent keys mean "not submitted". */
export type ModeChangeInput = Record<string, string | number | null | undefined>;

export interface ModeChangeMessage {
  level: 'error';
  message: string;
}

type Obj = Record<string, any>;

const RETURN_PREFIXES = ['pretax', 'spouse_pretax', 'roth', 'taxable', 'hsa', 'spouse_hsa'] as const;

/**
 * Apply the edits to `plan` in place and return any messages. A field is applied only
 * when its value differs from the saved value at the precision the card displays,
 * because the card always submits every field (as rounded copies). An age-at-death
 * change that fails the Enter page's checks is rejected.
 */
export function applyModeChange(plan: Plan, input: ModeChangeInput): ModeChangeMessage[] {
  const data = plan as Obj;
  const notes: ModeChangeMessage[] = [];
  const error = (message: string) => notes.push({ level: 'error', message });
  const has = (k: string) => k in input && input[k] !== undefined;
  const post = (k: string) => (has(k) ? input[k] : null);

  const isGoal = (has('simulation_type') ? input.simulation_type : 'regular') === 'goal_seeking';
  data.simulation_type = isGoal ? 'goal_seeking' : 'regular';
  data.goal_seeking = isGoal;

  if (isGoal) {
    const target = getFloat(post('target_success_rate'), data.target_success_rate ?? 80.0);
    if (target < 1.0 || target > 99.0) {
      error('Target Success Rate must be between 1% and 99% for Maximum Spending simulation.');
      data.target_success_rate = Math.min(99.0, Math.max(1.0, target));
    } else {
      data.target_success_rate = target;
    }
  }

  const changedValue = (key: string, current: unknown, decimals: number): number | null => {
    if (!has(key)) return null;
    const posted = getFloat(input[key], null);
    if (posted === null) return null;
    if (current !== null && current !== undefined && pyRound(posted, decimals) === pyRound(getFloat(current) as number, decimals)) {
      return null;
    }
    return posted;
  };

  const spending = changedValue('desired_spending', data.desired_spending, 0);
  if (spending !== null) data.desired_spending = spending;
  const inflation = changedValue('inflation_rate', data.inflation_rate, 1);
  if (inflation !== null) data.inflation_rate = inflation;
  if (has('runs')) {
    const runs = getInt(input.runs, data.runs ?? 10000);
    if (runs < 1 || runs > 1000000) {
      error('Number of Simulations must be an integer between 1 and 1,000,000.');
      data.runs = Math.min(1000000, Math.max(1, runs));
    } else {
      data.runs = runs;
    }
  }

  // Age at death drives every age-based schedule, so apply the Enter page's checks.
  const newUserDeath = changedValue('user_age_death', data.user_age_death, 0);
  const newSpouseDeath = data.is_married ? changedValue('spouse_age_death', data.spouse_age_death, 0) : null;
  if (newUserDeath !== null || newSpouseDeath !== null) {
    const trial: Obj = { ...data };
    if (newUserDeath !== null) trial.user_age_death = Math.trunc(newUserDeath);
    if (newSpouseDeath !== null) trial.spouse_age_death = Math.trunc(newSpouseDeath);
    const errs = deathAgeErrors(trial);
    if (errs.length) {
      for (const e of errs) error(e);
      error('Age at Death was not changed.');
    } else {
      data.user_age_death = trial.user_age_death;
      if ('spouse_age_death' in trial) data.spouse_age_death = trial.spouse_age_death;
    }
  }

  // Asset return updates
  let updatedReturns = false;
  for (const prefix of RETURN_PREFIXES) {
    const assetsKey = `${prefix}_assets`;
    const current = (data[assetsKey] || {}).return_mean;
    const val = changedValue(`${prefix}_return_mean`, current, 1);
    if (val === null) continue;
    if (!data[assetsKey] || typeof data[assetsKey] !== 'object' || Array.isArray(data[assetsKey])) data[assetsKey] = {};
    data[assetsKey].return_mean = val;

    let targetType: string = prefix;
    let targetOwner = 'user';
    if (prefix === 'spouse_pretax') {
      targetType = 'pretax';
      targetOwner = 'spouse';
    } else if (prefix === 'spouse_hsa') {
      targetType = 'hsa';
      targetOwner = 'spouse';
    }
    const ownerMatches = (owner: string) => targetType === 'roth' || targetType === 'taxable' || owner === targetOwner;

    if (Array.isArray(data.accounts)) {
      for (const acc of data.accounts) {
        const owner = data.is_married ? (acc.owner ?? 'user') : 'user';
        if ((acc.type ?? 'pretax') === targetType && ownerMatches(owner)) {
          acc.return_mean = val;
          updatedReturns = true;
        }
      }
    }

    const bs = data.balance_sheet;
    if (bs && typeof bs === 'object' && !Array.isArray(bs)) {
      const cat = (bs.categories ?? {})[targetType] ?? {};
      for (const bAcc of cat.accounts ?? []) {
        const owner = data.is_married ? (bAcc.owner ?? 'user') : 'user';
        if (ownerMatches(owner)) bAcc.return_mean = val;
      }
    }
  }

  if (updatedReturns && data.balance_sheet && typeof data.balance_sheet === 'object' && !Array.isArray(data.balance_sheet)) {
    data.balance_sheet = syncAccountsToBalanceSheet(data.balance_sheet, data.accounts ?? [], data.current_year ?? 2026);
  }
  return notes;
}
