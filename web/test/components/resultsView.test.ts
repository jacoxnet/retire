// @vitest-environment jsdom
// The Results route's logic: run with progress, cache, reuse, re-run on input edits,
// other stress tests, invalid plans, cancel and failure.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Results } from '../../src/lib/app/results';
import type { RunEngine } from '../../src/lib/app/runResults';
import { type ChunkRunner, localRunner } from '../../src/lib/engine/mc';
import ResultsView from '../../src/lib/components/results/ResultsView.svelte';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import { PoolTerminated } from '../../src/lib/workers/pool';
import { loadPlanFixture } from '../fixtures';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(cleanup);

function setup(opts: { runs?: number; storage?: ReturnType<typeof memoryStorage>; plan?: any; runner?: ChunkRunner; cancel?: () => void } = {}) {
  const storage = opts.storage ?? memoryStorage();
  const store = new PlanStore(storage);
  if (opts.plan !== null) {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    store.replace(opts.plan ?? { ...plan, runs: opts.runs ?? 300 });
  }
  const calls: number[] = [];
  const runner: ChunkRunner = opts.runner ?? ((job, ranges, onProgress) => {
    calls.push(ranges.reduce((n, [, c]) => n + c, 0));
    return localRunner(job, ranges, onProgress);
  });
  const engine = (): RunEngine => ({ runner, chunks: 2 });
  const page = render(ResultsView, { store, engine, cancel: opts.cancel, enterHref: '/', seed: 7 });
  const q = (sel: string) => page.container.querySelector(sel);
  return { store, storage, page, calls, q };
}

const ready = (q: (s: string) => Element | null) => waitFor(() => expect(q('#mcResultsCard')).not.toBeNull(), { timeout: 20_000 });

describe('ResultsView', () => {
  it('runs the plan with a progress card, then shows and caches the results', async () => {
    const { store, q, calls } = setup();
    expect(q('#runProgressCard')).not.toBeNull();
    await ready(q);
    expect(calls).toEqual([300, 300]); // Monte Carlo, then the stress test
    expect(store.resultsAreCurrent).toBe(true);
    const r = store.cachedResults as Results;
    expect(r.runs).toBe(300);
    expect(q('#mcResultsCard')!.textContent).toContain(`${r.run_success.toFixed(1)}%`);
  }, 30_000);

  it('shows cached results without running, and reuses them after a balance-sheet-only edit', async () => {
    const first = setup();
    await ready(first.q);
    cleanup();

    const again = setup({ storage: first.storage, plan: null });
    expect(again.q('#mcResultsCard')).not.toBeNull();
    expect(again.calls).toEqual([]);
    cleanup();

    // A view setting on the balance sheet doesn't change the engine inputs.
    const bs = first.store.plan.balance_sheet!;
    bs.view_mode = bs.view_mode === 'detailed' ? 'summary' : 'detailed';
    first.store.markChanged();
    const third = setup({ storage: first.storage, plan: null });
    expect(third.q('#mcResultsCard')).not.toBeNull();
    expect(third.calls).toEqual([]);
    expect(third.store.resultsAreCurrent).toBe(true);
    cleanup();

    // A spending change does.
    third.store.plan.desired_spending = (third.store.plan.desired_spending ?? 0) + 1000;
    third.store.markChanged();
    const fourth = setup({ storage: first.storage, plan: null });
    expect(fourth.q('#runProgressCard')).not.toBeNull();
    await ready(fourth.q);
    expect(fourth.calls).toHaveLength(2);
  }, 60_000);

  it('applies the inputs card, re-runs and shows the messages', async () => {
    const { store, q, calls } = setup();
    await ready(q);
    await fireEvent.input(q('#input_desired_spending')!, { target: { value: '90000' } });
    await fireEvent.input(q('#input_user_age_death')!, { target: { value: '50' } }); // invalid, rejected
    await fireEvent.submit(q('#resultsInputsForm')!);
    expect(store.plan.desired_spending).toBe(90000);
    expect(store.plan.user_age_death).not.toBe(50);
    await ready(q);
    expect(calls).toHaveLength(4);
    const alerts = [...document.querySelectorAll('#validationAlertContainer .alert')].map((a) => a.textContent!.trim());
    expect(alerts.at(-1)).toBe('Simulation inputs updated and simulation re-run.');
    expect(alerts).toContain('Age at Death was not changed.');
    expect((store.cachedResults as Results).desired_spending).toBe(90000);
    expect((q('#input_desired_spending') as HTMLInputElement).value).toBe('90000');
    expect(q('#staleResultsBanner')).toBeNull();
  }, 60_000);

  it('switches to goal seeking from the mode card', async () => {
    const { store, q } = setup({ runs: 200 });
    await ready(q);
    await fireEvent.click(q('#results_sim_type_goal')!);
    await fireEvent.input(q('#results_target_success_rate')!, { target: { value: '75' } });
    await fireEvent.submit(q('#resultsInputsForm')!);
    expect(store.plan.goal_seeking).toBe(true);
    expect(store.plan.target_success_rate).toBe(75);
    await waitFor(() => expect(q('#mcResultsCard')?.textContent).toContain('Max Achieved Desired Spending'), { timeout: 30_000 });
    expect((store.cachedResults as Results).achieved_spending).toBeGreaterThan(0);
  }, 60_000);

  it('runs another stress test on request and keeps it with the cached results', async () => {
    const { store, q, calls } = setup();
    await ready(q);
    const regular = (store.cachedResults as Results).stress_test.regular_results.run_success;
    await fireEvent.change(q('#stressScenarioSelect')!, { target: { value: '1929_depression' } });
    await waitFor(() => expect(q('#stressScenarioTitle')?.textContent).toContain('Great Depression'), { timeout: 20_000 });
    expect(calls).toHaveLength(3); // one more job: the stress run only
    const cached = store.cachedResults as Results;
    expect(cached.stress_test.scenario.key).toBe('1929_depression');
    expect(cached.stress_test.regular_results.run_success).toBe(regular);
    expect((q('#stressScenarioSelect') as HTMLSelectElement).value).toBe('1929_depression');
  }, 60_000);

  it('lists the plan errors instead of running an invalid plan', () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const { q, calls } = setup({ plan: { ...plan, user_age: 10 } });
    expect(q('#resultsPlanErrors')?.textContent).toContain('Your Present Age must be an integer between 18 and 120.');
    expect(q('#resultsPlanErrors a')?.getAttribute('href')).toBe('/');
    expect(calls).toEqual([]);
  });

  it('can be cancelled and run again', async () => {
    let reject: ((e: Error) => void) | null = null;
    let hang = true;
    const runner: ChunkRunner = (job, ranges, onProgress) =>
      hang ? new Promise((_, rej) => (reject = rej)) : localRunner(job, ranges, onProgress);
    const cancel = vi.fn(() => reject?.(new PoolTerminated()));
    const { q } = setup({ runner, cancel });
    await fireEvent.click(q('#btnCancelRun')!);
    expect(cancel).toHaveBeenCalled();
    await waitFor(() => expect(q('#resultsCancelled')).not.toBeNull());
    hang = false;
    await fireEvent.click([...q('#resultsCancelled')!.querySelectorAll('button')][0]);
    await ready(q);
  }, 30_000);

  it('reports a failed run', async () => {
    const runner: ChunkRunner = () => Promise.reject(new Error('boom'));
    const { q } = setup({ runner });
    await waitFor(() => expect(q('#resultsFailed')?.textContent).toContain('The simulation failed: boom'));
  });
});
