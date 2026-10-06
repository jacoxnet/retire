// Balance sheet: default structure, parsing, and two-way sync with the account list
// (build_default_balance_sheet / parse_balance_sheet / sync_balance_sheet_to_accounts /
// sync_accounts_to_balance_sheet in core/forms.py).
//
// Functions that need "today" (the Django code calls datetime.date.today()) take it as
// a trailing YYYY-MM-DD argument, defaulting to the local date.
import { pyBool, pyFloat } from '../engine/py';
import { getBool, getFloat, getInt, pyStr } from './coerce';
import { calculateMarginalTaxRate } from './marginal';
import { get, isObj, type Obj, or, pyEqual, title, todayIso } from './pyutil';
import type { Account, BalanceSheet } from './types';

const RETIREMENT_CATS = ['pretax', 'roth', 'taxable', 'hsa'];
const nameKey = (o: Obj) => pyStr(get(o, 'name', '')).trim().toLowerCase();

const cashAccount = (id: string, name: string, institution: string, period: string, type = 'cash'): Obj => ({
  id, name, institution, owner: 'user', type, include_in_retirement: false, values: { [period]: 0.0 },
});

const goalGroup = (id: string, name: string, period: string, accounts: Obj[]): Obj => ({
  id, name, target_amount: 0.0, target_auto_inflate: false, target_base_date: period, accounts,
});

const retirementPlaceholder = (id: string, name: string, institution: string, type: string, period: string,
  mean: number, std: number): Obj => ({
  id, name, institution, owner: 'user', type, include_in_retirement: true, values: { [period]: 0.0 },
  contrib_amount: 0.0, contrib_freq: 'annual', contrib_start_age: 60, contrib_end_age_type: 'retirement',
  contrib_end_age_specified: 65, contrib_adjust_inflation: true, return_mean: mean, return_std: std,
});

/**
 * A balance sheet with one column (today) holding the given accounts, plus default
 * placeholder accounts, goal groups, real estate and debts.
 */
