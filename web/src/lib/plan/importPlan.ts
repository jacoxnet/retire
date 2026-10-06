// Importing a plan file: import_plan_data in core/views.py.
import { pyBool, pyFloat } from '../engine/py';
import { aggregateAccounts, flatAssetsToAccounts } from './accounts';
import { buildDefaultBalanceSheet, parseBalanceSheet, syncAccountsToBalanceSheet, syncBalanceSheetToAccounts } from './balanceSheet';
import { buildDefaultRebalancing, parseRebalancing } from './defaults';
import { calculateMarginalTaxRate } from './marginal';
import { normalizePlanFields } from './normalize';
import { get, isObj, type Obj, todayIso } from './pyutil';
import type { Plan } from './types';
import { planErrors } from './validate';

/**
 * Stage 2 of an import: reconcile the balance sheet and the account list (whichever
 * the file has), default the rebalancing settings, add a taxable account to receive
 * life-insurance proceeds if needed, recompute the per-bucket aggregates and the
 * marginal tax rate. Modifies `data` in place.
 */
export function completeImport(data: Obj, today = todayIso()): void {
  const married = pyBool(get(data, 'is_married', false));
  if (isObj(data.balance_sheet)) {
    data.balance_sheet = parseBalanceSheet(data.balance_sheet, data, today);
    const synced = syncBalanceSheetToAccounts(
      data.balance_sheet, get(data, 'accounts', []), get(data, 'user_age', 60), get(data, 'user_retirement_age', 65),
      married, get(data, 'spouse_age', 60), get(data, 'spouse_retirement_age', 65),
    );
    if (synced.length) data.accounts = synced;
  } else if (Array.isArray(data.accounts) && data.accounts.length) {
    data.balance_sheet = buildDefaultBalanceSheet(data.accounts, 2026, data, today);
  } else {
    data.accounts = flatAssetsToAccounts(data, married);
    data.balance_sheet = buildDefaultBalanceSheet(data.accounts, 2026, data, today);
  }

  data.rebalancing = isObj(data.rebalancing) ? parseRebalancing(data.rebalancing) : buildDefaultRebalancing();

  const hasTaxable = (get(data, 'accounts', []) as Obj[]).some((a) => get(a, 'type') === 'taxable');
  if (!hasTaxable && (pyFloat(get(data, 'user_life_insurance_amount', 0.0)) > 0 || pyFloat(get(data, 'spouse_life_insurance_amount', 0.0)) > 0)) {
    data.accounts ??= [];
    data.accounts.push({
      name: 'Taxable Brokerage (Life Insurance Proceeds)',
      type: 'taxable',
      owner: 'user',
      balance: 0.0,
      contrib_amount: 0.0,
      contrib_freq: 'annual',
      contrib_start_age: get(data, 'user_age', 60),
      contrib_end_age_type: 'retirement',
      contrib_end_age_specified: get(data, 'user_retirement_age', 65),
      contrib_adjust_inflation: true,
      return_mean: 5.0,
      return_std: 8.0,
    });
    if (isObj(data.balance_sheet)) {
      data.balance_sheet = syncAccountsToBalanceSheet(data.balance_sheet, data.accounts, get(data, 'current_year', 2026), today);
    }
  }

  if (Array.isArray(data.accounts) && data.accounts.length) {
    Object.assign(data, aggregateAccounts(
      data.accounts, get(data, 'user_age', 60), get(data, 'user_retirement_age', 65), get(data, 'user_age_death', 90),
      married, get(data, 'spouse_age', 60), get(data, 'spouse_retirement_age', 65), get(data, 'spouse_age_death', 90),
    ));
  } else {
    data.accounts = flatAssetsToAccounts(data, married);
  }

  const rate = calculateMarginalTaxRate(data);
  if (isObj(data.balance_sheet)) data.balance_sheet.marginal_tax_rate = rate;
  data.marginal_tax_rate = rate;
}

/**
 * Normalize, migrate and complete an imported plan in place, as the Manage page loads
 * it. Returns import and validation messages; a plan with problems is still usable and
 * is fixed on the Enter page.
 */
export function importPlanData(data: Plan, today = todayIso()): string[] {
  const errors = normalizePlanFields(data);
  completeImport(data, today);
  errors.push(...planErrors(data));
  return errors;
}

/** Fill in a missing balance sheet or rebalancing block (get_session_sim_data). */
export function ensurePlanBlocks(plan: Plan, today = todayIso()): Plan {
  if (!('balance_sheet' in plan)) plan.balance_sheet = buildDefaultBalanceSheet((plan.accounts as Obj[]) ?? [], 2026, plan, today);
  if (!('rebalancing' in plan)) plan.rebalancing = buildDefaultRebalancing();
  return plan;
}
