// Account cards on the Enter page: the defaults and cross-field rules of enter.js
// addAccountCard / updateSpouseDropdownOptions, and the save rules of
// parse_account_rows (core/forms.py).
import { getBool, getFloat, getInt } from './coerce';
import { title } from './pyutil';
import { singleChoice, syncSpouseChoice } from './spouseChoice';
import type { Account, Plan } from './types';

/** Names and ages as the page labels them (enter.js getPersonLabels). */
export interface People {
  userName: string;
  spouseName: string;
  userAge: number;
  spouseAge: number;
  userRetAge: number;
  spouseRetAge: number;
  userDeathAge: number;
  spouseDeathAge: number;
  isMarried: boolean;
  currentYear: number;
}

const intOr = (v: unknown, d: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n !== 0 ? n : d; // parseInt(...) || d
};

export function personLabels(plan: Plan): People {
  return {
    userName: String(plan.user_name ?? '').trim() || 'You',
    spouseName: String(plan.spouse_name ?? '').trim() || 'Spouse',
    userAge: intOr(plan.user_age, 60),
    spouseAge: intOr(plan.spouse_age, 60),
    userRetAge: intOr(plan.user_retirement_age, 65),
    spouseRetAge: intOr(plan.spouse_retirement_age, 65),
    userDeathAge: intOr(plan.user_age_death, 90),
    spouseDeathAge: intOr(plan.spouse_age_death, 90),
    isMarried: !!plan.is_married,
    currentYear: intOr(plan.current_year, 2026),
  };
}

export type CardType = 'pretax' | 'roth' | 'taxable' | 'hsa';

export const ACCOUNT_TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'pretax', label: 'Pre-Tax (IRA / 401k / 403b)' },
  { value: 'roth', label: 'Roth (Roth IRA / Roth 401k)' },
  { value: 'taxable', label: 'Taxable (Brokerage / Savings)' },
  { value: 'hsa', label: 'Health Savings Account (HSA)' },
];

const BASE_NAMES: Record<string, string> = {
  pretax: 'Traditional 401(k) / IRA',
  roth: 'Roth IRA / 401(k)',
  hsa: 'Health Savings Account (HSA)',
  taxable: 'Taxable Brokerage',
};

/** `baseName`, or `baseName N` with the first N from 2 not already used (case-insensitive). */
export function uniqueDefaultName(baseName: string, existingNames: string[]): string {
  const used = new Set(existingNames.map((n) => (n || '').trim().toLowerCase()));
  if (!used.has(baseName.trim().toLowerCase())) return baseName;
  let i = 2;
  while (used.has(`${baseName} ${i}`.trim().toLowerCase())) i++;
  return `${baseName} ${i}`;
}

export function defaultAccountName(type: string, owner: string, people: People, existingNames: string[]): string {
  const prefix = owner === 'spouse' ? (people.isMarried ? `${people.spouseName}'s ` : "Spouse's ") : '';
  return uniqueDefaultName(prefix + (BASE_NAMES[type] ?? BASE_NAMES.taxable), existingNames);
}

export type IdMaker = (type: string) => string;

