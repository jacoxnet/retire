import { describe, expect, it } from 'vitest';
import {
  applyMarriageToAccounts, cardAccount, commitAccounts, duplicateAccountNames, newAccount, personLabels,
  setAccountOwner, uniqueDefaultName, volatilityChoice, yearAtAge,
} from '../../src/lib/plan/accountCard';
import { getDefaultData } from '../../src/lib/plan/defaults';
import type { Account, Plan } from '../../src/lib/plan/types';

const ids = () => {
  let n = 0;
  return (type: string) => `acc_${type}_${++n}`;
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return Object.assign(getDefaultData('2026-01-15'), {
    user_name: 'Pat', user_age: 55, user_retirement_age: 62, user_age_death: 92,
    is_married: true, spouse_name: 'Sam', spouse_age: 50, spouse_retirement_age: 60, spouse_age_death: 95,
    current_year: 2026, accounts: [],
  }, overrides);
}

describe('person labels', () => {
  it('falls back like getPersonLabels', () => {
    const p = personLabels(plan({ user_name: '  ', spouse_name: '', user_age: 0, current_year: undefined }));
    expect(p.userName).toBe('You');
    expect(p.spouseName).toBe('Spouse');
    expect(p.userAge).toBe(60); // parseInt(...) || 60
    expect(p.currentYear).toBe(2026);
  });

  it('gives calendar years for ages', () => {
    const p = personLabels(plan());
    expect(yearAtAge(60, false, p)).toBe(2031);
    expect(yearAtAge(60, true, p)).toBe(2036);
    expect(yearAtAge(10, false, p)).toBeNull();
    expect(yearAtAge('', false, p)).toBeNull();
    expect(yearAtAge(60, true, { ...p, isMarried: false })).toBe(2031);
  });
});

describe('card defaults', () => {
  it('numbers duplicate default names', () => {
    expect(uniqueDefaultName('Roth IRA / 401(k)', [])).toBe('Roth IRA / 401(k)');
    expect(uniqueDefaultName('Roth IRA / 401(k)', ['roth ira / 401(k)', 'Roth IRA / 401(k) 2'])).toBe('Roth IRA / 401(k) 3');
  });

  it('fills a new account', () => {
    const p = plan({ accounts: [{ name: 'Traditional 401(k) / IRA' }] });
    expect(newAccount(p, ids())).toEqual({
      id: 'acc_pretax_1', name: 'Traditional 401(k) / IRA 2', type: 'pretax', owner: 'user',
      balance: 0, contrib_amount: 0, contrib_freq: 'annual', contrib_start_age: 55,
      contrib_end_age_type: 'retirement', contrib_end_age_specified: 62, contrib_adjust_inflation: true,
      return_mean: 6.0, return_std: 10.0, hsa_for_medical: true, dividend_yield: 2.0, qualified_dividend_pct: 85.0,
      interest_yield: 0.0, capital_gains_dist_rate: 0.5, cost_basis_ratio: 70.0, is_community_property: false,
    });
  });

  it('uses owner- and type-specific defaults', () => {
    const p = personLabels(plan());
    const acc = cardAccount({ type: 'cash', owner: 'spouse', contrib_end_age_type: 'age' }, p, [], ids());
    expect(acc).toMatchObject({
      type: 'taxable', name: "Sam's Taxable Brokerage", contrib_start_age: 50, contrib_end_age_specified: 60,
      contrib_end_age_type: 'spouse_specified', return_mean: 5.0, return_std: 8.0,
    });
    expect(cardAccount({ contrib_end_age_type: 'age' }, p, [], ids()).contrib_end_age_type).toBe('user_specified');
    expect(cardAccount({ is_community_property: 'true' as unknown as boolean }, p, [], ids()).is_community_property).toBe(true);
  });

  it('keeps existing values and unknown keys', () => {
    const p = personLabels(plan());
    const acc = cardAccount({ id: 'x', name: '', balance: 5, hsa_for_medical: false, institution: 'Vanguard' }, p, [], ids());
    expect(acc).toMatchObject({ id: 'x', name: '', balance: 5, hsa_for_medical: false, institution: 'Vanguard' });
  });
});

