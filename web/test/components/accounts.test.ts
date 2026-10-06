// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney, formatPercent } from '../../src/lib/app/format';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { cardAccount, personLabels, volatilityChoice } from '../../src/lib/plan/accountCard';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import type { Account, Plan } from '../../src/lib/plan/types';
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
  render(EnterHarness, { store, ui, onNavigate: vi.fn() });
  return { store, ui, stop };
}

async function openAccounts() {
  await fireEvent.click(document.getElementById('assets-tab')!);
}

const cards = () => [...document.querySelectorAll<HTMLElement>('#accountsContainer .account-card-col')];
const q = <T extends Element = HTMLInputElement>(el: ParentNode, sel: string) => el.querySelector(sel) as T;

async function type(el: HTMLInputElement, value: string) {
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.blur(el);
}

const savedPlans = fixtureIndex().plans.map((p) => p.name).filter((n) => !n.startsWith('syn_'));

describe('Accounts tab with saved plans', () => {
  it.each(savedPlans)('shows every account of %s', async (name) => {
    const { plan } = loadPlanFixture<{ plan: Plan }>(name, 'imported');
    const { store, stop } = setup(structuredClone(plan));
    await openAccounts();
    const accounts = store.plan.accounts as Account[];
    expect(cards().length).toBe(accounts.length);
    const people = personLabels(store.plan);
    cards().forEach((card, i) => {
      const view = cardAccount(accounts[i], people, [], () => '');
      expect(q(card, '.account-name-input').value).toBe(view.name);
      expect(q<HTMLSelectElement>(card, '.acc-type-select').value).toBe(view.type);
      const owner = q<HTMLSelectElement>(card, '.acc-owner-select');
      if (store.plan.is_married) expect(owner.value).toBe(view.owner);
      else expect(owner).toBeNull();
      const [balance, contrib] = card.querySelectorAll<HTMLInputElement>('.currency-input');
      expect(balance.value).toBe(formatMoney(view.balance as number, true));
      expect(contrib.value).toBe(formatMoney(view.contrib_amount as number, true));
      expect(q<HTMLSelectElement>(card, '[id$="-freq"]').value).toBe(view.contrib_freq);
      expect(q(card, '.acc-contrib-adjust-inf-check').checked).toBe(!!view.contrib_adjust_inflation);
      expect(q<HTMLSelectElement>(card, '.acc-end-age-type').value).toBe(view.contrib_end_age_type);
      expect(q(card, '.acc-start-age-input').value).toBe(String(view.contrib_start_age));
      expect(q(card, '[id$="-mean"]').value).toBe(formatPercent(view.return_mean as number));
      expect(q<HTMLSelectElement>(card, '.acc-volatility-select').value).toBe(volatilityChoice(view.return_std));
      expect(!!card.querySelector('.acc-taxable-treatment-group')).toBe(view.type === 'taxable');
      expect(!!card.querySelector('.acc-hsa-medical-group')).toBe(view.type === 'hsa');
    });
    // Viewing the tab doesn't rewrite the plan.
    expect(store.plan.accounts).toEqual(plan.accounts);
    stop();
  });
});

