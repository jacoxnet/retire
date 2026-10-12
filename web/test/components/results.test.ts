// @vitest-environment jsdom
// The Results page for each fixture plan (its seeded Monte Carlo and stress results):
// what the page shows (the results card, print header, tabs, inputs, and the projection
// and cash-flow tables in nominal and real dollars) is snapshotted in
// fixtures/plans/<plan>/results-page.json.
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Results } from '../../src/lib/app/results';
import { djangoMoney, realValue, stressDeltaMoney, stressMoney } from '../../src/lib/app/resultsFormat';
import ResultsPage from '../../src/lib/components/results/ResultsPage.svelte';
import { fixtureResults } from '../resultsFixture';
import { expectPlanFixture, fixtureIndex } from '../fixtures';

const plans = fixtureIndex().plans.map((p) => p.name);
// Real dollars are checked on a few plans; re-rendering every cell is slow in jsdom.
const REAL_PLANS = ['aug_13_plan', 'sept27', 'syn_shortfall', 'syn_life_ins'];

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never; // no charts in jsdom
});
afterEach(cleanup);

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');
const cellTexts = (root: ParentNode, sel: string) =>
  [...root.querySelectorAll(`${sel} tbody tr`)].map((tr) => [...tr.querySelectorAll(':scope > td')].map((td) => squash(td.textContent)));
const tables = (root: ParentNode) => ({ projection: cellTexts(root, '#projection'), cashflow: cellTexts(root, '#cashflow') });

function show(r: Results) {
  return render(ResultsPage, { results: r });
}

describe.each(plans)('%s', (name) => {
  const r = fixtureResults(name);

  // One render per plan (a page with every table is slow to build in jsdom).
  it('matches results-page.json', async () => {
    const page = show(r);
    const c = page.container;
    stressMatches(c);
    const shown: Record<string, unknown> = {
      results_card: squash(c.querySelector('#mcResultsCard')?.textContent),
      print_header: squash(c.querySelector('.print-only-header')?.textContent),
      print_header_name: c.querySelector('.print-only-header strong')?.textContent,
      tabs: [...c.querySelectorAll('#resultsTabs button')].map((b) => squash(b.textContent)),
      // Every input with its value (radios: checked), and the balances shown beside the returns.
      inputs: Object.fromEntries([...c.querySelectorAll<HTMLInputElement>('#resultsInputsForm input[id]')]
        .map((i) => [i.id, i.type === 'radio' ? i.checked : i.value])),
      balances: [...c.querySelectorAll('#resultsInputsForm .small.text-muted')].map((e) => squash(e.textContent)),
      nominal: tables(c),
    };
    expect(Object.keys(shown.inputs as object).length).toBeGreaterThan(10);
    if (REAL_PLANS.includes(name)) {
      await fireEvent.click(c.querySelector('#proj_real')!);
      flushSync();
      shown.real = tables(c);
      // One toggle sets every table (and the charts).
      expect((c.querySelector('#cf_real') as HTMLInputElement).checked).toBe(true);
      expect((c.querySelector('#chart_real') as HTMLInputElement).checked).toBe(true);
    }
    expectPlanFixture(shown, name, 'results-page', 0);
  });

  /** The stress test tab shows the default scenario's results. */
  function stressMatches(container: HTMLElement) {
    const page = { container };
    const s = r.stress_test;
    const q = (id: string) => squash(page.container.querySelector(`#${id}`)?.textContent);
    expect(q('stressScenarioTitle')).toBe(squash(s.scenario.name));
    expect(q('stressScenarioDurationBadge')).toBe(squash(`${s.crisis_length} Years Duration`));
    expect(q('cmpRegularSuccess')).toBe(`${s.regular_results.run_success.toFixed(1)}%`);
    expect(q('cmpStressSuccess')).toBe(`${s.stress_results.run_success.toFixed(1)}%`);
    expect(q('cmpDesiredSpending')).toBe(stressMoney(s.desired_spending));
    expect(q('stressTimelineText')).toBe(squash(`${s.crisis_start_year}–${s.crisis_end_year} (${s.crisis_length} years)`));
    const rows = cellTexts(page.container, '#stressComparisonTable');
    expect(rows[1]).toEqual(['MedianEndingWealth', stressMoney(s.regular_results.run_median), stressMoney(s.stress_results.run_median),
      stressDeltaMoney(s.deltas.delta_median)].map(squash));
    const rate = s.stress_results.run_success;
    expect(page.container.querySelector('#cmpStressSuccessBox')!.className)
      .toContain(rate >= 80 ? 'alert-success' : rate >= 60 ? 'alert-warning' : 'alert-danger');
    expect((page.container.querySelector('#stressScenarioSelect') as HTMLSelectElement).value).toBe('2000_dotcom');
  }
});

