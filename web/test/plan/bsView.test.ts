import { describe, expect, it } from 'vitest';
import { syncAllTabs } from '../../src/lib/plan/bsSync';
import {
  addCategoryAccount, addDebt, addGoalAccount, addGoalGroup, addMortgage, addPeriod, addProperty, calcDelta, chartSeries,
  cpiPriorMonth, duplicateSheetNames, effectiveTarget, emergencyStatus, filterPeriodsByFrequency, kpis, periodLabel,
  periodTotals, removePeriod, setViewMode, suggestNextPeriod, toggleCategory, viewModeState, visiblePeriods,
} from '../../src/lib/plan/bsView';
import type { Plan } from '../../src/lib/plan/types';
import { loadPlanFixture } from '../fixtures';

const TODAY = '2026-01-15';

function sheet() {
  return {
    periods: ['2025-03-31', '2025-06-30', '2025-12-31'],
    current_period: '2025-12-31',
    categories: {
      pretax: { title: 'Pretax Retirement Accounts', is_pretax: true, accounts: [{ name: 'IRA', values: { '2025-06-30': 100000, '2025-12-31': 120000 } }] },
      roth: { title: 'Roth', accounts: [{ name: 'Roth', values: { '2025-12-31': 50000 } }] },
      taxable: { accounts: [] },
      hsa: { accounts: [{ name: 'HSA', values: { '2025-12-31': 5000 } }] },
      emergency: { title: 'Emergency Fund Accounts', target_amount: 20000, accounts: [{ name: 'HYSA', values: { '2025-12-31': 15000 } }] },
      goals: { goal_groups: [{ name: 'Car', target_amount: 30000, accounts: [{ name: 'Car Fund', values: { '2025-12-31': 10000 } }] }] },
      daily: { accounts: [{ name: 'Checking', values: { '2025-12-31': 3000 } }] },
      real_estate: { properties: [{ name: 'Home', market_values: { '2025-12-31': 400000 }, mortgages: [{ balances: { '2025-12-31': 250000 } }] }] },
      debts: [{ name: 'Car loan', values: { '2025-12-31': 8000, '2025-06-30': 10000 } }],
    },
  } as Record<string, any>;
}

describe('columns', () => {
  it('filters by quarter and year, and limits the count', () => {
    const periods = ['2025-01-31', '2025-03-31', '2025-02-28', '2025-05-15', '2026-01-31'];
    expect(filterPeriodsByFrequency(periods, 'all')).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-05-15', '2026-01-31']);
    expect(filterPeriodsByFrequency(periods, 'quarterly')).toEqual(['2025-03-31', '2025-05-15', '2026-01-31']);
    expect(filterPeriodsByFrequency(periods, 'yearly')).toEqual(['2025-05-15', '2026-01-31']);
    const bs = sheet();
    expect(visiblePeriods(bs, TODAY)).toEqual(bs.periods);
    bs.period_view_limit = 2;
    expect(visiblePeriods(bs, TODAY)).toEqual(['2025-06-30', '2025-12-31']);
    expect(visiblePeriods({}, TODAY)).toEqual([TODAY]);
  });

  it('labels and suggests columns', () => {
    expect(periodLabel('2025-12-31')).toBe('Dec 31, 2025');
    expect(periodLabel('2025-12')).toBe('Dec 2025');
    expect(suggestNextPeriod(sheet())).toBe('2026-01-31');
    expect(suggestNextPeriod({ periods: ['2026-01-31'] })).toBe('2026-02-28');
  });

  it('adds and removes columns', () => {
    const bs = sheet();
    expect(addPeriod(bs, '2025-12-31')).toBe('A balance sheet column with date 2025-12-31 already exists.');
    expect(addPeriod(bs, '2026-02-30')).toBe('Please choose a valid date.');
    expect(addPeriod(bs, '2026-03-31')).toBeNull();
    expect(bs.current_period).toBe('2026-03-31');
    expect(bs.categories.pretax.accounts[0].values['2026-03-31']).toBe(120000);
    expect(bs.categories.real_estate.properties[0].mortgages[0].balances['2026-03-31']).toBe(250000);
    expect(removePeriod(bs, '2026-03-31')).toBe(true);
    expect(bs.current_period).toBe('2025-12-31');
    expect('2026-03-31' in bs.categories.debts[0].values).toBe(false);
    expect(removePeriod({ periods: ['x'] }, 'x')).toBe(false);
  });
});

describe('totals', () => {
  it('computes every row for a column', () => {
    const t = periodTotals(sheet(), '2025-12-31', 25);
    expect(t.byCategory).toMatchObject({ pretax: 120000, roth: 50000, hsa: 5000, emergency: 15000, daily: 3000 });
    expect(t.goals).toBe(10000);
    expect(t.liquid).toBe(203000);
    expect(t.deferredTax).toBe(30000);
    expect(t.netPretax).toBe(90000);
    expect(t.liquidNetTax).toBe(173000);
    expect(t.liquidNetTaxAndGoals).toBe(163000);
    expect(t.netEquity).toBe(150000);
    expect(t.totalDebts).toBe(258000);
    expect(t.grossNetWorth).toBe(203000 + 150000 - 8000);
    expect(t.netRetirement).toBe(50000 + 5000 + 90000);
  });

  it('computes KPIs, deltas and chart series', () => {
    const k = kpis(sheet(), 25, TODAY);
    expect(k.current.grossNetWorth).toBe(345000);
    expect(k.liquidDelta).toEqual(calcDelta(203000, 100000));
    expect(calcDelta(5, 0)).toEqual({ diff: 5, pct: 0 });
    expect(calcDelta(-50, -100).pct).toBe(50);
    const s = chartSeries(sheet(), 25);
    expect(s.labels).toEqual(['Mar 2025', 'Jun 2025', 'Dec 2025']);
    expect(s.cash).toEqual([0, 0, 28000]);
    expect(s.gross[1]).toBe(100000 - 10000);
  });
});