export function buildDefaultBalanceSheet(
  accounts: Account[] | null = null, _currentYear = 2026, data: Obj | null = null, today = todayIso(),
): BalanceSheet {
  const period = today;
  const byType: Record<string, Obj[]> = { pretax: [], roth: [], taxable: [], hsa: [] };
  let n = 0;
  for (const acc of accounts ?? []) {
    const atype = get(acc, 'type', 'pretax');
    const taxable = atype === 'taxable';
    const accDict = {
      id: `acc_${n + 1}`,
      name: get(acc, 'name', 'Account'),
      institution: get(acc, 'institution', 'Investment Custodian'),
      owner: get(acc, 'owner', 'user'),
      type: atype,
      include_in_retirement: true,
      values: { [period]: pyFloat(get(acc, 'balance', 0.0)) },
      contrib_amount: pyFloat(get(acc, 'contrib_amount', 0.0)),
      contrib_freq: get(acc, 'contrib_freq', 'annual'),
      contrib_start_age: get(acc, 'contrib_start_age', 60),
      contrib_end_age_type: get(acc, 'contrib_end_age_type', 'retirement'),
      contrib_end_age_specified: get(acc, 'contrib_end_age_specified', 65),
      contrib_adjust_inflation: get(acc, 'contrib_adjust_inflation', true),
      return_mean: pyFloat(get(acc, 'return_mean', 6.0)),
      return_std: pyFloat(get(acc, 'return_std', 10.0)),
      hsa_for_medical: get(acc, 'hsa_for_medical', true),
      dividend_yield: pyFloat(get(acc, 'dividend_yield', taxable ? 2.0 : 0.0)),
      qualified_dividend_pct: pyFloat(get(acc, 'qualified_dividend_pct', taxable ? 85.0 : 0.0)),
      interest_yield: pyFloat(get(acc, 'interest_yield', 0.0)),
      capital_gains_dist_rate: pyFloat(get(acc, 'capital_gains_dist_rate', taxable ? 0.5 : 0.0)),
      cost_basis_ratio: pyFloat(get(acc, 'cost_basis_ratio', taxable ? 70.0 : 100.0)),
    };
    // Ids count accounts placed so far; unknown types are dropped without taking a number.
    if (atype in byType) {
      byType[atype].push(accDict);
      n++;
    }
  }

  if (!byType.pretax.length) {
    byType.pretax.push(retirementPlaceholder('acc_pretax_1', 'Primary 401(k) / Traditional IRA', 'Fidelity', 'pretax', period, 6.0, 10.0));
  }
  if (!byType.roth.length) {
    byType.roth.push(retirementPlaceholder('acc_roth_1', 'Roth IRA', 'Vanguard', 'roth', period, 6.0, 10.0));
  }
  if (!byType.taxable.length) {
    byType.taxable.push({
      ...retirementPlaceholder('acc_taxable_1', 'Taxable Brokerage Account', 'Charles Schwab', 'taxable', period, 5.0, 8.0),
      dividend_yield: 2.0, qualified_dividend_pct: 85.0, interest_yield: 0.0, capital_gains_dist_rate: 0.5, cost_basis_ratio: 70.0,
    });
  }

  return {
    periods: [period],
    current_period: period,
    marginal_tax_rate: data && pyBool(data) ? calculateMarginalTaxRate(data) : 24.0,
    marginal_tax_rate_override: null,
    emergency_goal_amount: 0.0,
    period_view_limit: 3,
    period_view_frequency: 'all',
    categories: {
      pretax: { title: 'Pretax Retirement Accounts', is_pretax: true, accounts: byType.pretax },
      roth: { title: 'Post-Tax (Roth) Retirement Accounts', is_pretax: false, accounts: byType.roth },
      taxable: { title: 'Investment / Taxable Brokerage Accounts', is_pretax: false, accounts: byType.taxable },
      hsa: { title: 'Health Savings Accounts (HSA)', is_pretax: false, accounts: byType.hsa },
      emergency: {
        title: 'Emergency Fund Accounts', is_pretax: false, target_amount: 0.0, target_auto_inflate: false,
        target_base_date: period,
        accounts: [cashAccount('acc_emg_1', 'High-Yield Emergency Savings', 'Marcus / Ally', period)],
      },
      goals: {
        title: 'Goal Savings (Sinking Funds)',
        is_pretax: false,
        goal_groups: [
          goalGroup('goal_car', 'Next Vehicle Replacement', period, [
            cashAccount('acc_g_car_1', 'Car Fund Savings (HYSA)', 'Ally Bank', period),
            cashAccount('acc_g_car_2', 'Short-Term Bond Reserve (Brokerage)', 'Vanguard (BSV)', period, 'taxable'),
          ]),
          goalGroup('goal_hvac', 'Home Maintenance & HVAC Reserve', period, [
            cashAccount('acc_g_hvac_1', 'Home Repair Sinking Fund', 'Capital One 360', period),
          ]),
          goalGroup('goal_travel', 'Vacation & Travel Fund', period, [
            cashAccount('acc_g_trv_1', 'Travel Savings Account', 'Discover Bank', period),
          ]),
          goalGroup('goal_tech', 'Tech & Electronics Sinking Fund', period, [
            cashAccount('acc_g_tech_1', 'Technology Reserve', 'Ally Bank', period),
          ]),
        ],
      },
      daily: {
        title: 'Daily Spending Accounts (Checking & Cash)',
        is_pretax: false,
        accounts: [cashAccount('acc_daily_1', 'Primary Checking', 'Chase Bank', period)],
      },
      real_estate: {
        properties: [{
          id: 'prop_primary',
          name: 'Primary Residence',
          market_values: { [period]: 0.0 },
          mortgages: [{ id: 'mort_primary', name: 'Primary 30-Yr Mortgage', balances: { [period]: 0.0 } }],
        }],
      },
      debts: [
        { id: 'debt_auto', name: 'Auto Loan', institution: 'Toyota Financial Services', values: { [period]: 0.0 } },
        { id: 'debt_cc', name: 'Credit Cards (Monthly Statement Balance)', institution: 'Chase / Amex', values: { [period]: 0.0 } },
      ],
    },
  };
}

/** The current column: current_period, else the last period, else `fallback`. */
function currentPeriod(bs: Obj, fallback: string | null): string | null {
  const periods = get(bs, 'periods', []);
  return or(get(bs, 'current_period'), or(pyBool(periods) ? periods[periods.length - 1] : periods, fallback)) || fallback;
}

