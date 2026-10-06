// App-wide singletons, created on first use in the browser.
import { PlanStore } from '../plan/store.svelte';
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