describe('CPI targets', () => {
  const cpi = { '2024-12': 300, '2025-05': 310, '2025-11': 315 };
  it('inflates from the month before the base date to the month before the column', () => {
    expect(cpiPriorMonth('2025-01-15')).toBe('2024-12');
    const c = effectiveTarget(cpi, 20000, true, '2025-01-01', '2025-12-31');
    expect(c).toMatchObject({ baseMonth: '2024-12', evalMonth: '2025-11', effectiveTarget: 21000, inflationPct: 5 });
    expect(effectiveTarget(cpi, 20000, false, '2025-01-01', '2025-12-31').effectiveTarget).toBe(20000);
    // Months outside the series use its first or last month.
    expect(effectiveTarget(cpi, 100, true, '1990-01-01', '2030-01-01')).toMatchObject({ baseMonth: '2024-12', evalMonth: '2025-11' });
  });

  it('reports goal status', () => {
    const st = emergencyStatus(sheet(), cpi, '2025-12-31');
    expect(st).toMatchObject({ target: 20000, current: 15000, shortage: 5000, surplus: 0, percent: 75 });
    expect(st.accounts).toEqual([{ name: 'HYSA', value: 15000 }]);
  });
});

describe('edits and view state', () => {
  it('adds rows with unique names and zeroed columns', () => {
    const bs = sheet();
    const a = addCategoryAccount(bs, 'taxable', 1);
    expect(a).toMatchObject({ name: 'New Investment / Taxable Brokerage Account', include_in_retirement: true, type: 'taxable', return_mean: 5 });
    expect(Object.keys(a.values)).toEqual(bs.periods);
    expect(addCategoryAccount(bs, 'taxable', 2).name).toBe('New Investment / Taxable Brokerage Account 2');
    expect(addCategoryAccount(bs, 'daily', 3)).toMatchObject({ type: 'cash', include_in_retirement: false });
    addGoalGroup(bs, 'Wedding', 15000, 4);
    const g = bs.categories.goals.goal_groups[1];
    expect(g).toMatchObject({ name: 'Wedding', target_amount: 15000, target_base_date: '2025-12-31' });
    addGoalAccount(bs, g, 5);
    expect(g.accounts[1].name).toBe('Additional Wedding Account');
    addProperty(bs, 'Cabin', 6);
    addMortgage(bs, bs.categories.real_estate.properties[1], 7);
    expect(bs.categories.real_estate.properties[1].mortgages.map((m: any) => m.name)).toEqual(['1st Mortgage', '2nd Mortgage / HELOC']);
    addDebt(bs, 'Card', 8);
    expect(bs.categories.debts[1]).toMatchObject({ name: 'Card', institution: 'Lender / Bank' });
  });

  it('tracks collapsed sections', () => {
    const bs = sheet();
    expect(viewModeState(bs)).toBe('detailed');
    toggleCategory(bs, 'roth');
    expect(viewModeState(bs)).toBe('mixed');
    setViewMode(bs, 'summary');
    expect(viewModeState(bs)).toBe('summary');
    expect(bs.collapsed_goals).toEqual({ 0: true });
  });

  it('finds duplicate account names across the sheet', () => {
    const bs = sheet();
    bs.categories.daily.accounts.push({ name: 'ira ' });
    expect(duplicateSheetNames(bs)).toEqual(['IRA']);
  });
});

describe('syncAllTabs', () => {
  it('moves a balance-sheet edit into the account cards and back', () => {
    const { plan } = loadPlanFixture<{ plan: Plan }>('sept27', 'imported');
    const bs = plan.balance_sheet as Record<string, any>;
    const cur = bs.current_period;
    const acc = bs.categories.pretax.accounts.find((a: any) => a.include_in_retirement);
    acc.values[cur] = 777777;
    syncAllTabs(plan, true, TODAY);
    expect(plan.accounts!.find((a) => a.id === acc.id)?.balance).toBe(777777);

    // Unticking "For Retirement?" removes its card; deleting a card unticks it.
    acc.include_in_retirement = false;
    syncAllTabs(plan, true, TODAY);
    expect(plan.accounts!.some((a) => a.id === acc.id)).toBe(false);
    const other = plan.accounts![0];
    plan.accounts!.splice(0, 1);
    syncAllTabs(plan, false, TODAY);
    const entry = JSON.stringify(plan.balance_sheet).includes(other.id as string);
    expect(entry).toBe(true);
    const all = Object.values((plan.balance_sheet as any).categories).flatMap((c: any) => c?.accounts ?? []);
    expect(all.find((a: any) => a.id === other.id)?.include_in_retirement).toBe(false);
  });

  it('pushes a card edit into the current column', () => {
    const { plan } = loadPlanFixture<{ plan: Plan }>('sept27', 'imported');
    plan.accounts![0].balance = 4242;
    syncAllTabs(plan, false, TODAY);
    const bs = plan.balance_sheet as Record<string, any>;
    const all = Object.values(bs.categories).flatMap((c: any) => c?.accounts ?? []);
    expect(all.find((a: any) => a.id === plan.accounts![0].id)?.values[bs.current_period]).toBe(4242);
  });
});
