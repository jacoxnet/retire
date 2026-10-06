// Loads the golden fixtures written by tools/golden/dump_fixtures.py.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

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
