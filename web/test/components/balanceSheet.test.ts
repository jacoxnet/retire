// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../src/lib/app/format';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { balanceSheetAccounts } from '../../src/lib/plan/bsSync';
import { ACCOUNT_CATEGORIES, categoryAccounts, effectiveTaxRate, goalGroups, kpis, periodTotals, visiblePeriods } from '../../src/lib/plan/bsView';
import { calculateMarginalTaxRate } from '../../src/lib/plan/marginal';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import type { Plan } from '../../src/lib/plan/types';
import { fixtureIndex, loadPlanFixture } from '../fixtures';
import EnterHarness from './EnterHarness.svelte';

afterEach(cleanup);
beforeEach(() => {
  window.scrollTo = () => {};
  window.confirm = () => true;
  HTMLCanvasElement.prototype.getContext = (() => null) as never; // no chart in jsdom
});

function setup(plan?: Plan) {
  const storage = memoryStorage();
  const store = new PlanStore(storage);
  if (plan) store.replace(plan);
  const stop = store.startAutosave();
  const onNavigate = vi.fn();
  render(EnterHarness, { store, ui: new UiPrefs(storage), onNavigate });
  return { store, stop, onNavigate };
}

const $ = <T extends Element = HTMLInputElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const tab = (id: string) => fireEvent.click(document.getElementById(`${id}-tab`)!);
const money = (v: number) => formatMoney(v, true);
const bsOf = (store: PlanStore) => store.plan.balance_sheet as Record<string, any>;

async function type(el: HTMLInputElement, value: string) {
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.blur(el);
}

const savedPlans = fixtureIndex().plans.map((p) => p.name).filter((n) => !n.startsWith('syn_'));
const loadSaved = (name: string) => structuredClone(loadPlanFixture<{ plan: Plan }>(name, 'imported').plan);
const TODAY = new Date().toISOString().slice(0, 10);

describe('saved plans', () => {
  it.each(savedPlans)('shows the balance sheet of %s', async (name) => {
    const plan = loadSaved(name);
    const { store, stop } = setup(structuredClone(plan));
    await tab('balance-sheet');
    const bs = plan.balance_sheet as Record<string, any>;
    const rate = effectiveTaxRate(bs, calculateMarginalTaxRate(plan));
    const k = kpis(bs, rate, TODAY);
    expect($('#kpiGrossNetWorth', document).textContent).toBe(money(k.current.grossNetWorth));
    expect($('#kpiLiquidNetWorth', document).textContent).toBe(money(k.current.liquid));
    expect($('#kpiNetRetirement', document).textContent).toBe(money(k.current.netRetirement));
    expect($('#kpiTotalDebts', document).textContent).toBe(money(k.current.totalDebts));

    const periods = visiblePeriods(bs, TODAY);
    expect($$('#bsTableHead th').length).toBe(periods.length + 5);
    const expectedRows = ACCOUNT_CATEGORIES.reduce((n, c) => n + categoryAccounts(bs, c).length, 0)
      + goalGroups(bs).reduce((n, g) => n + (g.accounts?.length ?? 0), 0);
    const rows = $$('.bs-account-row');
    expect(rows.length).toBe(expectedRows);
    const first = categoryAccounts(bs, 'pretax')[0];
    if (first) {
      expect($('.bs-acc-name-input', rows[0]).value).toBe(first.name);
      expect($('.bs-input-val', rows[0]).value).toBe(money(first.values?.[periods[0]] ?? 0));
      expect($('.bs-retire-check', rows[0]).checked).toBe(!!first.include_in_retirement);
    }
    const grand = $$('td', $('#grand_net_worth_row')).slice(2, 2 + periods.length).map((td) => td.textContent);
    expect(grand).toEqual(periods.map((p) => money(periodTotals(bs, p, rate).grossNetWorth)));

    // Viewing, collapsing and switching tabs leaves the plan as it was.
    await fireEvent.click($('#btnBsModeSummary'));
    await fireEvent.click($('#btnBsModeDetailed'));
    await tab('assets');
    await tab('balance-sheet');
    const strip = (p: Plan) => {
      const c = $stateFree(p) as any;
      for (const k of ['collapsed_categories', 'collapsed_goals', 'view_mode']) delete c.balance_sheet[k];
      return c;
    };
    expect(strip(store.plan)).toEqual(strip(plan));
    stop();
  });
});

