import { describe, expect, it } from 'vitest';
import {
  assetBreakdownConfig, chartConfig, incomeSpendingConfig, milestonesList, spaghettiConfig, splitIncome, taxLiabilityConfig,
  trajectoryConfig,
} from '../../src/lib/app/resultCharts';
import { engineKey } from '../../src/lib/app/results';
import {
  chartMoney, djangoMoney, floatformat, intcomma, realValue, stressDeltaMoney, stressDeltaPercent, stressMoney, usd,
} from '../../src/lib/app/resultsFormat';
import { expectPlanFixture, fixtureIndex, loadFixture, loadPlanFixture } from '../fixtures';
import { fixtureResults } from '../resultsFixture';

const plans = fixtureIndex().plans.map((p) => p.name);

describe('template filters', () => {
  const cases = loadFixture<Array<{ value: number; arg: number | 'money'; out: string }>>('functions', 'template_filters.json');

  it.each(cases.map((c) => [c.value, c.arg, c.out] as const))('floatformat(%s, %s) = %s', (value, arg, out) => {
    expect(arg === 'money' ? djangoMoney(value) : floatformat(value, arg)).toBe(out);
  });

  it('intcomma groups only the integer part', () => {
    expect(intcomma('-1234567.891')).toBe('-1,234,567.891');
    expect(intcomma('999')).toBe('999');
  });
});

describe('results formatting', () => {
  it('formats table, chart and stress-test amounts', () => {
    expect(usd(1234.5)).toBe('$1,235');
    expect(usd(-1234.4)).toBe('-$1,234');
    expect(usd(-0.2)).toBe('-$0');
    expect(chartMoney(1_250_000)).toBe('$1.25M');
    expect(chartMoney(-35_400)).toBe('-$35K');
    expect(chartMoney(950)).toBe('$950');
    expect(stressMoney(-1234.5)).toBe('-$1,234');
    expect(stressMoney(undefined)).toBe('$0');
    expect(stressDeltaMoney(1500.4)).toBe('+$1,500');
    expect(stressDeltaMoney(-2)).toBe('-$2');
    expect(stressDeltaMoney(0.2)).toBe('$0');
    expect(stressDeltaPercent(-35.175)).toBe('-35.2%');
    expect(stressDeltaPercent(1)).toBe('+1.0%');
  });

  it('deflates real values to cents', () => {
    expect(realValue(1000, 0, 3)).toBe(1000);
    expect(realValue(1000, 2, 3)).toBe(942.6);
    expect(realValue(123456.789, 1, 2.5)).toBe(120445.65);
  });
});

describe('resultsContext', () => {
  // Keys that repeat other fixtures (det_rows, the plan, the mc / stress statistics) are left out of results.json.
  const BULKY = ['det_rows', 'plan_data_json', 'stress_test', 'scenarios_list', 'mc_p10', 'mc_p50', 'mc_p90', 'mc_spaghetti_paths'];

  it.each(plans)('%s matches results.json', (name) => {
    const r = fixtureResults(name) as Record<string, any>;
    expectPlanFixture(Object.fromEntries(Object.entries(r).filter(([k]) => !BULKY.includes(k))), name, 'results', 0);
    expect(r.det_rows).toEqual(loadPlanFixture(name, 'det_rows'));
    expect(r.mc_p50).toEqual(loadPlanFixture(name, 'mc').generate_runs.mc_p50);
    expect(Object.keys(r.scenarios_list)).toContain('2000_dotcom');
  });

  it('engineKey ignores the balance sheet and rebalancing only', () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    const other = structuredClone(plan);
    other.balance_sheet.view_mode = 'detailed';
    other.rebalancing = {};
    expect(engineKey(other)).toBe(engineKey(plan));
    other.desired_spending += 1;
    expect(engineKey(other)).not.toBe(engineKey(plan));
  });
});

describe('chart data', () => {
  it.each(plans)('%s: chart series follow the rows', (name) => {
    const r = fixtureResults(name);
    const rows = r.det_rows;
    const infl = 1 + r.inflation_rate / 100;

    const assets = assetBreakdownConfig(r, 'real');
    expect(assets.data.labels).toHaveLength(rows.length);
    expect(assets.data.labels[0]).toBe(`Age ${rows[0].user_age} (${rows[0].year})`);
    const t = rows.length - 1;
    expect(assets.data.datasets[0].data[t]).toBeCloseTo(rows[t].ending_assets.pretax / infl ** (t + 1), 6);

    const flows = incomeSpendingConfig(r, 'nominal');
    rows.forEach((row, i) => {
      expect(flows.data.datasets[0].data[i] + flows.data.datasets[1].data[i]).toBeCloseTo(row.income, 6);
      expect(flows.data.datasets[2].data[i]).toBe(row.withdrawals.total);
      expect(flows.data.datasets[5].data[i]).toBe(row.taxes);
    });

    const taxes = taxLiabilityConfig(r, 'real');
    expect(taxes.data.datasets[0].data[t]).toBeCloseTo(rows[t].taxes / infl ** t, 6);
    const rmdYear = rows.findIndex((row) => row.milestones.some((m: string) => m.toLowerCase().includes('rmd')));
    if (rmdYear >= 0) expect(taxes.data.datasets[0].backgroundColor[rmdYear]).toBe('#ffb703');

    const traj = trajectoryConfig(r, 'nominal');
    expect(traj.data.datasets.map((d) => d.data)).toEqual([r.mc_p90, r.mc_p50, r.mc_p10]);
    expect(traj.data.labels).toHaveLength(r.mc_p50.length);

    const spaghetti = spaghettiConfig(r, 'nominal', 3);
    expect(spaghetti.data.datasets).toHaveLength(Math.min(3, r.mc_spaghetti_paths.length));
    expect(chartConfig('spaghetti', r, 'nominal', 500).data.datasets).toHaveLength(r.mc_spaghetti_paths.length);
  });

  it('counts named Social Security streams and "ss" names as Social Security', () => {
    const plan = { income_sources: [{ name: 'Benefit A ', is_social_security: true }] };
    expect(splitIncome({ income_breakdown: { 'benefit a': 100, 'Jack SS': 50, Pension: 25, Classes: 5 } }, plan))
      .toEqual({ ss: 155, other: 25 }); // "Classes" contains "ss": a substring match, by design
  });

  it('lists milestones in order, from the rows and the plan', () => {
    const r = fixtureResults('sept27');
    const list = milestonesList(r);
    expect(list.length).toBeGreaterThan(3);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].t > list[i - 1].t || (list[i].t === list[i - 1].t && list[i].priority >= list[i - 1].priority)).toBe(true);
    }
    expect(list.find((m) => m.label.startsWith('🏁 Retire'))?.age).toBe(r.user_retirement_age);
    expect(list.find((m) => m.label.startsWith('⌛ Final Year'))?.age).toBe(r.user_age_death);
    expect(list.some((m) => m.label.startsWith('🏁 Spouse Retires'))).toBe(true);
  });
});
