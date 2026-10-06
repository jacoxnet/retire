// The Balance Sheet tab's calculations and edits (enter.js balance-sheet engine):
// visible columns, per-column totals, deltas, KPIs, chart series, CPI-adjusted
// goal targets, and adding or removing columns, accounts, goals, property and debts.
// Everything works on the plan's balance_sheet object; missing parts read as empty.
import { uniqueDefaultName } from './accountCard';
import type { Obj } from './pyutil';

export type BalanceSheetObj = Obj;
type Values = Record<string, number>;

export const ACCOUNT_CATEGORIES = ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily'] as const;
export const COLLAPSIBLE = ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'goals', 'daily', 'real_estate', 'debts'] as const;

export const CATEGORY_TITLES: Record<string, string> = {
  pretax: 'Pretax Retirement Accounts',
  roth: 'Post-Tax (Roth) Retirement Accounts',
  taxable: 'Investment / Taxable Brokerage Accounts',
  hsa: 'Health Savings Accounts (HSA)',
  emergency: 'Emergency Fund Accounts',
  goals: 'Goal Savings (Sinking Funds)',
  daily: 'Daily Spending Accounts (Checking & Cash)',
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const valueAt = (values: unknown, p: string): number =>
  values && typeof values === 'object' && (values as Values)[p] !== undefined ? num((values as Values)[p]) : 0;

const cats = (bs: BalanceSheetObj): Obj => (bs && typeof bs.categories === 'object' && bs.categories) || {};
export const categoryAccounts = (bs: BalanceSheetObj, key: string): Obj[] => cats(bs)[key]?.accounts ?? [];
export const goalGroups = (bs: BalanceSheetObj): Obj[] => cats(bs).goals?.goal_groups ?? [];
export const properties = (bs: BalanceSheetObj): Obj[] => cats(bs).real_estate?.properties ?? [];
export const debts = (bs: BalanceSheetObj): Obj[] => (Array.isArray(cats(bs).debts) ? cats(bs).debts : []);
export const categoryTitle = (bs: BalanceSheetObj, key: string): string => cats(bs)[key]?.title ?? CATEGORY_TITLES[key] ?? key;

/** Every value map in the sheet (accounts, goal accounts, property values, mortgages, debts). */
function allValueMaps(bs: BalanceSheetObj, create: boolean): Values[] {
  const maps: Values[] = [];
  const take = (o: Obj, key: string) => {
    if (create && (!o[key] || typeof o[key] !== 'object')) o[key] = {};
    if (o[key] && typeof o[key] === 'object') maps.push(o[key]);
  };
  for (const k of ACCOUNT_CATEGORIES) for (const a of categoryAccounts(bs, k)) take(a, 'values');
  for (const g of goalGroups(bs)) for (const a of g.accounts ?? []) take(a, 'values');
  for (const p of properties(bs)) {
    take(p, 'market_values');
    for (const m of p.mortgages ?? []) take(m, 'balances');
  }
  for (const d of debts(bs)) take(d, 'values');
  return maps;
}

// ---------------------------------------------------------------------------
// Columns.
// ---------------------------------------------------------------------------

/** The latest date per quarter or year, or every date (getFilteredPeriodsByFrequency). */
export function filterPeriodsByFrequency(periods: string[], freq: string): string[] {
  const sorted = [...new Set(periods)].sort();
  if (freq !== 'quarterly' && freq !== 'yearly') return sorted;
  const latest = new Map<string, string>();
  for (const p of sorted) {
    const parts = p.split('-');
    if (freq === 'quarterly' && parts.length < 2) continue;
    const key = freq === 'quarterly' ? `${parts[0]}-Q${Math.ceil(parseInt(parts[1], 10) / 3)}` : parts[0];
    const cur = latest.get(key);
    if (!cur || p > cur) latest.set(key, p);
  }
  return [...latest.keys()].sort().map((k) => latest.get(k)!);
}

/** The columns shown, oldest first (getVisiblePeriods). */
export function visiblePeriods(bs: BalanceSheetObj, today: string): string[] {
  const raw: string[] = Array.isArray(bs?.periods) ? bs.periods : [];
  if (!raw.length) return [today];
  const candidates = filterPeriodsByFrequency(raw, bs.period_view_frequency || 'all');
  if (!candidates.length) return [raw[raw.length - 1]];
  const limit = bs.period_view_limit;
  if (!limit || limit <= 0 || limit >= candidates.length) return candidates;
  return candidates.slice(-limit);
}

/** The column limit, with Django's default of 3 when unset. */
export const periodLimit = (bs: BalanceSheetObj): number =>
  bs?.period_view_limit === undefined || bs?.period_view_limit === null ? 3 : bs.period_view_limit;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A column heading: "Mar 31, 2026" (formatPeriodHeader without the markup). */
export function periodLabel(p: string): string {
  const parts = p.split('-');
  if (parts.length < 2) return p;
  const month = MONTHS[parseInt(parts[1], 10) - 1] ?? parts[1];
  const day = parts.length >= 3 && parts[2] ? `${parseInt(parts[2], 10)}, ` : '';
  return `${month} ${day}${parts[0]}`;
}

/** A chart label: "Mar 2026". */
export function chartLabel(p: string): string {
  const parts = p.split('-');
  return parts.length >= 2 ? `${MONTHS[parseInt(parts[1], 10) - 1] ?? parts[1]} ${parts[0]}` : p;
}

export interface Delta {
  diff: number;
  pct: number;
}

export function calcDelta(curr: number, prev: number): Delta {
  const diff = curr - prev;
  return { diff, pct: prev !== 0 ? (diff / Math.abs(prev)) * 100.0 : 0 };
}

// ---------------------------------------------------------------------------
// Tax rate and CPI-adjusted targets.
// ---------------------------------------------------------------------------

export const hasRateOverride = (bs: BalanceSheetObj): boolean => {
  const o = bs?.marginal_tax_rate_override;
  return o !== null && o !== undefined && o !== '' && !Number.isNaN(Number(o));
};

/** The rate used for deferred tax: the override, else the automatic rate (else 24%). */
export function effectiveTaxRate(bs: BalanceSheetObj, autoRate: number): number {
  if (hasRateOverride(bs)) return parseFloat(String(bs.marginal_tax_rate_override));
  return autoRate || 24.0;
}

export type CpiSeries = Record<string, number>;

/** YYYY-MM of the month before a date (getCpiPriorMonth); a bad date means "now". */
export function cpiPriorMonth(dateStr: unknown, now = new Date()): string {
  if (!dateStr) return '2026-08';
  const parts = String(dateStr).trim().replace(/\//g, '-').split('-');
  let y = parseInt(parts[0], 10);
  let m = parts.length > 1 ? parseInt(parts[1], 10) : 1;
  if (Number.isNaN(y) || Number.isNaN(m)) {
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  if (m === 1) {
    y -= 1;
    m = 12;
  } else {
    m -= 1;
  }
  return `${y}-${m < 10 ? '0' : ''}${m}`;
}

function cpiIndex(cpi: CpiSeries, dateStr: unknown): { ym: string; index: number } {
  const ym = cpiPriorMonth(dateStr);
  const keys = Object.keys(cpi).sort();
  if (!keys.length) return { ym, index: 100.0 };
  if (cpi[ym] !== undefined && cpi[ym] !== null) return { ym, index: cpi[ym] };
  const k = ym < keys[0] ? keys[0] : keys[keys.length - 1];
  return { ym: k, index: cpi[k] };
}

function latestCpi(cpi: CpiSeries): { ym: string; index: number } {
  const keys = Object.keys(cpi).sort();
  if (!keys.length) return { ym: '2026-08', index: 334.98 };
  const k = keys[keys.length - 1];
  return { ym: k, index: cpi[k] };
}

export interface TargetCalc {
  effectiveTarget: number;
  baseTarget: number;
  autoInflate: boolean;
  baseMonth: string;
  baseIndex: number;
  evalMonth: string;
  evalIndex: number;
  ratio: number;
  inflationPct: number;
}

/** A goal target, optionally inflated by CPI-U from its base date (getEffectiveTarget). */
export function effectiveTarget(cpi: CpiSeries, baseTarget: unknown, autoInflate: unknown, baseDate: unknown, evalDate: unknown): TargetCalc {
  const base = parseFloat(String(baseTarget)) || 0.0;
  if (!autoInflate || base <= 0) {
    return { effectiveTarget: base, baseTarget: base, autoInflate: false, baseMonth: '', baseIndex: 0, evalMonth: '', evalIndex: 0, ratio: 1.0, inflationPct: 0.0 };
  }
  const b = cpiIndex(cpi, baseDate);
  const e = evalDate ? cpiIndex(cpi, evalDate) : latestCpi(cpi);
  const ratio = b.index > 0 && e.index > 0 ? e.index / b.index : 1.0;
  return {
    effectiveTarget: Math.round(base * ratio),
    baseTarget: base,
    autoInflate: true,
    baseMonth: b.ym,
    baseIndex: b.index,
    evalMonth: e.ym,
    evalIndex: e.index,
    ratio,
    inflationPct: Math.round((ratio - 1.0) * 10000) / 100,
  };
}

/** The emergency fund's base target (target_amount, else the legacy emergency_goal_amount). */
export function emergencyTargetBase(bs: BalanceSheetObj): number {
  const emg = cats(bs).emergency ?? {};
  const v = emg.target_amount !== undefined ? emg.target_amount : bs?.emergency_goal_amount !== undefined ? bs.emergency_goal_amount : 0.0;
  return parseFloat(String(v)) || 0.0;
}

export interface GoalStatus {
  name: string;
  calc: TargetCalc;
  target: number;
  current: number;
  shortage: number;
  surplus: number;
  percent: number;
  accounts: { name: string; value: number }[];
}

function goalStatus(name: string, calc: TargetCalc, accounts: Obj[], p: string): GoalStatus {
  const rows = accounts.map((a) => ({ name: String(a.name), value: valueAt(a.values, p) }));
  const current = rows.reduce((s, r) => s + r.value, 0);
  const target = calc.effectiveTarget;
  return {
    name, calc, target, current,
    shortage: Math.max(0, target - current),
    surplus: Math.max(0, current - target),
    percent: target > 0 ? Math.round((current / target) * 100) : 100,
    accounts: rows,
  };
}

export function emergencyStatus(bs: BalanceSheetObj, cpi: CpiSeries, p: string): GoalStatus {
  const emg = cats(bs).emergency ?? {};
  const calc = effectiveTarget(cpi, emergencyTargetBase(bs), emg.target_auto_inflate, emg.target_base_date, p);
  return goalStatus('Emergency Reserve', calc, emg.accounts ?? [], p);
}

export function goalGroupStatus(bs: BalanceSheetObj, cpi: CpiSeries, g: Obj, p: string): GoalStatus {
  const calc = effectiveTarget(cpi, g.target_amount || 0.0, g.target_auto_inflate, g.target_base_date, p);
  return goalStatus(g.name || 'Goal', calc, g.accounts ?? [], p);
}

// ---------------------------------------------------------------------------
// Totals.
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  byCategory: Record<string, number>;
  goals: number;
  liquid: number;
  homeValue: number;
  mortgages: number;
  debts: number;
  netEquity: number;
  totalDebts: number;
  grossNetWorth: number;
  deferredTax: number;
  netPretax: number;
  liquidNetTax: number;
  liquidNetTaxAndGoals: number;
  netRetirement: number;
}

/** Every total the table, KPIs and chart show for one column, at a tax rate in percent. */
export function periodTotals(bs: BalanceSheetObj, p: string, taxRatePct: number): PeriodTotals {
  const rate = taxRatePct / 100.0;
  const byCategory: Record<string, number> = {};
  for (const k of ACCOUNT_CATEGORIES) byCategory[k] = categoryAccounts(bs, k).reduce((s, a) => s + valueAt(a.values, p), 0);
  let goals = 0;
  for (const g of goalGroups(bs)) for (const a of g.accounts ?? []) goals += valueAt(a.values, p);
  let homeValue = 0;
  let mortgages = 0;
  for (const prop of properties(bs)) {
    homeValue += valueAt(prop.market_values, p);
    for (const m of prop.mortgages ?? []) mortgages += valueAt(m.balances, p);
  }
  const debtTotal = debts(bs).reduce((s, d) => s + valueAt(d.values, p), 0);
  const liquid = ACCOUNT_CATEGORIES.reduce((s, k) => s + byCategory[k], 0) + goals;
  const pretax = byCategory.pretax;
  const deferred = pretax * rate;
  return {
    byCategory, goals, liquid, homeValue, mortgages, debts: debtTotal,
    netEquity: homeValue - mortgages,
    totalDebts: mortgages + debtTotal,
    grossNetWorth: liquid + (homeValue - mortgages) - debtTotal,
    deferredTax: Math.round(pretax * rate),
    netPretax: Math.round(pretax * (1 - rate)),
    liquidNetTax: liquid - deferred,
    liquidNetTaxAndGoals: liquid - deferred - goals,
    netRetirement: byCategory.roth + byCategory.taxable + byCategory.hsa + pretax * (1 - rate),
  };
}

/** The KPI cards: the current column against the column before it in the full history (updateBsKpis). */
export function kpis(bs: BalanceSheetObj, taxRatePct: number, today: string) {
  const periods: string[] = Array.isArray(bs?.periods) ? bs.periods : [];
  const curr = bs?.current_period || periods[periods.length - 1] || today;
  const prev = periods.length > 1 ? periods[periods.length - 2] : curr;
  const c = periodTotals(bs, curr, taxRatePct);
  const pv = periodTotals(bs, prev, taxRatePct);
  return {
    current: c,
    grossDelta: calcDelta(c.grossNetWorth, pv.grossNetWorth),
    liquidDelta: calcDelta(c.liquid, pv.liquid),
  };
}

export type ChartMetric = 'gross_net_worth' | 'liquid_net_worth' | 'net_retirement' | 'breakdown';

export interface ChartSeries {
  labels: string[];
  gross: number[];
  liquid: number[];
  netRetirement: number[];
  pretax: number[];
  roth: number[];
  taxableHsa: number[];
  cash: number[];
  homeEquity: number[];
}

/** Every column's chart values (renderBsHistoricalChart). */
export function chartSeries(bs: BalanceSheetObj, taxRatePct: number): ChartSeries {
  const periods: string[] = Array.isArray(bs?.periods) ? bs.periods : [];
  const s: ChartSeries = { labels: [], gross: [], liquid: [], netRetirement: [], pretax: [], roth: [], taxableHsa: [], cash: [], homeEquity: [] };
  for (const p of periods) {
    const t = periodTotals(bs, p, taxRatePct);
    s.labels.push(chartLabel(p));
    s.gross.push(t.grossNetWorth);
    s.liquid.push(t.liquid);
    s.netRetirement.push(t.netRetirement);
    s.pretax.push(t.byCategory.pretax);
    s.roth.push(t.byCategory.roth);
    s.taxableHsa.push(t.byCategory.taxable + t.byCategory.hsa);
    s.cash.push(t.byCategory.emergency + t.goals + t.byCategory.daily);
    s.homeEquity.push(t.netEquity);
  }
  return s;
}

// ---------------------------------------------------------------------------
// View state stored in the sheet (collapsed sections, column scope).
// ---------------------------------------------------------------------------

export const isCollapsed = (bs: BalanceSheetObj, key: string): boolean => !!bs?.collapsed_categories?.[key];
export const isGoalCollapsed = (bs: BalanceSheetObj, i: number): boolean => !!bs?.collapsed_goals?.[i];

export function toggleCategory(bs: BalanceSheetObj, key: string): void {
  bs.collapsed_categories ??= {};
  bs.collapsed_categories[key] = !bs.collapsed_categories[key];
}

export function toggleGoalGroup(bs: BalanceSheetObj, i: number): void {
  bs.collapsed_goals ??= {};
  bs.collapsed_goals[i] = !bs.collapsed_goals[i];
}

/** Summary collapses every section and goal; Detailed expands them (setBsViewMode). */
export function setViewMode(bs: BalanceSheetObj, mode: 'detailed' | 'summary'): void {
  bs.view_mode = mode;
  bs.collapsed_categories ??= {};
  bs.collapsed_goals ??= {};
  for (const k of COLLAPSIBLE) bs.collapsed_categories[k] = mode === 'summary';
  goalGroups(bs).forEach((_, i) => (bs.collapsed_goals[i] = mode === 'summary'));
}

/** Which view button is lit: all sections collapsed, none, or neither. */
export function viewModeState(bs: BalanceSheetObj): 'summary' | 'detailed' | 'mixed' {
  if (COLLAPSIBLE.every((k) => isCollapsed(bs, k))) return 'summary';
  if (COLLAPSIBLE.every((k) => !isCollapsed(bs, k))) return 'detailed';
  return 'mixed';
}

// ---------------------------------------------------------------------------
// Edits.
// ---------------------------------------------------------------------------

const latestPeriod = (bs: BalanceSheetObj): string =>
  Array.isArray(bs.periods) && bs.periods.length ? bs.periods[bs.periods.length - 1] : '2026-02-28';

/** The month-end after the latest column, suggested for a new one (promptAddPeriodSnapshot). */
export function suggestNextPeriod(bs: BalanceSheetObj, now = new Date()): string {
  const parts = latestPeriod(bs).split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + 1;
  if (Number.isNaN(y) || Number.isNaN(m)) {
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Add a dated column, copying every value from the latest column; it becomes the
 * current column if it is the latest. Returns an error message, or null.
 */
export function addPeriod(bs: BalanceSheetObj, date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const parsed = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  if (!m || !parsed || parsed.getFullYear() !== +m[1] || parsed.getMonth() !== +m[2] - 1 || parsed.getDate() !== +m[3]) {
    return 'Please choose a valid date.';
  }
  const newDate = date.trim();
  bs.periods ??= [];
  if (bs.periods.includes(newDate)) return `A balance sheet column with date ${newDate} already exists.`;
  const latest = latestPeriod(bs);
  for (const vals of allValueMaps(bs, false)) vals[newDate] = vals[latest] !== undefined ? vals[latest] : 0.0;
  bs.periods.push(newDate);
  bs.periods.sort();
  bs.current_period = bs.periods[bs.periods.length - 1];
  return null;
}

/** Remove a column and its values (the last remaining column can't be removed). */
export function removePeriod(bs: BalanceSheetObj, p: string): boolean {
  if (!Array.isArray(bs.periods) || bs.periods.length <= 1) return false;
  bs.periods = bs.periods.filter((x: string) => x !== p);
  bs.current_period = bs.periods[bs.periods.length - 1];
  for (const vals of allValueMaps(bs, false)) delete vals[p];
  return true;
}

const zeroValues = (bs: BalanceSheetObj): Values => Object.fromEntries((bs.periods ?? []).map((p: string) => [p, 0.0]));
const allAccountNames = (bs: BalanceSheetObj): string[] => {
  const names: string[] = [];
  for (const k of ACCOUNT_CATEGORIES) for (const a of categoryAccounts(bs, k)) if (a.name) names.push(a.name);
  for (const g of goalGroups(bs)) for (const a of g.accounts ?? []) if (a.name) names.push(a.name);
  return names;
};
const rand = () => Math.random().toString(36).slice(2, 7);

function ensureCategory(bs: BalanceSheetObj, key: string): Obj {
  bs.categories ??= {};
  bs.categories[key] ??= { title: CATEGORY_TITLES[key] ?? key, is_pretax: key === 'pretax', accounts: [] };
  bs.categories[key].accounts ??= [];
  return bs.categories[key];
}

/** Add an account to a category ("+ Add ... Account"). */
export function addCategoryAccount(bs: BalanceSheetObj, key: string, now = Date.now()): Obj {
  const cat = ensureCategory(bs, key);
  const retirement = ['pretax', 'roth', 'taxable', 'hsa'].includes(key);
  const base = `New ${categoryTitle(bs, key).replace(' Accounts', '').replace(' (HSA)', '')} Account`;
  const growth = key === 'pretax' || key === 'roth';
  const acc = {
    id: `acc_${key}_${cat.accounts.length + 1}_${now}_${rand()}`,
    name: uniqueDefaultName(base, allAccountNames(bs)),
    institution: 'Custodian / Bank',
    owner: 'user',
    type: key === 'daily' || key === 'emergency' ? 'cash' : key,
    include_in_retirement: retirement,
    values: zeroValues(bs),
    contrib_amount: 0.0,
    return_mean: growth ? 6.0 : 5.0,
    return_std: growth ? 10.0 : 8.0,
  };
  cat.accounts.push(acc);
  return acc;
}

/** Add a sinking fund with one savings account. */
export function addGoalGroup(bs: BalanceSheetObj, name: string, target: number, now = Date.now()): void {
  bs.categories ??= {};
  bs.categories.goals ??= { title: CATEGORY_TITLES.goals, is_pretax: false, goal_groups: [] };
  bs.categories.goals.goal_groups ??= [];
  bs.categories.goals.goal_groups.push({
    id: `goal_${now}`,
    name,
    target_amount: target,
    target_auto_inflate: false,
    target_base_date: bs.current_period,
    accounts: [{
      id: `acc_g_${now}`, name: `${name} Savings Account`, institution: 'Bank / Custodian', owner: 'user', type: 'cash',
      include_in_retirement: false, values: zeroValues(bs),
    }],
  });
}

export function addGoalAccount(bs: BalanceSheetObj, group: Obj, now = Date.now()): void {
  group.accounts ??= [];
  group.accounts.push({
    id: `acc_g_${now}_${rand()}`,
    name: uniqueDefaultName(`Additional ${group.name} Account`, allAccountNames(bs)),
    institution: 'Bank / Investment', owner: 'user', type: 'cash', include_in_retirement: false, values: zeroValues(bs),
  });
}

export function addProperty(bs: BalanceSheetObj, name: string, now = Date.now()): void {
  bs.categories ??= {};
  bs.categories.real_estate ??= { properties: [] };
  bs.categories.real_estate.properties ??= [];
  bs.categories.real_estate.properties.push({
    id: `prop_${now}`, name, market_values: zeroValues(bs),
    mortgages: [{ id: `mort_${now}`, name: '1st Mortgage', balances: zeroValues(bs) }],
  });
}

export function addMortgage(bs: BalanceSheetObj, prop: Obj, now = Date.now()): void {
  prop.mortgages ??= [];
  prop.mortgages.push({ id: `mort_${now}`, name: '2nd Mortgage / HELOC', balances: zeroValues(bs) });
}

export function addDebt(bs: BalanceSheetObj, name: string, now = Date.now()): void {
  bs.categories ??= {};
  if (!Array.isArray(bs.categories.debts)) bs.categories.debts = [];
  bs.categories.debts.push({ id: `debt_${now}`, name, institution: 'Lender / Bank', values: zeroValues(bs) });
}

/** Names used by more than one balance-sheet account (case-insensitive), as first typed. */
export function duplicateSheetNames(bs: BalanceSheetObj): string[] {
  const seen = new Map<string, { raw: string; n: number }>();
  for (const raw of allAccountNames(bs).map((n) => String(n).trim()).filter(Boolean)) {
    const k = raw.toLowerCase();
    const e = seen.get(k);
    if (e) e.n += 1;
    else seen.set(k, { raw, n: 1 });
  }
  return [...seen.values()].filter((e) => e.n > 1).map((e) => e.raw);
}
