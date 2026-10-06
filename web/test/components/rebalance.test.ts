// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '../../src/lib/app/format';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { latestSheetAccounts } from '../../src/lib/plan/rebalance';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import type { Plan, Rebalancing } from '../../src/lib/plan/types';
import { loadPlanFixture } from '../fixtures';
import EnterHarness from './EnterHarness.svelte';

afterEach(cleanup);
beforeEach(() => {
  window.scrollTo = () => {};
  window.alert = vi.fn();
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

function setup(plan: Plan) {
  const storage = memoryStorage();
  const store = new PlanStore(storage);
  store.replace(plan);
  const stop = store.startAutosave();
  render(EnterHarness, { store, ui: new UiPrefs(storage), onNavigate: vi.fn() });
  return { store, stop };
}

const $ = <T extends Element = HTMLInputElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
const money = (v: number) => formatMoney(v, true);
const rebOf = (s: PlanStore) => s.plan.rebalancing as Rebalancing;

async function type(el: HTMLInputElement, value: string) {
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.blur(el);
}

function plan(): Plan {
  const p = structuredClone(loadPlanFixture<{ plan: Plan }>('sept27', 'imported').plan);
  p.rebalancing = { included_account_ids: [], tolerance_percent: 10, rebalance_mode: 'target', cash_flow: 0, account_allocations: {},
    asset_classes: [
      { id: 'ac_us_stocks', name: 'US Stocks', target_percent: 60, color: '#3b82f6' },
      { id: 'ac_bonds', name: 'Bonds', target_percent: 40, color: '#8b5cf6' },
    ] };
  return p;
}

describe('Rebalance tab', () => {
  it('seeds a selection on entry and lists the latest balances', async () => {
    const { store, stop } = setup(plan());
    const accounts = latestSheetAccounts(store.plan.balance_sheet as Record<string, unknown>, '2026-01-15').accounts;
    await fireEvent.click(document.getElementById('rebalance-tab')!);
    const reb = rebOf(store);
    const expected = accounts.filter((a) => a.is_investment && a.balance > 0);
    expect(reb.included_account_ids).toEqual(expected.map((a) => a.id));
    expect($$('#rebAccountsTableBody tr').length).toBe(accounts.length);
    const total = expected.reduce((s, a) => s + a.balance, 0);
    expect($('#rebAccountsTableTotal').textContent).toBe(money(total));
    expect($('#rebKpiAccSummary').textContent).toBe(`${expected.length} of ${accounts.length} accounts included`);
    expect($$('.reb-acc-card').length).toBe(expected.length);
    // Every seeded account sits 100% in US Stocks, so stocks are overweight.
    expect($('#rebDiagnosisAlert').textContent).toMatch(/Rebalancing Recommended/);
    expect($('#rebSells').textContent).toContain('US Stocks');
    expect($('#rebSells').textContent).toContain(money(total * 0.4));
    stop();
  });

  it('edits allocations until the portfolio is balanced', async () => {
    const { store, stop } = setup(plan());
    await fireEvent.click(document.getElementById('rebalance-tab')!);
    await fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    expect($('.alert-info', $('#rebAccountBreakdownsContainer'))).not.toBeNull();
    const first = $$('.reb-include')[0];
    await fireEvent.click(first);
    const card = $$('.reb-acc-card')[0];
    const inputs = $$<HTMLInputElement>('.reb-alloc-input', card);
    await type(inputs[0], '60');
    await type(inputs[1], '30');
    expect($('.reb-card-footer', card).textContent).toMatch(/Remaining: 10\.0%/);
    await fireEvent.click($('.reb-assign-remaining', card));
    const id = rebOf(store).included_account_ids[0];
    expect(rebOf(store).account_allocations[id]).toEqual({ ac_us_stocks: 70, ac_bonds: 30 });
    await type(inputs[0], '60');
    await type(inputs[1], '40');
    expect(card.classList.contains('is-complete')).toBe(true);
    expect($('#rebDiagnosisAlert').textContent).toMatch(/in Balance/);
    expect($('#rebActionPlanContainer').textContent).toMatch(/No trades needed/);

    await fireEvent.change($('.reb-preset', card), { target: { value: 'ac_bonds' } });
    expect(rebOf(store).account_allocations[id]).toEqual({ ac_us_stocks: 0, ac_bonds: 100 });
    stop();
  });

  it('changes tolerance, mode, targets and classes', async () => {
    const { store, stop } = setup(plan());
    await fireEvent.click(document.getElementById('rebalance-tab')!);
    await fireEvent.input($('#rebToleranceInput'), { target: { value: '5' } });
    expect(rebOf(store).tolerance_percent).toBe(5);
    expect($('#rebKpiTolerance').textContent).toBe('±5.0%');
    await fireEvent.change($('#rebModeSelect'), { target: { value: 'minimal' } });
    expect($('#rebKpiMode').textContent).toBe('Minimal Trading');

    await type($('#rebTargetInput_ac_bonds'), '30');
    expect($('#rebTargetValidationBadge').textContent).toMatch(/Remaining: 10\.0%/);
    await type($('#rebTargetInput_ac_bonds'), '50');
    expect($('#rebTargetValidationBadge').textContent).toMatch(/Over by 10\.0%/);

    await fireEvent.click($('#rebAddClass'));
    await fireEvent.click($('#confirmAddAssetClass'));
    expect(window.alert).toHaveBeenCalled();
    await fireEvent.input($('#newAssetClassName'), { target: { value: 'Gold' } });
    await fireEvent.click($('#confirmAddAssetClass'));
    expect(rebOf(store).asset_classes.map((c) => c.name)).toEqual(['US Stocks', 'Bonds', 'Gold']);
    expect($$('.reb-class-row').length).toBe(3);
    await fireEvent.click($$('.reb-delete-class')[2]);
    expect($$('.reb-class-row').length).toBe(2);

    await type($('#rebCashFlowInput'), '25000');
    expect(rebOf(store).cash_flow).toBe(25000);
    stop();
  });
});
