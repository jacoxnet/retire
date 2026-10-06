// The plan store: the browser-side replacement for the Django session. Holds the
// reactive plan, a data version that invalidates cached results whenever the plan
// changes, and the cached results themselves, all persisted to localStorage.
import { untrack } from 'svelte';
import { getDefaultData } from './defaults';
import { applyModeChange as applyModeChangeTo, type ModeChangeInput, type ModeChangeMessage } from './modeChange';
import { ensurePlanBlocks, importPlanData } from './importPlan';
import { parsePlanJson } from './normalize';
import type { Plan } from './types';

/** The subset of the Web Storage API the store uses (injectable for tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PLAN_KEY = 'retire.plan.v1';
export const RESULTS_KEY = 'retire.results.v1';

interface PlanEnvelope {
  plan: Plan;
  dataVersion: number;
}

interface ResultsEnvelope<R> {
  version: number;
  results: R;
}

export interface ImportOutcome {
  /** False when the file couldn't be read at all; the current plan is then unchanged. */
  loaded: boolean;
  /** Import and validation messages. A plan with problems is still loaded, to be fixed on the Enter page. */
  errors: string[];
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function defaultStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // access can throw (e.g. blocked storage); fall through
  }
  return memoryStorage();
}

export class PlanStore<R = unknown> {
  plan: Plan = $state(getDefaultData());
  dataVersion = $state(1);
  cachedResults: R | null = $state(null);
  cachedVersion = $state(-1);

  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage = defaultStorage()) {
    this.storage = storage;
    this.load();
  }

  /** True when the cached results were computed from the current plan. */
  get resultsAreCurrent(): boolean {
    return this.cachedResults !== null && this.cachedVersion === this.dataVersion;
  }

  /** Read the plan (and cached results) from storage; anything unreadable falls back to defaults. */
  load(): void {
    const env = this.read<PlanEnvelope>(PLAN_KEY);
    if (env && env.plan && typeof env.plan === 'object' && Number.isInteger(env.dataVersion)) {
      this.plan = ensurePlanBlocks(env.plan);
      this.dataVersion = env.dataVersion;
    } else {
      this.plan = getDefaultData();
      this.dataVersion = 1;
    }
    const res = this.read<ResultsEnvelope<R>>(RESULTS_KEY);
    if (res && res.version === this.dataVersion) {
      this.cachedResults = res.results;
      this.cachedVersion = res.version;
    } else {
      this.cachedResults = null;
      this.cachedVersion = -1;
    }
  }

  /** Write the plan to storage. */
  save(): void {
    const env: PlanEnvelope = { plan: $state.snapshot(this.plan) as Plan, dataVersion: this.dataVersion };
    this.write(PLAN_KEY, JSON.stringify(env));
  }

  /** Record that the plan changed: bump the data version, drop cached results, save. */
  markChanged(): void {
    this.dataVersion += 1;
    this.cachedResults = null;
    this.cachedVersion = -1;
    this.storage.removeItem(RESULTS_KEY);
    this.save();
  }

  /** Replace the whole plan (e.g. after an import). */
  replace(plan: Plan): void {
    this.plan = plan;
    this.markChanged();
  }

  /** Reset to the default plan ("Clear Data"). */
  clear(): void {
    this.replace(getDefaultData());
  }

  /** Load a plan file's text, as the Manage page's import does. */
  importText(text: string): ImportOutcome {
    if (!text || !text.trim()) return { loaded: false, errors: ['No plan data provided.'] };
    let data: Plan;
    try {
      data = parsePlanJson(text);
    } catch (e) {
      return { loaded: false, errors: [`Error loading plan: ${e instanceof Error ? e.message : String(e)}`] };
    }
    const errors = importPlanData(data);
    this.replace(data);
    return { loaded: true, errors };
  }

  /** The plan as pretty-printed JSON, for export. */
  exportText(): string {
    return JSON.stringify($state.snapshot(this.plan), null, 4);
  }

  /** Apply Results-page mode / input edits; returns any messages. */
  applyModeChange(input: ModeChangeInput): ModeChangeMessage[] {
    const plan = $state.snapshot(this.plan) as Plan;
    const messages = applyModeChangeTo(plan, input);
    this.replace(plan);
    return messages;
  }

  /** Cache results computed for `version` (ignored if the plan has changed since). */
  setCachedResults(version: number, results: R): void {
    if (version !== this.dataVersion) return;
    this.cachedResults = results;
    this.cachedVersion = version;
    // Large results can exceed the storage quota; caching is best-effort.
    this.write(RESULTS_KEY, JSON.stringify({ version, results } satisfies ResultsEnvelope<R>));
  }

  /**
   * Save automatically whenever the plan is edited in place (e.g. through bound
   * inputs), bumping the data version. Returns a function that stops it.
   */
  startAutosave(): () => void {
    return $effect.root(() => {
      let first = true;
      $effect(() => {
        JSON.stringify(this.plan); // track every nested field
        if (first) {
          first = false;
          return;
        }
        untrack(() => this.markChanged()); // don't depend on the version it bumps
      });
    });
  }

  private read<T>(key: string): T | null {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      // quota exceeded or storage unavailable: keep working in memory
    }
  }
}