describe('Accounts tab editing', () => {
  it('adds, edits and deletes accounts', async () => {
    const { store, stop } = setup();
    await openAccounts();
    const n = store.plan.accounts!.length;
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    expect(cards().length).toBe(n + 2);
    const [a, b] = store.plan.accounts!.slice(n);
    expect(a.name).toBe('Traditional 401(k) / IRA');
    expect(b.name).toBe('Traditional 401(k) / IRA 2');

    const card = cards()[n];
    await type(card.querySelectorAll<HTMLInputElement>('.currency-input')[0], '$125,000');
    expect(store.plan.accounts![n].balance).toBe(125000);
    expect(card.querySelectorAll<HTMLInputElement>('.currency-input')[0].value).toBe('$125,000');

    await fireEvent.click(q(cards()[n], '.btnDeleteAccount'));
    expect(cards().length).toBe(n + 1);
    expect(store.plan.accounts![n].name).toBe('Traditional 401(k) / IRA 2');
    stop();
  });

  it('shows the type-specific drawers and the cost-basis estimate', async () => {
    const { store, stop } = setup();
    await openAccounts();
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    const i = store.plan.accounts!.length - 1;
    const card = () => cards()[i];
    await type(card().querySelectorAll<HTMLInputElement>('.currency-input')[0], '200000');
    expect(card().querySelector('.acc-taxable-treatment-group')).toBeNull();

    await fireEvent.change(q(card(), '.acc-type-select'), { target: { value: 'taxable' } });
    expect(store.plan.accounts![i].type).toBe('taxable');
    expect(q(card(), '.cost-basis-dollar-preview').textContent).toBe('Est. Basis: $140,000');
    await type(q(card(), '.acc-cost-basis-ratio'), '50');
    expect(store.plan.accounts![i].cost_basis_ratio).toBe(50);
    expect(q(card(), '.cost-basis-dollar-preview').textContent).toBe('Est. Basis: $100,000');
    await fireEvent.change(q(card(), '.acc-community-property'), { target: { value: 'true' } });
    expect(store.plan.accounts![i].is_community_property).toBe(true);

    await fireEvent.click(q(card(), '.btn-link'));
    expect(document.getElementById('tier1TaxAssumptionsModal')).not.toBeNull();
    await fireEvent.click(screen.getByText('Got It'));
    expect(document.getElementById('tier1TaxAssumptionsModal')).toBeNull();

    await fireEvent.change(q(card(), '.acc-type-select'), { target: { value: 'hsa' } });
    expect(card().querySelector('.acc-taxable-treatment-group')).toBeNull();
    expect(card().querySelector('.acc-hsa-medical-group')).not.toBeNull();
    stop();
  });

  it('moves the end-age choice with the owner and shows calendar years', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, { is_married: true, user_age: 55, spouse_age: 50, current_year: 2026, spouse_name: 'Sam' });
    flushSync();
    await openAccounts();
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    const i = store.plan.accounts!.length - 1;
    const card = () => cards()[i];
    expect(q(card(), '.age-helper-badge').textContent).toMatch(/Year 2026/);

    await fireEvent.change(q(card(), '.acc-owner-select'), { target: { value: 'spouse' } });
    expect(store.plan.accounts![i]).toMatchObject({ owner: 'spouse', contrib_end_age_type: 'spouse_retirement' });
    expect(q(card(), '.acc-start-age-label').textContent).toBe("Sam's Contribution Start Age");

    await fireEvent.change(q(card(), '.acc-end-age-type'), { target: { value: 'spouse_specified' } });
    const spec = q(card(), '.acc-end-age-spec');
    await type(spec, '62');
    expect(store.plan.accounts![i].contrib_end_age_specified).toBe(62);
    expect(card().querySelectorAll('.age-helper-badge')[1].textContent).toMatch(/Year 2038/);
    stop();
  });

  it('picks volatility presets and custom values', async () => {
    const { store, stop } = setup();
    await openAccounts();
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    const i = store.plan.accounts!.length - 1;
    const card = () => cards()[i];
    const vol = () => q<HTMLSelectElement>(card(), '.acc-volatility-select');
    expect(vol().value).toBe('moderate');
    expect(card().querySelector('.acc-return-std')).toBeNull();
    await fireEvent.change(vol(), { target: { value: 'high' } });
    expect(store.plan.accounts![i].return_std).toBe(16);
    await fireEvent.change(vol(), { target: { value: 'custom' } });
    await type(q(card(), '.acc-return-std'), '12.5');
    expect(store.plan.accounts![i].return_std).toBe(12.5);
    expect(vol().value).toBe('custom');
    stop();
  });

  it('flags duplicate names on the cards and at the top of the page', async () => {
    const { stop } = setup();
    await openAccounts();
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    const [x, y] = cards().slice(-2);
    expect(document.getElementById('accountsDuplicateNotice')).toBeNull();
    await type(q(y, '.account-name-input'), 'traditional 401(K) / IRA');
    expect(q(x, '.account-name-input').classList.contains('is-invalid')).toBe(true);
    expect(q(y, '.account-name-input').classList.contains('is-invalid')).toBe(true);
    expect(document.getElementById('accountsDuplicateNotice')!.textContent).toMatch(/"Traditional 401\(k\) \/ IRA"/);
    expect(document.getElementById('globalDuplicateNotice')).not.toBeNull();
    await type(q(y, '.account-name-input'), 'Rollover IRA');
    expect(document.getElementById('globalDuplicateNotice')).toBeNull();
    stop();
  });

  it('marks advanced-only fields for simple mode', async () => {
    const { stop } = setup();
    await openAccounts();
    await fireEvent.click(document.getElementById('btnAddAccount')!);
    await fireEvent.click(document.getElementById('mode_simple')!);
    expect(document.getElementById('enterDataForm')!.classList.contains('planner-simple-mode')).toBe(true);
    expect(q(cards()[0], '.acc-volatility-select').closest('.advanced-only-field')).not.toBeNull();
    stop();
  });

  it('sets spouse end ages aside when unmarried and restores them', async () => {
    const { store, stop } = setup();
    Object.assign(store.plan, { is_married: true });
    store.plan.accounts = [{ id: 's1', name: 'Spouse IRA', owner: 'spouse', contrib_end_age_type: 'spouse_retirement' }];
    flushSync();
    await fireEvent.click(document.getElementById('is_married')!);
    expect(store.plan.accounts[0].contrib_end_age_type).toBe('retirement');
    expect(store.plan.filing_status).toBe('single');
    await fireEvent.click(document.getElementById('is_married')!);
    expect(store.plan.accounts[0].contrib_end_age_type).toBe('spouse_retirement');
    expect([...document.querySelectorAll('#filing_status option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['joint', 'hoh']);
    stop();
  });
});
