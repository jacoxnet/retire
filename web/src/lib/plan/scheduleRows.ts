// Spending, income and other-tax rows on the Enter page, and the Social Security
// and spending-start fields: the defaults the page fills in (enter.js addSpendingRow,
// addIncomeRow, addAdjustmentPeriodRow, addOtherTaxRow), the effect of the Married
// toggle (updateSpouseDropdownOptions), and enter_view's save rules
// (parse_additional_spending / parse_income_sources / parse_other_taxes in forms.py).
import { getFloat, getInt } from './coerce';
import { singleChoice, syncSpouseChoice } from './spouseChoice';
import type { AdditionalSpendingItem, Adjustment, IncomeSource, OtherTax, Plan, SocialSecurity } from './types';

/**
 * Option values of each select, in page order. A select shows a value it has no
 * option for as its first option, and submits that; `aliases` are legacy values an
 * option is shown as selected for.
 */
interface Choices {
  values: readonly string[];
  aliases?: Record<string, string>;
}

const SPECIFIED_ALIAS = { specified: 'user_specified' };
const ONE_TIME_ALIAS = { 'one-time': 'one_time' };

export const CHOICES = {
  beginSpending: { values: ['retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  spendingPerson: { values: ['user', 'spouse'] },
  start: { values: ['retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  end: { values: ['death', 'spouse_death', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  incomeFrequency: { values: ['monthly', 'annual', 'one_time'], aliases: ONE_TIME_ALIAS },
  taxFrequency: { values: ['annual', 'monthly', 'one_time'], aliases: ONE_TIME_ALIAS },
  periodStart: { values: ['current_age', 'start', 'retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  periodEnd: { values: ['retirement', 'spouse_retirement', 'start', 'death', 'spouse_death', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  adjustType: { values: ['inflation', 'none', 'fixed_pct', 'inflation_less_pct'] },
  taxAdjustStart: { values: ['start', 'retirement', 'spouse_retirement', 'current_age', 'user_specified', 'spouse_specified'], aliases: SPECIFIED_ALIAS },
  ssFrequency: { values: ['monthly', 'annual'] },
} satisfies Record<string, Choices>;

/** The value a select shows (and submits) for `value`. */
export function pick(value: unknown, choices: Choices): string {
  const v = String(value ?? '');
  const aliased = choices.aliases?.[v] ?? v;
  return choices.values.includes(aliased) ? aliased : choices.values[0];
}

export const SPECIFIED_TYPES = ['specified', 'user_specified', 'spouse_specified'];
export const isSpecified = (t: unknown): boolean => SPECIFIED_TYPES.includes(t as string);
export const isOneTime = (f: unknown): boolean => f === 'one_time' || f === 'one-time';
export const hasRate = (t: unknown): boolean => t === 'fixed_pct' || t === 'inflation_less_pct';

/** JavaScript truthiness, as the page's `value ? 'selected' : ''` checks use. */
const truthy = (v: unknown): boolean => !!v;
/** parseInt(...), or `d` when it isn't a number. */
const parseIntOr = (v: unknown, d: number): number => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? d : n;
};
const def = <T>(v: T | undefined, d: T): T => (v !== undefined ? v : d);

// ---------------------------------------------------------------------------
// Views: what each row shows. Fields the item lacks show the page's defaults.
// ---------------------------------------------------------------------------

export function spendingItemView(item: AdditionalSpendingItem): Required<AdditionalSpendingItem> {
  return {
    name: def(item.name, ''),
    amount: def(item.amount, 0),
    start_age: def(item.start_age, 65),
    start_age_type: pick(item.start_age_type || 'user', CHOICES.spendingPerson),
    interval: def(item.interval, 0),
    adjust_inflation: truthy(def<unknown>(item.adjust_inflation, true)),
  };
}

export interface PeriodView {
  start_type: string;
  start_spec: number | null;
  end_type: string;
  end_spec: number | null;
  adjust_type: string;
  adjust_val: number | null;
}

/** An adjustment period as its row shows it; `index` is its position in the schedule. */
export function periodView(p: Adjustment, index: number): PeriodView {
  return {
    start_type: pick(def(p.start_type, index === 0 ? 'current_age' : 'retirement'), CHOICES.periodStart),
    start_spec: def<number | null>(p.start_spec, 65),
    end_type: pick(def(p.end_type, index === 0 ? 'retirement' : 'death'), CHOICES.periodEnd),
    end_spec: def<number | null>(p.end_spec, 90),
    adjust_type: pick(def(p.adjust_type, 'inflation'), CHOICES.adjustType),
    adjust_val: def<number | null>(p.adjust_val, 0.0),
  };
}

/**
 * The schedule an income card starts with: its `adjustments`, else one period built
 * from the legacy flat fields, else one default period.
 */
export function incomeSchedule(item: IncomeSource): Adjustment[] {
  if (Array.isArray(item.adjustments) && item.adjustments.length) return item.adjustments;
  if (item.adjust_type !== undefined) {
    return [{
      start_type: item.adjust_start_age_type || 'start',
      start_spec: (item.adjust_start_age_specified as number) || 65,
      end_type: item.end_age_type || 'death',
      end_spec: (item.end_age_specified as number) || 90,
      adjust_type: item.adjust_type,
      adjust_val: (item.adjust_val as number) || 0.0,
    }];
  }
  return [{}];
}

/** Make the item's schedule an array the page can edit (before adding, removing or editing a period). */
export function editableSchedule(item: IncomeSource): Adjustment[] {
  if (!(Array.isArray(item.adjustments) && item.adjustments.length)) {
    item.adjustments = incomeSchedule(item).map((p, i) => ({ ...periodView(p, i) }) as Adjustment);
  }
  return item.adjustments!;
}

export interface IncomeView {
  name: string;
  amount: number;
  frequency: string;
  start_age_type: string;
  start_age_specified: number | null;
  end_age_type: string;
  end_age_specified: number | null;
  subject_to_tax: boolean;
  has_survivor_benefit: boolean;
  survivor_benefit_pct: number | null;
  periods: PeriodView[];
}

export function incomeView(item: IncomeSource): IncomeView {
  return {
    name: def(item.name, ''),
    amount: def(item.amount, 0),
    frequency: pick(def(item.frequency, 'monthly'), CHOICES.incomeFrequency),
    start_age_type: pick(def(item.start_age_type, 'retirement'), CHOICES.start),
    start_age_specified: def<number | null>(item.start_age_specified, 65),
    end_age_type: pick(def(item.end_age_type, 'death'), CHOICES.end),
    end_age_specified: def<number | null>(item.end_age_specified, 90),
    subject_to_tax: truthy(def<unknown>(item.subject_to_tax, true)),
    has_survivor_benefit: item.has_survivor_benefit === true || (item.has_survivor_benefit as unknown) === 'true',
    survivor_benefit_pct: def<number | null>(item.survivor_benefit_pct, 100.0),
    periods: incomeSchedule(item).map(periodView),
  };
}

/** The survivor-benefit box shows for a married couple when the income ends at a death. */
export const showsSurvivor = (view: IncomeView, married: boolean): boolean =>
  married && (view.end_age_type === 'death' || view.end_age_type === 'spouse_death');

export interface OtherTaxView {
  name: string;
  amount: number;
  frequency: string;
  start_age_type: string;
  start_age_specified: number | null;
  end_age_type: string;
  end_age_specified: number | null;
  adjust_type: string;
  adjust_val: number | null;
  adjust_start_age_type: string;
  adjust_start_age_specified: number | null;
}

export function otherTaxView(item: OtherTax): OtherTaxView {
  return {
    name: def(item.name, ''),
    amount: def(item.amount, 0),
    frequency: pick(def(item.frequency, 'annual'), CHOICES.taxFrequency),
    start_age_type: pick(def(item.start_age_type, 'retirement'), CHOICES.start),
    start_age_specified: def<number | null>(item.start_age_specified, 65),
    end_age_type: pick(def(item.end_age_type, 'death'), CHOICES.end),
    end_age_specified: def<number | null>(item.end_age_specified, 90),
    adjust_type: pick(def(item.adjust_type, 'inflation'), CHOICES.adjustType),
    adjust_val: def<number | null>(item.adjust_val, 0.0),
    adjust_start_age_type: pick(def(item.adjust_start_age_type, 'start'), CHOICES.taxAdjustStart),
    adjust_start_age_specified: def<number | null>(item.adjust_start_age_specified, 65),
  };
}

export interface SsPersonView {
  receiving: boolean;
  future_entitled: boolean;
  amount: number | null;
  freq: string;
  start_age: number | null;
}

/** One person's Social Security fields as the selects show them. */
export function ssView(ss: SocialSecurity | undefined, who: 'user' | 'spouse'): SsPersonView {
  const s = (ss ?? {}) as Record<string, unknown>;
  return {
    receiving: truthy(s[`${who}_receiving`]),
    future_entitled: truthy(s[`${who}_future_entitled`]),
    amount: (s[`${who}_amount`] as number | null | undefined) ?? null,
    freq: pick(s[`${who}_freq`], CHOICES.ssFrequency),
    start_age: (s[`${who}_start_age`] as number | null | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// The Married toggle.
// ---------------------------------------------------------------------------

/**
 * Move every spouse-based choice on the Spending and Income tabs to its
 * single-person equivalent when Married is unticked, and back when it is ticked.
 */
export function applyMarriageToSchedules(plan: Plan, married: boolean): void {
  syncSpouseChoice(plan, 'begin_spending_age_type', married, 'retirement');
  for (const item of plan.additional_spending ?? []) syncSpouseChoice(item, 'start_age_type', married, 'user');
  for (const item of plan.income_sources ?? []) {
    syncSpouseChoice(item, 'start_age_type', married, 'retirement');
    syncSpouseChoice(item, 'end_age_type', married, 'death');
    for (const p of Array.isArray(item.adjustments) ? item.adjustments : []) {
      syncSpouseChoice(p, 'start_type', married, 'current_age');
      syncSpouseChoice(p, 'end_type', married, 'death');
    }
  }
  for (const item of plan.other_taxes ?? []) {
    syncSpouseChoice(item, 'start_age_type', married, 'retirement');
    syncSpouseChoice(item, 'end_age_type', married, 'death');
    syncSpouseChoice(item, 'adjust_start_age_type', married, 'current_age');
  }
}

// ---------------------------------------------------------------------------
// New rows.
// ---------------------------------------------------------------------------

export const newSpendingItem = (): AdditionalSpendingItem => ({ ...spendingItemView({}) });

export function newIncomeSource(): IncomeSource {
  const { periods, ...rest } = incomeView({});
  return { ...rest, adjustments: periods.map((p) => ({ ...p }) as Adjustment) } as IncomeSource;
}

export const newOtherTax = (): OtherTax => ({ ...otherTaxView({}) }) as OtherTax;

/** A period added with "Add Another Period". */
export const newPeriod = (index: number): Adjustment => ({ ...periodView({}, index) }) as Adjustment;

// ---------------------------------------------------------------------------
// Saving (enter_view): each row as the page submits it, through the forms.py parsers.
// ---------------------------------------------------------------------------

const nameOr = (name: unknown, d: string): string => String(name ?? '').trim() || d;

function commitSpendingItem(item: AdditionalSpendingItem, married: boolean): AdditionalSpendingItem {
  const v = spendingItemView(item);
  return {
    ...item,
    name: nameOr(v.name, 'Additional Expense'),
    amount: getFloat(v.amount, 0.0),
    start_age: getInt(v.start_age, 65),
    start_age_type: singleChoice(v.start_age_type, married, 'user'),
    interval: getInt(v.interval, 0),
    adjust_inflation: v.adjust_inflation,
  };
}

function commitPeriod(p: PeriodView, married: boolean): Adjustment {
  return {
    start_type: singleChoice(p.start_type, married, 'current_age'),
    start_spec: parseIntOr(p.start_spec, 65),
    end_type: singleChoice(p.end_type, married, 'death'),
    end_spec: parseIntOr(p.end_spec, 90),
    adjust_type: p.adjust_type,
    adjust_val: getFloat(p.adjust_val, 0.0),
  };
}

/**
 * parse_income_sources on a card's fields. Two differences from Django, which loses
 * data here: `is_social_security` (never submitted by the page, so Django resets it)
 * is kept, as are keys the page doesn't know.
 */
function commitIncomeSource(item: IncomeSource, married: boolean): IncomeSource {
  const v = incomeView(item);
  const adjustments = v.periods.map((p) => commitPeriod(p, married));
  return {
    ...item,
    name: nameOr(v.name, 'Income Source'),
    amount: getFloat(v.amount, 0.0),
    frequency: v.frequency,
    start_age_type: singleChoice(v.start_age_type, married, 'retirement'),
    start_age_specified: getInt(v.start_age_specified, 65),
    end_age_type: singleChoice(v.end_age_type, married, 'death'),
    end_age_specified: getInt(v.end_age_specified, 90),
    subject_to_tax: v.subject_to_tax,
    is_social_security: item.is_social_security === true,
    has_survivor_benefit: v.has_survivor_benefit,
    survivor_benefit_pct: Math.min(100.0, Math.max(0.0, getFloat(v.survivor_benefit_pct, 100.0))),
    adjust_type: adjustments[0].adjust_type,
    adjust_val: adjustments[0].adjust_val,
    adjust_start_age_type: 'start',
    adjust_start_age_specified: 65,
    adjustments,
  };
}

function commitOtherTax(item: OtherTax, married: boolean): OtherTax {
  const v = otherTaxView(item);
  return {
    ...item,
    name: nameOr(v.name, 'Other Tax'),
    amount: getFloat(v.amount, 0.0),
    frequency: v.frequency,
    start_age_type: singleChoice(v.start_age_type, married, 'retirement'),
    start_age_specified: getInt(v.start_age_specified, 65),
    end_age_type: singleChoice(v.end_age_type, married, 'death'),
    end_age_specified: getInt(v.end_age_specified, 90),
    adjust_type: v.adjust_type,
    adjust_val: getFloat(v.adjust_val, 0.0),
    adjust_start_age_type: singleChoice(v.adjust_start_age_type, married, 'current_age'),
    adjust_start_age_specified: getInt(v.adjust_start_age_specified, 65),
  };
}

function commitSsPerson(ss: Record<string, unknown>, who: 'user' | 'spouse', v: SsPersonView): void {
  const future = v.receiving ? false : v.future_entitled;
  ss[`${who}_receiving`] = v.receiving;
  ss[`${who}_future_entitled`] = future;
  ss[`${who}_entitled`] = v.receiving || future;
  ss[`${who}_amount`] = getFloat(v.amount, 0.0);
  ss[`${who}_freq`] = v.freq;
  ss[`${who}_start_age`] = getInt(v.start_age, 67);
}

/**
 * Save the Spending and Income tabs as enter_view does: the spending start, the three
 * row lists and Social Security (the spouse's fields only when married; a single
 * person's are cleared by commitEnterPlan).
 */
export function commitSchedules(plan: Plan, married: boolean): void {
  plan.begin_spending_age_type = singleChoice(pick(plan.begin_spending_age_type, CHOICES.beginSpending), married, 'retirement');
  plan.begin_spending_age_specified = getInt(plan.begin_spending_age_specified, 65);
  plan.additional_spending = (plan.additional_spending ?? []).map((i) => commitSpendingItem(i ?? {}, married));
  plan.income_sources = (plan.income_sources ?? []).map((i) => commitIncomeSource(i ?? {}, married));
  plan.other_taxes = (plan.other_taxes ?? []).map((i) => commitOtherTax(i ?? {}, married));

  const ss = { ...(plan.social_security ?? {}) } as Record<string, unknown>;
  commitSsPerson(ss, 'user', ssView(plan.social_security, 'user'));
  if (married) commitSsPerson(ss, 'spouse', ssView(plan.social_security, 'spouse'));
  plan.social_security = ss as SocialSecurity;
}

/** The page's "Name is required" checks on the rows, before anything is submitted. */
export function rowNameErrors(plan: Plan): string[] {
  const errors: string[] = [];
  (plan.additional_spending ?? []).forEach((item, i) => {
    if (!String(spendingItemView(item ?? {}).name ?? '').trim()) errors.push(`Additional Spending item #${i + 1} Name is required.`);
  });
  (plan.income_sources ?? []).forEach((item, i) => {
    if (!incomeView(item ?? {}).name.trim()) errors.push(`Income Source #${i + 1} Name is required.`);
  });
  (plan.other_taxes ?? []).forEach((item, i) => {
    if (!otherTaxView(item ?? {}).name.trim()) errors.push(`Other Tax #${i + 1} Description is required.`);
  });
  return errors;
}
