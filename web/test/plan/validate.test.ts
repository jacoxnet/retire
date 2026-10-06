import { describe, expect, it } from 'vitest';
import { getDefaultData } from '../../src/lib/plan/defaults';
import { deathAgeErrors, planErrors, validateAccounts, validateAdditionalSpending } from '../../src/lib/plan/validate';
import { loadFixture } from '../fixtures';

// JSON can't tell 95.0 from 95, and imported plans hold these fields as ints after
// normalization, so Python's "(95.0)" for raw float inputs is compared as "(95)".
const asInts = (msgs: string[]) => msgs.map((m) => m.replace(/\((\d+)\.0\)/g, '($1)'));

describe('plan_errors / death_age_errors grid', () => {
  const cases = loadFixture<any[]>('functions', 'plan_errors.json');
  cases.forEach((c, i) => {
    it(`case ${i}: ${c.plan_errors.length} errors`, () => {
      expect(planErrors(structuredClone(c.input))).toEqual(asInts(c.plan_errors));
      expect(deathAgeErrors(structuredClone(c.input))).toEqual(asInts(c.death_age_errors));
    });
  });
});

describe('core/tests.py validator cases', () => {
  it('rejects duplicate (case-insensitive) and blank account names', () => {
    const acc = (name: string) => ({ name, balance: 100000.0, contrib_amount: 0, contrib_start_age: 60, owner: 'user' });
    expect(validateAccounts([acc('Primary 401(k)'), acc('Roth IRA')], 60, 90, false, 60, 90)).toEqual([]);
    expect(validateAccounts([acc('Primary 401(k)'), acc('primary 401(k) ')], 60, 90, false, 60, 90)
      .some((e) => e.includes('Multiple accounts cannot have the same name'))).toBe(true);
    expect(validateAccounts([acc('   ')], 60, 90, false, 60, 90)
      .some((e) => e.includes('Account Name cannot be blank'))).toBe(true);
  });

  it('validates user- and spouse-specified fields', () => {
    const trip = (start_age: number) => ({ name: 'Trip', amount: 5000.0, start_age, start_age_type: 'spouse', interval: 0, adjust_inflation: true });
    expect(validateAdditionalSpending([trip(55)], 60, 90, true, 50, 85)).toEqual([]);
    expect(validateAdditionalSpending([trip(45)], 60, 90, true, 50, 85)[0]).toContain("cannot be younger than Spouse's Present Age");
    const acc = (id: string, owner: string, start: number, endType: string, end: number) => ({
      id, name: `Acc ${id}`, type: 'pretax', owner, balance: 1000.0, contrib_amount: 0.0, contrib_freq: 'annual',
      contrib_start_age: start, contrib_end_age_type: endType, contrib_end_age_specified: end,
      contrib_adjust_inflation: true, return_mean: 6.0, return_std: 10.0, hsa_for_medical: true,
    });
    expect(validateAccounts([acc('1', 'user', 60, 'user_specified', 65), acc('2', 'spouse', 55, 'spouse_specified', 60)],
      60, 90, true, 55, 85)).toEqual([]);
  });

  it('the default plan is valid (an export of it loads back cleanly)', () => {
    expect(planErrors(getDefaultData())).toEqual([]);
  });
});
