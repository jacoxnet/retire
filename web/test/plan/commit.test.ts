import { describe, expect, it } from 'vitest';
import {
  commitEnterPlan, clientFieldErrors, ensureTaxableAccountForLifeInsurance, prepareEnterPlan,
} from '../../src/lib/plan/commit';
import { getDefaultData } from '../../src/lib/plan/defaults';
import type { Plan } from '../../src/lib/plan/types';
import { close, deepClose, fixtureIndex, loadPlanFixture } from '../fixtures';

const TODAY = '2026-01-15';
const fresh = (): Plan => getDefaultData(TODAY);

describe('commitEnterPlan', () => {
  it('clears spouse fields and fixes the filing status for a single person', () => {
    const plan = fresh();
    Object.assign(plan, {
      is_married: false, filing_status: 'joint', spouse_name: 'Sam', spouse_age: 58,
      spouse_life_insurance_amount: 100000, spouse_life_insurance_type: 'term', begin_spending_age_type: 'spouse_retirement',
      survivor_spending: 50000,
    });
    plan.social_security = { ...plan.social_security, spouse_amount: 1500, spouse_receiving: true };
    commitEnterPlan(plan, TODAY);
    expect(plan.filing_status).toBe('single');
    expect([plan.spouse_name, plan.spouse_age, plan.spouse_retirement_age, plan.spouse_age_death]).toEqual(['', 0, 0, 0]);
    expect([plan.spouse_life_insurance_amount, plan.spouse_life_insurance_type, plan.spouse_life_insurance_term_age])
      .toEqual([0, 'permanent', 70]);
    expect(plan.begin_spending_age_type).toBe('retirement');
    expect(plan.survivor_spending).toBe(0);
    expect(plan.social_security?.spouse_amount).toBe(0);
    expect(plan.social_security?.spouse_receiving).toBe(false);
  });

  it('switches single to joint when married, keeps head of household', () => {
    const plan = fresh();
    Object.assign(plan, { is_married: true, filing_status: 'single', spouse_age: 60, spouse_retirement_age: 65, spouse_age_death: 92 });
    commitEnterPlan(plan, TODAY);
    expect(plan.filing_status).toBe('joint');
    plan.filing_status = 'hoh';
    commitEnterPlan(plan, TODAY);
    expect(plan.filing_status).toBe('hoh');
  });

  it('adds a taxable account for life-insurance proceeds once', () => {
    const plan = fresh();
    plan.accounts = (plan.accounts ?? []).filter((a) => a.type !== 'taxable');
    plan.user_life_insurance_amount = 250000;
    const n = plan.accounts.length;
    commitEnterPlan(plan, TODAY);
    expect(plan.accounts.length).toBe(n + 1);
    const acc = plan.accounts[n];
    expect(acc).toMatchObject({ name: 'Taxable Brokerage (Life Insurance Proceeds)', type: 'taxable', cost_basis_ratio: 70 });
    expect(plan.taxable_assets?.accounts?.map((a) => a.name)).toContain(acc.name);
    const names = JSON.stringify(plan.balance_sheet);
    expect(names).toContain('Taxable Brokerage (Life Insurance Proceeds)');
    expect(ensureTaxableAccountForLifeInsurance(plan)).toBe(false);
  });

  it('ignores the spouse benefit when single', () => {
    const plan = fresh();
    plan.accounts = [];
    plan.is_married = false;
    plan.spouse_life_insurance_amount = 1000;
    expect(ensureTaxableAccountForLifeInsurance(plan)).toBe(false);
  });

  it('coerces cleared fields to the view defaults', () => {
    const plan = fresh();
    Object.assign(plan, { inflation_rate: null, state_tax_rate: undefined, current_year: null, user_life_insurance_type: 'bogus' });
    commitEnterPlan(plan, TODAY);
    expect(plan.inflation_rate).toBe(2.5);
    expect(plan.state_tax_rate).toBe(0);
    expect(plan.current_year).toBe(2026);
    expect(plan.user_life_insurance_type).toBe('permanent');
  });

  // Committing an unedited, already-imported plan must not change what the engine sees.
  // Accounts gain the card's fields (and ids) but keep every value they had.
  // Synthetic plans get overrides after import, so their derived fields are stale by design.
  it.each(fixtureIndex().plans.map((p) => p.name).filter((n) => !n.startsWith('syn_')))('leaves imported plan %s unchanged', (name) => {
    const { plan } = loadPlanFixture<{ plan: Plan }>(name, 'imported');
    const before = structuredClone(plan);
    let n = 0;
    const makeId = (type: string) => `acc_${type}_test_${++n}`;
    commitEnterPlan(plan, TODAY, makeId);
    expect(close(plan.marginal_tax_rate as number, before.marginal_tax_rate as number)).toBe(true);
    for (const k of ['pretax_assets', 'spouse_pretax_assets', 'roth_assets', 'taxable_assets', 'hsa_assets', 'spouse_hsa_assets']) {
      const { accounts: _a, ...after } = (plan[k] ?? {}) as Record<string, unknown>;
      const { accounts: _b, ...was } = (before[k] ?? {}) as Record<string, unknown>;
      expect(deepClose(after, was, 1e-9, k)).toBeNull();
    }
    // A missing state exemption shows as checked on the Django page, so it saves as exempt.
    expect(plan.state_ss_exempt).toBe(before.state_ss_exempt ?? true);
    expect(plan.filing_status).toBe(before.filing_status);
    expect(plan.income_sources!.map((s) => s.is_social_security)).toEqual(before.income_sources!.map((s) => !!s.is_social_security));
    expect(plan.accounts!.length).toBe(before.accounts!.length);
    plan.accounts!.forEach((acc, i) => {
      const old = before.accounts![i];
      // An account without an id takes its balance-sheet entry's id, as Django's save does.
      expect(acc).toMatchObject(old.id ? old : { ...old, id: expect.stringMatching(/^acc_\w+$/) });
      expect(Object.keys(acc)).toEqual(expect.arrayContaining(['dividend_yield', 'cost_basis_ratio', 'is_community_property']));
    });
    const once = structuredClone(plan);
    commitEnterPlan(plan, TODAY, makeId);
    expect(plan).toEqual(once);
  });
});

describe('prepareEnterPlan', () => {
  it('reports blank and non-numeric demographics before committing', () => {
    const plan = fresh();
    plan.user_name = '  ';
    plan.user_age = null as unknown as number;
    const errors = prepareEnterPlan(plan, TODAY);
    expect(errors).toEqual([
      'Name is required.',
      'Your Present Age must be an integer between 18 and 120.',
    ]);
    expect(plan.user_age).toBeNull(); // not committed
  });

  it('checks spouse ages only when married', () => {
    const plan = fresh();
    plan.is_married = true;
    plan.spouse_age = 50;
    plan.spouse_retirement_age = undefined;
    expect(clientFieldErrors(plan)).toEqual(["Spouse's Retirement Age must be between Spouse's Present Age (50) and 120."]);
    plan.is_married = false;
    expect(clientFieldErrors(plan)).toEqual([]);
  });

  it('returns plan errors after committing', () => {
    const plan = fresh();
    plan.user_age = 70;
    plan.user_retirement_age = 65;
    expect(prepareEnterPlan(plan, TODAY)).toEqual(['Your Retirement Age must be between Your Present Age (70) and 120.']);
    plan.user_retirement_age = 70;
    expect(prepareEnterPlan(plan, TODAY)).toEqual([]);
  });
});
