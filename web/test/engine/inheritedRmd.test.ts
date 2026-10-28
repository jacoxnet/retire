import { describe, expect, it } from 'vitest';
import { getSingleLifeDivisor, SINGLE_LIFE_TABLE } from '../../src/lib/engine/constants';
import { computeInheritedFractions } from '../../src/lib/engine/inputs';
import { njitRmdTaxWithdraw, RTW, RTW_LEN } from '../../src/lib/engine/tax';
import { runDeterministic } from '../../src/lib/engine/deterministic';
import { commitEnterPlan } from '../../src/lib/plan/commit';

describe('IRS Single Life Table and Divisors', () => {
  it('correctly returns Table I values and subtract-1 rule', () => {
    // Exact IRS Table I checks
    expect(SINGLE_LIFE_TABLE[50]).toBe(36.2);
    expect(SINGLE_LIFE_TABLE[75]).toBe(14.8);
    expect(SINGLE_LIFE_TABLE[80]).toBe(11.2);

    // Initial distribution year (yearsElapsed = 1)
    expect(getSingleLifeDivisor(50, 1)).toBe(36.2);
    // Non-recalculation rule: subtract 1.0 for each subsequent year
    expect(getSingleLifeDivisor(50, 2)).toBeCloseTo(35.2, 5);
    expect(getSingleLifeDivisor(50, 3)).toBeCloseTo(34.2, 5);
    expect(getSingleLifeDivisor(50, 10)).toBeCloseTo(27.2, 5);

    // Clamps to 1.0 minimum
    expect(getSingleLifeDivisor(110, 15)).toBe(1.0);
  });
});

describe('Inherited IRA Distribution Fractions', () => {
  const currentYear = 2026;
  const userAge = 50;

  it('10-year rule pre-RBD rmd_only: 0 in years 1-9, 1.0 in year 10', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'ten_year',
      decedent_passed_rbd: false,
      distribution_strategy: 'rmd_only',
    };
    const fracs = computeInheritedFractions(12, currentYear, userAge, data, false);
    // Death in 2025: Year 1 = 2026 (index 0), Year 10 = 2035 (index 9)
    for (let t = 0; t < 9; t++) {
      expect(fracs[t]).toBe(0.0);
    }
    expect(fracs[9]).toBe(1.0); // Year 10 balloon distribution
    expect(fracs[10]).toBe(1.0); // Post-clock
  });

  it('10-year rule post-RBD rmd_only: annual RMDs in years 1-9, 1.0 in year 10', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'ten_year',
      decedent_passed_rbd: true,
      distribution_strategy: 'rmd_only',
    };
    const fracs = computeInheritedFractions(12, currentYear, userAge, data, false);
    // Beneficiary age at initial distribution year (2026) is 50. Divisor is 36.2
    expect(fracs[0]).toBeCloseTo(1.0 / 36.2, 6);
    // Year 2: divisor is 35.2
    expect(fracs[1]).toBeCloseTo(1.0 / 35.2, 6);
    // Year 10: full liquidation
    expect(fracs[9]).toBe(1.0);
  });

  it('10-year rule equalized: ratable 1/N distributions', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'ten_year',
      decedent_passed_rbd: false,
      distribution_strategy: 'equalized',
    };
    const fracs = computeInheritedFractions(12, currentYear, userAge, data, false);
    // 10 years remaining in year 2026
    expect(fracs[0]).toBeCloseTo(1.0 / 10, 6); // 10%
    expect(fracs[1]).toBeCloseTo(1.0 / 9, 6);  // 1/9
    expect(fracs[2]).toBeCloseTo(1.0 / 8, 6);  // 1/8
    expect(fracs[8]).toBeCloseTo(1.0 / 2, 6);  // 50%
    expect(fracs[9]).toBe(1.0);                // 100%
  });

  it('Inherited Roth 10-year rule: no annual RMDs regardless of RBD, 1.0 in year 10', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'ten_year',
      decedent_passed_rbd: true, // Even if decedent was past RBD, inherited Roth has no annual RMDs
      distribution_strategy: 'rmd_only',
    };
    const fracs = computeInheritedFractions(12, currentYear, userAge, data, true);
    for (let t = 0; t < 9; t++) {
      expect(fracs[t]).toBe(0.0);
    }
    expect(fracs[9]).toBe(1.0);
  });

  it('5-year rule: 0 in years 1-4, 1.0 in year 5', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'five_year',
    };
    const fracs = computeInheritedFractions(10, currentYear, userAge, data, false);
    for (let t = 0; t < 4; t++) {
      expect(fracs[t]).toBe(0.0);
    }
    expect(fracs[4]).toBe(1.0); // Year 5
  });

  it('Lifetime stretch: annual Single Life Table RMDs indefinitely', () => {
    const data = {
      death_year: 2025,
      inherited_rule: 'stretch',
    };
    const fracs = computeInheritedFractions(20, currentYear, userAge, data, false);
    for (let t = 0; t < 20; t++) {
      const divisor = getSingleLifeDivisor(50, t + 1);
      expect(fracs[t]).toBeCloseTo(1.0 / divisor, 6);
    }
  });
});