describe('owner and marriage', () => {
  it('moves the end-age choice with the owner', () => {
    const acc: Account = { contrib_end_age_type: 'retirement' };
    setAccountOwner(acc, 'spouse');
    expect(acc).toMatchObject({ owner: 'spouse', contrib_end_age_type: 'spouse_retirement' });
    acc.contrib_end_age_type = 'spouse_specified';
    setAccountOwner(acc, 'user');
    expect(acc.contrib_end_age_type).toBe('user_specified');
    acc.contrib_end_age_type = 'first_death';
    setAccountOwner(acc, 'spouse');
    expect(acc.contrib_end_age_type).toBe('first_death');
  });

  it('sets spouse choices aside when single and restores them', () => {
    const a: Account = { contrib_end_age_type: 'spouse_retirement' };
    const b: Account = { contrib_end_age_type: 'spouse_specified' };
    const c: Account = { contrib_end_age_type: 'first_death' };
    applyMarriageToAccounts([a, b, c], false);
    // "First Death" is couple-only too: the single person's card can't show it.
    expect([a, b, c].map((x) => x.contrib_end_age_type)).toEqual(['retirement', 'retirement', 'retirement']);
    b.contrib_end_age_type = 'user_specified'; // changed while single: kept
    applyMarriageToAccounts([a, b, c], true);
    expect([a, b, c].map((x) => x.contrib_end_age_type)).toEqual(['spouse_retirement', 'user_specified', 'first_death']);
  });
});

describe('volatility and duplicates', () => {
  it('maps standard deviations to choices', () => {
    expect(volatilityChoice(4.5)).toBe('low');
    expect([8, 9.5, 10, 10.05].map(volatilityChoice)).toEqual(['moderate', 'moderate', 'moderate', 'moderate']);
    expect(volatilityChoice(16)).toBe('high');
    expect(volatilityChoice(12)).toBe('custom');
  });

  it('finds duplicate names case-insensitively', () => {
    expect(duplicateAccountNames([{ name: 'IRA' }, { name: ' ira ' }, { name: 'Roth' }, { name: '' }, { name: '' }])).toEqual(['IRA']);
    expect(duplicateAccountNames([])).toEqual([]);
  });
});

describe('commitAccounts (parse_account_rows)', () => {
  it('applies the save rules', () => {
    const p = plan({
      is_married: false,
      accounts: [
        { id: 'a', name: '  ', type: 'roth', owner: 'spouse', contrib_start_age: 40, contrib_end_age_type: 'spouse_specified',
          balance: null as unknown as number, dividend_yield: null as unknown as number, cost_basis_ratio: undefined },
        { id: 'b', name: 'Brokerage', type: 'taxable', contrib_start_age: 58, dividend_yield: '' as unknown as number,
          contrib_adjust_inflation: 'true' as unknown as boolean },
      ],
    });
    commitAccounts(p, ids());
    const [a, b] = p.accounts!;
    expect(a).toMatchObject({
      name: 'User Roth Account', owner: 'user', contrib_start_age: 55, contrib_end_age_type: 'retirement',
      balance: 0, dividend_yield: 0.0, cost_basis_ratio: 70.0,
    });
    expect(b).toMatchObject({ contrib_start_age: 58, dividend_yield: 2.0, contrib_adjust_inflation: true });
  });

  it('keeps spouse ownership for a married couple', () => {
    const p = plan({ accounts: [{ id: 'a', name: 'IRA', owner: 'spouse', contrib_start_age: 45, contrib_end_age_type: 'spouse_retirement' }] });
    commitAccounts(p, ids());
    expect(p.accounts![0]).toMatchObject({ owner: 'spouse', contrib_start_age: 50, contrib_end_age_type: 'spouse_retirement' });
  });
});
