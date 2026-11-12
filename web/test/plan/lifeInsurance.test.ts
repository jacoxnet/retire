import { describe, expect, it } from 'vitest';
import { getLifeInsuranceRouting } from '../../src/lib/engine/inputs';
import { commitEnterPlan, ensureTaxableAccountForLifeInsurance, hasLifeInsurance } from '../../src/lib/plan/commit';
import { getDefaultData } from '../../src/lib/plan/defaults';
import type { Plan } from '../../src/lib/plan/types';
import { planErrors } from '../../src/lib/plan/validate';

const TODAY = '2026-01-15';
const fresh = (): Plan => getDefaultData(TODAY);

describe('Multiple Life Insurance Policies', () => {
  describe('getLifeInsuranceRouting', () => {
    it('aggregates multiple user policies for a single person', () => {
      const inputs = {
        user_age: 60,
        user_age_death: 80,
        is_married: false,
        life_insurance_policies: [
          { owner: 'user', amount: 100000, type: 'term', term_age: 70 }, // expired at 80
          { owner: 'user', amount: 250000, type: 'permanent' }, // active
          { owner: 'user', amount: 150000, type: 'term', term_age: 85 }, // active
        ],
      };
      const routing = getLifeInsuranceRouting(inputs);
      expect(routing.user_policy_active).toBe(true);
      expect(routing.taxable_deposit_t).toBe(-1);
      expect(routing.taxable_deposit_amt).toBe(0);
      expect(routing.terminal_life_ins_estate).toBe(400000); // 250k + 150k
    });

    it('aggregates multiple user policies paying out to surviving spouse', () => {
      const inputs = {
        user_age: 60,
        user_age_death: 75,
        is_married: true,
        spouse_age: 60,
        spouse_age_death: 85,
        life_insurance_policies: [
          { owner: 'user', amount: 200000, type: 'permanent' }, // active
          { owner: 'user', amount: 300000, type: 'term', term_age: 80 }, // active (75 <= 80)
          { owner: 'user', amount: 500000, type: 'term', term_age: 70 }, // expired (75 > 70)
          { owner: 'spouse', amount: 150000, type: 'permanent' }, // terminal
        ],
      };
      const routing = getLifeInsuranceRouting(inputs);
      expect(routing.user_policy_active).toBe(true);
      expect(routing.spouse_policy_active).toBe(true);
      // User dies at age 75 -> tUserDeath = 75 - 60 + 1 = 16
      expect(routing.taxable_deposit_t).toBe(16);
      expect(routing.taxable_deposit_amt).toBe(500000); // 200k + 300k
      expect(routing.terminal_life_ins_estate).toBe(150000); // spouse policy at spouse death
    });

    it('aggregates multiple spouse policies paying out to surviving user', () => {
      const inputs = {
        user_age: 60,
        user_age_death: 90,
        is_married: true,
        spouse_age: 60,
        spouse_age_death: 70,
        life_insurance_policies: [
          { owner: 'user', amount: 250000, type: 'permanent' },
          { owner: 'spouse', amount: 100000, type: 'term', term_age: 75 }, // active
          { owner: 'spouse', amount: 200000, type: 'permanent' }, // active
        ],
      };
      const routing = getLifeInsuranceRouting(inputs);
      // Spouse dies at age 70 -> tSpouseDeath = 70 - 60 + 1 = 11
      expect(routing.taxable_deposit_t).toBe(11);
      expect(routing.taxable_deposit_amt).toBe(300000); // 100k + 200k
      expect(routing.terminal_life_ins_estate).toBe(250000); // user policy at final death
    });

    it('aggregates both spouses active policies upon simultaneous death', () => {
      const inputs = {
        user_age: 60,
        user_age_death: 85,
        is_married: true,
        spouse_age: 60,
        spouse_age_death: 85,
        life_insurance_policies: [
          { owner: 'user', amount: 200000, type: 'permanent' },
          { owner: 'spouse', amount: 150000, type: 'permanent' },
          { owner: 'spouse', amount: 100000, type: 'term', term_age: 90 },
        ],
      };
      const routing = getLifeInsuranceRouting(inputs);
      expect(routing.taxable_deposit_t).toBe(-1);
      expect(routing.taxable_deposit_amt).toBe(0);
      expect(routing.terminal_life_ins_estate).toBe(450000); // 200k + 150k + 100k
    });

    it('falls back to legacy scalar fields if life_insurance_policies is absent', () => {
      const inputs = {
        user_age: 60,
        user_age_death: 90,
        is_married: false,
        user_life_insurance_amount: 300000,
        user_life_insurance_type: 'permanent',
      };
      const routing = getLifeInsuranceRouting(inputs);
      expect(routing.terminal_life_ins_estate).toBe(300000);
    });
  });

  describe('commitEnterPlan & hasLifeInsurance', () => {
    it('detects life insurance when policies exist in life_insurance_policies', () => {
      const plan = fresh();
      plan.user_life_insurance_amount = 0;
      plan.spouse_life_insurance_amount = 0;
      plan.life_insurance_policies = [
        { owner: 'user', amount: 100000, type: 'permanent' },
      ];
      expect(hasLifeInsurance(plan)).toBe(true);
    });

    it('ignores spouse policies when single', () => {
      const plan = fresh();
      plan.is_married = false;
      plan.life_insurance_policies = [
        { owner: 'spouse', amount: 100000, type: 'permanent' },
      ];
      expect(hasLifeInsurance(plan)).toBe(false);
      commitEnterPlan(plan, TODAY);
      expect(plan.life_insurance_policies).toEqual([]);
    });

    it('normalizes multiple policies and adds taxable account if needed', () => {
      const plan = fresh();
      plan.accounts = (plan.accounts ?? []).filter((a) => a.type !== 'taxable');
      plan.is_married = true;
      plan.spouse_age = 60;
      plan.spouse_retirement_age = 65;
      plan.spouse_age_death = 90;
      plan.life_insurance_policies = [
        { owner: 'user', amount: 200000, type: 'term', term_age: 75, name: 'Work' },
        { owner: 'user', amount: 100000, type: 'permanent' },
        { owner: 'spouse', amount: 150000, type: 'permanent' },
      ];
      commitEnterPlan(plan, TODAY);
      expect(plan.accounts.some((a) => a.name === 'Taxable Brokerage (Life Insurance Proceeds)')).toBe(true);
      expect(plan.user_life_insurance_amount).toBe(300000);
      expect(plan.spouse_life_insurance_amount).toBe(150000);
      expect(plan.life_insurance_policies.length).toBe(3);
    });
  });

  describe('validation', () => {
    it('catches negative death benefit on multiple policies', () => {
      const plan = fresh();
      plan.is_married = true;
      plan.life_insurance_policies = [
        { owner: 'user', amount: 100000, type: 'permanent' },
        { owner: 'user', amount: -500, type: 'permanent' },
      ];
      const errors = planErrors(plan);
      expect(errors).toContain('Your Life Insurance Policy 2 Death Benefit must be a non-negative number.');
    });

    it('catches invalid term expiration age on multiple policies', () => {
      const plan = fresh();
      plan.life_insurance_policies = [
        { owner: 'user', amount: 100000, type: 'term', term_age: 75 },
        { owner: 'user', amount: 200000, type: 'term', term_age: 150 },
      ];
      const errors = planErrors(plan);
      expect(errors).toContain('Your Life Insurance Policy 2 Term Policy Expiration Age must be between 18 and 120.');
    });
  });
});

