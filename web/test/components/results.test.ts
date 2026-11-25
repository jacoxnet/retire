// @vitest-environment jsdom
// The Results page for each fixture plan (its seeded Monte Carlo and stress results):
// what the page shows (the results card, print header, tabs, inputs, and the projection
// and cash-flow tables in nominal and real dollars) is snapshotted in
// fixtures/plans/<plan>/results-page.json.
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Results } from '../../src/lib/app/results';
import { computeResults } from '../../src/lib/app/runResults';
import { localRunner } from '../../src/lib/engine/mc';
import { djangoMoney, milestoneBadge, realValue, stressDeltaMoney, stressMoney, usd } from '../../src/lib/app/resultsFormat';
import ResultsPage from '../../src/lib/components/results/ResultsPage.svelte';
import { fixtureResults } from '../resultsFixture';
import { expectPlanFixture, fixtureIndex, loadPlanFixture } from '../fixtures';

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
    // All Real/Nominal dollar toggles default to Real Dollars and synchronize across tabs.
    expect((c.querySelector('#mc_real') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#proj_real') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#cf_real') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#chart_real') as HTMLInputElement).checked).toBe(true);

    const shown: Record<string, unknown> = {
      results_card: squash(c.querySelector('#mcResultsCard')?.textContent),
      print_header: squash(c.querySelector('.print-only-header')?.textContent),
      print_header_name: c.querySelector('.print-only-header strong')?.textContent,
      tabs: [...c.querySelectorAll('#resultsTabs button')].map((b) => squash(b.textContent)),
      // Every input with its value (radios: checked), and the balances shown beside the returns.
      inputs: Object.fromEntries([...c.querySelectorAll<HTMLInputElement>('#resultsInputsForm input[id]')]
        .map((i) => [i.id, i.type === 'radio' ? i.checked : i.value])),
      balances: [...c.querySelectorAll('#resultsInputsForm .small.text-muted')].map((e) => squash(e.textContent)),
    };
    expect(Object.keys(shown.inputs as object).length).toBeGreaterThan(10);
    if (REAL_PLANS.includes(name)) {
      shown.real = tables(c);
    }
    await fireEvent.click(c.querySelector('#proj_nominal')!);
    flushSync();
    expect((c.querySelector('#mc_nominal') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#cf_nominal') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#chart_nominal') as HTMLInputElement).checked).toBe(true);
    shown.nominal = tables(c);
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
    expect(q('cmpDesiredSpending')).toBe(`${stressMoney(s.desired_spending)}/yr`);
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
    await fireEvent.click(document.querySelector('#chartModal .btn-close')!);

    // Every Real/Nominal dollar toggle has a ? button opening the shared explanation modal.
    for (const btnSel of ['#mc_dollar_mode_help', '#proj_dollar_mode_help', '#cf_dollar_mode_help', '#chart_dollar_mode_help']) {
      await fireEvent.click(page.container.querySelector(btnSel)!);
      const dmModal = document.querySelector('#dollarModeModal')!;
      expect(dmModal).not.toBeNull();
      expect(dmModal.textContent).toContain('Real Dollars vs. Nominal Dollars');
      expect(dmModal.textContent).toContain("Today's Dollars");
      await fireEvent.click(dmModal.querySelector('.btn-close')!);
    }
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
    expect(page.container.querySelector('#mcResultsCard')?.textContent).toContain('Maximum Regular Retirement Spending');
    expect(page.container.querySelector('#input_desired_spending')).toBeNull();
  });

  it('renders Ending Wealth percentiles inside Further Detail, defaulting to Real Dollars and switching to Nominal Dollars', async () => {
    const page = show(r);
    expect(page.container.querySelector('#mcEndingWealthTable')).toBeNull();
    await fireEvent.click(page.container.querySelector('#btnFurtherDetail')!);
    flushSync();

    const table = page.container.querySelector('#mcEndingWealthTable')!;
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toEqual(['Metric', 'Real Dollars']);

    const realRows = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(realRows.length).toBe(6);
    expect(realRows[0]).toEqual(['Mean Ending Wealth', `$${djangoMoney(realValue(r.run_mean, r.years, r.inflation_rate))}`]);
    expect(realRows[1]).toEqual(['Median Ending Wealth', `$${djangoMoney(realValue(r.run_median, r.years, r.inflation_rate))}`]);

    // Toggling to Nominal Dollars switches the table and synchronizes the other tabs
    await fireEvent.click(page.container.querySelector('#mc_nominal')!);
    flushSync();
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toEqual(['Metric', 'Nominal Dollars']);
    const nomRows = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(nomRows[0]).toEqual(['Mean Ending Wealth', `$${djangoMoney(r.run_mean)}`]);
    expect(nomRows[1]).toEqual(['Median Ending Wealth', `$${djangoMoney(r.run_median)}`]);
    expect((page.container.querySelector('#proj_nominal') as HTMLInputElement).checked).toBe(true);
    expect((page.container.querySelector('#chart_nominal') as HTMLInputElement).checked).toBe(true);
  });

  it('renders Earliest Retirement Age card with simultaneous strategy showing user and spouse on separate lines', () => {
    const customResults: Results = {
      ...r,
      simulation_type: 'earliest_retirement',
      strategy: 'simultaneous',
      is_married: true,
      user_name: 'George Jetson',
      spouse_name: 'Jane Jetson',
      user_age: 61,
      spouse_age: 53,
      achieved_user_ret_age: 66,
      achieved_spouse_ret_age: 58,
      current_year: 2026,
    };
    const page = show(customResults);
    const card = page.container.querySelector('#mcResultsCard')!;
    expect(card).not.toBeNull();
    const lines = [...card.querySelectorAll('.display-6.font-weight-bold > div')].map((el) => el.textContent?.trim());
    expect(lines).toEqual(['George Jetson: 66', 'Jane Jetson: 58']);
    expect(card.textContent).toContain('Both retire in Year 2031');
  });

  it('calls onAdopt when clicking adopt button in goal seeking mode', () => {
    const onAdopt = vi.fn();
    const custom: Results = {
      ...r,
      simulation_type: 'goal_seeking',
      goal_seeking: true,
      achieved_spending: 95000,
    };
    const page = render(ResultsPage, { results: custom, onAdopt });
    expect(page.container.textContent).toContain('Adopt Solved Spending ($95,000/yr) into the Plan?');
    const btn = page.container.querySelector<HTMLButtonElement>('#btnAdoptMaxSpending');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Adopt into Plan');
    btn?.click();
    expect(onAdopt).toHaveBeenCalledWith('spending', 95000);
  });

  it('calls onAdopt when clicking adopt button in earliest retirement mode', () => {
    const onAdopt = vi.fn();
    const custom: Results = {
      ...r,
      simulation_type: 'earliest_retirement',
      achieved_user_ret_age: 62,
      achieved_spouse_ret_age: 60,
      is_married: true,
    };
    const page = render(ResultsPage, { results: custom, onAdopt });
    expect(page.container.textContent).toContain('Adopt earliest retirement age (62 / 60) into the Plan?');
    const btn = page.container.querySelector<HTMLButtonElement>('#btnAdoptEarliestRet');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Adopt into Plan');
    btn?.click();
    expect(onAdopt).toHaveBeenCalledWith('retirement_age', { user: 62, spouse: 60 });
  });

  it('displays read-only solved badges in the inputs card', () => {
    const goalCustom: Results = {
      ...r,
      simulation_type: 'goal_seeking',
      goal_seeking: true,
      achieved_spending: 95000,
    };
    const goalPage = render(ResultsPage, { results: goalCustom });
    expect(goalPage.container.querySelector('#results_solved_spending_display')?.textContent).toContain('$95,000/yr');

    const earlyCustom: Results = {
      ...r,
      simulation_type: 'earliest_retirement',
      achieved_user_ret_age: 63,
    };
    const earlyPage = render(ResultsPage, { results: earlyCustom });
    expect(earlyPage.container.querySelector('#results_solved_earliest_ret_display')?.textContent).toContain('Age 63');
  });

  it('renders scenario comparison toggle and switches between solved and baseline rows', () => {
    const solvedRows = r.det_rows.map((row) => ({ ...row, desired_spending: 95000 }));
    const baseRows = r.det_rows.map((row) => ({ ...row, desired_spending: 60000 }));
    const custom: Results = {
      ...r,
      simulation_type: 'goal_seeking',
      goal_seeking: true,
      achieved_spending: 95000,
      det_rows: solvedRows,
      baseline_det_rows: baseRows,
    };
    const page = render(ResultsPage, { results: custom });
    const bar = page.container.querySelector('#scenarioComparisonBar');
    expect(bar).not.toBeNull();
    expect(page.container.querySelector('#projection')?.textContent).toContain('$95,000');

    const baselineRadio = page.container.querySelector<HTMLInputElement>('#scenario_view_baseline')!;
    expect(baselineRadio).not.toBeNull();
    baselineRadio.click();
    flushSync();
    expect(page.container.querySelector('#projection')?.textContent).toContain('$60,000');
  });

  it('renders Balance Sheet and Rebalance tabs on the right side of the Print button row in advanced mode', () => {
    const page = render(ResultsPage, { results: r, enterHref: '/' });
    const actionRow = page.container.querySelector('.results-actions-bar');
    expect(actionRow).not.toBeNull();
    const printBtn = actionRow?.querySelector('#btnPrintSummary');
    expect(printBtn).not.toBeNull();

    const tabsContainer = actionRow?.querySelector('#resultsSubpageTabs');
    expect(tabsContainer).not.toBeNull();

    const bsTab = actionRow?.querySelector('#balance-sheet-tab') as HTMLAnchorElement;
    expect(bsTab).not.toBeNull();
    expect(bsTab.getAttribute('href')).toBe('/?tab=balance-sheet');
    expect(bsTab.textContent).toContain('Balance Sheet');
    expect(bsTab.textContent).toContain('(optional)');

    const rebTab = actionRow?.querySelector('#rebalance-tab') as HTMLAnchorElement;
    expect(rebTab).not.toBeNull();
    expect(rebTab.getAttribute('href')).toBe('/?tab=rebalance');
    expect(rebTab.textContent).toContain('Rebalance');
    expect(rebTab.textContent).toContain('(optional)');
  });

  it('hides Balance Sheet and Rebalance tabs on results page in simple mode', () => {
    const page = render(ResultsPage, { results: r, plannerMode: 'simple' });
    expect(page.container.querySelector('#resultsSubpageTabs')).toBeNull();
    expect(page.container.querySelector('#balance-sheet-tab')).toBeNull();
    expect(page.container.querySelector('#rebalance-tab')).toBeNull();
  });

  it('defaults Target Success Rate % to 85% for goal seeking and earliest retirement modes', async () => {
    const page = show(r);
    await fireEvent.click(page.container.querySelector('#results_sim_type_goal')!);
    const targetGoal = page.container.querySelector('#results_target_success_rate') as HTMLInputElement;
    expect(targetGoal.value).toBe('85%');

    await fireEvent.click(page.container.querySelector('#results_sim_type_earliest')!);
    const targetEarliest = page.container.querySelector('#results_target_success_rate') as HTMLInputElement;
    expect(targetEarliest.value).toBe('85%');
  });

  it('renders projection and cashflow tables with sticky-cols class for sticky header rows', () => {
    const page = render(ResultsPage, { results: r });
    const projTable = page.container.querySelector('#projection .table-container table');
    expect(projTable).not.toBeNull();
    expect(projTable?.classList.contains('table-sticky-cols')).toBe(true);
    const projHeaders = projTable?.querySelectorAll('thead th');
    expect(projHeaders?.length).toBeGreaterThan(5);

    const cfTable = page.container.querySelector('#cashflow .table-container table');
    expect(cfTable).not.toBeNull();
    expect(cfTable?.classList.contains('table-sticky-cols')).toBe(true);
    const cfHeaders = cfTable?.querySelectorAll('thead th');
    expect(cfHeaders?.length).toBeGreaterThan(5);
  });
});

