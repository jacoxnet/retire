// App-wide singletons, created on first use in the browser.
import { PlanStore } from '../plan/store.svelte';
import { McPool } from '../workers/pool';
import type { RunEngine } from './runResults';
import { UiPrefs } from './ui.svelte';

let store: PlanStore | null = null;
let ui: UiPrefs | null = null;

export function planStore(): PlanStore {
  if (!store) {
    store = new PlanStore();
    store.startAutosave();
  }
  return store;
}

export function uiPrefs(): UiPrefs {
  ui ??= new UiPrefs();
  return ui;
}

let pool: McPool | null = null;

/** The Monte Carlo worker pool, started on first use. */
export function mcEngine(): RunEngine {
  pool ??= new McPool();
  return { runner: pool.runner, chunks: pool.chunks };
}

/** Stop the running simulation; the next run starts a fresh pool. */
export function cancelMc(): void {
  pool?.terminate();
  pool = null;
}
