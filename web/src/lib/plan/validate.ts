// Plan validation: the Enter page's rules (plan_errors / death_age_errors in
// core/views.py, validate_* in core/forms.py), applied to a plan object so form edits
// and imported files are held to the same rules. Messages match the Django app.
import { getBool, getFloat, getInt, pyStr } from './coerce';
import type { BalanceSheet, Plan } from './types';

type Obj = Record<string, any>;
const get = (o: Obj | null | undefined, k: string, d: any = null) =>
  o && k in o && o[k] !== undefined ? o[k] : d;
const SPECIFIED = ['specified', 'user_specified', 'spouse_specified'];

export function validateAccounts(
  accounts: Obj[], userAge: number, userAgeDeath: number, isMarried: boolean, spouseAge: number, spouseAgeDeath: number,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const acc of accounts) {
    const name = pyStr(get(acc, 'name', '')).trim();
    if (name) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        errors.push(`Multiple accounts cannot have the same name: '${name}' is used more than once. Each account must have a unique name.`);
      } else {
        seen.add(key);
      }
    } else {
      errors.push('Account Name cannot be blank. Each account must have a unique name.');
    }
    const label = name || 'Account';
    if (get(acc, 'balance', 0.0) < 0) errors.push(`Account '${label}' Present Balance cannot be negative.`);
    if (get(acc, 'contrib_amount', 0.0) < 0) errors.push(`Account '${label}' Future Contribution Amount cannot be negative.`);
    const spouse = get(acc, 'owner', 'user') === 'spouse' && isMarried;
    const relAge = spouse ? spouseAge : userAge;
    const relDeath = spouse ? spouseAgeDeath : userAgeDeath;
    const cStart = get(acc, 'contrib_start_age', relAge);
    if (cStart < relAge || cStart > relDeath) {
      errors.push(`Account '${label}' Contribution Start Age (${pyStr(cStart)}) must be between Present Age (${relAge}) and Age at Death (${relDeath}).`);
    }
    if (['age', ...SPECIFIED].includes(get(acc, 'contrib_end_age_type'))) {
      const cEnd = get(acc, 'contrib_end_age_specified', relAge);
      if (cEnd < cStart || cEnd > 120) {
        errors.push(`Account '${label}' Specified Contribution End Age (${pyStr(cEnd)}) must be greater than or equal to Contribution Start Age (${pyStr(cStart)}) up to 120.`);
      }
    }
  }
  return errors;
}

/** Account names in the balance sheet must be unique across categories and goal groups. */
export function validateBalanceSheetAccounts(balanceSheet: BalanceSheet | null | undefined): string[] {
  const errors: string[] = [];
  if (!balanceSheet || typeof balanceSheet !== 'object' || !('categories' in balanceSheet)) return errors;
  const cats = balanceSheet.categories ?? {};
  const seen = new Set<string>();
  const check = (acc: Obj) => {
    const name = pyStr(get(acc, 'name', '')).trim();
    if (!name) return;
    const k = name.toLowerCase();
    if (seen.has(k)) {
      errors.push(`Multiple accounts cannot have the same name: '${name}' is used more than once in the Balance Sheet. Each account must have a unique name.`);
    } else {
      seen.add(k);
    }
  };
  for (const cat of ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily']) {
    for (const acc of get(get(cats, cat, {}), 'accounts', [])) check(acc);
  }
  for (const group of get(get(cats, 'goals', {}), 'goal_groups', [])) {
    for (const acc of get(group, 'accounts', [])) check(acc);
  }
  return errors;
}

export function validateAdditionalSpending(
  items: Obj[], userAge: number, userAgeDeath: number, isMarried = false, spouseAge = 60, spouseAgeDeath = 90,
): string[] {
  const errors: string[] = [];
  for (const item of items) {
    const name = pyStr(get(item, 'name'));
    if (get(item, 'amount', 0.0) < 0) errors.push(`Additional Spending item '${name}' Amount cannot be negative.`);
    const spouse = get(item, 'start_age_type', 'user') === 'spouse' && isMarried;
    const relAge = spouse ? spouseAge : userAge;
    const relDeath = spouse ? spouseAgeDeath : userAgeDeath;
    const start = get(item, 'start_age', relAge);
    const person = spouse ? "Spouse's Present Age" : 'Your Present Age';
    if (start < relAge || start > relDeath) {
      errors.push(`Additional Spending item '${name}' Start Age (${pyStr(start)}) cannot be younger than ${person} (${relAge}) or after Age at Death (${relDeath}).`);
    }
    if (get(item, 'interval', 0) < 0) {
      errors.push(`Additional Spending item '${name}' 'Repeats Every' must be 0 (for one-time) or a positive number of years.`);
    }
  }
  return errors;
}

