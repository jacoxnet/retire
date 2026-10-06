// The Rebalance tab's calculations (enter.js portfolio rebalancing engine): accounts
// from the balance sheet's latest column, the default selection and allocations,
// target corridors, drift per asset class and the recommended trades. Rebalancing
// is a planning aid only; the simulation never reads it.
import { categoryAccounts, goalGroups } from './bsView';
import type { Obj } from './pyutil';
import type { AssetClass, Rebalancing } from './types';

export interface RebAccount {
  id: string;
  name: string;
  institution: string;
  category: string;
  category_title: string;
  is_investment: boolean;
  balance: number;
}

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isNaN(v) ? 0 : v;
  const n = parseFloat(String(v ?? '').replace(/[$,]/g, '').trim());
  return Number.isNaN(n) ? 0 : n;
};
const pct = (v: unknown): number => parseFloat(String(v)) || 0;

const CATEGORIES: [string, string, boolean][] = [
  ['pretax', 'Pretax Retirement', true],
  ['roth', 'Roth Retirement', true],
  ['taxable', 'Taxable Brokerage', true],
  ['hsa', 'Health Savings (HSA)', true],
  ['emergency', 'Emergency Fund', false],
  ['goals', 'Goal Sinking Fund', false],
  ['daily', 'Daily Spending', false],
];

/** Every balance-sheet account with its balance in the latest column (getLatestBsAccounts). */
export function latestSheetAccounts(bs: Obj | undefined, today: string): { latestPeriod: string; accounts: RebAccount[] } {
  const periods: string[] = Array.isArray(bs?.periods) ? bs!.periods : [];
  const latestPeriod = periods.length ? periods[periods.length - 1] : today;
  const valueOf = (a: Obj) => (a.values && a.values[latestPeriod] !== undefined ? toNumber(a.values[latestPeriod]) : 0);
  const accounts: RebAccount[] = [];
  for (const [key, title, investment] of CATEGORIES) {
    if (!bs?.categories?.[key]) continue;
    if (key === 'goals') {
      goalGroups(bs).forEach((g, gi) => (g.accounts ?? []).forEach((a: Obj, ai: number) => accounts.push({
        id: a.id || `acc_goal_${gi + 1}_${ai + 1}`,
        name: a.name || (g.name ? `${g.name} Fund` : 'Goal Account'),
        institution: a.institution || '',
        category: key,
        category_title: g.name || 'Goal Savings',
        is_investment: false,
        balance: valueOf(a),
      })));
      continue;
    }
    const cat = bs.categories[key];
    categoryAccounts(bs, key).forEach((a, i) => accounts.push({
      id: a.id || `acc_${key}_${i + 1}`,
      name: a.name || `${title} Account`,
      institution: a.institution || '',
      category: key,
      category_title: cat.title || title,
      is_investment: investment,
      balance: valueOf(a),
    }));
  }
  return { latestPeriod, accounts };
}

/**
 * Fill in what the tool needs (syncRebalanceFromBalanceSheet): with nothing selected
 * (or `force`), select the investment accounts with a balance (else the first three
 * accounts); give every account without an allocation 100% in one class (cash
 * accounts to a cash class, Roth to an international class, others to the first).
 * Returns true if anything changed.
 */
export function seedRebalancing(reb: Rebalancing, accounts: RebAccount[], force = false): boolean {
  let changed = false;
  if (force || !reb.included_account_ids || reb.included_account_ids.length === 0) {
    let ids = accounts.filter((a) => a.is_investment && a.balance > 0).map((a) => a.id);
    if (!ids.length && accounts.length) ids = accounts.slice(0, 3).map((a) => a.id);
    if (JSON.stringify(ids) !== JSON.stringify(reb.included_account_ids ?? [])) {
      reb.included_account_ids = ids;
      changed = true;
    }
  }
  reb.account_allocations ??= {};
  const classes = reb.asset_classes ?? [];
  if (!classes.length) return changed;
  const find = (pred: (c: AssetClass) => boolean) => (classes.find(pred) ?? classes[0]).id;
  for (const acc of accounts) {
    const existing = reb.account_allocations[acc.id] as Record<string, unknown> | undefined;
    if (existing && Object.keys(existing).length) continue;
    let pick = classes[0].id;
    if (acc.category === 'emergency' || acc.category === 'daily') {
      pick = find((c) => c.id === 'ac_cash' || c.name.toLowerCase().includes('cash'));
    } else if (acc.category === 'roth') {
      pick = find((c) => c.id === 'ac_intl_stocks' || /intl|international/.test(c.name.toLowerCase()));
    }
    reb.account_allocations[acc.id] = { [pick]: 100 };
    changed = true;
  }
  return changed;
}

