import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFloat, getInt } from '../../src/lib/plan/coerce';
import { normalizeImportedPlan, normalizePlanFields, parsePlanJson } from '../../src/lib/plan/normalize';
import { deepClose, FIXTURES_DIR, fixtureIndex, loadFixture, loadPlanFixture } from '../fixtures';

const SAVED_DIR = join(FIXTURES_DIR, '..', '..', 'saved json files');

describe('normalize_imported_plan grid', () => {
  const cases = loadFixture<any[]>('functions', 'normalize.json');
  cases.forEach((c, i) => {
    it(`case ${i}`, () => {
      const data = structuredClone(c.input);
      const errors = normalizeImportedPlan(data);
      expect(errors).toEqual(c.errors);
      expect(deepClose(data, c.normalized, 0)).toBeNull();
    });
  });
});

describe('stage-1 import of every saved plan', () => {
  for (const p of fixtureIndex().plans.filter((x) => !x.name.startsWith('syn_'))) {
    it(p.name, () => {
      const data = parsePlanJson(readFileSync(join(SAVED_DIR, p.source), 'utf8'));
      const errors = normalizePlanFields(data);
      const expected = loadPlanFixture(p.name, 'normalized');
      expect(errors).toEqual(expected.errors);
      expect(deepClose(data, expected.plan, 0)).toBeNull();
    });
  }
});

// Ports of core/tests_input_validation.py
describe('NormalizeImportedPlanTests', () => {
  it('non-list rows and non-dict items', () => {
    const data: any = { accounts: 'nope', income_sources: [1, { name: 'Pension', amount: '1200' }] };
    const errors = normalizeImportedPlan(data);
    expect('accounts' in data).toBe(false);
    expect(data.income_sources).toEqual([{ name: 'Pension', amount: 1200.0 }]);
    expect(errors.length).toBe(2);
  });

  it('nulls fall back to defaults silently', () => {
    const data: any = { user_age: null, social_security: { user_start_age: null } };
    expect(normalizeImportedPlan(data)).toEqual([]);
    expect('user_age' in data).toBe(false);
    expect('user_start_age' in data.social_security).toBe(false);
  });
});

describe('NumericHelperTests', () => {
  it('non-finite values use the default', () => {
    expect(getFloat('inf', 1.0)).toBe(1.0);
    expect(getFloat('nan', 2.0)).toBe(2.0);
    expect(getInt('inf', 3)).toBe(3);
    expect(getInt('1e400', 4)).toBe(4);
  });

  it('strips $, % and commas', () => {
    expect(getFloat('$1,234.50')).toBe(1234.5);
    expect(getFloat('3.5%')).toBe(3.5);
    expect(getInt('61.9')).toBe(61);
    expect(getFloat({}, 7)).toBe(7);
  });
});

describe('ImportedPlanValidationTests (loader parts)', () => {
  it('rejects non-finite numbers in the file', () => {
    expect(() => parsePlanJson('{"user_age": 60, "runs": Infinity}')).toThrow('Invalid number in plan file: Infinity');
    expect(() => parsePlanJson('{"x": NaN}')).toThrow('Invalid number in plan file: NaN');
  });

  it('requires a JSON object, but unwraps a JSON-encoded plan string', () => {
    expect(() => parsePlanJson('[1, 2]')).toThrow('Invalid JSON format');
    expect(parsePlanJson(JSON.stringify(JSON.stringify({ user_age: 61 })))).toEqual({ user_age: 61 });
  });

  it('coerces numeric strings, drops unknown keys and reports wrong types', () => {
    const data: any = { user_age: '61', runs: '500', injected_key: '<b>hi</b>', desired_spending: { x: 1 },
      accounts: [{ name: 'IRA', balance: 'lots' }] };
    const errors = normalizeImportedPlan(data);
    expect(data.user_age).toBe(61);
    expect(data.runs).toBe(500);
    expect('injected_key' in data).toBe(false);
    expect(errors).toContain("Imported plan: field 'desired_spending' must be a number.");
    expect(errors).toContain("Imported plan: accounts #1 'balance' must be a number.");
  });
});