/**
 * A balance sheet from an object or its JSON (or {balance_sheet_json}); anything
 * without categories gives the default. Fills missing emergency/goal inflation fields.
 */
export function parseBalanceSheet(raw: unknown, defaultData: Obj | null = null, today = todayIso()): BalanceSheet {
  const fromJson = (s: unknown): Obj | null => {
    try {
      const p = JSON.parse(String(s));
      return isObj(p) && 'categories' in p ? p : null;
    } catch {
      return null;
    }
  };
  let bs: Obj | null = null;
  if (typeof raw === 'string') bs = fromJson(raw);
  if (bs === null && isObj(raw)) {
    if ('categories' in raw) bs = raw;
    else if ('balance_sheet_json' in raw) bs = fromJson(raw.balance_sheet_json);
  }
  if (bs === null) bs = buildDefaultBalanceSheet(null, 2026, defaultData, today);

  const period = currentPeriod(bs, today);
  const cats = get(bs, 'categories', {});
  const fill = (o: Obj) => {
    if (!('target_auto_inflate' in o)) o.target_auto_inflate = false;
    if (!pyBool(get(o, 'target_base_date'))) o.target_base_date = period;
  };
  if (isObj(cats.emergency)) fill(cats.emergency);
  if (isObj(cats.goals)) for (const g of get(cats.goals, 'goal_groups', [])) if (isObj(g)) fill(g);
  return bs;
}

/**
 * The account list (as the engine and account cards use it) from the balance sheet's
 * accounts that are included in retirement, taking each balance from the current
 * column. Settings come from the matching existing account (by id, then
 * case-insensitive name) when there is one. Cash accounts become taxable.
 */