export function selectAccounts(reb: Rebalancing, accounts: RebAccount[], mode: 'all' | 'investment' | 'none'): void {
  reb.included_account_ids = mode === 'all' ? accounts.map((a) => a.id)
    : mode === 'investment' ? accounts.filter((a) => a.is_investment).map((a) => a.id) : [];
}

export function toggleAccount(reb: Rebalancing, id: string, on: boolean): void {
  const ids = (reb.included_account_ids ??= []);
  const i = ids.indexOf(id);
  if (on && i === -1) ids.push(id);
  else if (!on && i !== -1) ids.splice(i, 1);
}

export const includedAccounts = (reb: Rebalancing, accounts: RebAccount[]): RebAccount[] =>
  accounts.filter((a) => (reb.included_account_ids ?? []).includes(a.id));

export const tolerance = (reb: Rebalancing): number => parseFloat(String(reb.tolerance_percent)) || 10.0;

/** The selected balances plus the cash flow (never negative): what the targets apply to. */
export function targetPortfolio(reb: Rebalancing, accounts: RebAccount[]): { selected: number; target: number } {
  const selected = includedAccounts(reb, accounts).reduce((s, a) => s + a.balance, 0);
  return { selected, target: Math.max(0, selected + (pct(reb.cash_flow) || 0)) };
}

export interface Corridor {
  targetPct: number;
  targetDol: number;
  minPct: number;
  maxPct: number;
  minDol: number;
  maxDol: number;
}

export function corridor(targetPct: number, tolPct: number, portfolio: number): Corridor {
  const minPct = targetPct * (1 - tolPct / 100);
  const maxPct = targetPct * (1 + tolPct / 100);
  return {
    targetPct,
    targetDol: portfolio * (targetPct / 100),
    minPct, maxPct,
    minDol: portfolio * (minPct / 100),
    maxDol: portfolio * (maxPct / 100),
  };
}

/** The targets' total and whether it is 100%, under or over. */
export function targetSum(reb: Rebalancing): { total: number; state: 'balanced' | 'under' | 'over' } {
  const total = (reb.asset_classes ?? []).reduce((s, c) => s + pct(c.target_percent), 0);
  const diff = Math.round((total - 100) * 10) / 10;
  return { total, state: Math.abs(diff) < 0.01 ? 'balanced' : total < 100 ? 'under' : 'over' };
}

/** One account's split across the classes, and how much of it is assigned. */
export function accountAllocation(reb: Rebalancing, acc: RebAccount) {
  const alloc = (reb.account_allocations?.[acc.id] ?? {}) as Record<string, unknown>;
  const rows = (reb.asset_classes ?? []).map((c) => ({ cls: c, pct: pct(alloc[c.id]), dollars: acc.balance * (pct(alloc[c.id]) / 100) }));
  const total = rows.reduce((s, r) => s + r.pct, 0);
  return {
    rows,
    total,
    complete: Math.abs(total - 100) < 0.1,
    allocated: acc.balance * (total / 100),
    remaining: Math.round((100 - total) * 10) / 10,
    /** The class this account is 100% in, if any (the preset select shows it). */
    sole: (reb.asset_classes ?? []).find((c) => alloc[c.id] === 100 || alloc[c.id] === '100')?.id ?? '',
  };
}

export function applyPreset(reb: Rebalancing, accId: string, classId: string): void {
  if (!classId) return;
  reb.account_allocations ??= {};
  reb.account_allocations[accId] = Object.fromEntries((reb.asset_classes ?? []).map((c) => [c.id, c.id === classId ? 100 : 0]));
}

