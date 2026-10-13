// Regression fixtures: the engine's and pages' outputs for the sample plans, checked
// by the tests and rewritten by them under `npm run fixtures:update` (UPDATE_FIXTURES=1).
// After an intended change, regenerate and review the diff of web/fixtures/. The update
// runs in stages because later fixtures are computed from earlier ones: imported.json
// (test/plan) -> engine outputs (det_rows, inputs, kernel, mc, stress) -> Results page.
// The functions/*.json grids are hand-maintained tables of cases and expected outputs.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
/** The sample plan files (the Manage page's input; the fixture dumper reads the same files). */
export const SAVED_DIR = join(FIXTURES_DIR, 'saved-plans');

const NON_FINITE: Record<string, number> = {
  NaN: NaN,
  Infinity: Infinity,
  '-Infinity': -Infinity,
};

/** True under `npm run fixtures:update`: snapshot checks rewrite their files instead of comparing. */
export const UPDATING = process.env.UPDATE_FIXTURES === '1';

/** Fixture JSON: compact, typed arrays as arrays, non-finite numbers as the strings parseFixture reads. */
export function stringifyFixture(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v as unknown as ArrayLike<number>);
    if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
    return v;
  }) + '\n';
}

/**
 * Default relative tolerance for engine snapshots. Floating-point results differ in the
 * last bit between platforms (e.g. `**` on macOS vs Linux), and Monte Carlo / stress means
 * amplify that to ~1e-7 relative (heavy-tailed paths dominate the sum), so fixtures written
 * on one machine must still pass on CI. 1e-6 leaves headroom while still catching any real
 * change (more than $1 on a $1M value).
 */
export const FIXTURE_TOL = 1e-6;

/**
 * Snapshot check: `actual` must match fixtures/<parts> (numbers within `tol`, see
 * deepClose). Under UPDATE_FIXTURES=1 the file is rewritten from `actual` instead.
 */
export function expectFixture(actual: unknown, parts: string[], tol = FIXTURE_TOL): void {
  const path = join(FIXTURES_DIR, ...parts);
  if (UPDATING) {
    mkdirSync(dirname(path), { recursive: true });
    // Atomic, so tests in other workers reading the file never see half of it.
    writeFileSync(`${path}.${process.pid}.tmp`, stringifyFixture(actual));
    renameSync(`${path}.${process.pid}.tmp`, path);
    return;
  }
  const diff = deepClose(actual, loadFixture(...parts), tol);
  if (diff) throw new Error(`${parts.join('/')} differs at ${diff} (run \`npm run fixtures:update\` if the change is intended)`);
}

export const expectPlanFixture = (actual: unknown, plan: string, file: string, tol = FIXTURE_TOL) =>
  expectFixture(actual, ['plans', plan, `${file}.json`], tol);

/** Parse fixture JSON, turning the "NaN"/"Infinity" sentinels back into numbers. */
export function parseFixture<T = unknown>(text: string): T {
  return JSON.parse(text, (_k, v) => (typeof v === 'string' && v in NON_FINITE ? NON_FINITE[v] : v));
}

export function loadFixture<T = any>(...parts: string[]): T {
  return parseFixture<T>(readFileSync(join(FIXTURES_DIR, ...parts), 'utf8'));
}

export interface FixturePlan {
  name: string;
  source: string;
  import_errors: number;
  years: number;
  runs: number;
}

export interface FixtureIndex {
  /** The frozen "today" for imports, the seed of kernel.json's return matrices, and the Monte Carlo seed. */
  generated_with: { fixture_today: string; kernel_seed: number; mc_seed: number };
  plans: FixturePlan[];
}

export const fixtureIndex = (): FixtureIndex => loadFixture<FixtureIndex>('index.json');

export const loadPlanFixture = <T = any>(plan: string, file: string): T =>
  loadFixture<T>('plans', plan, `${file}.json`);

/** Assert-style comparison helper: relative/absolute tolerance used by engine tests. */
export function close(a: number, b: number, tol = 1e-9): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (a === b) return true;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Recursively compare `actual` against `expected` (fixture JSON). Numbers use close();
 * typed arrays compare against plain arrays. Returns null on match, otherwise the
 * path and values of the first mismatch.
 */
export function deepClose(actual: any, expected: any, tol = 1e-9, path = '$'): string | null {
  if (typeof expected === 'number') {
    if (typeof actual === 'boolean' && (expected === 0 || expected === 1)) actual = Number(actual);
    return typeof actual === 'number' && close(actual, expected, tol) ? null : `${path}: ${actual} != ${expected}`;
  }
  if (expected === null || typeof expected !== 'object') {
    return actual === expected ? null : `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
  }
  if (Array.isArray(expected)) {
    if (!(Array.isArray(actual) || ArrayBuffer.isView(actual))) return `${path}: expected array, got ${typeof actual}`;
    const a = actual as ArrayLike<any>;
    if (a.length !== expected.length) return `${path}: length ${a.length} != ${expected.length}`;
    for (let i = 0; i < expected.length; i++) {
      const r = deepClose(a[i], expected[i], tol, `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (actual === null || typeof actual !== 'object') return `${path}: expected object, got ${JSON.stringify(actual)}`;
  const ek = Object.keys(expected).sort();
  const ak = Object.keys(actual).filter((k) => actual[k] !== undefined).sort();
  const missing = ek.filter((k) => !ak.includes(k));
  const extra = ak.filter((k) => !ek.includes(k));
  if (missing.length || extra.length) return `${path}: keys missing [${missing}] extra [${extra}]`;
  for (const k of ek) {
    const r = deepClose(actual[k], expected[k], tol, `${path}.${k}`);
    if (r) return r;
  }
  return null;
}