describe('guardrails mode', () => {
  const { plan } = loadPlanFixture('sept27', 'imported');
  const base = { ...plan, runs: 300, goal_seeking: false, simulation_type: 'guyton_klinger' };
  let solved: Results;
  let specified: Results;
  beforeAll(async () => {
    solved = await computeResults(base, { runner: localRunner, chunks: 1, seed: 11, goalSeekRunsCap: 200 });
    specified = await computeResults({ ...base, gk_spending_mode: 'specified' }, { runner: localRunner, chunks: 1, seed: 11 });
  }, 60_000);

  const text = (root: ParentNode, sel: string) => root.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const rowsOf = (root: ParentNode, sel: string) =>
    [...root.querySelectorAll(`${sel} tbody tr`)].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()));

  it('shows the success rate, full Guardrail Activity on main card in Real/Nominal Dollars, and Further Detail with Ending Wealth at top', async () => {
    const page = show(solved);
    const c = page.container;
    const g = solved.guardrails!;
    const card = c.querySelector('#mcResultsCard')!;
    expect(card.querySelector('.radial-gauge-center')?.textContent).toContain(`${solved.run_success.toFixed(1)}%`);
    expect(card.textContent).toContain('Probability of Plan Success');

    // Default view: Real Dollars
    const realPortfolio = realValue(g.starting_portfolio, g.start_year_index, solved.inflation_rate ?? 0);
    const startReal = text(c, '#gkStartingWithdrawal');
    expect(startReal).toContain(`$${djangoMoney(g.starting_withdrawal_real)} /yr`);
    expect(startReal).toContain(`${g.starting_withdrawal_pct.toFixed(1)}% of the portfolio at retirement ($${djangoMoney(realPortfolio)}, the average across runs)`);
    expect(startReal).toContain(`In ${solved.current_year + g.start_year_index} (Retirement Year 0)`);
    expect(startReal).toContain("In today's dollars");
    expect(startReal).toContain('Solved for 99% success');

    // Full Guardrail Activity distribution on main card (≥ 1 time, ..., Max in a Run)
    const actHeaders = [...c.querySelectorAll('#gkActivityTable thead th')].map((th) => th.textContent?.trim());
    expect(actHeaders[0]).toBe('Adjustment Type');
    expect(actHeaders[1]).toBe('≥ 1 time');
    expect(actHeaders.at(-1)).toBe('Max in a Run');
    expect(actHeaders.length).toBeGreaterThanOrEqual(4);
    expect(rowsOf(c, '#gkActivityTable')).toHaveLength(3);
    expect(text(c, '#gkPctCut')).toBe(`${g.pct_runs_cut.toFixed(1)}%`);
    expect(text(c, '#gkPctRaise')).toBe(`${g.pct_runs_raise.toFixed(1)}%`);
    expect(text(c, '#gkPctFreeze')).toBe(`${g.pct_runs_freeze.toFixed(1)}%`);
    expect(text(c, '#gkActivityCuts')).toContain('10% Spending Cuts');
    expect(text(c, '#gkActivityRaises')).toContain('10% Spending Raises');
    expect(text(c, '#gkActivityFreezes')).toContain('Inflation Skips');

    const money = (v: number) => `$${djangoMoney(v)}`;
    expect(rowsOf(c, '#gkWithdrawalTable')).toEqual([
      ['Lowest-Year Spending (Mean)', money(g.lowest_withdrawal_real.mean)],
      ['Final-Year Spending (Mean)', money(g.final_withdrawal_real.mean)],
      ['Peak-Year Spending (Mean)', money(g.peak_withdrawal_real.mean)],
    ]);
    // Ending Wealth Percentiles is inside Further Detail (hidden until expanded)
    expect(c.querySelector('#mcEndingWealthTableGuardrails')).toBeNull();
    expect(c.querySelector('#mcFurtherDetail')).toBeNull();

    // Toggling to Nominal Dollars updates the main card
    await fireEvent.click(c.querySelector('#mc_nominal')!);
    flushSync();
    const startNom = text(c, '#gkStartingWithdrawal');
    expect(startNom).toContain(`$${djangoMoney(g.starting_withdrawal)} /yr`);
    expect(startNom).toContain(`$${djangoMoney(g.starting_portfolio)}`);
    expect(rowsOf(c, '#gkWithdrawalTable')).toEqual([
      ['Lowest-Year Spending (Mean)', money(g.lowest_withdrawal.mean)],
      ['Final-Year Spending (Mean)', money(g.final_withdrawal.mean)],
      ['Peak-Year Spending (Mean)', money(g.peak_withdrawal.mean)],
    ]);

    // Expanding Further Detail reveals Ending Wealth Percentiles at the top, followed by rules, 7-row spending table, and withdrawal ordering note
    await fireEvent.click(c.querySelector('#btnFurtherDetail')!);
    flushSync();
    const detail = c.querySelector('#mcFurtherDetail')!;
    expect(detail).not.toBeNull();
    expect(rowsOf(detail, '#mcEndingWealthTableGuardrails')[1]).toEqual(['Median Ending Wealth', money(solved.run_median)]);
    const detailHtml = detail.innerHTML;
    expect(detailHtml.indexOf('id="mcEndingWealthTableGuardrails"')).toBeLessThan(detailHtml.indexOf('id="gkInitialRate"'));
    expect(detailHtml.indexOf('id="gkInitialRate"')).toBeLessThan(detailHtml.indexOf('id="gkWithdrawalDetailTable"'));
    expect(detailHtml.indexOf('id="gkWithdrawalDetailTable"')).toBeLessThan(detailHtml.indexOf('id="portfolioWithdrawalOrderingNote"'));

    expect(text(detail, '#gkInitialRate')).toContain(`${g.initial_withdrawal_rate.toFixed(1)}% on average`);
    expect(text(detail, '#gkInitialRate')).toContain('dividing the amount of the regular retirement spending in the first year of retirement by that year\'s amount in the Accounts for Retirement');
    expect(text(detail, '#gkCutLimit')).toContain(`This simulation is limited to making at most ${g.max_cuts} cut`);
    expect(detail.querySelector('#gkActivityDetailTable')).toBeNull();
    expect(rowsOf(detail, '#gkWithdrawalDetailTable')).toEqual([
      ['Final-Year Regular Retirement Spending: Mean', money(g.final_withdrawal_real.mean), money(g.final_withdrawal.mean)],
      ['Final-Year Regular Retirement Spending: Maximum', money(g.final_withdrawal_real.max), money(g.final_withdrawal.max)],
      ['Final-Year Regular Retirement Spending: Minimum', money(g.final_withdrawal_real.min), money(g.final_withdrawal.min)],
      ['Peak-Year Regular Retirement Spending: Mean', money(g.peak_withdrawal_real.mean), money(g.peak_withdrawal.mean)],
      ['Peak-Year Regular Retirement Spending: Maximum', money(g.peak_withdrawal_real.max), money(g.peak_withdrawal.max)],
      ['Peak-Year Regular Retirement Spending: Minimum', money(g.peak_withdrawal_real.min), money(g.peak_withdrawal.min)],
      ['Lowest-Year Regular Retirement Spending: Mean', money(g.lowest_withdrawal_real.mean), money(g.lowest_withdrawal.mean)],
    ]);
    expect(detail.querySelector('#portfolioWithdrawalOrderingNote')).not.toBeNull();

    // Toggling back to Real Dollars updates Ending Wealth inside Further Detail too
    await fireEvent.click(c.querySelector('#mc_real')!);
    flushSync();
    expect(rowsOf(detail, '#mcEndingWealthTableGuardrails')[1]).toEqual([
      'Median Ending Wealth', money(realValue(solved.run_median, solved.years, solved.inflation_rate)),
    ]);

    // Collapsing hides Further Detail again
    await fireEvent.click(c.querySelector('#btnFurtherDetail')!);
    flushSync();
    expect(c.querySelector('#mcFurtherDetail')).toBeNull();

    expect(c.querySelector('#btnAdoptMaxSpending')).toBeNull();
    expect(text(c, '.print-only-header .badge')).toBe(`Guardrails: $${djangoMoney(g.starting_withdrawal)}/yr to start, ${solved.run_success.toFixed(1)}% success`);
  });

  it('a solved run has no spending to edit, shows the solved amount and compares with the original plan', async () => {
    const page = show(solved);
    const c = page.container;
    expect(c.querySelector('#input_desired_spending')).toBeNull();
    expect(text(c, '#results_solved_guardrails_display')).toContain(`$${djangoMoney(solved.achieved_spending)}/yr`);
    expect((c.querySelector('#results_sim_type_guardrails') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#results_gk_solve') as HTMLInputElement).checked).toBe(true);
    expect(text(c, 'label[for=results_gk_specified]')).toContain(`($${djangoMoney(plan.desired_spending)}/yr)`);
    // The mode has a fixed target, so the target field is hidden.
    expect((c.querySelector('#results_target_success_group') as HTMLElement).style.display).toBe('none');

    expect(text(c, '#projection #scenarioComparisonBar')).toContain(`Solved Starting Regular Retirement Spending under Guardrails: $${djangoMoney(solved.achieved_spending)}/yr`);
    const startRow = solved.guardrails!.start_year_index;
    const spendingCell = () => text(c, `#projection tbody tr:nth-child(${startRow + 1}) td:nth-child(9)`);
    expect(spendingCell()).toBe(usd(realValue(solved.det_rows[startRow].desired_spending, startRow, solved.inflation_rate)));
    await fireEvent.click(c.querySelector('#projection #scenario_view_baseline')!);
    flushSync();
    expect(text(c, '#projection #scenarioComparisonBar')).toContain(`Original Baseline Plan under Guardrails: $${djangoMoney(plan.desired_spending)}/yr`);
    expect(spendingCell()).toBe(usd(realValue(solved.baseline_det_rows![startRow].desired_spending, startRow, solved.inflation_rate)));
  });

  it('the projection marks the years the guardrails acted', () => {
    const page = show(solved);
    const badges = [...page.container.querySelectorAll('#projection tbody .badge')].map((b) => b.textContent ?? '');
    expect(badges.filter((b) => b.startsWith('Guardrails Set (Initial Withdrawal Rate')).length).toBe(1);
    const acted = solved.det_rows.flatMap((row) => row.milestones as string[]).filter((m) => m.startsWith('Guardrails: Spending'));
    expect(acted.length).toBeGreaterThan(0);
    expect(badges.filter((b) => b.startsWith('Guardrails: Spending'))).toEqual(acted);
  });

  it('with the plan\'s own spending: the amount is editable and nothing was solved', async () => {
    const onApply = vi.fn();
    const page = render(ResultsPage, { results: specified, onApply });
    const c = page.container;
    expect(text(c, '#gkStartingWithdrawal')).toContain('Desired spending, as entered');
    expect(c.querySelector('#results_solved_guardrails_display')).toBeNull();
    expect(c.querySelector('#scenarioComparisonBar')).toBeNull();
    expect((c.querySelector('#results_gk_specified') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#input_desired_spending') as HTMLInputElement).value).toBe(String(plan.desired_spending));

    // Editing the amount, or switching to solving, are both changes to apply.
    expect(c.querySelector('#staleResultsBanner')).toBeNull();
    await fireEvent.click(c.querySelector('#results_gk_solve')!);
    expect(c.querySelector('#staleResultsBanner')).not.toBeNull();
    await fireEvent.click(c.querySelector('#results_gk_specified')!);
    expect(c.querySelector('#staleResultsBanner')).toBeNull();
    await fireEvent.input(c.querySelector('#input_desired_spending')!, { target: { value: '120000' } });
    await fireEvent.submit(c.querySelector('#resultsInputsForm')!);
    expect(onApply.mock.calls[0][0]).toMatchObject({ simulation_type: 'guyton_klinger', gk_spending_mode: 'specified', desired_spending: '120000' });
  });

  it('the mode card switches a regular plan to the guardrails, solving by default', async () => {
    const onApply = vi.fn();
    const regular = fixtureResults('sept27');
    const page = render(ResultsPage, { results: regular, onApply });
    const c = page.container;
    expect(c.querySelector('#results_guardrails_group')).toBeNull();
    await fireEvent.click(c.querySelector('#results_sim_type_guardrails')!);
    expect(c.querySelector('#results_guardrails_group')).not.toBeNull();
    expect((c.querySelector('#results_gk_solve') as HTMLInputElement).checked).toBe(true);
    expect((c.querySelector('#results_target_success_group') as HTMLElement).style.display).toBe('none');
    expect(c.querySelector('#staleResultsBanner')).not.toBeNull();
    await fireEvent.submit(c.querySelector('#resultsInputsForm')!);
    expect(onApply.mock.calls[0][0]).toMatchObject({ simulation_type: 'guyton_klinger', gk_spending_mode: 'solve' });

    // Back to a regular simulation: the guardrails option is not sent.
    await fireEvent.click(c.querySelector('#results_sim_type_regular')!);
    await fireEvent.submit(c.querySelector('#resultsInputsForm')!);
    expect(onApply.mock.calls[1][0].simulation_type).toBe('regular');
    expect('gk_spending_mode' in onApply.mock.calls[1][0]).toBe(false);
  });

  it('the stress test compares spending under the guardrails', () => {
    const page = show(solved);
    const c = page.container;
    const reg = solved.stress_test.regular_results.guardrails!;
    const st = solved.stress_test.stress_results.guardrails!;
    const rows = rowsOf(c, '#stressGuardrailsTable');
    expect(rows.map((r) => r[0])).toEqual([
      'Runs with at Least One 10% Cut', 'Runs with at Least One 10% Raise', 'Runs that Skipped an Inflation Raise',
      'Runs that Made Every Allowed Cut',
      'Mean Lowest-Year Regular Retirement Spending (Real)', 'Mean Peak-Year Regular Retirement Spending (Real)', 'Mean Final-Year Regular Retirement Spending (Real)',
    ]);
    expect(rows[0].slice(1, 3)).toEqual([`${reg.pct_runs_cut.toFixed(1)}%`, `${st.pct_runs_cut.toFixed(1)}%`]);
    expect(rows[3].slice(1, 3)).toEqual([`${reg.pct_runs_max_cuts.toFixed(1)}%`, `${st.pct_runs_max_cuts.toFixed(1)}%`]);
    expect(rows[4].slice(1)).toEqual([
      stressMoney(reg.lowest_withdrawal_real.mean), stressMoney(st.lowest_withdrawal_real.mean),
      stressDeltaMoney(st.lowest_withdrawal_real.mean - reg.lowest_withdrawal_real.mean),
    ]);
    // Not shown outside the guardrails mode.
    cleanup();
    expect(show(fixtureResults('sept27')).container.querySelector('#stressGuardrailsTable')).toBeNull();
  });

  it('shows the non-discretionary expenses opt-in in 4-3-1-2 order, help modal, diagnostic warning, and stress rows in guardrails mode', async () => {
    const diagResults = await computeResults(
      { ...base, gk_spending_mode: 'specified', desired_spending: 144000, essential_spending: 105000 },
      { runner: localRunner, chunks: 1, seed: 11 },
    );
    const onApply = vi.fn();
    const page = render(ResultsPage, { results: diagResults, onApply });
    const c = page.container;

    // 4-3-1-2 ordering, exact wording, and bold/non-bold classes inside Guardrails Simulation Mode box
    const promptEl = c.querySelector('#gkNonDiscretionaryPrompt')!;
    const protectSwitch = c.querySelector('#results_gk_protect_floor') as HTMLInputElement;
    const protectLabel = c.querySelector('label[for="results_gk_protect_floor"]')!;
    const expenseLabel = c.querySelector('label[for="input_essential_spending"]')!;
    const expenseInput = c.querySelector('#input_essential_spending') as HTMLInputElement;

    expect(promptEl.classList.contains('fw-bold')).toBe(true);
    expect(promptEl.textContent?.trim()).toBe(
      'Would you like this simulation to prohibit spending cuts or skipping inflation raises if that would reduce your Regular Retirement Spending below your non-discretionary expenses?',
    );
    expect(protectLabel.classList.contains('fw-normal')).toBe(true);
    expect(protectLabel.classList.contains('fw-bold') || protectLabel.classList.contains('fw-semibold')).toBe(false);
    expect(protectLabel.textContent?.trim()).toBe('Protect Non-Discretionary Spending');
    expect(expenseLabel.classList.contains('fw-normal')).toBe(true);
    expect(expenseLabel.classList.contains('fw-bold') || expenseLabel.classList.contains('fw-semibold')).toBe(false);
    expect(expenseLabel.textContent?.trim()).toBe("Annual Non-Discretionary Living Expenses (in today's dollars)");
    expect(expenseInput.value).toBe('105000');
    expect(protectSwitch.checked).toBe(false);
    expect(protectSwitch.disabled).toBe(false);

    expect(promptEl.compareDocumentPosition(protectSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(protectSwitch.compareDocumentPosition(expenseLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(expenseLabel.compareDocumentPosition(expenseInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Turning protection ON with an empty expense input blocks submit with inline validation
    await fireEvent.input(expenseInput, { target: { value: '' } });
    await fireEvent.click(protectSwitch);
    expect(protectSwitch.checked).toBe(true);
    await fireEvent.submit(c.querySelector('#resultsInputsForm')!);
    expect(onApply).not.toHaveBeenCalled();
    expect(c.querySelector('#input_essential_spending_feedback')?.classList.contains('d-block')).toBe(true);
    await fireEvent.click(protectSwitch);
    expect(c.querySelector('#input_essential_spending_feedback')?.classList.contains('d-block')).toBe(false);
    await fireEvent.input(expenseInput, { target: { value: '105000' } });

    // Non-Discretionary Spending Warning card and Guaranteed Income coverage
    const floorCard = text(c, '#gkEssentialFloorCard');
    expect(floorCard).toContain('Non-Discretionary Spending Warning');
    expect(floorCard).toContain('$105,000/yr');
    expect(floorCard).toContain('Protect Non-Discretionary Spending');
    expect(floorCard).toContain('Guaranteed Income (today\'s dollars):');

    // Expanding Further Detail shows monthly/duration breakdown for Non-Discretionary Expenses
    await fireEvent.click(c.querySelector('#btnFurtherDetail')!);
    flushSync();
    expect(text(c, '#gkNonDiscretionaryDetail')).toContain('$8,750/mo');
    expect(text(c, '#gkNonDiscretionaryDetail')).toContain('adjust total Regular Retirement Spending rather than only the portfolio withdrawal portion');
    await fireEvent.click(c.querySelector('#btnFurtherDetail')!);
    flushSync();

    // Stress test appends non-discretionary expenses row
    const stressRows = rowsOf(c, '#stressGuardrailsTable');
    expect(stressRows).toHaveLength(8);
    expect(stressRows[7][0]).toBe('Runs Below Non-Discretionary Expenses ($105,000/yr)');

    // Popup modal uses non-discretionary terminology and lists included/excluded categories
    await fireEvent.click(c.querySelector('#btnEssentialSpendingHelp')!);
    const modal = document.querySelector('#essentialSpendingModal')!;
    expect(modal).not.toBeNull();
    const modalText = modal.textContent!;
    expect(modalText).toContain('What Counts as Annual Non-Discretionary Living Expenses?');
    expect(modalText).toContain('Non-Discretionary Core Household Expenses');
    for (const phrase of ['Housing', 'Utilities', 'Food & Everyday Basics', 'Transportation', 'Healthcare & Insurance', 'Fixed Debt Obligations',
      'Income Taxes', 'IRMAA', 'NIIT', 'Other Taxes', 'Additional Taxes', 'Additional Spending']) {
      expect(modalText).toContain(phrase);
    }

    // Opting in to Protect Non-Discretionary Spending updates stale state and submits true
    await fireEvent.click(protectSwitch);
    expect(c.querySelector('#staleResultsBanner')).not.toBeNull();
    await fireEvent.submit(c.querySelector('#resultsInputsForm')!);
    expect(onApply.mock.calls[0][0]).toMatchObject({
      simulation_type: 'guyton_klinger',
      essential_spending: '105000',
      gk_protect_essential_floor: 'true',
    });

    // Protected mode renders Non-Discretionary Spending Protection Active card, 0% floor breach, and 9 stress rows
    cleanup();
    const protResults = await computeResults(
      { ...base, gk_spending_mode: 'specified', desired_spending: 144000, essential_spending: 105000, gk_protect_essential_floor: true },
      { runner: localRunner, chunks: 1, seed: 11 },
    );
    expect(protResults.guardrails?.pct_runs_below_floor).toBe(0);
    const protPage = show(protResults);
    expect(text(protPage.container, '#gkEssentialFloorCard')).toContain('Non-Discretionary Spending Protection Active');
    const protStressRows = rowsOf(protPage.container, '#stressGuardrailsTable');
    expect(protStressRows).toHaveLength(9);
    expect(protStressRows[8][0]).toBe('Runs Where Non-Discretionary Protection Stopped Cuts/Freezes');
    expect(milestoneBadge('Guardrails: Non-Discretionary Floor Applied')).toContain('bg-warning-subtle');
  }, 60_000);
});