export function syncBalanceSheetToAccounts(
  balanceSheet: unknown, existingAccounts: Account[] | null = null, userAge = 60, userRetirementAge = 65,
  isMarried = false, spouseAge = 60, spouseRetirementAge = 65, _minStartAge = 60,
): Account[] {
  if (!isObj(balanceSheet) || !('categories' in balanceSheet)) return existingAccounts ?? [];
  const categories = get(balanceSheet, 'categories', {});
  const period = currentPeriod(balanceSheet, null);

  const byId = new Map<unknown, Obj>();
  const byName = new Map<string, Obj>();
  if (Array.isArray(existingAccounts)) {
    for (const acc of existingAccounts) {
      if (!isObj(acc)) continue;
      if (pyBool(get(acc, 'id'))) byId.set(acc.id, acc);
      if (pyBool(get(acc, 'name'))) byName.set(nameKey(acc), acc);
    }
  }

  const synced: Account[] = [];
  const processAccount = (acc: Obj, defaultType: string) => {
    if (!pyBool(get(acc, 'include_in_retirement', false))) return;
    let atype = get(acc, 'type', defaultType);
    if (atype === 'cash') atype = 'taxable';
    let owner = isMarried ? get(acc, 'owner', 'user') : 'user';

    const vals = get(acc, 'values', {});
    let bal: number;
    if (isObj(vals)) {
      if (period && period in vals) bal = getFloat(vals[period]) as number;
      else if (pyBool(vals)) bal = getFloat(Object.values(vals).at(-1)) as number;
      else bal = getFloat(get(acc, 'balance', 0.0)) as number;
    } else {
      bal = getFloat(get(acc, 'balance', 0.0)) as number;
    }

    const id = get(acc, 'id');
    const key = nameKey(acc);
    const match = pyBool(id) && byId.has(id) ? byId.get(id)! : key && byName.has(key) ? byName.get(key)! : null;

    // Settings: from the matching account card when there is one, else from this entry.
    const src = match ?? acc;
    const fb = match ? acc : null;
    /** match.get(k, acc.get(k, d)) when matched; acc.get(k, d) otherwise. */
    const pick = (k: string, d: unknown) => get(src, k, fb ? get(fb, k, d) : d);
    /** Value from the match unless it's null, then the entry's (for flags Python checks with `is None`). */
    const pickNullable = (k: string, d: unknown) => {
      const v = match ? get(match, k) : null;
      return v === null ? get(acc, k, d) : v;
    };

    let name: unknown;
    let institution: unknown;
    if (match) {
      name = or(get(acc, 'name'), or(get(match, 'name'), `${title(String(owner))} ${title(String(atype))} Account`));
      institution = or(get(acc, 'institution'), get(match, 'institution', ''));
      atype = or(get(match, 'type'), get(acc, 'type', defaultType));
      if (atype === 'cash') atype = 'taxable';
      owner = isMarried ? or(get(match, 'owner'), get(acc, 'owner', 'user')) : 'user';
    } else {
      name = get(acc, 'name', `${title(String(owner))} ${title(String(atype))} Account`);
      institution = get(acc, 'institution', '');
    }
    const spouse = owner === 'spouse' && isMarried;
    const defStart = spouse ? spouseAge : userAge;
    const defRet = spouse ? spouseRetirementAge : userRetirementAge;
    const taxable = atype === 'taxable';

    const cFreq = match ? or(get(match, 'contrib_freq'), get(acc, 'contrib_freq', 'annual')) : get(acc, 'contrib_freq', 'annual');
    const endTypeDefault = owner === 'spouse' ? 'spouse_retirement' : 'retirement';
    const cEndType = match ? or(get(match, 'contrib_end_age_type'), get(acc, 'contrib_end_age_type', endTypeDefault))
      : get(acc, 'contrib_end_age_type', endTypeDefault);

    synced.push({
      id: or(id, match ? get(match, 'id') : `acc_${defaultType}_${synced.length + 1}`),
      name: name as string,
      institution: institution as string,
      type: atype,
      owner,
      balance: bal,
      contrib_amount: getFloat(pick('contrib_amount', 0.0)) as number,
      contrib_freq: cFreq,
      contrib_start_age: Math.max(defStart, getInt(pick('contrib_start_age', defStart)) as number),
      contrib_end_age_type: cEndType,
      contrib_end_age_specified: getInt(pick('contrib_end_age_specified', defRet)) as number,
      contrib_adjust_inflation: getBool(match ? pickNullable('contrib_adjust_inflation', true) : get(acc, 'contrib_adjust_inflation', true)),
      return_mean: getFloat(pick('return_mean', 6.0)) as number,
      return_std: getFloat(pick('return_std', 10.0)) as number,
      hsa_for_medical: getBool(match ? pickNullable('hsa_for_medical', true) : get(acc, 'hsa_for_medical', true)),
      dividend_yield: getFloat(pick('dividend_yield', taxable ? 2.0 : 0.0)) as number,
      qualified_dividend_pct: getFloat(pick('qualified_dividend_pct', taxable ? 85.0 : 0.0)) as number,
      interest_yield: getFloat(pick('interest_yield', 0.0)) as number,
      capital_gains_dist_rate: getFloat(pick('capital_gains_dist_rate', taxable ? 0.5 : 0.0)) as number,
      cost_basis_ratio: getFloat(pick('cost_basis_ratio', taxable ? 70.0 : 100.0)) as number,
      is_community_property: getBool(match ? pickNullable('is_community_property', false) : get(acc, 'is_community_property', false)),
    });
  };

  for (const cat of ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily']) {
    for (const acc of get(get(categories, cat, {}), 'accounts', [])) {
      processAccount(acc, RETIREMENT_CATS.includes(cat) ? cat : 'taxable');
    }
  }
  for (const group of get(get(categories, 'goals', {}), 'goal_groups', [])) {
    for (const acc of get(group, 'accounts', [])) processAccount(acc, 'taxable');
  }
  return synced.length ? synced : (existingAccounts ?? []);
}

const removeFirstEqual = (list: Obj[], item: Obj) => {
  const i = list.findIndex((x) => pyEqual(x, item));
  if (i >= 0) list.splice(i, 1);
};

/**
 * Push account-card edits (name, balance, contributions, returns, ...) into the
 * balance sheet's current column, linking by id then case-insensitive name, moving
 * accounts whose type changed, adding new ones, and dropping unlinked duplicates and
 * unused default placeholders. Modifies and returns `balanceSheet`.
 */
