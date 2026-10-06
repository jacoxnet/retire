// Saving the Enter page: the browser-side counterpart of enter_view's POST handling
// in core/views.py. Inputs bind straight to the plan, so instead of parsing a form
// this applies the same coercions and derived fields to the edited plan in place.
import { cardAccount, commitAccounts, type IdMaker, newAccountId, personLabels } from './accountCard';
import { aggregateAccounts } from './accounts';
import { syncAccountsToBalanceSheet } from './balanceSheet';
import { commitBalanceSheet } from './bsSync';
import { buildDefaultRebalancing, parseRebalancing } from './defaults';
import { getBool, getFloat, getInt } from './coerce';
import { calculateMarginalTaxRate } from './marginal';
import { isObj, todayIso } from './pyutil';
import type { Account, Plan } from './types';
import { commitSchedules, rowNameErrors } from './scheduleRows';
import { planErrors } from './validate';

const LIFE_INSURANCE_TYPES = ['permanent', 'term'];

/** The account enter_view adds to receive life-insurance proceeds. */
export function lifeInsuranceAccount(plan: Plan): Account {
  return {
    name: 'Taxable Brokerage (Life Insurance Proceeds)',
    type: 'taxable',
    owner: 'user',
    balance: 0.0,
    contrib_amount: 0.0,
    contrib_freq: 'annual',
    contrib_start_age: getInt(plan.user_age, 60),
    contrib_end_age_type: 'retirement',
    contrib_end_age_specified: getInt(plan.user_retirement_age, 65),
    contrib_adjust_inflation: true,
    return_mean: 5.0,
    return_std: 8.0,
    dividend_yield: 2.0,
    qualified_dividend_pct: 85.0,
    interest_yield: 0.0,
    capital_gains_dist_rate: 0.5,
    cost_basis_ratio: 70.0,
  };
}

/** True when a life-insurance benefit is entered (the spouse's only counts if married). */
export function hasLifeInsurance(plan: Plan): boolean {
  return getFloat(plan.user_life_insurance_amount, 0) > 0
    || (getBool(plan.is_married) && getFloat(plan.spouse_life_insurance_amount, 0) > 0);
}

/**
 * Add a taxable account for life-insurance proceeds if a benefit is entered and there
 * is no taxable account yet (enter.js ensureTaxableAccountForLifeInsurance). Returns
 * true if it added one.
 */