export const newAccountId: IdMaker = (type) =>
  `acc_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const SPECIFIED_END = ['age', 'user_specified', 'spouse_specified'];

/** True when the end-age type uses the specified-age field. */
export const endAgeIsSpecified = (endType: unknown): boolean => SPECIFIED_END.includes(endType as string);

/**
 * An account with every field a card shows, filled with the card's defaults
 * (enter.js addAccountCard). "cash" becomes "taxable" and the legacy "age" end type
 * becomes the owner's "specified" choice, as the card's selects show them. Keys the
 * card doesn't know about are kept.
 */
export function cardAccount(data: Account, people: People, existingNames: string[], makeId: IdMaker = newAccountId): Account {
  const rawType = (data.type as string) || 'pretax';
  const type = rawType === 'cash' ? 'taxable' : rawType;
  const owner = (data.owner as string) || 'user';
  const isSpouse = owner === 'spouse';
  const def = <T>(v: T | undefined, d: T): T => (v !== undefined ? v : d);
  let endType = (data.contrib_end_age_type as string) || (isSpouse ? 'spouse_retirement' : 'retirement');
  if (endType === 'age') endType = isSpouse ? 'spouse_specified' : 'user_specified';
  const lowRisk = type === 'taxable' || type === 'hsa';
  return {
    ...data,
    id: data.id || makeId(type),
    name: def(data.name, defaultAccountName(type, owner, people, existingNames)),
    type,
    owner,
    balance: def(data.balance, 0),
    contrib_amount: def(data.contrib_amount, 0),
    contrib_freq: data.contrib_freq || 'annual',
    contrib_start_age: def(data.contrib_start_age, isSpouse ? people.spouseAge : people.userAge),
    contrib_end_age_type: endType,
    contrib_end_age_specified: def(data.contrib_end_age_specified, isSpouse ? people.spouseRetAge : people.userRetAge),
    contrib_adjust_inflation: def(data.contrib_adjust_inflation, true),
    return_mean: def(data.return_mean, lowRisk ? 5.0 : 6.0),
    return_std: def(data.return_std, lowRisk ? 8.0 : 10.0),
    hsa_for_medical: def(data.hsa_for_medical, true),
    dividend_yield: def(data.dividend_yield, 2.0),
    qualified_dividend_pct: def(data.qualified_dividend_pct, 85.0),
    interest_yield: def(data.interest_yield, 0.0),
    capital_gains_dist_rate: def(data.capital_gains_dist_rate, 0.5),
    cost_basis_ratio: def(data.cost_basis_ratio, 70.0),
    is_community_property: data.is_community_property === true || (data.is_community_property as unknown) === 'true',
  };
}

/** A new, empty account card (the Add Account button). */
export function newAccount(plan: Plan, makeId: IdMaker = newAccountId): Account {
  const names = (plan.accounts ?? []).map((a) => String(a?.name ?? ''));
  return cardAccount({}, personLabels(plan), names, makeId);
}

/** Changing a card's owner moves its end-age choice to the same choice for the new owner. */
export function setAccountOwner(acc: Account, owner: string): void {
  acc.owner = owner;
  const t = acc.contrib_end_age_type;
  if (owner === 'spouse') {
    if (t === 'retirement') acc.contrib_end_age_type = 'spouse_retirement';
    if (t === 'user_specified') acc.contrib_end_age_type = 'spouse_specified';
  } else {
    if (t === 'spouse_retirement') acc.contrib_end_age_type = 'retirement';
    if (t === 'spouse_specified') acc.contrib_end_age_type = 'user_specified';
  }
}

/**
 * Unticking Married moves each spouse-based end-age choice to "retirement";
 * ticking it again restores the original unless the user has since changed it.
 */
export function applyMarriageToAccounts(accounts: Account[] | undefined, married: boolean): void {
  for (const acc of accounts ?? []) syncSpouseChoice(acc, 'contrib_end_age_type', married, 'retirement');
}

export type Volatility = 'low' | 'moderate' | 'high' | 'custom';

export const VOLATILITY_PRESETS: Record<Exclude<Volatility, 'custom'>, number> = { low: 4.5, moderate: 9.5, high: 16.0 };

/** Which volatility choice a standard deviation shows as (8% and 10% count as moderate). */
export function volatilityChoice(std: unknown): Volatility {
  const s = Number(std);
  const near = (v: number) => Math.abs(s - v) < 0.1;
  if (near(4.5)) return 'low';
  if (near(9.5) || near(10.0) || near(8.0)) return 'moderate';
  if (near(16.0)) return 'high';
  return 'custom';
}

/** Names used by more than one account (case-insensitive), as first typed. */
export function duplicateAccountNames(accounts: Account[] | undefined): string[] {
  const seen = new Map<string, { raw: string; count: number }>();
  for (const acc of accounts ?? []) {
    const raw = String(acc?.name ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { raw, count: 1 });
  }
  return [...seen.values()].filter((e) => e.count > 1).map((e) => e.raw);
}

/** The calendar year in which the owner reaches `age` (the cards' "Year N" hints). */
export function yearAtAge(age: unknown, spouse: boolean, people: People): number | null {
  const a = Math.trunc(Number(age));
  if (!Number.isFinite(a) || a < 18 || a > 120) return null;
  const base = spouse && people.isMarried ? people.spouseAge : people.userAge;
  return people.currentYear + (a - base);
}

/**
 * Save the account cards as enter_view does: each card's fields (with the card
 * defaults) go through parse_account_rows, which forces the owner to "user" when
 * single, names blank accounts, applies per-type defaults to cleared fields and keeps
 * contribution start ages at or after the owner's present age. Replaces the list.
 */
export function commitAccounts(plan: Plan, makeId: IdMaker = newAccountId): void {
  const people = personLabels(plan);
  const married = getBool(plan.is_married);
  const userAge = getInt(plan.user_age, 60);
  const userRet = getInt(plan.user_retirement_age, 65);
  const spouseAge = getInt(plan.spouse_age, 60);
  const spouseRet = getInt(plan.spouse_retirement_age, 65);

  const cards: Account[] = [];
  for (const acc of plan.accounts ?? []) {
    cards.push(cardAccount(acc ?? {}, people, cards.map((c) => String(c.name ?? '')), makeId));
  }

  plan.accounts = cards.map((card, i) => {
    const type = card.type as string;
    const owner = married ? (card.owner as string) : 'user';
    const spouse = owner === 'spouse' && married;
    // A single person's spouse-based end-age choices were moved to "retirement" on the page.
    const endType = singleChoice(card.contrib_end_age_type as string, married, 'retirement');
    const defStart = spouse ? spouseAge : userAge;
    const defRet = spouse ? spouseRet : userRet;
    const taxable = type === 'taxable';
    const name = String(card.name ?? '').trim();
    return {
      ...card,
      id: String(card.id ?? '').trim() || `acc_row_${i + 1}`,
      name: name || `${title(owner)} ${title(type)} Account`,
      type,
      owner,
      balance: getFloat(card.balance, 0.0),
      contrib_amount: getFloat(card.contrib_amount, 0.0),
      contrib_freq: card.contrib_freq,
      contrib_start_age: Math.max(defStart, getInt(card.contrib_start_age, defStart)),
      contrib_end_age_type: endType,
      contrib_end_age_specified: getInt(card.contrib_end_age_specified, defRet),
      contrib_adjust_inflation: getBool(card.contrib_adjust_inflation),
      return_mean: getFloat(card.return_mean, 6.0),
      return_std: getFloat(card.return_std, 10.0),
      hsa_for_medical: getBool(card.hsa_for_medical),
      dividend_yield: getFloat(card.dividend_yield, taxable ? 2.0 : 0.0),
      qualified_dividend_pct: getFloat(card.qualified_dividend_pct, taxable ? 85.0 : 0.0),
      interest_yield: getFloat(card.interest_yield, 0.0),
      capital_gains_dist_rate: getFloat(card.capital_gains_dist_rate, taxable ? 0.5 : 0.0),
      cost_basis_ratio: getFloat(card.cost_basis_ratio, taxable ? 70.0 : 100.0),
      is_community_property: card.is_community_property === true,
    };
  });
}
