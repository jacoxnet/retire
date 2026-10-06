// UI preferences kept outside the plan (they don't affect results): the colour
// theme and the planner mode. Same localStorage keys as the Django app.
import type { KeyValueStorage } from '../plan/store.svelte';

export type Theme = 'light' | 'dark';
export type PlannerMode = 'advanced' | 'simple';

export const THEME_KEY = 'retire_theme';
export const MODE_KEY = 'planner_mode';

function safeGet(storage: KeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(storage: KeyValueStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // storage unavailable: keep the preference for this page only
  }
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class UiPrefs {
  theme: Theme = $state('light');
  mode: PlannerMode = $state('advanced');
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null = browserStorage()) {
    this.storage = storage;
    this.mode = safeGet(storage, MODE_KEY) === 'simple' ? 'simple' : 'advanced';
    const attr = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    this.theme = (attr ?? safeGet(storage, THEME_KEY)) === 'dark' ? 'dark' : 'light';
  }

  setMode(mode: PlannerMode): void {
    this.mode = mode;
    safeSet(this.storage, MODE_KEY, mode);
  }

  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', this.theme);
    safeSet(this.storage, THEME_KEY, this.theme);
  }
}