export function setAllocation(reb: Rebalancing, accId: string, classId: string, value: number): void {
  reb.account_allocations ??= {};
  const alloc = ((reb.account_allocations[accId] as Record<string, number> | undefined) ??= {});
  alloc[classId] = Number.isNaN(value) ? 0 : Math.max(0, value);
}

/** "Assign Remaining x% to <first class>". */
export function assignRemaining(reb: Rebalancing, accId: string, remaining: number): void {
  const first = reb.asset_classes?.[0]?.id;
  if (!first) return;
  reb.account_allocations ??= {};
  const alloc = ((reb.account_allocations[accId] as Record<string, number> | undefined) ??= {});
  alloc[first] = pct(alloc[first]) + remaining;
}

export const COLOR_PALETTE = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'];
export const nextColor = (reb: Rebalancing): string => COLOR_PALETTE[(reb.asset_classes ?? []).length % COLOR_PALETTE.length];

export function addAssetClass(reb: Rebalancing, name: string, target: number, color: string, now = Date.now()): void {
  (reb.asset_classes ??= []).push({ id: `ac_${now}`, name, target_percent: Number.isNaN(target) || target < 0 ? 0 : target, color });
}

/** Remove a class and its share of every allocation; the last class can't be removed. */
export function deleteAssetClass(reb: Rebalancing, classId: string): boolean {
  if ((reb.asset_classes ?? []).length <= 1) return false;
  reb.asset_classes = reb.asset_classes.filter((c) => c.id !== classId);
  for (const alloc of Object.values(reb.account_allocations ?? {})) delete (alloc as Record<string, unknown>)[classId];
  return true;
}

export interface ClassResult extends Corridor {
  classId: string;
  name: string;
  color: string;
  actualDol: number;
  actualPct: number;
  driftDol: number;
  driftPct: number;
  status: 'in_range' | 'over' | 'under';
}

/** Drift of each class against its corridor (calculateAndRenderRebalanceResults). */
export function rebalanceResults(reb: Rebalancing, accounts: RebAccount[]) {
  const included = includedAccounts(reb, accounts);
  const portfolio = included.reduce((s, a) => s + a.balance, 0);
  const { target } = targetPortfolio(reb, accounts);
  const tol = tolerance(reb);
  const classes: ClassResult[] = (reb.asset_classes ?? []).map((c) => {
    const actualDol = included.reduce((s, a) => s + a.balance * (pct((reb.account_allocations?.[a.id] as Obj | undefined)?.[c.id]) / 100), 0);
    const actualPct = portfolio > 0 ? (actualDol / portfolio) * 100 : 0;
    const cor = corridor(pct(c.target_percent), tol, target);
    const status = actualPct > cor.maxPct + 0.05 ? 'over' : actualPct < cor.minPct - 0.05 ? 'under' : 'in_range';
    return {
      ...cor, classId: c.id, name: c.name, color: c.color || '#3b82f6', actualDol, actualPct,
      driftDol: actualDol - cor.targetDol, driftPct: actualPct - cor.targetPct, status,
    };
  });
  const outOfRange = classes.filter((c) => c.status !== 'in_range').length;
  return { classes, included, outOfRange, tolerance: tol };
}

export interface Trade {
  classId: string;
  name: string;
  amount: number;
  color: string;
}

/** Sells and buys (over $50) to return to the targets, or just to the corridor in minimal mode. */
export function tradePlan(classes: ClassResult[], mode: string): { sells: Trade[]; buys: Trade[] } {
  const sells: Trade[] = [];
  const buys: Trade[] = [];
  const t = (r: ClassResult, amount: number): Trade => ({ classId: r.classId, name: r.name, amount, color: r.color });
  for (const r of classes) {
    if (mode === 'minimal') {
      if (r.status === 'over' && r.actualDol - r.maxDol > 50) sells.push(t(r, r.actualDol - r.maxDol));
      else if (r.status === 'under' && r.minDol - r.actualDol > 50) buys.push(t(r, r.minDol - r.actualDol));
    } else {
      const d = r.actualDol - r.targetDol;
      if (d > 50) sells.push(t(r, d));
      else if (d < -50) buys.push(t(r, Math.abs(d)));
    }
  }
  return { sells, buys };
}
