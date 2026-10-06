// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney, formatPercent } from '../../src/lib/app/format';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { incomeView, otherTaxView, spendingItemView, ssView } from '../../src/lib/plan/scheduleRows';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import type { Plan } from '../../src/lib/plan/types';
import { fixtureIndex, loadPlanFixture } from '../fixtures';
import EnterHarness from './EnterHarness.svelte';

afterEach(cleanup);
window.scrollTo = () => {};

function setup(plan?: Plan) {
  const storage = memoryStorage();
  const store = new PlanStore(storage);
  if (plan) store.replace(plan);
  const stop = store.startAutosave();
  const ui = new UiPrefs(storage);
  const onNavigate = vi.fn();
  render(EnterHarness, { store, ui, onNavigate });
  return { store, ui, stop, onNavigate };
}

const $ = <T extends Element = HTMLInputElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const tab = (id: string) => fireEvent.click(document.getElementById(`${id}-tab`)!);

async function type(el: HTMLInputElement, value: string) {
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.blur(el);
}

const savedPlans = fixtureIndex().plans.map((p) => p.name).filter((n) => !n.startsWith('syn_'));
const loadSaved = (name: string) => structuredClone(loadPlanFixture<{ plan: Plan }>(name, 'imported').plan);

describe('saved plans display', () => {
  it.each(savedPlans)('shows the Spending tab of %s', async (name) => {
    const plan = loadSaved(name);
    const { store, stop } = setup(structuredClone(plan));
    await tab('spending');
    expect($<HTMLSelectElement>('#begin_spending_age_type').value).toBe(
      plan.is_married ? plan.begin_spending_age_type : 'retirement');
    expect($('#desired_spending').value).toBe(formatMoney(plan.desired_spending!, true));
    expect(!!$('#survivor_spending')).toBe(!!plan.is_married);
    expect($('#adjust_spending_inflation').checked).toBe(!!plan.adjust_spending_inflation);

    const rows = $$('#additionalSpendingTable tbody tr');
    expect(rows.length).toBe(plan.additional_spending?.length ?? 0);
    rows.forEach((row, i) => {
      const v = spendingItemView(plan.additional_spending![i]);
      expect($('.add-spending-name', row).value).toBe(v.name);
      expect($('.add-spending-amount', row).value).toBe(formatMoney(v.amount, true));
      expect($('.add-spending-start-age', row).value).toBe(String(v.start_age));
      expect($('.add-spending-interval', row).value).toBe(String(v.interval));
      expect($<HTMLSelectElement>('.add-spending-inflation', row).value).toBe(String(v.adjust_inflation));
    });

    const taxes = $$('.other-tax-card');
    expect(taxes.length).toBe(plan.other_taxes?.length ?? 0);
    taxes.forEach((card, i) => {
      const v = otherTaxView(plan.other_taxes![i]);
      expect($('.ot-name', card).value).toBe(v.name);
      expect($<HTMLSelectElement>('.ot-frequency', card).value).toBe(v.frequency);
      expect($<HTMLSelectElement>('.ot-start-type', card).value).toBe(v.start_age_type);
      expect($<HTMLSelectElement>('.ot-adjust-type', card).value).toBe(v.adjust_type);
      if (v.adjust_type !== 'none') expect($<HTMLSelectElement>('.ot-adjust-start-type', card).value).toBe(v.adjust_start_age_type);
    });
    expect(store.plan).toEqual(plan); // viewing doesn't change anything
    stop();
  });

  it.each(savedPlans)('shows the Income tab of %s', async (name) => {
    const plan = loadSaved(name);
    const { store, stop } = setup(structuredClone(plan));
    await tab('income');
    for (const who of ['user', 'spouse'] as const) {
      if (who === 'spouse' && !plan.is_married) {
        expect($('#spouse_ss_container')).toBeNull();
        continue;
      }
      const v = ssView(plan.social_security, who);
      expect($<HTMLSelectElement>(`#${who}_ss_receiving`).value).toBe(String(v.receiving));
      expect(!!$(`#${who}_ss_fields_group`)).toBe(v.receiving || v.future_entitled);
      if (v.receiving || v.future_entitled) expect($(`#${who}_ss_amount`).value).toBe(formatMoney(v.amount ?? 0, true));
    }

    const cards = $$('.income-stream-card');
    expect(cards.length).toBe(plan.income_sources?.length ?? 0);
    cards.forEach((card, i) => {
      const v = incomeView(plan.income_sources![i]);
      expect($('.inc-name', card).value).toBe(v.name);
      expect($('.currency-input', card).value).toBe(formatMoney(v.amount, true));
      expect($<HTMLSelectElement>('.inc-frequency', card).value).toBe(v.frequency);
      expect($<HTMLSelectElement>('.inc-start-type', card).value).toBe(v.start_age_type);
      if (v.frequency !== 'one_time') expect($<HTMLSelectElement>('.inc-end-type', card).value).toBe(v.end_age_type);
      expect($<HTMLSelectElement>('.inc-subject-to-tax', card).value).toBe(String(v.subject_to_tax));
      const periods = $$('.inc-period-row', card);
      expect(periods.length).toBe(v.periods.length);
      periods.forEach((row, j) => {
        expect($<HTMLSelectElement>('.p-start-type', row).value).toBe(v.periods[j].start_type);
        expect($<HTMLSelectElement>('.p-end-type', row).value).toBe(v.periods[j].end_type);
        expect($<HTMLSelectElement>('.p-adj-type', row).value).toBe(v.periods[j].adjust_type);
        const val = $('.p-adj-val', row);
        if (val) expect(val.value).toBe(formatPercent(v.periods[j].adjust_val));
      });
    });
    expect(store.plan).toEqual(plan);
    stop();
  });
});

