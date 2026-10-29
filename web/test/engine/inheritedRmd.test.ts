import { describe, expect, it } from 'vitest';
import { getSingleLifeDivisor, SINGLE_LIFE_TABLE } from '../../src/lib/engine/constants';
import { computeInheritedFractions, extractSimInputs, prepareNumbaInputs } from '../../src/lib/engine/inputs';
import { kernelParams, simulatePath } from '../../src/lib/engine/montecarlo';
import { njitRmdTaxWithdraw, RTW, RTW_LEN } from '../../src/lib/engine/tax';
import { meanReturns, runDeterministic } from '../../src/lib/engine/deterministic';
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
      0, 0, 0, 0, // no required distribution this year
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
      52000, 0, 31000, 0, // Year 10: the whole account is required
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

describe('Minor child and surviving spouse rules', () => {
  const currentYear = 2026;

  it('minor child: life expectancy RMDs, then emptied in the year the child turns 31', () => {
    const fracs = computeInheritedFractions(20, currentYear, 15, { death_year: 2025, inherited_rule: 'minor_child' }, false);
    // Age 15 in the year after death (2026): Single Life Table 69.9, less 1 each year
    expect(fracs[0]).toBeCloseTo(1 / 69.9, 10);
    expect(fracs[5]).toBeCloseTo(1 / 64.9, 10);
    expect(fracs[15]).toBeCloseTo(1 / 54.9, 10); // age 30
    expect(fracs[16]).toBe(1.0); // 2042, age 31
  });

  it('spouse: RMDs wait for the decedent\'s RMD age, then recalculate each year', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1960 }; // RMD age 75 -> 2035
    const fracs = computeInheritedFractions(15, currentYear, 60, d, false);
    for (let t = 0; t < 9; t++) expect(fracs[t]).toBe(0.0);
    expect(fracs[9]).toBeCloseTo(1 / SINGLE_LIFE_TABLE[69], 10);
    expect(fracs[12]).toBeCloseTo(1 / SINGLE_LIFE_TABLE[72], 10); // recalculated, not 19.6 - 3
  });

  it('spouse: no delay when the decedent died after the RBD; Uniform election ignored', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1950, decedent_passed_rbd: true, spouse_table: 'uniform' };
    const fracs = computeInheritedFractions(5, currentYear, 70, d, false);
    expect(fracs[0]).toBeCloseTo(1 / SINGLE_LIFE_TABLE[70], 10);
  });

  it('spouse: Uniform Lifetime Table election, Single Life Table below age 72', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1960, spouse_table: 'uniform' };
    const fracs = computeInheritedFractions(15, currentYear, 60, d, false);
    expect(fracs[9]).toBeCloseTo(1 / SINGLE_LIFE_TABLE[69], 10);
    expect(fracs[12]).toBeCloseTo(1 / 27.4, 10); // Uniform Lifetime Table, age 72
  });

  it('spouse: Roth owner never reaches the RBD, so the delay applies', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1960, decedent_passed_rbd: true };
    const fracs = computeInheritedFractions(15, currentYear, 60, d, true);
    expect(fracs[8]).toBe(0.0);
    expect(fracs[9]).toBeGreaterThan(0.0);
  });
});

describe('Successor beneficiary after the beneficiary dies', () => {
  const currentYear = 2026;

  it('10-year rule: annual RMDs continue and the original deadline stands', () => {
    const d = { death_year: 2025, inherited_rule: 'ten_year', decedent_passed_rbd: true };
    const own = computeInheritedFractions(12, currentYear, 55, d, false);
    const succ = computeInheritedFractions(12, currentYear, 55, d, false, 2); // beneficiary dies in 2028
    expect(Array.from(succ)).toEqual(Array.from(own));
  });

  it('stretch: emptied by the end of the 10th year after the beneficiary\'s death', () => {
    const d = { death_year: 2018, inherited_rule: 'stretch' };
    const fracs = computeInheritedFractions(15, currentYear, 55, d, false, 2);
    expect(fracs[11]).toBeGreaterThan(0.0);
    expect(fracs[11]).toBeLessThan(1.0);
    expect(fracs[12]).toBe(1.0); // 2038
  });

  it('spouse dying before RMDs begin: no annual RMDs, 10 years from the spouse\'s death', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1960 };
    const fracs = computeInheritedFractions(20, currentYear, 60, d, false, 5); // dies 2031, before 2035
    for (let t = 0; t < 15; t++) expect(fracs[t]).toBe(0.0);
    expect(fracs[15]).toBe(1.0); // 2041
  });

  it('spouse dying after RMDs begin: spouse\'s remaining life expectancy, less 1 each year', () => {
    const d = { death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1960 };
    const fracs = computeInheritedFractions(25, currentYear, 60, d, false, 12); // dies 2038 at 72
    expect(fracs[12]).toBeCloseTo(1 / SINGLE_LIFE_TABLE[72], 10);
    expect(fracs[13]).toBeCloseTo(1 / (SINGLE_LIFE_TABLE[72] - 1), 10);
    expect(fracs[21]).toBeLessThan(1.0);
    expect(fracs[22]).toBe(1.0); // 2048
  });
});

