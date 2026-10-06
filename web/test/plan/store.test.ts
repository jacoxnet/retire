// @vitest-environment jsdom
// Runes compile for the client (so $effect runs) only in a DOM environment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { memoryStorage, PLAN_KEY, PlanStore, RESULTS_KEY } from '../../src/lib/plan/store.svelte';
import { FIXTURES_DIR } from '../fixtures';

const savedPlan = (file: string) => readFileSync(join(FIXTURES_DIR, '..', '..', 'saved json files', file), 'utf8');

describe('PlanStore', () => {
  it('starts from defaults and persists edits across instances', () => {
    const storage = memoryStorage();
    const a = new PlanStore(storage);
    expect(a.plan.user_name).toBe('John Doe');
    a.plan.user_name = 'Pat';
    a.markChanged();
    const b = new PlanStore(storage);
    expect(b.plan.user_name).toBe('Pat');
    expect(b.dataVersion).toBe(a.dataVersion);
  });

  it('falls back to defaults when storage is corrupt', () => {
    const storage = memoryStorage();
    storage.setItem(PLAN_KEY, '{not json');
    expect(new PlanStore(storage).plan.user_name).toBe('John Doe');
    storage.setItem(PLAN_KEY, JSON.stringify({ plan: 5 }));
    expect(new PlanStore(storage).dataVersion).toBe(1);
  });

  it('imports a saved plan, bumping the version and clearing cached results', () => {
    const store = new PlanStore(memoryStorage());
    store.setCachedResults(store.dataVersion, { run_success: 50 });
    expect(store.resultsAreCurrent).toBe(true);
    const v = store.dataVersion;
    const out = store.importText(savedPlan('sept27.json'));
    expect(out).toEqual({ loaded: true, errors: [] });
    expect(store.plan.user_age).toBe(56);
    expect(store.dataVersion).toBe(v + 1);
    expect(store.resultsAreCurrent).toBe(false);
  });

  it('reports unreadable files without changing the plan', () => {
    const store = new PlanStore(memoryStorage());
    const v = store.dataVersion;
    expect(store.importText('')).toEqual({ loaded: false, errors: ['No plan data provided.'] });
    expect(store.importText('{"runs": Infinity}').errors[0]).toBe('Error loading plan: Invalid number in plan file: Infinity');
    expect(store.dataVersion).toBe(v);
  });

  it('loads a plan with problems but returns its errors', () => {
    const store = new PlanStore(memoryStorage());
    const out = store.importText(JSON.stringify({ user_age: 10, runs: 50000000 }));
    expect(out.loaded).toBe(true);
    expect(out.errors).toContain('Number of Simulations must be an integer between 1 and 1,000,000.');
    expect(out.errors).toContain('Your Present Age must be an integer between 18 and 120.');
  });

  it('round-trips through export', () => {
    const store = new PlanStore(memoryStorage());
    store.importText(savedPlan('aug_13_plan.json'));
    const before = JSON.parse(store.exportText());
    const other = new PlanStore(memoryStorage());
    expect(other.importText(store.exportText()).errors).toEqual([]);
    expect(JSON.parse(other.exportText())).toEqual(before);
  });

  it('applies mode changes and persists them', () => {
    const storage = memoryStorage();
    const store = new PlanStore(storage);
    const msgs = store.applyModeChange({ simulation_type: 'goal_seeking', target_success_rate: '150' });
    expect(msgs).toHaveLength(1);
    expect(new PlanStore(storage).plan.target_success_rate).toBe(99.0);
  });

  it('ignores results computed for an older version and persists current ones', () => {
    const storage = memoryStorage();
    const store = new PlanStore(storage);
    const old = store.dataVersion;
    store.markChanged();
    store.setCachedResults(old, 'stale');
    expect(store.cachedResults).toBeNull();
    store.setCachedResults(store.dataVersion, 'fresh');
    expect(new PlanStore(storage).cachedResults).toBe('fresh');
    store.markChanged();
    expect(storage.getItem(RESULTS_KEY)).toBeNull();
  });

  it('autosave bumps the version on in-place edits and is reactive', () => {
    const storage = memoryStorage();
    const store = new PlanStore(storage);
    const stop = store.startAutosave();
    flushSync();
    const v = store.dataVersion;
    store.plan.desired_spending = 51000;
    flushSync();
    expect(store.dataVersion).toBe(v + 1);
    expect(new PlanStore(storage).plan.desired_spending).toBe(51000);
    store.plan.social_security!.user_amount = 2500; // nested edit
    flushSync();
    expect(store.dataVersion).toBe(v + 2);
    stop();
    store.plan.desired_spending = 1;
    flushSync();
    expect(store.dataVersion).toBe(v + 2);
  });
});