describe('Spending tab editing', () => {
  it('adds, edits and removes spending items', async () => {
    const { store, stop } = setup();
    store.plan.additional_spending = [];
    flushSync();
    await tab('spending');
    await fireEvent.click(document.getElementById('btnAddSpendingRow')!);
    await fireEvent.click(document.getElementById('btnAddSpendingRow')!);
    let rows = $$('#additionalSpendingTable tbody tr');
    expect(rows.length).toBe(2);
    await type($('.add-spending-name', rows[0]), 'New car');
    await type($('.add-spending-amount', rows[0]), '35000');
    await type($('.add-spending-interval', rows[0]), '8');
    await fireEvent.change($('.add-spending-inflation', rows[0]), { target: { value: 'false' } });
    expect(store.plan.additional_spending![0]).toMatchObject({ name: 'New car', amount: 35000, interval: 8, adjust_inflation: false });
    await type($('.add-spending-name', rows[1]), 'Wedding');
    await fireEvent.click($('.btnDeleteRow', rows[0]));
    rows = $$('#additionalSpendingTable tbody tr');
    expect(rows.length).toBe(1);
    expect($('.add-spending-name', rows[0]).value).toBe('Wedding');
    expect(store.plan.additional_spending!.map((s) => s.name)).toEqual(['Wedding']);
    stop();
  });

  it('shows the specified spending start age with its year', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, { is_married: false, user_age: 55, current_year: 2026 });
    flushSync();
    await tab('spending');
    expect($('#begin_spending_age_specified')).toBeNull();
    await fireEvent.change($('#begin_spending_age_type'), { target: { value: 'user_specified' } });
    await type($('#begin_spending_age_specified'), '62');
    expect(store.plan).toMatchObject({ begin_spending_age_type: 'user_specified', begin_spending_age_specified: 62 });
    expect($('#begin_spending_specified_group').textContent).toMatch(/Year 2033/);
    expect([...$<HTMLSelectElement>('#begin_spending_age_type').options].map((o) => o.value)).toEqual(['retirement', 'user_specified']);
    stop();
  });

  it('edits other taxes', async () => {
    const { store, stop } = setup();
    store.plan.other_taxes = [];
    flushSync();
    await tab('spending');
    await fireEvent.click(document.getElementById('btnAddOtherTaxRow')!);
    const card = () => $$('.other-tax-card')[0];
    expect($('.ot-adjust-val', card())).toBeNull();
    await fireEvent.change($('.ot-adjust-type', card()), { target: { value: 'inflation_less_pct' } });
    await type($('.ot-adjust-val', card()), '1.5');
    await fireEvent.change($('.ot-frequency', card()), { target: { value: 'one_time' } });
    expect($('.ot-end-type', card())).toBeNull();
    await fireEvent.change($('.ot-adjust-type', card()), { target: { value: 'none' } });
    expect($('.ot-adjust-start-type', card())).toBeNull();
    expect(store.plan.other_taxes![0]).toMatchObject({ adjust_type: 'none', adjust_val: 1.5, frequency: 'one_time' });
    expect($('#otherTaxesCard').classList.contains('advanced-only-card')).toBe(true);
    stop();
  });
});

