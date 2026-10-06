import { describe, expect, it } from 'vitest';
import { buildDefaultRebalancing } from '../../src/lib/plan/defaults';
import {
  accountAllocation, addAssetClass, applyPreset, assignRemaining, corridor, deleteAssetClass, latestSheetAccounts, nextColor,
  type RebAccount, rebalanceResults, seedRebalancing, selectAccounts, setAllocation, targetPortfolio, targetSum, toggleAccount,
  tradePlan,
} from '../../src/lib/plan/rebalance';
import type { Rebalancing } from '../../src/lib/plan/types';

const sheet = {
  periods: ['2025-06-30', '2025-12-31'],
  categories: {
    pretax: { title: 'Pretax Retirement Accounts', accounts: [{ id: 'p1', name: 'IRA', values: { '2025-12-31': 60000 } }] },
    roth: { accounts: [{ id: 'r1', name: 'Roth', values: { '2025-12-31': 20000 } }] },
    taxable: { accounts: [{ id: 't1', name: 'Brokerage', values: { '2025-12-31': 0 } }] },
    emergency: { title: 'Emergency Fund Accounts', accounts: [{ id: 'e1', name: 'HYSA', values: { '2025-12-31': 20000 } }] },
    goals: { goal_groups: [{ name: 'Car', accounts: [{ name: 'Car Fund', values: { '2025-06-30': 500 } }] }] },
  },
};

const fresh = (): Rebalancing => buildDefaultRebalancing();
const accounts = (): RebAccount[] => latestSheetAccounts(sheet, '2026-01-15').accounts;

describe('accounts and defaults', () => {
  it('reads the latest column of every account', () => {
    const { latestPeriod, accounts: a } = latestSheetAccounts(sheet, '2026-01-15');
    expect(latestPeriod).toBe('2025-12-31');
    expect(a.map((x) => [x.id, x.category, x.is_investment, x.balance])).toEqual([
      ['p1', 'pretax', true, 60000], ['r1', 'roth', true, 20000], ['t1', 'taxable', true, 0],
      ['e1', 'emergency', false, 20000], ['acc_goal_1_1', 'goals', false, 0],
    ]);
    expect(a[0].category_title).toBe('Pretax Retirement Accounts');
    expect(a[1].category_title).toBe('Roth Retirement');
    expect(a[4].category_title).toBe('Car');
  });

  it('seeds the selection and allocations once', () => {
    const reb = fresh();
    expect(seedRebalancing(reb, accounts())).toBe(true);
    expect(reb.included_account_ids).toEqual(['p1', 'r1']);
    expect(reb.account_allocations).toMatchObject({ p1: { ac_us_stocks: 100 }, r1: { ac_intl_stocks: 100 }, e1: { ac_cash: 100 } });
    expect(seedRebalancing(reb, accounts())).toBe(false);
    reb.included_account_ids = ['e1'];
    expect(seedRebalancing(reb, accounts())).toBe(false);
    expect(seedRebalancing(reb, accounts(), true)).toBe(true);
    expect(reb.included_account_ids).toEqual(['p1', 'r1']);
    const none = fresh();
    seedRebalancing(none, accounts().map((a) => ({ ...a, balance: 0 })));
    expect(none.included_account_ids).toEqual(['p1', 'r1', 't1']);
  });

  it('selects and toggles accounts', () => {
    const reb = fresh();
    selectAccounts(reb, accounts(), 'investment');
    expect(reb.included_account_ids).toEqual(['p1', 'r1', 't1']);
    toggleAccount(reb, 'e1', true);
    toggleAccount(reb, 'p1', false);
    expect(reb.included_account_ids).toEqual(['r1', 't1', 'e1']);
    selectAccounts(reb, accounts(), 'none');
    expect(reb.included_account_ids).toEqual([]);
  });
});