describe('interactions', () => {
  const r = fixtureResults('sept27');

  it('switches tabs and opens the help and chart modals', async () => {
    const page = show(r);
    const pane = (id: string) => page.container.querySelector(`#${id}`)!;
    expect(pane('stats').className).toContain('active');
    await fireEvent.click(page.container.querySelector('#cashflow-tab')!);
    expect(pane('cashflow').className).toContain('active');
    expect(pane('stats').className).not.toContain('active');

    await fireEvent.click(page.container.querySelector('[aria-label="Portfolio Withdrawals Information"]')!);
    expect(document.querySelector('#portfolioWithdrawalsModal')).not.toBeNull();
    await fireEvent.click(document.querySelector('#portfolioWithdrawalsModal .btn-close')!);
    await fireEvent.click([...page.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Taxes & Penalties Information')!);
    expect(document.querySelector('#taxesPenaltiesModal')?.textContent).toContain(`(Age ${r.desired_spending_start_age})`);

    await fireEvent.click(page.container.querySelector('#charts-tab')!);
    await fireEvent.click(page.container.querySelector('[aria-label="Enlarge 4. Deterministic Annual Income vs. Spending Sources"]')!);
    expect(document.querySelector('#chartModalLabel')?.textContent).toBe('4. Deterministic Annual Income vs. Spending Sources');
    expect(document.querySelector('#modalChartCanvas')).not.toBeNull();
  });

  it('flags edited inputs, validates them and applies them as the form posted', async () => {
    const onApply = vi.fn();
    const page = render(ResultsPage, { results: r, onApply });
    expect(page.container.querySelector('#staleResultsBanner')).toBeNull();

    const spending = page.container.querySelector('#input_desired_spending') as HTMLInputElement;
    await fireEvent.input(spending, { target: { value: '150000' } });
    expect(page.container.querySelector('#staleResultsBanner')).not.toBeNull();
    expect((page.container.querySelector('#range_desired_spending') as HTMLInputElement).value).toBe('150000');
    expect(page.container.querySelector('#resultsInputsForm button[type=submit]')!.className).toContain('btn-rerun-highlight');

    // Out-of-range runs block the submit.
    const runs = page.container.querySelector('#input_runs') as HTMLInputElement;
    await fireEvent.input(runs, { target: { value: '0' } });
    await fireEvent.click(page.container.querySelector('#btnStaleReRun')!);
    expect(onApply).not.toHaveBeenCalled();
    expect(runs.className).toContain('is-invalid');
    await fireEvent.input(runs, { target: { value: '5000' } });

    // Goal seeking needs a target between 1% and 99%.
    await fireEvent.click(page.container.querySelector('#results_sim_type_goal')!);
    const target = page.container.querySelector('#results_target_success_rate') as HTMLInputElement;
    expect((page.container.querySelector('#results_target_success_group') as HTMLElement).style.display).toBe('block');
    await fireEvent.input(target, { target: { value: '150' } });
    await fireEvent.submit(page.container.querySelector('#resultsInputsForm')!);
    expect(onApply).not.toHaveBeenCalled();
    expect(target.className).toContain('is-invalid');
    await fireEvent.input(target, { target: { value: '90' } });
    expect(target.value).toBe('90%');
    await fireEvent.submit(page.container.querySelector('#resultsInputsForm')!);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual({
      simulation_type: 'goal_seeking',
      target_success_rate: '90%',
      desired_spending: '150000',
      inflation_rate: '3.5',
      user_age_death: '95',
      spouse_age_death: '103',
      pretax_return_mean: r.pretax_assets.return_mean.toFixed(1),
      roth_return_mean: r.roth_assets.return_mean.toFixed(1),
      taxable_return_mean: r.taxable_assets.return_mean.toFixed(1),
      hsa_return_mean: r.hsa_assets.return_mean.toFixed(1),
      runs: '5000',
    });
  });

  it('asks for a new stress test when a selector changes', async () => {
    const onStressChange = vi.fn();
    const page = render(ResultsPage, { results: r, onStressChange });
    const sel = page.container.querySelector('#stressAllocationSelect') as HTMLSelectElement;
    await fireEvent.change(sel, { target: { value: '60_40' } });
    expect(onStressChange).toHaveBeenCalledWith({ scenarioKey: '2000_dotcom', assetAllocation: '60_40', crisisTiming: 'retirement' });
  });

  it('shows every tab while printing', async () => {
    const page = show(r);
    window.dispatchEvent(new Event('beforeprint'));
    for (const id of ['stats', 'projection', 'cashflow', 'charts', 'stresstest']) {
      expect(page.container.querySelector(`#${id}`)!.className).toContain('active');
    }
    window.dispatchEvent(new Event('afterprint'));
    flushSync();
    expect(page.container.querySelector('#charts')!.className).not.toContain('active');
  });

  it('shows the goal-seeking card for a goal-seeking plan', () => {
    const goal = plans.map(fixtureResults).find((x) => x.goal_seeking);
    expect(goal).toBeDefined();
    const page = show(goal!);
    expect(page.container.querySelector('#mcResultsCard')?.textContent).toContain('Max Achieved Desired Spending');
    expect(page.container.querySelector('#input_desired_spending')).toBeNull();
  });

  it('renders Ending Wealth percentiles with both nominal and real dollar columns', () => {
    const page = show(r);
    const table = page.container.querySelector('#mcEndingWealthTable');
    expect(table).not.toBeNull();
    const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Metric', 'Nominal', 'Real']);

    const rows = [...table!.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(rows.length).toBe(6);
    expect(rows[0][0]).toBe('Mean Ending Wealth');
    expect(rows[0][1]).toBe(`$${djangoMoney(r.run_mean)}`);
    expect(rows[0][2]).toBe(`$${djangoMoney(realValue(r.run_mean, r.years, r.inflation_rate))}`);
    expect(rows[1][0]).toBe('Median Ending Wealth');
    expect(rows[1][1]).toBe(`$${djangoMoney(r.run_median)}`);
    expect(rows[1][2]).toBe(`$${djangoMoney(realValue(r.run_median, r.years, r.inflation_rate))}`);
  });
});