function $stateFree<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe('editing', () => {
  it('moves a retirement balance to its account card and saves it on Run', async () => {
    const plan = loadSaved('sept27');
    const { store, onNavigate, stop } = setup(plan);
    await tab('balance-sheet');
    const bs = bsOf(store);
    const acc = categoryAccounts(bs, 'pretax').find((a) => a.include_in_retirement)!;
    const row = $$('.bs-account-row').find((r) => $('.bs-acc-name-input', r).value === acc.name)!;
    const cells = $$<HTMLInputElement>('.bs-input-val', row);
    await type(cells[cells.length - 1], '$654,321');
    expect(acc.values[bs.current_period]).toBe(654321);

    await tab('assets');
    const card = $$('.account-card-col').find((c) => $('.account-name-input', c).value === acc.name)!;
    expect($('.currency-input', card).value).toBe('$654,321');

    await tab('balance-sheet');
    await fireEvent.click(screen.getAllByRole('button', { name: /Run Simulation/ })[0]);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(store.plan.accounts!.find((a) => a.name === acc.name)?.balance).toBe(654321);
    stop();
  });

  it('removes the card when "For Retirement?" is unticked, and adds one when ticked', async () => {
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const bs = bsOf(store);
    const included = balanceSheetAccounts(bs).filter((a) => a.include_in_retirement);
    const target = included[0];
    const row = () => $$('.bs-account-row').find((r) => $('.bs-acc-name-input', r).value === target.name)!;
    await fireEvent.click($('.bs-retire-check', row()));
    await tab('assets');
    expect($$('.account-card-col').length).toBe(included.length - 1);
    expect(store.plan.accounts!.some((a) => a.name === target.name)).toBe(false);
    await tab('balance-sheet');
    await fireEvent.click($('.bs-retire-check', row()));
    await tab('assets');
    expect(store.plan.accounts!.some((a) => a.name === target.name)).toBe(true);
    stop();
  });

  it('adds and removes columns', async () => {
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const bs = bsOf(store);
    const before = bs.periods.length;
    await fireEvent.click($('#btnAddPeriodSnapshot'));
    expect($('#addPeriodDate').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await fireEvent.input($('#addPeriodDate'), { target: { value: bs.periods[0] } });
    await fireEvent.click($('#confirmAddPeriod'));
    expect($('#addPeriodError').textContent).toMatch(/already exists/);
    await fireEvent.input($('#addPeriodDate'), { target: { value: '2099-12-31' } });
    await fireEvent.click($('#confirmAddPeriod'));
    expect($('#addPeriodModal')).toBeNull();
    expect(bs.periods.length).toBe(before + 1);
    expect(bs.current_period).toBe('2099-12-31');
    expect($$('#bsTableHead th').some((th) => /Dec 31, 2099/.test(th.textContent!) && /Current/.test(th.textContent!))).toBe(true);

    await fireEvent.click($$('.bs-remove-period')[0]);
    expect(bs.periods.length).toBe(before);
    stop();
  });

  it('collapses sections and switches column scope and frequency', async () => {
    const plan = loadSaved('sept27');
    const bs0 = plan.balance_sheet as Record<string, any>;
    bs0.periods = ['2025-01-31', '2025-02-28', '2025-03-31', '2025-06-30', bs0.current_period].sort();
    bs0.current_period = bs0.periods[bs0.periods.length - 1];
    Object.assign(bs0, { period_view_limit: 3, period_view_frequency: 'all' });
    const { store, stop } = setup(plan);
    await tab('balance-sheet');
    const headerCount = () => $$('#bsTableHead th').length - 5;
    expect(headerCount()).toBe(3); // default: most recent 3
    await fireEvent.change($('#bsColumnScopeSelect'), { target: { value: 'all' } });
    expect(headerCount()).toBe(5);
    expect($('#bsColLimitInput')).toBeNull();
    await fireEvent.change($('#bsPeriodFrequencySelect'), { target: { value: 'quarterly' } });
    expect(headerCount()).toBeLessThan(5);
    await fireEvent.change($('#bsColumnScopeSelect'), { target: { value: 'recent' } });
    await fireEvent.input($('#bsColLimitInput'), { target: { value: '1' } });
    expect(headerCount()).toBe(1);

    await fireEvent.click($('#btnBsModeSummary'));
    expect($$('.bs-account-row').length).toBe(0);
    expect($('#btnBsModeSummary').classList.contains('active')).toBe(true);
    await fireEvent.click($('[data-section="roth"]'));
    expect($('#btnBsModeSummary').classList.contains('active')).toBe(false);
    expect(bsOf(store).collapsed_categories.roth).toBe(false);
    stop();
  });

  it('overrides the deferred-tax rate and resets it', async () => {
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const bs = bsOf(store);
    const pretax = periodTotals(bs, bs.current_period, 30).byCategory.pretax;
    const input = $('#bsTaxRateOverrideInput');
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: '30' } });
    await fireEvent.blur(input);
    expect(bs.marginal_tax_rate_override).toBe(30);
    const cells = $$('td', $('#deferred_tax_row'));
    expect(cells[cells.length - 3].textContent).toBe(`(${money(Math.round(pretax * 0.3))})`);
    await fireEvent.click($('#bsTaxRateResetBtn'));
    expect(bs.marginal_tax_rate_override).toBeNull();
    expect($('#bsTaxRateResetBtn')).toBeNull();
    stop();
  });

  it('sets goal targets with CPI-U and shows funding status', async () => {
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const bs = bsOf(store);
    await type($('#bsEmergencyTarget'), '1000000');
    expect(bs.categories.emergency.target_amount).toBe(1000000);
    await fireEvent.click($('#emg_badge_container button'));
    expect($('#goalShortageModal')).not.toBeNull();
    expect($('#modalGoalTarget').textContent).toBe('$1,000,000');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect($('#goalShortageModal')).toBeNull();

    await fireEvent.click($('[aria-label="Configure CPI-U inflation adjustment"]'));
    await fireEvent.click($('#cpiModalAutoInflate'));
    await fireEvent.change($('#cpiModalMonth'), { target: { value: '01' } });
    await fireEvent.input($('#cpiModalYear'), { target: { value: '2020' } });
    expect($('#cpiModalInflationPctDisplay').textContent).toMatch(/^\+\d+\.\d\d%$/);
    await fireEvent.click($('#saveTargetCpi'));
    expect(bs.categories.emergency).toMatchObject({ target_auto_inflate: true, target_base_date: '2020-01-01' });
    expect(document.body.textContent).toMatch(/CPI: \$1,\d{3},\d{3}/);
    stop();
  });

  it('adds goals, property and debts through prompts', async () => {
    const answers = ['Boat', '$40,000', 'Lake House', 'Student Loan'];
    window.prompt = () => answers.shift() ?? null;
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const bs = bsOf(store);
    const goals = goalGroups(bs).length;
    await fireEvent.click($('#bsAddGoalGroup'));
    expect(goalGroups(bs).length).toBe(goals + 1);
    expect(goalGroups(bs).at(-1)).toMatchObject({ name: 'Boat', target_amount: 40000 });
    await fireEvent.click(screen.getByRole('button', { name: /Add Property/ }));
    expect(bs.categories.real_estate.properties.at(-1).name).toBe('Lake House');
    await fireEvent.click(screen.getByRole('button', { name: /Add Debt Account/ }));
    expect(bs.categories.debts.at(-1).name).toBe('Student Loan');
    stop();
  });

  it('flags duplicate names in the sheet', async () => {
    const { store, stop } = setup(loadSaved('sept27'));
    await tab('balance-sheet');
    const rows = $$('.bs-account-row');
    const name = $('.bs-acc-name-input', rows[0]).value;
    await type($('.bs-acc-name-input', rows[1]), name);
    expect($('#bsDuplicateNotice').textContent).toContain(`"${name}"`);
    expect($('#globalDuplicateNotice')).not.toBeNull();
    expect($('.bs-acc-name-input', rows[1]).classList.contains('is-invalid')).toBe(true);
    flushSync();
    expect(store.plan).toBeTruthy();
    stop();
  });
});
