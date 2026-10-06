// Loads the golden fixtures written by tools/golden/dump_fixtures.py.
import { readFileSync } from 'node:fs';
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
  generated_with: Record<string, string | number>;
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
