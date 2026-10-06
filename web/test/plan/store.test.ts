// @vitest-environment jsdom
// Runes compile for the client (so $effect runs) only in a DOM environment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { memoryStorage, PLAN_KEY, PlanStore, RESULTS_KEY } from '../../src/lib/plan/store.svelte';
import { SAVED_DIR } from '../fixtures';

const savedPlan = (file: string) => readFileSync(join(SAVED_DIR, file), 'utf8');

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

  it('an exported plan imports back cleanly and is stable from the second round trip', () => {
    // Like Django: the first re-import of a legacy plan can pick up the balance sheet's
    // zero-balance placeholder accounts (early_suzie gains "Primary 401(k) / Traditional
    // IRA"); after that, export -> import is a fixed point.
    const store = new PlanStore(memoryStorage());
    store.importText(savedPlan('early_suzie_plan.json'));
    const second = new PlanStore(memoryStorage());
    expect(second.importText(store.exportText()).errors).toEqual([]);
    const third = new PlanStore(memoryStorage());
    expect(third.importText(second.exportText()).errors).toEqual([]);
    expect(JSON.parse(third.exportText())).toEqual(JSON.parse(second.exportText()));
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
    expect(JSON.parse(storage.getItem(RESULTS_KEY)!).version).toBe(store.dataVersion);
  });

  it('keeps the last results after an edit, for adoption when they still apply', () => {
    const storage = memoryStorage();
    const store = new PlanStore(storage);
    store.setCachedResults(store.dataVersion, 'r1');
    store.markChanged();
    expect(store.cachedResults).toBeNull();
    expect(store.cachedVersion).toBe(store.dataVersion - 1);
    expect(store.previousResults).toBe('r1');
    const reloaded = new PlanStore(storage);
    expect(reloaded.cachedResults).toBeNull();
    expect(reloaded.previousResults).toBe('r1');
    reloaded.adoptResults();
    expect(reloaded.cachedResults).toBe('r1');
    expect(new PlanStore(storage).resultsAreCurrent).toBe(true);
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