/** Income sources and other-tax rows share their field shape and rules. */
export function validateScheduledItems(label: string, items: Obj[]): string[] {
  const errors: string[] = [];
  for (const item of items) {
    const name = pyStr(get(item, 'name'));
    if (get(item, 'amount', 0.0) < 0) errors.push(`${label} '${name}' Amount cannot be negative.`);
    const startSpecified = SPECIFIED.includes(get(item, 'start_age_type'));
    if (startSpecified) {
      const s = get(item, 'start_age_specified', 65);
      if (s < 18 || s > 120) errors.push(`${label} '${name}' Specified Start Age must be between 18 and 120.`);
    }
    const oneTime = ['one_time', 'one-time'].includes(get(item, 'frequency'));
    if (!oneTime && SPECIFIED.includes(get(item, 'end_age_type'))) {
      const minEnd = startSpecified ? get(item, 'start_age_specified', 18) : 18;
      const e = get(item, 'end_age_specified', 90);
      if (e < minEnd || e > 120) {
        errors.push(`${label} '${name}' Specified End Age (${pyStr(e)}) must be greater than or equal to Start Age (${pyStr(minEnd)}) up to 120.`);
      }
    }
    if (get(item, 'survivor_benefit_pct', 0.0) < 0.0 || get(item, 'survivor_benefit_pct', 100.0) > 100.0) {
      errors.push(`${label} '${name}' Survivor Benefit Percentage must be between 0% and 100%.`);
    }

    const adjustments = get(item, 'adjustments');
    if (Array.isArray(adjustments) && adjustments.length) {
      adjustments.forEach((p: Obj, i: number) => {
        const idx = i + 1;
        if (['fixed_pct', 'inflation_less_pct'].includes(get(p, 'adjust_type'))) {
          const v = get(p, 'adjust_val', 0.0);
          if (v < 0.0 || v > 100.0) errors.push(`${label} '${name}' Adjustment Period ${idx} Percentage Rate must be between 0% and 100%.`);
        }
        if (SPECIFIED.includes(get(p, 'start_type'))) {
          const ps = get(p, 'start_spec', 65);
          if (ps < 18 || ps > 120) errors.push(`${label} '${name}' Adjustment Period ${idx} Start Age must be between 18 and 120.`);
        }
        if (SPECIFIED.includes(get(p, 'end_type'))) {
          const pe = get(p, 'end_spec', 90);
          if (pe < 18 || pe > 120) errors.push(`${label} '${name}' Adjustment Period ${idx} End Age must be between 18 and 120.`);
        }
      });
    } else {
      if (['fixed_pct', 'inflation_less_pct'].includes(get(item, 'adjust_type'))) {
        const v = get(item, 'adjust_val', 0.0);
        if (v < 0.0 || v > 100.0) errors.push(`${label} '${name}' Percentage Rate must be between 0% and 100%.`);
      }
      if (get(item, 'adjust_type') !== 'none' && SPECIFIED.includes(get(item, 'adjust_start_age_type'))) {
        const a = get(item, 'adjust_start_age_specified', 65);
        if (a < 18 || a > 120) errors.push(`${label} '${name}' Adjustment Start Age must be between 18 and 120.`);
      }
    }
  }
  return errors;
}

interface People {
  userAge: number;
  userAgeDeath: number;
  isMarried: boolean;
  spouseAge: number;
  spouseAgeDeath: number;
}

function people(data: Obj): People {
  return {
    userAge: getInt(data.user_age, 60),
    userAgeDeath: getInt(data.user_age_death, 90),
    isMarried: getBool(data.is_married),
    spouseAge: getInt(data.spouse_age, 60),
    spouseAgeDeath: getInt(data.spouse_age_death, 92),
  };
}

function spendingStartError(data: Obj, userAge: number, userAgeDeath: number): string | null {
  if (data.begin_spending_age_type !== 'specified') return null;
  const begin = getInt(data.begin_spending_age_specified, 65);
  return begin < userAge || begin > userAgeDeath
    ? `Specified Spending Start Age (${begin}) must be between Your Present Age (${userAge}) and Your Age at Death (${userAgeDeath}).`
    : null;
}

const deathError = (who: 'Your' | "Spouse's", age: number) =>
  `${who} Age at Death must be an integer greater than ${who} Present Age (${age}) up to 120.`;

/** The Enter page's checks that depend on age at death, for edits made elsewhere. */
export function deathAgeErrors(data: Plan | Obj): string[] {
  const { userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath } = people(data);
  const errors: string[] = [];
  if (userAgeDeath <= userAge || userAgeDeath > 120) errors.push(deathError('Your', userAge));
  if (isMarried && (spouseAgeDeath <= spouseAge || spouseAgeDeath > 120)) errors.push(deathError("Spouse's", spouseAge));
  const se = spendingStartError(data, userAge, userAgeDeath);
  if (se) errors.push(se);
  errors.push(...validateAccounts(get(data, 'accounts', []), userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath));
  errors.push(...validateAdditionalSpending(get(data, 'additional_spending', []), userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath));
  return errors;
}

