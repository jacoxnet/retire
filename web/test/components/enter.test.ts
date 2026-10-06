// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODE_KEY, UiPrefs } from '../../src/lib/app/ui.svelte';
import InstructionsModal from '../../src/lib/components/shared/InstructionsModal.svelte';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import EnterHarness from './EnterHarness.svelte';

afterEach(cleanup);
window.scrollTo = () => {}; // jsdom doesn't implement scrolling

function setup(storage = memoryStorage()) {
  const store = new PlanStore(storage);
  const stop = store.startAutosave();
  const ui = new UiPrefs(storage);
  const onNavigate = vi.fn();
  const r = render(EnterHarness, { store, ui, onNavigate });
  return { ...r, store, ui, storage, onNavigate, stop };
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement | null;

async function type(id: string, value: string) {
  const el = byId(id)!;
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.blur(el);
}

describe('Enter page', () => {
  it('keeps edits across a reload', async () => {
    const { storage, stop } = setup();
    await type('user_name', 'Pat');
    await type('user_age', '57');
    await type('state_tax_rate', '4.25');
    await type('user_life_insurance_amount', '$250,000');
    flushSync();
    stop();
    cleanup();

    const again = setup(storage);
    expect(again.store.plan.user_name).toBe('Pat');
    expect(again.store.plan.user_age).toBe(57);
    expect(again.store.plan.state_tax_rate).toBe(4.25);
    expect(again.store.plan.user_life_insurance_amount).toBe(250000);
    expect(byId('user_name')!.value).toBe('Pat');
    expect(byId('user_age')!.value).toBe('57');
    expect(byId('state_tax_rate')!.value).toBe('4.25%');
    expect(byId('user_life_insurance_amount')!.value).toBe('250,000');
    again.stop();
  });

  it('hides the advanced tabs in simple mode and remembers the mode', async () => {
    const { storage, stop } = setup();
    expect(byId('balance-sheet-tab')).not.toBeNull();
    await fireEvent.click(byId('balance-sheet-tab')!);
    expect(byId('balance-sheet-tab')!.classList.contains('active')).toBe(true);

    await fireEvent.click(byId('mode_simple')!);
    expect(byId('balance-sheet-tab')).toBeNull();
    expect(byId('rebalance-tab')).toBeNull();
    expect(byId('assets-tab')!.classList.contains('active')).toBe(true); // fell back from Balance Sheet
    expect(byId('enterDataForm')!.classList.contains('planner-simple-mode')).toBe(true);
    expect(storage.getItem(MODE_KEY)).toBe('simple');
    stop();
    cleanup();

    const again = setup(storage);
    expect(again.ui.mode).toBe('simple');
    expect(byId('rebalance-tab')).toBeNull();
    await fireEvent.click(byId('mode_advanced')!);
    expect(byId('rebalance-tab')).not.toBeNull();
    again.stop();
  });

  it('shows the spouse fields and sets the filing status when married', async () => {
    const { store, stop } = setup();
    store.plan.is_married = false;
    store.plan.filing_status = 'single';
    flushSync();
    expect(byId('spouse_section')).toBeNull();
    expect(byId('spouse_life_insurance_section')).toBeNull();
    expect(screen.getByText(/to heirs \/ estate/)).toBeTruthy();

    await fireEvent.click(byId('is_married')!);
    expect(byId('spouse_section')).not.toBeNull();
    expect(byId('spouse_life_insurance_section')).not.toBeNull();
    expect(store.plan.filing_status).toBe('joint');
    expect(byId('filing_status')!.value).toBe('joint');
    expect(screen.getByText(/paid to surviving spouse upon your death/)).toBeTruthy();

    await fireEvent.click(byId('is_married')!);
    expect(store.plan.filing_status).toBe('single');
    stop();
  });

  it('shows the term-policy status', async () => {
    const { store, stop } = setup();
    store.plan.user_age_death = 90;
    flushSync();
    expect(byId('user_term_age_group')).toBeNull();
    await type('user_life_insurance_amount', '100000');
    expect(byId('user_life_ins_badge_container')!.textContent).toMatch(/Permanent policy/);

    await fireEvent.change(byId('user_life_insurance_type')!, { target: { value: 'term' } });
    expect(byId('user_term_age_group')).not.toBeNull();
    await type('user_life_insurance_term_age', '75');
    expect(byId('user_life_ins_badge_container')!.textContent).toMatch(/expires at age 75.*\(90\)/s);
    await type('user_life_insurance_term_age', '95');
    expect(byId('user_life_ins_badge_container')!.textContent).toMatch(/Policy active at assumed death \(age 90/);
    stop();
  });

  it('adds a taxable account for life insurance when moving to Accounts', async () => {
    const { store, stop } = setup();
    store.plan.accounts = (store.plan.accounts ?? []).filter((a) => a.type !== 'taxable');
    store.plan.user_life_insurance_amount = 50000;
    flushSync();
    const n = store.plan.accounts!.length;
    await fireEvent.click(screen.getByText('Next: Accounts for Retirement'));
    expect(store.plan.accounts!.length).toBe(n + 1);
    expect(byId('assets-tab')!.classList.contains('active')).toBe(true);
    stop();
  });

  it('updates the demographics badge live', async () => {
    const { stop } = setup();
    await type('user_age', '50');
    await type('user_retirement_age', '60');
    expect(byId('demographics-tab')!.textContent).toMatch(/Age 50→60/);
    stop();
  });

  it('runs only when the plan is valid', async () => {
    const { onNavigate, stop } = setup();
    await type('user_age', '70');
    await type('user_retirement_age', '65');
    await fireEvent.click(byId('income-tab')!);
    await fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(byId('validationAlertContainer')!.textContent).toMatch(
      /Your Retirement Age must be between Your Present Age \(70\) and 120\./);

    await fireEvent.click(byId('demographics-tab')!);
    await type('user_retirement_age', '72');
    await fireEvent.click(byId('income-tab')!);
    await fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(byId('validationAlertContainer')!.textContent!.trim()).toBe('');
    stop();
  });
});

describe('flash messages', () => {
  it('shows messages from the Manage page and lets them be dismissed', async () => {
    const store = new PlanStore(memoryStorage());
    const storage = memoryStorage();
    render(EnterHarness, { store, ui: new UiPrefs(storage), onNavigate: vi.fn(), messages: [
      { level: 'error', text: 'Bad value.' }, { level: 'warning', text: 'Plan loaded, but fix it.' },
    ] });
    const alerts = [...document.querySelectorAll('.flash-message')];
    expect(alerts.map((a) => [a.className.match(/alert-(danger|warning)/)?.[1], a.textContent!.trim()])).toEqual([
      ['danger', 'Bad value.'], ['warning', 'Plan loaded, but fix it.'],
    ]);
    await fireEvent.click(alerts[0].querySelector('.btn-close')!);
    expect(document.querySelectorAll('.flash-message').length).toBe(1);
  });
});

describe('InstructionsModal', () => {
  it('renders the how-to guide and closes on Escape', async () => {
    const r = render(InstructionsModal, { open: true });
    const body = document.getElementById('howToBody')!;
    expect(body.querySelector('h1, h2')).not.toBeNull();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.getElementById('howToModal')).toBeNull();
    r.unmount();
  });
});