export function syncAccountsToBalanceSheet(
  balanceSheet: unknown, accounts: Account[] | null, currentYear = 2026, today = todayIso(),
): BalanceSheet {
  if (!isObj(balanceSheet) || !('categories' in balanceSheet)) {
    return buildDefaultBalanceSheet(accounts, currentYear, null, today);
  }
  const period = currentPeriod(balanceSheet, today) as string;
  const periods: string[] = get(balanceSheet, 'periods', []);

  balanceSheet.categories ??= {};
  const categories: Obj = balanceSheet.categories;
  for (const cat of RETIREMENT_CATS) {
    if (!(cat in categories)) categories[cat] = { title: `${title(cat)} Accounts`, accounts: [] };
  }

  const bsById = new Map<unknown, [string, Obj]>();
  const bsByName = new Map<string, [string, Obj]>();
  for (const [cat, data] of Object.entries(categories)) {
    if (isObj(data) && 'accounts' in data) {
      for (const b of get(data, 'accounts', [])) {
        if (!isObj(b)) continue;
        if (pyBool(get(b, 'id'))) bsById.set(b.id, [cat, b]);
        if (pyBool(get(b, 'name'))) bsByName.set(nameKey(b), [cat, b]);
      }
    } else if (cat === 'goals' && isObj(data)) {
      for (const g of get(data, 'goal_groups', [])) {
        for (const b of get(g, 'accounts', [])) {
          if (!isObj(b)) continue;
          if (pyBool(get(b, 'id'))) bsById.set(b.id, ['goals', b]);
          if (pyBool(get(b, 'name'))) bsByName.set(nameKey(b), ['goals', b]);
        }
      }
    }
  }

  const accountIds = new Set((accounts ?? []).filter((a) => isObj(a) && pyBool(get(a, 'id'))).map((a) => a.id));

  for (const acc of accounts ?? []) {
    const atype = get(acc, 'type', 'pretax');
    const cat = RETIREMENT_CATS.includes(atype) ? atype : 'taxable';
    categories[cat].accounts ??= [];
    const catAccs: Obj[] = categories[cat].accounts;

    let matched: Obj | null = null;
    const key = nameKey(acc);
    const link = pyBool(get(acc, 'id')) && bsById.has(acc.id) ? bsById.get(acc.id)! : key && bsByName.has(key) ? bsByName.get(key)! : null;
    if (link) {
      const [oldCat, m] = link;
      matched = m;
      if (oldCat !== cat && oldCat in categories && 'accounts' in categories[oldCat]) {
        const oldList: Obj[] = categories[oldCat].accounts;
        if (oldList.some((x) => pyEqual(x, m))) removeFirstEqual(oldList, m);
        if (!catAccs.some((x) => pyEqual(x, m))) catAccs.push(m);
      }
    }

    // An unlinked balance-sheet account elsewhere with the same name is a duplicate: drop it.
    if (key) {
      const targetId = matched ? get(matched, 'id') : get(acc, 'id');
      for (const data of Object.values(categories)) {
        if (isObj(data) && 'accounts' in data) {
          // In place (Python's slice assignment), so references like catAccs stay valid.
          const list = data.accounts as Obj[];
          const kept = list.filter((x) => !(
            isObj(x) && nameKey(x) === key && get(x, 'id') !== targetId && !accountIds.has(get(x, 'id'))
          ));
          list.splice(0, list.length, ...kept);
        }
      }
      bsByName.delete(key);
    }

    const bal = getFloat(get(acc, 'balance', 0.0)) as number;
    const taxable = atype === 'taxable';
    if (matched) {
      const prefer = (k: string, d: unknown) => get(acc, k, get(matched, k, d));
      const preferNullable = (k: string, d: unknown) => {
        const v = get(acc, k);
        return v === null ? get(matched, k, d) : v;
      };
      matched.name = get(acc, 'name', get(matched, 'name'));
      matched.owner = get(acc, 'owner', get(matched, 'owner', 'user'));
      matched.type = atype;
      matched.include_in_retirement = true;
      matched.contrib_amount = getFloat(prefer('contrib_amount', 0.0));
      matched.contrib_freq = prefer('contrib_freq', 'annual');
      matched.contrib_start_age = getInt(prefer('contrib_start_age', 60));
      matched.contrib_end_age_type = prefer('contrib_end_age_type', 'retirement');
      matched.contrib_end_age_specified = getInt(prefer('contrib_end_age_specified', 65));
      matched.contrib_adjust_inflation = getBool(preferNullable('contrib_adjust_inflation', true));
      matched.return_mean = getFloat(prefer('return_mean', 6.0));
      matched.return_std = getFloat(prefer('return_std', 10.0));
      matched.hsa_for_medical = getBool(preferNullable('hsa_for_medical', true));
      matched.is_community_property = getBool(preferNullable('is_community_property', false));
      matched.dividend_yield = getFloat(prefer('dividend_yield', taxable ? 2.0 : 0.0));
      matched.qualified_dividend_pct = getFloat(prefer('qualified_dividend_pct', taxable ? 85.0 : 0.0));
      matched.interest_yield = getFloat(prefer('interest_yield', 0.0));
      matched.capital_gains_dist_rate = getFloat(prefer('capital_gains_dist_rate', taxable ? 0.5 : 0.0));
      matched.cost_basis_ratio = getFloat(prefer('cost_basis_ratio', taxable ? 70.0 : 100.0));
      if (!isObj(matched.values)) matched.values = {};
      matched.values[period] = bal;
    } else {
      const values: Obj = Object.fromEntries(periods.map((p) => [p, 0.0]));
      values[period] = bal;
      catAccs.push({
        id: or(get(acc, 'id'), `acc_${cat}_${catAccs.length + 1}`),
        name: get(acc, 'name', `${title(pyStr(get(acc, 'owner', 'User')))} ${title(String(atype))} Account`),
        institution: get(acc, 'institution', 'Investment Custodian'),
        owner: get(acc, 'owner', 'user'),
        type: atype,
        include_in_retirement: true,
        values,
        contrib_amount: getFloat(get(acc, 'contrib_amount', 0.0)),
        contrib_freq: get(acc, 'contrib_freq', 'annual'),
        contrib_start_age: getInt(get(acc, 'contrib_start_age', 60)),
        contrib_end_age_type: get(acc, 'contrib_end_age_type', 'retirement'),
        contrib_end_age_specified: getInt(get(acc, 'contrib_end_age_specified', 65)),
        contrib_adjust_inflation: getBool(get(acc, 'contrib_adjust_inflation', true)),
        return_mean: getFloat(get(acc, 'return_mean', 6.0)),
        return_std: getFloat(get(acc, 'return_std', 10.0)),
        hsa_for_medical: getBool(get(acc, 'hsa_for_medical', true)),
        dividend_yield: getFloat(get(acc, 'dividend_yield', taxable ? 2.0 : 0.0)),
        qualified_dividend_pct: getFloat(get(acc, 'qualified_dividend_pct', taxable ? 85.0 : 0.0)),
        interest_yield: getFloat(get(acc, 'interest_yield', 0.0)),
        capital_gains_dist_rate: getFloat(get(acc, 'capital_gains_dist_rate', taxable ? 0.5 : 0.0)),
        cost_basis_ratio: getFloat(get(acc, 'cost_basis_ratio', taxable ? 70.0 : 100.0)),
        is_community_property: getBool(get(acc, 'is_community_property', false)),
      });
    }
  }

  // Drop unlinked, empty default placeholders from categories that now have real accounts.
  for (const cat of ['pretax', 'roth', 'taxable']) {
    const defaultId = `acc_${cat}_1`;
    if (accountIds.has(defaultId) || !(cat in categories)) continue;
    const catAccounts: Obj[] = get(categories[cat], 'accounts', []);
    const hasUserAccounts = catAccounts.some((a) => get(a, 'id') !== defaultId && pyBool(get(a, 'include_in_retirement')));
    if (!hasUserAccounts) continue;
    for (const b of [...catAccounts]) {
      if (get(b, 'id') !== defaultId) continue;
      const vals = Object.values(or(get(b, 'values'), {}) as Obj);
      if (!vals.some((v) => pyFloat(or(v, 0)) > 0)) removeFirstEqual(catAccounts, b);
    }
  }
  return balanceSheet;
}