describe('targets and allocations', () => {
  it('computes corridors, totals and the target sum', () => {
    expect(corridor(30, 10, 100000)).toEqual({ targetPct: 30, targetDol: 30000, minPct: 27, maxPct: 33, minDol: 27000, maxDol: 33000 });
    const reb = fresh();
    reb.included_account_ids = ['p1', 'e1'];
    reb.cash_flow = -100000;
    expect(targetPortfolio(reb, accounts())).toEqual({ selected: 80000, target: 0 });
    expect(targetSum(reb)).toEqual({ total: 100, state: 'balanced' });
    reb.asset_classes[0].target_percent = 50;
    expect(targetSum(reb).state).toBe('over');
    reb.asset_classes[0].target_percent = 10;
    expect(targetSum(reb).state).toBe('under');
  });

  it('edits allocations and classes', () => {
    const reb = fresh();
    const acc = accounts()[0];
    setAllocation(reb, 'p1', 'ac_us_stocks', 60);
    setAllocation(reb, 'p1', 'ac_bonds', -5);
    let a = accountAllocation(reb, acc);
    expect([a.total, a.remaining, a.complete, a.allocated]).toEqual([60, 40, false, 36000]);
    assignRemaining(reb, 'p1', a.remaining);
    a = accountAllocation(reb, acc);
    expect([a.total, a.complete, a.sole]).toEqual([100, true, 'ac_us_stocks']);
    applyPreset(reb, 'p1', 'ac_bonds');
    expect(reb.account_allocations.p1).toEqual({ ac_us_stocks: 0, ac_intl_stocks: 0, ac_bonds: 100, ac_cash: 0 });
    expect(nextColor(reb)).toBe('#ec4899');
    addAssetClass(reb, 'Gold', -3, '#ff0000', 7);
    expect(reb.asset_classes.at(-1)).toEqual({ id: 'ac_7', name: 'Gold', target_percent: 0, color: '#ff0000' });
    expect(deleteAssetClass(reb, 'ac_bonds')).toBe(true);
    expect('ac_bonds' in (reb.account_allocations.p1 as object)).toBe(false);
    reb.asset_classes = reb.asset_classes.slice(0, 1);
    expect(deleteAssetClass(reb, reb.asset_classes[0].id)).toBe(false);
  });
});

describe('results and trades', () => {
  function scenario() {
    const reb = fresh();
    reb.included_account_ids = ['p1', 'r1', 'e1'];
    reb.account_allocations = { p1: { ac_us_stocks: 100 }, r1: { ac_intl_stocks: 100 }, e1: { ac_cash: 100 } };
    return reb;
  }

  it('measures drift against the corridors', () => {
    const r = rebalanceResults(scenario(), accounts());
    const byId = Object.fromEntries(r.classes.map((c) => [c.classId, c]));
    expect(byId.ac_us_stocks).toMatchObject({ actualDol: 60000, actualPct: 60, targetDol: 40000, status: 'over' });
    expect(byId.ac_intl_stocks).toMatchObject({ actualPct: 20, status: 'in_range' });
    expect(byId.ac_bonds).toMatchObject({ actualPct: 0, status: 'under' });
    expect(byId.ac_cash).toMatchObject({ actualPct: 20, status: 'over' });
    expect(r.outOfRange).toBe(3);
  });

  it('plans trades to the target or to the corridor edge', () => {
    const r = rebalanceResults(scenario(), accounts());
    const full = tradePlan(r.classes, 'target');
    expect(full.sells.map((t) => [t.classId, Math.round(t.amount)])).toEqual([['ac_us_stocks', 20000], ['ac_cash', 10000]]);
    expect(full.buys.map((t) => [t.classId, Math.round(t.amount)])).toEqual([['ac_bonds', 30000]]);
    const minimal = tradePlan(r.classes, 'minimal');
    expect(minimal.sells.map((t) => [t.classId, Math.round(t.amount)])).toEqual([['ac_us_stocks', 16000], ['ac_cash', 9000]]);
    expect(minimal.buys.map((t) => [t.classId, Math.round(t.amount)])).toEqual([['ac_bonds', 27000]]);
  });
});