describe('Tax Waterfall & Inherited IRA Rules', () => {
  it('Inherited Pre-tax distributions are penalty-free under age 59.5 (IRC § 72(t)(2)(A)(ii))', () => {
    const out = new Float64Array(RTW_LEN);
    // User age 45 (under 59.5), spending target $50,000, no income sources
    // Has $100k inherited pre-tax and $100k own pre-tax
    njitRmdTaxWithdraw(
      45, 45, true, false, false,
      100000, 0, 100000, 0, // own pre-tax mid = 100k
      0, 0, 0, 0, // roth, taxable, hsa = 0
      75, 75,
      0, 1.0, // single, inflation = 1.0
      50000, 0, 0, 0, // spending target = 50k
      0, 0, 1,
      1, 1,
      0, 0, 0, 0, 0,
      out,
      100000, 0, 100000, 0, // inhPreUserMid = 100k
      0, 0, 0, 0, // inhRoth = 0
      0, 0, 0, 0, // no mandatory RMD fraction this year
    );

    // Deficit should be funded by Inherited Pretax Extra, NOT own pre-tax
    // And early withdrawal penalty must be 0!
    expect(out[RTW.penalty]).toBe(0.0);
    expect(out[RTW.wInhPreUserExtra]).toBeGreaterThan(50000); // grossed up for ordinary tax
    expect(out[RTW.wPretaxExtra]).toBe(0.0); // Own pre-tax untouched
    expect(out[RTW.inhPreUserEnd]).toBeLessThan(100000);
    expect(out[RTW.pretaxUserEnd]).toBe(100000);
  });

  it('Inherited Roth is drawn BEFORE own Roth to preserve permanent shelter', () => {
    const out = new Float64Array(RTW_LEN);
    // Spending target $30,000, has $20k inherited Roth and $50k own Roth
    njitRmdTaxWithdraw(
      60, 60, true, false, false,
      0, 0, 0, 0,
      50000, 0, 0, 0, // own Roth = 50k
      75, 75,
      0, 1.0,
      30000, 0, 0, 0,
      0, 0, 1,
      1, 1,
      0, 0, 0, 0, 0,
      out,
      0, 0, 0, 0,
      20000, 0, 20000, 0, // inhRothUserMid = 20k
      0, 0, 0, 0,
    );

    // Should exhaust the $20,000 inherited Roth first, then draw remaining $10,000 from own Roth
    expect(out[RTW.wInhRothUser]).toBe(20000);
    expect(out[RTW.inhRothUserEnd]).toBe(0.0);
    expect(out[RTW.wRoth]).toBe(10000);
    expect(out[RTW.rothEnd]).toBe(40000);
  });

  it('Year 10 mandatory distribution zeroes the account balance', () => {
    const out = new Float64Array(RTW_LEN);
    njitRmdTaxWithdraw(
      55, 55, true, false, false,
      0, 0, 0, 0,
      0, 0, 0, 0,
      75, 75,
      0, 1.0,
      0, 0, 0, 0,
      0, 0, 1,
      1, 1,
      0, 0, 0, 0, 0,
      out,
      50000, 0, 52000, 0, // inhPreUserMid = 52k after growth
      30000, 0, 31000, 0, // inhRothUserMid = 31k after growth
      1.0, 0, 1.0, 0,     // Year 10 fraction >= 1.0
    );

    // Ending balances must be strictly 0.0
    expect(out[RTW.inhPreUserEnd]).toBe(0.0);
    expect(out[RTW.inhRothUserEnd]).toBe(0.0);
    // Distributions must match the mid-year balances
    expect(out[RTW.userInhPretaxRmd]).toBe(52000);
    expect(out[RTW.userInhRothDist]).toBe(31000);
  });
});

describe('Deterministic Simulation with Inherited Accounts', () => {
  it('runs deterministic simulation and distributes inherited accounts over 10 years', () => {
    const plan = {
      current_year: 2026,
      user_age: 55,
      user_ret_age: 65,
      user_age_death: 85,
      is_married: false,
      filing_status: 'single',
      desired_spending: 40000,
      adjust_spending_inflation: false,
      inflation_rate: 2.5,
      accounts: [
        {
          id: 'inh_pre',
          type: 'inherited_pretax',
          owner: 'user',
          balance: 100000,
          return_mean: 5.0,
          death_year: 2025,
          inherited_rule: 'ten_year',
          decedent_passed_rbd: false,
          distribution_strategy: 'rmd_only',
        },
        {
          id: 'inh_roth',
          type: 'inherited_roth',
          owner: 'user',
          balance: 50000,
          return_mean: 5.0,
          death_year: 2025,
          inherited_rule: 'ten_year',
          decedent_passed_rbd: false,
          distribution_strategy: 'rmd_only',
        },
      ],
    };

    commitEnterPlan(plan as any);
    const rows = runDeterministic(plan);
    expect(rows.length).toBe(31);

    // Initial year: beginning assets match initial balances
    expect(rows[0].beg_assets.inherited_pretax).toBe(100000);
    expect(rows[0].beg_assets.inherited_roth).toBe(50000);

    // Year 10 is 2035 (year_index 9)
    const year10 = rows[9];
    expect(year10.year).toBe(2035);
    // Ending assets in year 10 must be 0 for inherited accounts
    expect(year10.ending_assets.inherited_pretax).toBe(0.0);
    expect(year10.ending_assets.inherited_roth).toBe(0.0);
    // Milestone for 10-year period end must be recorded
    expect(year10.milestones).toContain('Your Inherited IRA 10-Year Period Ends (64)');

    // In year 11 (2036), beginning assets must remain 0
    expect(rows[10].beg_assets.inherited_pretax).toBe(0.0);
    expect(rows[10].beg_assets.inherited_roth).toBe(0.0);
  });
});
