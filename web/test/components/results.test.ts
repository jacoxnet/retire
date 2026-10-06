// @vitest-environment jsdom
// The Results page against the page Django renders for the same numbers
// (fixtures/plans/<plan>/results.html.gz, generated from results_context with the
// fixtures' seeded Monte Carlo and stress results).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Results } from '../../src/lib/app/results';
import { realValue, stressDeltaMoney, stressMoney, usd } from '../../src/lib/app/resultsFormat';
import ResultsPage from '../../src/lib/components/results/ResultsPage.svelte';
import { fixtureResults } from '../resultsFixture';
import { FIXTURES_DIR, fixtureIndex } from '../fixtures';

const plans = fixtureIndex().plans.map((p) => p.name);
// Real dollars are checked on a few plans; re-rendering every cell is slow in jsdom.
const REAL_PLANS = ['aug_13_plan', 'sept27', 'syn_shortfall', 'syn_life_ins'];

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never; // no charts in jsdom
});
afterEach(cleanup);

function djangoPage(name: string): Document {
  const html = gunzipSync(readFileSync(join(FIXTURES_DIR, 'plans', name, 'results.html.gz'))).toString('utf8');
  return new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
}

/**
 * What the browser showed after results.js ran: every `.dollar-amount` rewritten
 * from its data-nominal value, or deflated to real dollars by the row's year
 * (one more year inside an ending-assets group).
 */
function applyResultsJs(doc: Document, mode: 'nominal' | 'real', inflation: number, startYear: number): void {
  for (const el of doc.querySelectorAll<HTMLElement>('.dollar-amount')) {
    const nominal = parseFloat(el.getAttribute('data-nominal')!);
    let value = nominal;
    if (mode === 'real') {
      const tr = el.closest('tr');
      const year = parseInt(tr?.querySelector('td')?.textContent ?? '2026');
      const t = Math.max(0, year - startYear);
      value = realValue(nominal, el.closest('.ending-assets-group') ? t + 1 : t, inflation);
    }
    el.textContent = usd(value);
  }
}

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');
const cellTexts = (root: ParentNode, sel: string) =>
  [...root.querySelectorAll(`${sel} tbody tr`)].map((tr) => [...tr.querySelectorAll(':scope > td')].map((td) => squash(td.textContent)));

function show(r: Results) {
  return render(ResultsPage, { results: r });
}

describe.each(plans)('%s', (name) => {
  const r = fixtureResults(name);
  const startYear = r.det_rows[0].year;

  // One render per plan (a page with every table is slow to build in jsdom).
  it('matches the page Django renders', async () => {
    const page = show(r);
    headersMatch(page.container);
    stressMatches(page.container);

    // The projection and cash-flow tables, in nominal and then real dollars.
    for (const mode of REAL_PLANS.includes(name) ? (['nominal', 'real'] as const) : (['nominal'] as const)) {
      const django = djangoPage(name);
      applyResultsJs(django, mode, r.inflation_rate, startYear);
      if (mode === 'real') {
        await fireEvent.click(page.container.querySelector('#proj_real')!);
        flushSync();
      }
      for (const table of ['#projection', '#cashflow']) {
        const expected = cellTexts(django, table);
        const actual = cellTexts(page.container, table);
        expect(actual.length, `${table} rows`).toBe(expected.length);
        expected.forEach((row, i) => expect(actual[i], `${table} ${mode} row ${i}`).toEqual(row));
      }
    }
    if (!REAL_PLANS.includes(name)) return;
    // One toggle sets every table (and the charts).
    expect((page.container.querySelector('#cf_real') as HTMLInputElement).checked).toBe(true);
    expect((page.container.querySelector('#chart_real') as HTMLInputElement).checked).toBe(true);
  });

  function headersMatch(container: HTMLElement) {
    const page = { container };
    const django = djangoPage(name);
    expect(squash(page.container.querySelector('#mcResultsCard')?.textContent))
      .toBe(squash(django.querySelector('#stats .col-md-7 .card')?.textContent));
    expect(squash(page.container.querySelector('.print-only-header')?.textContent))
      .toBe(squash(django.querySelector('.print-only-header')?.textContent));
    expect(page.container.querySelector('.print-only-header strong')?.textContent)
      .toBe(django.querySelector('.print-only-header strong')?.textContent);
    expect([...page.container.querySelectorAll('#resultsTabs button')].map((b) => squash(b.textContent)))
      .toEqual([...django.querySelectorAll('#resultsTabs button')].map((b) => squash(b.textContent)));

    // Every input Django rendered, with the same value (the target rate gets its "%").
    const inputs = [...django.querySelectorAll<HTMLInputElement>('#resultsInputsForm input[id]')];
    expect(inputs.length).toBeGreaterThan(10);
    for (const want of inputs) {
      const got = page.container.querySelector<HTMLInputElement>(`#${want.id}`);
      expect(got, want.id).not.toBeNull();
      if (want.type === 'radio') expect(got!.checked, want.id).toBe(want.hasAttribute('checked'));
      else expect(got!.value, want.id).toBe(want.id === 'results_target_success_rate' ? `${want.getAttribute('value')}%` : want.getAttribute('value') ?? '');
    }
    // ...and the balances shown beside the returns.
    const balances = (root: ParentNode) => [...root.querySelectorAll('#resultsInputsForm .small.text-muted')].map((e) => squash(e.textContent));
    expect(balances(page.container)).toEqual(balances(django));
  }

  /** The stress test tab shows the default scenario as results.js filled it in. */
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
});