export function ensureTaxableAccountForLifeInsurance(plan: Plan): boolean {
  if (!hasLifeInsurance(plan)) return false;
  plan.accounts ??= [];
  if (plan.accounts.some((a) => a?.type === 'taxable')) return false;
  plan.accounts.push(lifeInsuranceAccount(plan));
  return true;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The Enter page's client-side checks that the server doesn't repeat, because a
 * value has fallen back to its default by then or the server never checks it
 * (enter.js handleCustomValidation): blank names, empty or non-numeric ages, the
 * current year and inflation ranges, and account return ranges.
 */
export function clientFieldErrors(plan: Plan): string[] {
  const errors: string[] = [];
  if (!String(plan.user_name ?? '').trim()) errors.push('Name is required.');
  const uAge = plan.user_age;
  if (!isInt(uAge)) errors.push('Your Present Age must be an integer between 18 and 120.');
  const shownAge = isInt(uAge) ? uAge : 18;
  if (!isInt(plan.user_retirement_age)) errors.push(`Your Retirement Age must be between Your Present Age (${shownAge}) and 120.`);
  if (!isInt(plan.user_age_death)) {
    errors.push(`Your Age at Death must be an integer greater than Your Present Age (${shownAge}) up to 120.`);
  }
  if (getBool(plan.is_married)) {
    const sAge = plan.spouse_age;
    if (!isInt(sAge)) errors.push("Spouse's Present Age must be an integer between 18 and 120.");
    const shownS = isInt(sAge) ? sAge : 18;
    if (!isInt(plan.spouse_retirement_age)) {
      errors.push(`Spouse's Retirement Age must be between Spouse's Present Age (${shownS}) and 120.`);
    }
    if (!isInt(plan.spouse_age_death)) {
      errors.push(`Spouse's Age at Death must be an integer greater than Spouse's Present Age (${shownS}) up to 120.`);
    }
  }

  const year = parseInt(String(plan.current_year ?? ''), 10);
  if (Number.isNaN(year) || year < 2020 || year > 2100) errors.push('Current Year must be between 2020 and 2100.');
  const inflation = getFloat(plan.inflation_rate, 0);
  if (inflation < 0.0 || inflation > 50.0) errors.push('Inflation Rate % must be between 0% and 50%.');

  const people = personLabels(plan);
  const priorNames: string[] = [];
  for (const acc of plan.accounts ?? []) {
    const view = cardAccount(acc ?? {}, people, priorNames, () => '');
    priorNames.push(String(view.name ?? ''));
    const name = String(view.name ?? '').trim();
    if (!name) errors.push('Account Name is required.');
    const mean = view.return_mean as number | null;
    if (mean !== null && (mean < -100.0 || mean > 100.0)) errors.push(`Account "${name}" Average Return % must be between -100% and 100%.`);
    const std = view.return_std as number | null;
    if (std !== null && (std < 0.0 || std > 100.0)) errors.push(`Account "${name}" Return Std Dev % must be between 0% and 100%.`);
  }

  errors.push(...rowNameErrors(plan));
  return errors;
}

/**
 * Apply enter_view's save rules to `plan` in place: integer/float coercion with the
 * view's defaults, spouse fields cleared when single, filing status and spending start
 * kept consistent with marital status, a taxable account for life-insurance proceeds,
 * account aggregates, the balance sheet's current column and the marginal tax rate.
 */
export function commitEnterPlan(plan: Plan, today = todayIso(), makeId: IdMaker = newAccountId): void {
  plan.user_name = plan.user_name ?? 'User';
  plan.user_age = getInt(plan.user_age, 60);
  plan.user_retirement_age = getInt(plan.user_retirement_age, 65);
  plan.user_age_death = getInt(plan.user_age_death, 90);

  const married = getBool(plan.is_married);
  plan.is_married = married;
  if (married) {
    plan.spouse_name = plan.spouse_name ?? 'Spouse';
    plan.spouse_age = getInt(plan.spouse_age, 60);
    plan.spouse_retirement_age = getInt(plan.spouse_retirement_age, 65);
    plan.spouse_age_death = getInt(plan.spouse_age_death, 92);
  } else {
    plan.spouse_name = '';
    plan.spouse_age = 0;
    plan.spouse_retirement_age = 0;
    plan.spouse_age_death = 0;
  }

  // The select shows an unknown or legacy value as its first option, Joint.
  let filing = ['joint', 'single', 'hoh'].includes(plan.filing_status as string) ? (plan.filing_status as string) : 'joint';
  if (!married && filing === 'joint') filing = 'single';
  else if (married && filing === 'single') filing = 'joint';
  plan.filing_status = filing;

  plan.current_year = getInt(plan.current_year, 2026);
  plan.desired_spending = getFloat(plan.desired_spending, 0.0);
  plan.survivor_spending = married ? getFloat(plan.survivor_spending, plan.desired_spending) : 0.0;
  plan.inflation_rate = getFloat(plan.inflation_rate, 2.5);
  plan.state_tax_rate = getFloat(plan.state_tax_rate, 0.0);
  // A missing exemption shows as checked on the page (the template's `is None` case).
  plan.state_ss_exempt = plan.state_ss_exempt === undefined || plan.state_ss_exempt === null || getBool(plan.state_ss_exempt);
  plan.adjust_spending_inflation = getBool(plan.adjust_spending_inflation);

  commitSchedules(plan, married);
  if (!married) {
    Object.assign(plan.social_security!, {
      spouse_receiving: false, spouse_future_entitled: false, spouse_entitled: false,
      spouse_amount: 0.0, spouse_freq: 'monthly', spouse_start_age: 67,
    });
  }

  plan.user_life_insurance_amount = getFloat(plan.user_life_insurance_amount, 0.0);
  if (!LIFE_INSURANCE_TYPES.includes(plan.user_life_insurance_type as string)) plan.user_life_insurance_type = 'permanent';
  plan.user_life_insurance_term_age = getInt(plan.user_life_insurance_term_age, 70);
  if (married) {
    plan.spouse_life_insurance_amount = getFloat(plan.spouse_life_insurance_amount, 0.0);
    if (!LIFE_INSURANCE_TYPES.includes(plan.spouse_life_insurance_type as string)) plan.spouse_life_insurance_type = 'permanent';
    plan.spouse_life_insurance_term_age = getInt(plan.spouse_life_insurance_term_age, 70);
  } else {
    plan.spouse_life_insurance_amount = 0.0;
    plan.spouse_life_insurance_type = 'permanent';
    plan.spouse_life_insurance_term_age = 70;
  }

  commitAccounts(plan, makeId);
  commitBalanceSheet(plan, today);
  plan.rebalancing = isObj(plan.rebalancing) ? parseRebalancing(plan.rebalancing) : buildDefaultRebalancing();
  if (ensureTaxableAccountForLifeInsurance(plan)) {
    plan.balance_sheet = syncAccountsToBalanceSheet(plan.balance_sheet, plan.accounts ?? [], plan.current_year, today);
  }
  Object.assign(plan, aggregateAccounts(
    plan.accounts ?? [], plan.user_age, plan.user_retirement_age, plan.user_age_death,
    married, plan.spouse_age, plan.spouse_retirement_age, plan.spouse_age_death,
  ));

  const rate = calculateMarginalTaxRate(plan);
  if (isObj(plan.balance_sheet)) plan.balance_sheet.marginal_tax_rate = rate;
  plan.marginal_tax_rate = rate;
}

/**
 * Validate and save the Enter page before a run (or navigating away from it). Returns
 * the error messages; when there are none the plan has been committed in place.
 */
export function prepareEnterPlan(plan: Plan, today = todayIso(), makeId: IdMaker = newAccountId): string[] {
  const fieldErrors = clientFieldErrors(plan);
  if (fieldErrors.length) return fieldErrors;
  commitEnterPlan(plan, today, makeId);
  return planErrors(plan);
}
