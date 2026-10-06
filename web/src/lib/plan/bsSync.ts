// Keeping the balance sheet and the account cards in step: the Enter page's
// syncAllTabs (enter.js) between tabs, and enter_view's save sequence.
import { cardAccount, personLabels } from './accountCard';
import { buildDefaultBalanceSheet, parseBalanceSheet, syncAccountsToBalanceSheet, syncBalanceSheetToAccounts } from './balanceSheet';
import { getBool, getInt } from './coerce';
import { isObj, type Obj, todayIso } from './pyutil';
import type { Account, Plan } from './types';

const ACCOUNT_CATS = ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily'];

/** Every balance-sheet account, in category order, goal accounts last. */
export function balanceSheetAccounts(bs: unknown): Obj[] {
  if (!isObj(bs) || !isObj(bs.categories)) return [];
  const cats = bs.categories;
  const out: Obj[] = [];
  for (const k of ACCOUNT_CATS) for (const a of (isObj(cats[k]) ? cats[k].accounts : null) ?? []) if (isObj(a)) out.push(a);
  for (const g of (isObj(cats.goals) ? cats.goals.goal_groups : null) ?? []) {
    for (const a of (isObj(g) ? g.accounts : null) ?? []) if (isObj(a)) out.push(a);
  }
  return out;
}

/**
 * The accounts as their cards show them (card defaults filled in). Accounts without
 * an id get the one their card has, so the balance sheet can link to them.
 */
function cardViews(plan: Plan): Account[] {
  const people = personLabels(plan);
  const names: string[] = [];
  return (plan.accounts ?? []).map((acc) => {
    const view = cardAccount(acc ?? {}, people, names);
    names.push(String(view.name ?? ''));
    if (acc && !acc.id) acc.id = view.id;
    return view;
  });
}

const ages = (plan: Plan) => [
  getInt(plan.user_age, 60), getInt(plan.user_retirement_age, 65), getBool(plan.is_married),
  getInt(plan.spouse_age, 60), getInt(plan.spouse_retirement_age, 65),
] as const;

const nameKey = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Push the account cards into the balance sheet's current column
 * (syncAccountCardsToBsState). Beyond sync_accounts_to_balance_sheet, the page also
 * unticks "For Retirement?" on sheet accounts that no card links to (by id or
 * name), and drops an empty default placeholder (acc_pretax_1, ...) no card uses.
 */
export function syncCardsToBalanceSheet(plan: Plan, today = todayIso()): void {
  if (!isObj(plan.balance_sheet)) return;
  const cards = cardViews(plan);
  const bs = syncAccountsToBalanceSheet(plan.balance_sheet, cards, getInt(plan.current_year, 2026), today);
  const ids = new Set(cards.map((c) => c.id));
  const names = new Set(cards.map((c) => nameKey(c.name)).filter(Boolean));
  for (const cat of ['pretax', 'roth', 'taxable']) {
    const list = bs.categories?.[cat]?.accounts as Obj[] | undefined;
    const id = `acc_${cat}_1`;
    if (!list || ids.has(id)) continue;
    const i = list.findIndex((a) => a?.id === id);
    if (i >= 0 && !Object.values(list[i].values ?? {}).some((v) => parseFloat(String(v)) > 0)) list.splice(i, 1);
  }
  for (const a of balanceSheetAccounts(bs)) {
    if (a.include_in_retirement && !ids.has(a.id) && !(a.name && names.has(nameKey(a.name)))) a.include_in_retirement = false;
  }
  plan.balance_sheet = bs;
}

/**
 * Rebuild the account cards from the balance sheet's accounts marked "For
 * Retirement?" (none marked: no cards, as the page removed them).
 */
export function syncBalanceSheetToCards(plan: Plan): void {
  if (!isObj(plan.balance_sheet)) return;
  if (!balanceSheetAccounts(plan.balance_sheet).some((a) => a.include_in_retirement)) {
    plan.accounts = [];
    return;
  }
  plan.accounts = syncBalanceSheetToAccounts(plan.balance_sheet, plan.accounts ?? [], ...ages(plan));
}

/**
 * syncAllTabs: reconcile both directions, starting from the side that was being
 * edited (the balance sheet when on its tab, otherwise the cards).
 */
export function syncAllTabs(plan: Plan, fromBalanceSheet: boolean, today = todayIso()): void {
  if (fromBalanceSheet) {
    syncBalanceSheetToCards(plan);
    syncCardsToBalanceSheet(plan, today);
  } else {
    syncCardsToBalanceSheet(plan, today);
    syncBalanceSheetToCards(plan);
  }
}

/**
 * enter_view's save of the balance sheet: the page's last sync of the cards into
 * the sheet, then parse_balance_sheet, sync_balance_sheet_to_accounts (which
 * replaces the accounts when any are marked for retirement) and
 * sync_accounts_to_balance_sheet. Without a balance sheet, a default one is built.
 */
export function commitBalanceSheet(plan: Plan, today = todayIso()): void {
  const year = getInt(plan.current_year, 2026);
  plan.accounts ??= [];
  if (!isObj(plan.balance_sheet)) {
    plan.balance_sheet = buildDefaultBalanceSheet(plan.accounts, year, plan, today);
    return;
  }
  syncCardsToBalanceSheet(plan, today);
  const bs = parseBalanceSheet(plan.balance_sheet, plan, today);
  const synced = syncBalanceSheetToAccounts(bs, plan.accounts, ...ages(plan));
  if (synced.length) plan.accounts = synced;
  plan.balance_sheet = syncAccountsToBalanceSheet(bs, plan.accounts, year, today);
}
