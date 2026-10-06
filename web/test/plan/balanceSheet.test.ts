import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateAccounts, flatAssetsToAccounts } from '../../src/lib/plan/accounts';
import {
  buildDefaultBalanceSheet,
  parseBalanceSheet,
  syncAccountsToBalanceSheet,
  syncBalanceSheetToAccounts,
} from '../../src/lib/plan/balanceSheet';
import { getDefaultData } from '../../src/lib/plan/defaults';
import { importPlanData } from '../../src/lib/plan/importPlan';
import { calculateMarginalTaxRate } from '../../src/lib/plan/marginal';
import { applyModeChange } from '../../src/lib/plan/modeChange';
import { parsePlanJson } from '../../src/lib/plan/normalize';
import { validateBalanceSheetAccounts } from '../../src/lib/plan/validate';
import { deepClose, FIXTURES_DIR, fixtureIndex, loadFixture, loadPlanFixture } from '../fixtures';

const TODAY = '2026-01-15'; // the date the fixture generator freezes
const SAVED_DIR = join(FIXTURES_DIR, '..', '..', 'saved json files');

type Case = { fn: string; args: any[]; kwargs: Record<string, any>; out: unknown };

/** Call the TS port of a forms.py function with Python-style args/kwargs. */
function call(c: Case): unknown {
  const a = structuredClone(c.args);
  const k = structuredClone(c.kwargs);
  switch (c.fn) {
    case 'calculate_marginal_tax_rate':
      return calculateMarginalTaxRate(a[0]);
    case 'flat_assets_to_accounts':
      return flatAssetsToAccounts(a[0], a[1]);
    case 'aggregate_accounts':
      return aggregateAccounts(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
    case 'build_default_balance_sheet':
      return buildDefaultBalanceSheet(a[0] ?? k.accounts ?? null, k.current_year ?? 2026, k.data ?? null, TODAY);
    case 'parse_balance_sheet':
      return parseBalanceSheet(a[0], k.default_data ?? null, TODAY);
    case 'sync_balance_sheet_to_accounts':
      return syncBalanceSheetToAccounts(a[0], k.existing_accounts ?? null, k.user_age ?? 60, k.user_retirement_age ?? 65,
        k.is_married ?? false, k.spouse_age ?? 60, k.spouse_retirement_age ?? 65);
    case 'sync_accounts_to_balance_sheet':
      return syncAccountsToBalanceSheet(a[0], a[1], k.current_year ?? 2026, TODAY);
    default:
      throw new Error(`unknown fn ${c.fn}`);
  }
}

describe('balance sheet / accounts / marginal rate grid', () => {
  const cases = loadFixture<Case[]>('functions', 'balance_sheet.json');
  cases.forEach((c, i) => {
    it(`${i}: ${c.fn}`, () => {
      expect(deepClose(call(c), c.out, 1e-12)).toBeNull();
    });
  });
});

describe('mode changes that sync returns into the balance sheet', () => {
  const cases = loadFixture<any[]>('functions', 'mode_change_sync.json');
  cases.forEach((c, i) => {
    it(`case ${i}`, () => {
      const plan = structuredClone(c.plan);
      const notes = applyModeChange(plan, c.post);
      expect(notes.map((n) => [n.level, n.message])).toEqual(c.messages);
      expect(deepClose(plan, c.result, 1e-12)).toBeNull();
    });
  });
});

describe('full import of every saved plan', () => {
  for (const p of fixtureIndex().plans.filter((x) => !x.name.startsWith('syn_'))) {
    it(p.name, () => {
      const data = parsePlanJson(readFileSync(join(SAVED_DIR, p.source), 'utf8'));
      const errors = importPlanData(data, TODAY);
      const expected = loadPlanFixture(p.name, 'imported');
      expect(errors).toEqual(expected.import_errors);
      expect(deepClose(data, expected.plan, 1e-12)).toBeNull();
    });
  }
});

// Ports of the BalanceSheetTests in core/tests.py that call the functions directly.
describe('BalanceSheetTests', () => {
  const inc = (amount: number, frequency = 'annual', subject_to_tax = true) => ({ name: 'X', amount, frequency, subject_to_tax });

  it('marginal tax rate calculation', () => {
    const single: any = { filing_status: 'single', state_tax_rate: 0.0, income_sources: [inc(100000.0)] };
    expect(calculateMarginalTaxRate(single)).toBe(22.0);
    single.state_tax_rate = 5.0;
    expect(calculateMarginalTaxRate(single)).toBe(27.0);
    expect(calculateMarginalTaxRate({ filing_status: 'single', state_tax_rate: 4.5, income_sources: [inc(300000.0)] })).toBe(39.5);
  });

  it('marginal tax rate with pensions and Social Security', () => {
    const joint = { is_married: true, filing_status: 'joint', state_tax_rate: 0.0 };
    const ss = { user_entitled: true, user_amount: 3000.0, user_freq: 'monthly', spouse_entitled: true, spouse_amount: 2000.0, spouse_freq: 'monthly' };
    expect(calculateMarginalTaxRate({ ...joint, desired_spending: 60000.0, income_sources: [inc(2000.0, 'monthly')] })).toBe(12.0);
    expect(calculateMarginalTaxRate({ ...joint, desired_spending: 60000.0, state_tax_rate: 5.0, income_sources: [inc(200000.0, 'monthly')] })).toBe(42.0);
    expect(calculateMarginalTaxRate({ ...joint, desired_spending: 40000.0, social_security: ss, income_sources: [inc(50000.0)] })).toBe(12.0);
    expect(calculateMarginalTaxRate({ ...joint, desired_spending: 40000.0, social_security: ss, income_sources: [inc(110000.0)] })).toBe(22.0);
    expect(calculateMarginalTaxRate({ is_married: false, filing_status: 'single', desired_spending: 20000.0, income_sources: [inc(100000.0, 'annual', false)] })).toBe(10.0);
  });

  it('marginal tax rate manual override', () => {
    expect(calculateMarginalTaxRate({ filing_status: 'single', desired_spending: 60000.0, state_tax_rate: 5.0, marginal_tax_rate_override: 18.5 })).toBe(18.5);
    expect(calculateMarginalTaxRate({ filing_status: 'single', desired_spending: 60000.0, state_tax_rate: 5.0, balance_sheet: { marginal_tax_rate_override: 28.0 } })).toBe(28.0);
  });

  it('builds and parses a balance sheet', () => {
    const bs = buildDefaultBalanceSheet([
      { name: '401k Account', type: 'pretax', balance: 500000.0, contrib_amount: 20000.0 },
      { name: 'Roth IRA', type: 'roth', balance: 150000.0, contrib_amount: 7000.0 },
    ], 2026);
    for (const k of ['pretax', 'roth', 'goals', 'real_estate', 'debts']) expect(k in bs.categories).toBe(true);
    const pretax = bs.categories.pretax.accounts;
    expect(pretax).toHaveLength(1);
    expect(pretax[0].name).toBe('401k Account');
    expect(pretax[0].values[bs.current_period]).toBe(500000.0);
    expect(bs.period_view_frequency).toBe('all');
    expect(bs.period_view_limit).toBe(3);
    const parsed = parseBalanceSheet(JSON.stringify(bs));
    expect(parsed.current_period).toBe(bs.current_period);
    expect(parsed.categories.pretax.accounts).toHaveLength(1);
  });

  it('syncs included balance-sheet accounts to the account list', () => {
    const bs = buildDefaultBalanceSheet();
    const p = bs.current_period;
    bs.categories.pretax.accounts.push({ name: 'New 401(k) Plan', type: 'pretax', owner: 'user', include_in_retirement: true,
      values: { [p]: 350000.0 }, contrib_amount: 22000.0, return_mean: 6.5, return_std: 9.5 });
    bs.categories.goals.goal_groups[0].accounts.push({ name: 'Car Fund HYSA', type: 'cash', owner: 'user', include_in_retirement: false, values: { [p]: 20000.0 } });
    const synced = syncBalanceSheetToAccounts(bs);
    const names = synced.map((a) => a.name);
    expect(names).toContain('New 401(k) Plan');
    expect(names).not.toContain('Car Fund HYSA');
    const acc = synced.find((a) => a.name === 'New 401(k) Plan')!;
    expect([acc.balance, acc.contrib_amount, acc.return_mean]).toEqual([350000.0, 22000.0, 6.5]);
  });

  it('keeps accounts and balance sheet in sync in both directions', () => {
    const bs = buildDefaultBalanceSheet();
    const p = bs.current_period;
    for (const a of bs.categories.roth.accounts) if (a.name.includes('Roth')) a.values[p] = 20000.0;
    const accounts = syncBalanceSheetToAccounts(bs);
    const roth = accounts.find((a) => a.type === 'roth')!;
    expect(roth.balance).toBe(20000.0);
    roth.balance = 25000.0;
    const updated = syncAccountsToBalanceSheet(bs, accounts);
    expect(updated.categories.roth.accounts.find((a: any) => a.type === 'roth').values[p]).toBe(25000.0);
  });

  it('default data has zero dollar amounts and a one-column balance sheet', () => {
    const d = getDefaultData(TODAY);
    expect([d.desired_spending, d.survivor_spending, d.social_security!.user_amount, d.pretax_assets!.present_balance]).toEqual([0, 0, 0, 0]);
    const bs = d.balance_sheet!;
    expect(bs.periods).toEqual([TODAY]);
    expect(bs.current_period).toBe(TODAY);
    for (const g of bs.categories.goals.goal_groups) {
      expect(g.target_amount).toBe(0.0);
      for (const a of g.accounts) expect(a.values[TODAY]).toBe(0.0);
    }
    for (const prop of bs.categories.real_estate.properties) expect(prop.market_values[TODAY]).toBe(0.0);
  });

  it('imports a multi-column balance sheet with every column', () => {
    const periods = ['2026-06-30', '2026-07-31', '2026-08-28'];
    const col = (a: number, b: number, c: number) => ({ [periods[0]]: a, [periods[1]]: b, [periods[2]]: c });
    const plan: any = {
      user_name: 'Multi Column Test', user_age: 60, user_retirement_age: 65, user_age_death: 90, is_married: false, desired_spending: 50000.0,
      balance_sheet: {
        periods, current_period: periods[2], marginal_tax_rate: 24.0, emergency_goal_amount: 30000.0,
        categories: {
          pretax: { title: 'Pretax', is_pretax: true, accounts: [{ id: 'acc_pretax_1', name: 'Primary 401(k)', institution: 'Fidelity', owner: 'user',
            type: 'pretax', include_in_retirement: true, values: col(450000.0, 480000.0, 500000.0), contrib_amount: 15000.0, return_mean: 6.0, return_std: 10.0 }] },
          roth: { accounts: [] }, taxable: { accounts: [] }, hsa: { accounts: [] },
          emergency: { target_amount: 30000.0, accounts: [{ id: 'acc_emg_1', name: 'Emergency HYSA', type: 'cash', include_in_retirement: false, values: col(25000.0, 28000.0, 30000.0) }] },
          goals: { goal_groups: [] }, daily: { accounts: [] },
        },
      },
      accounts: [{ name: 'Primary 401(k)', type: 'pretax', owner: 'user', balance: 500000.0, contrib_amount: 15000.0, return_mean: 6.0, return_std: 10.0 }],
    };
    expect(importPlanData(plan, TODAY)).toEqual([]);
    expect(plan.balance_sheet.periods).toEqual(periods);
    expect(plan.balance_sheet.categories.pretax.accounts[0].values).toEqual(col(450000.0, 480000.0, 500000.0));
    expect(plan.pretax_assets.present_balance).toBe(500000.0);
  });

  it('renaming one of several accounts in a category does not clobber the others', () => {
    const bs = buildDefaultBalanceSheet();
    const p = bs.current_period;
    for (const k of ['roth', 'taxable', 'hsa', 'emergency', 'daily']) bs.categories[k].accounts = [];
    bs.categories.pretax.accounts = [
      { id: 'acc_pretax_1', name: 'Primary 401(k)', type: 'pretax', owner: 'user', include_in_retirement: true, values: { [p]: 500000.0 }, contrib_amount: 20000.0 },
      { id: 'acc_pretax_2', name: 'Old Rollover IRA', type: 'pretax', owner: 'user', include_in_retirement: true, values: { [p]: 200000.0 }, contrib_amount: 0.0 },
    ];
    const accounts = syncBalanceSheetToAccounts(bs);
    expect(accounts.map((a) => [a.name, a.balance])).toEqual([['Primary 401(k)', 500000.0], ['Old Rollover IRA', 200000.0]]);
    bs.categories.pretax.accounts[1].name = 'Vanguard Rollover IRA';
    bs.categories.pretax.accounts[1].values[p] = 250000.0;
    const synced = syncBalanceSheetToAccounts(bs, accounts);
    expect(synced).toHaveLength(2);
    expect(synced.find((a) => a.id === 'acc_pretax_1')).toMatchObject({ name: 'Primary 401(k)', balance: 500000.0 });
    const acc2 = synced.find((a) => a.id === 'acc_pretax_2')!;
    expect(acc2).toMatchObject({ name: 'Vanguard Rollover IRA', balance: 250000.0 });
    acc2.balance = 260000.0;
    const out = syncAccountsToBalanceSheet(bs, synced).categories.pretax.accounts;
    expect(out.map((a: any) => [a.name, a.values[p]])).toEqual([['Primary 401(k)', 500000.0], ['Vanguard Rollover IRA', 260000.0]]);
  });

  it('a cash account included in retirement syncs as taxable', () => {
    const bs = buildDefaultBalanceSheet();
    bs.categories.emergency.accounts.push({ id: 'acc_emg_ret', name: 'Emergency HYSA for Retirement', type: 'cash', owner: 'user',
      include_in_retirement: true, values: { [bs.current_period]: 50000.0 } });
    expect(syncBalanceSheetToAccounts(bs).find((a) => a.id === 'acc_emg_ret')).toMatchObject({ type: 'taxable', balance: 50000.0 });
  });

  it('duplicate balance-sheet names are reported', () => {
    const bs = buildDefaultBalanceSheet();
    expect(validateBalanceSheetAccounts(bs)).toEqual([]);
    bs.categories.roth.accounts[0].name = bs.categories.pretax.accounts[0].name;
    expect(validateBalanceSheetAccounts(bs).some((e) => e.includes('Multiple accounts cannot have the same name'))).toBe(true);
  });

  it('links account cards to balance-sheet accounts case-insensitively (both directions)', () => {
    const bs = buildDefaultBalanceSheet();
    const updated = syncAccountsToBalanceSheet(bs, [{ id: 'acc_card_new_1', name: 'Roth ira', type: 'roth', owner: 'user', balance: 75000.0, contrib_amount: 7000.0 }]);
    const roth = updated.categories.roth.accounts;
    expect(roth).toHaveLength(1);
    expect(roth[0].name).toBe('Roth ira');
    expect(roth[0].values[updated.current_period]).toBe(75000.0);
    expect(validateBalanceSheetAccounts(updated)).toEqual([]);

    const bs2 = buildDefaultBalanceSheet();
    bs2.categories.roth.accounts[0].values[bs2.current_period] = 60000.0;
    const synced = syncBalanceSheetToAccounts(bs2, [{ id: 'acc_existing_1', name: 'roth ira', type: 'roth', owner: 'user', balance: 50000.0, contrib_amount: 5000.0 }]);
    expect(synced.find((a) => a.type === 'roth')).toMatchObject({ balance: 60000.0, contrib_amount: 5000.0 });
  });

  it('drops an unlinked same-name account from another category', () => {
    const updated = syncAccountsToBalanceSheet(buildDefaultBalanceSheet(), [
      { id: 'acc_pretax_100', name: 'Traditional 401(k) / IRA', type: 'pretax', balance: 50000.0 },
      { id: 'acc_pretax_101', name: 'Roth ira', type: 'pretax', balance: 20000.0 },
    ]);
    expect(updated.categories.roth.accounts.map((a: any) => a.name.toLowerCase())).not.toContain('roth ira');
    expect(validateBalanceSheetAccounts(updated)).toEqual([]);
  });
});