describe('Deterministic simulation: successor and per-account rules', () => {
  const base = {
    current_year: 2026, user_age: 55, user_ret_age: 65, desired_spending: 0,
    adjust_spending_inflation: false, inflation_rate: 2.5,
  };
  const married = {
    ...base, user_age_death: 57, is_married: true, filing_status: 'married_filing_jointly',
    spouse_age: 55, spouse_ret_age: 65, spouse_age_death: 90, survivor_spending: 0,
  };
  const inh = (id: string, extra: Record<string, unknown>) => ({
    id, type: 'inherited_pretax', owner: 'user', balance: 100000, return_mean: 5.0, distribution_strategy: 'rmd_only', ...extra,
  });
  const run = (plan: any) => {
    commitEnterPlan(plan);
    return runDeterministic(plan);
  };

  it('surviving spouse keeps the 10-year schedule of an inherited IRA', () => {
    const rows = run({ ...married, accounts: [inh('a', { death_year: 2025, inherited_rule: 'ten_year', decedent_passed_rbd: true })] });
    // The user dies in 2028; annual RMDs continue in 2029-2034 and the account closes in 2035
    for (let t = 3; t < 9; t++) expect(rows[t].withdrawals.inherited_pretax_rmd).toBeGreaterThan(0.0);
    expect(rows[8].ending_assets.inherited_pretax).toBeGreaterThan(0.0);
    expect(rows[9].ending_assets.inherited_pretax).toBe(0.0);
  });

  it('surviving spouse empties an inherited stretch IRA within 10 years of the beneficiary\'s death', () => {
    const rows = run({ ...married, accounts: [inh('a', { death_year: 2018, inherited_rule: 'stretch' })] });
    expect(rows[11].ending_assets.inherited_pretax).toBeGreaterThan(0.0);
    expect(rows[12].ending_assets.inherited_pretax).toBe(0.0); // 2038
  });

  it('each inherited account follows its own rule', () => {
    const single = { ...base, user_age_death: 90, is_married: false, filing_status: 'single' };
    const stretch = inh('a', { death_year: 2018, inherited_rule: 'stretch' });
    const tenYear = inh('b', { death_year: 2025, inherited_rule: 'ten_year', decedent_passed_rbd: false });
    const both = run({ ...single, accounts: [stretch, tenYear] });
    const alone = run({ ...single, accounts: [{ ...stretch }] });
    // 2035: the 10-year account closes; only the stretch account remains
    expect(both[9].ending_assets.inherited_pretax).toBeCloseTo(alone[9].ending_assets.inherited_pretax, 6);
    expect(both[8].ending_assets.inherited_pretax).toBeGreaterThan(alone[8].ending_assets.inherited_pretax + 100000);
  });
});

describe('MC kernel matches the deterministic projection with inherited accounts', () => {
  it('several accounts, a first death and deficit withdrawals', () => {
    const plan: any = {
      current_year: 2026, user_age: 55, user_ret_age: 55, user_retirement_age: 55, user_age_death: 60, is_married: true,
      filing_status: 'married_filing_jointly', spouse_age: 52, spouse_ret_age: 60, spouse_age_death: 88,
      desired_spending: 30000, survivor_spending: 25000, adjust_spending_inflation: true, inflation_rate: 2.5,
      accounts: [
        { id: 'a', type: 'inherited_pretax', owner: 'user', balance: 200000, return_mean: 6.0, death_year: 2018, inherited_rule: 'stretch' },
        { id: 'b', type: 'inherited_pretax', owner: 'user', balance: 80000, return_mean: 4.0, death_year: 2024, inherited_rule: 'ten_year', decedent_passed_rbd: true },
        { id: 'c', type: 'inherited_roth', owner: 'spouse', balance: 50000, return_mean: 5.0, death_year: 2025, inherited_rule: 'spouse', decedent_birth_year: 1962 },
      ],
    };
    commitEnterPlan(plan);
    const inputs = extractSimInputs(plan);
    const years = inputs.total_years;
    const m = meanReturns(inputs);
    const s = (v: number) => new Float64Array(years).fill(v);
    const traj = new Float64Array(years + 1);
    simulatePath(kernelParams(inputs, prepareNumbaInputs(inputs)), {
      preUser: s(m.pretax), preSpouse: s(m.pretaxSpouse), roth: s(m.roth), taxable: s(m.taxable),
      hsaUser: s(m.hsa), hsaSpouse: s(m.hsaSpouse), inhPreUser: s(m.inhPretax), inhPreSpouse: s(m.inhPretaxSpouse),
      inhRothUser: s(m.inhRoth), inhRothSpouse: s(m.inhRothSpouse),
    }, traj);
    const rows = runDeterministic(plan);
    expect(rows.some((r) => r.withdrawals.inherited_pretax_extra > 0)).toBe(true);
    for (const r of rows) {
      const e = r.ending_assets.total;
      expect(Math.abs(e - traj[r.year_index + 1]) / Math.max(1, Math.abs(e))).toBeLessThan(1e-12);
    }
  });
});