/** Every check the Enter page applies to a submission. */
export function planErrors(data: Plan | Obj): string[] {
  const { userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath } = people(data);
  const isGoalSeeking = getBool(data.goal_seeking);
  const runs = getInt(data.runs, 10000);
  const target = getFloat(data.target_success_rate, 80.0);
  const userRetirementAge = getInt(data.user_retirement_age, 65);
  const spouseRetirementAge = getInt(data.spouse_retirement_age, 65);
  const ss: Obj = data.social_security && typeof data.social_security === 'object' && !Array.isArray(data.social_security)
    ? data.social_security : {};

  const errors: string[] = [];
  if (runs < 1 || runs > 1000000) errors.push('Number of Simulations must be an integer between 1 and 1,000,000.');
  if (isGoalSeeking && (target < 1.0 || target > 99.0)) {
    errors.push('Target Success Rate must be between 1% and 99% for Maximum Spending simulation.');
  }

  if (userAge < 18 || userAge > 120) errors.push('Your Present Age must be an integer between 18 and 120.');
  if (userRetirementAge < userAge || userRetirementAge > 120) {
    errors.push(`Your Retirement Age must be between Your Present Age (${userAge}) and 120.`);
  }
  if (userAgeDeath <= userAge || userAgeDeath > 120) errors.push(deathError('Your', userAge));

  if (isMarried) {
    if (spouseAge < 18 || spouseAge > 120) errors.push("Spouse's Present Age must be an integer between 18 and 120.");
    if (spouseRetirementAge < spouseAge || spouseRetirementAge > 120) {
      errors.push(`Spouse's Retirement Age must be between Spouse's Present Age (${spouseAge}) and 120.`);
    }
    if (spouseAgeDeath <= spouseAge || spouseAgeDeath > 120) errors.push(deathError("Spouse's", spouseAge));
    if (getFloat(data.survivor_spending, 0.0) < 0) {
      errors.push('Amount of Regular Retirement Spending for Surviving Spouse must be a valid non-negative number.');
    }
  }

  const se = spendingStartError(data, userAge, userAgeDeath);
  if (se) errors.push(se);

  if (getFloat(data.desired_spending, 0.0) < 0) errors.push('Desired Annual Spending must be a valid non-negative number.');

  const stateTaxRate = getFloat(data.state_tax_rate, 0.0);
  if (stateTaxRate < 0.0 || stateTaxRate > 100.0) errors.push('State Income Tax Rate must be between 0% and 100%.');

  if (!getBool(ss.user_receiving) && getBool(ss.user_future_entitled)) {
    const a = getInt(ss.user_start_age, 67);
    if (a < 62 || a > 70) errors.push('Your Social Security Claiming Age must be between 62 and 70.');
  }
  if (isMarried && !getBool(ss.spouse_receiving) && getBool(ss.spouse_future_entitled)) {
    const a = getInt(ss.spouse_start_age, 67);
    if (a < 62 || a > 70) errors.push("Spouse's Social Security Claiming Age must be between 62 and 70.");
  }

  if (getFloat(data.user_life_insurance_amount, 0.0) < 0) errors.push('Your Life Insurance Death Benefit must be a non-negative number.');
  if (data.user_life_insurance_type === 'term') {
    const a = getInt(data.user_life_insurance_term_age, 70);
    if (a < 18 || a > 120) errors.push('Your Term Life Policy Expiration Age must be between 18 and 120.');
  }
  if (isMarried) {
    if (getFloat(data.spouse_life_insurance_amount, 0.0) < 0) {
      errors.push("Spouse's Life Insurance Death Benefit must be a non-negative number.");
    }
    if (data.spouse_life_insurance_type === 'term') {
      const a = getInt(data.spouse_life_insurance_term_age, 70);
      if (a < 18 || a > 120) errors.push("Spouse's Term Life Policy Expiration Age must be between 18 and 120.");
    }
  }

  // Accounts are validated once; the derived pretax/roth/taxable/hsa aggregates are
  // views over the same accounts.
  errors.push(...validateAccounts(get(data, 'accounts', []), userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath));
  errors.push(...validateBalanceSheetAccounts(get(data, 'balance_sheet')));
  errors.push(...validateAdditionalSpending(get(data, 'additional_spending', []), userAge, userAgeDeath, isMarried, spouseAge, spouseAgeDeath));
  errors.push(...validateScheduledItems('Income Source', get(data, 'income_sources', [])));
  errors.push(...validateScheduledItems('Other Tax item', get(data, 'other_taxes', [])));
  return errors;
}