describe('Income tab editing', () => {
  it('follows the Social Security answers', async () => {
    const { store, stop } = setup();
    store.plan.social_security = { user_receiving: false, user_future_entitled: false };
    flushSync();
    await tab('income');
    expect($('#user_ss_fields_group')).toBeNull();
    await fireEvent.change($('#user_ss_future_entitled'), { target: { value: 'true' } });
    expect($('#user_ss_claiming_age_group')).not.toBeNull();
    expect(screen.getByLabelText('Initial Amount')).toBeTruthy();
    await type($('#user_ss_amount'), '2,400');
    await type($('#user_ss_start_age'), '68');
    await fireEvent.change($('#user_ss_receiving'), { target: { value: 'true' } });
    expect($('#user_ss_future_group')).toBeNull();
    expect($('#user_ss_claiming_age_group')).toBeNull();
    expect(screen.getByLabelText('Current Benefit Amount')).toBeTruthy();
    expect(store.plan.social_security).toMatchObject({ user_receiving: true, user_amount: 2400, user_start_age: 68 });
    stop();
  });

  it('edits an income stream, its survivor benefit and its periods', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, { is_married: true, spouse_name: 'Sam', user_name: 'Pat', income_sources: [] });
    flushSync();
    await tab('income');
    await fireEvent.click(document.getElementById('btnAddIncomeRow')!);
    const card = () => $$('.income-stream-card')[0];
    await type($('.inc-name', card()), 'Pension');
    expect($('.inc-survivor-group', card())).not.toBeNull(); // ends at death, married
    expect($('.inc-survivor-details', card())).toBeNull();
    await fireEvent.click($('.inc-has-survivor', card()));
    await type($('.inc-survivor-pct', card()), '60');
    expect($('.inc-survivor-hint', card()).textContent).toMatch(/Upon your death, Sam will receive 60%/);
    await fireEvent.change($('.inc-end-type', card()), { target: { value: 'spouse_death' } });
    expect($('.inc-survivor-title', card()).textContent).toBe('Survivor Benefit for Pat');
    await fireEvent.change($('.inc-end-type', card()), { target: { value: 'user_specified' } });
    expect($('.inc-survivor-group', card())).toBeNull();

    await fireEvent.click($('.btnAddAdjustmentPeriod', card()));
    let periods = $$('.inc-period-row', card());
    expect(periods.length).toBe(2);
    expect($('.btnDeletePeriod', periods[0])).toBeNull();
    expect($<HTMLSelectElement>('.p-start-type', periods[1]).value).toBe('retirement');
    await fireEvent.change($('.p-adj-type', periods[1]), { target: { value: 'fixed_pct' } });
    await type($('.p-adj-val', periods[1]), '2');
    expect(store.plan.income_sources![0].adjustments![1]).toMatchObject({ adjust_type: 'fixed_pct', adjust_val: 2 });
    await fireEvent.click($('.btnDeletePeriod', periods[1]));
    periods = $$('.inc-period-row', card());
    expect(periods.length).toBe(1);
    expect(store.plan.income_sources![0]).toMatchObject({ name: 'Pension', has_survivor_benefit: true, survivor_benefit_pct: 60 });
    stop();
  });

  it('describes when other income must start', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, { is_married: true, spouse_name: 'Sam', spouse_retirement_age: 63, begin_spending_age_type: 'spouse_retirement' });
    flushSync();
    await tab('income');
    expect($('#otherIncomeSpendingStartAgeText').textContent).toBe("Sam's retirement age (Sam's age 63)");
    stop();
  });
});

describe('marriage and validation', () => {
  it('moves spouse-based choices when unmarried and restores them', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, {
      is_married: true, begin_spending_age_type: 'spouse_retirement',
      income_sources: [{ name: 'Pension', end_age_type: 'spouse_death' }],
    });
    flushSync();
    await fireEvent.click(document.getElementById('is_married')!);
    expect(store.plan.begin_spending_age_type).toBe('retirement');
    expect(store.plan.income_sources![0].end_age_type).toBe('death');
    await fireEvent.click(document.getElementById('is_married')!);
    expect(store.plan.begin_spending_age_type).toBe('spouse_retirement');
    expect(store.plan.income_sources![0].end_age_type).toBe('spouse_death');
    stop();
  });

  it('shows row validation messages on Run', async () => {
    const { store, onNavigate, stop } = setup();
    store.plan.additional_spending = [{}];
    store.plan.income_sources = [{ name: 'Annuity', amount: -5 }];
    flushSync();
    await tab('income');
    await fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect($('#validationAlertContainer').textContent).toMatch(/Additional Spending item #1 Name is required\./);

    store.plan.additional_spending = [{ name: 'Roof', start_age: 61 }];
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect($('#validationAlertContainer').textContent).toMatch(/Income Source 'Annuity' Amount cannot be negative\./);

    store.plan.income_sources![0].amount = 500;
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(onNavigate).toHaveBeenCalledOnce();
    stop();
  });
});
