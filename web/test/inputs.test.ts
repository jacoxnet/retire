import { describe, expect, it } from 'vitest';
import {
  calculateIncomeBenefitMultiplier,
  calculateIncomeGrowthFactor,
  extractSimInputs,
  prepareNumbaInputs,
} from '../src/lib/engine/inputs';
import { deepClose, expectPlanFixture, fixtureIndex, loadFixture, loadPlanFixture } from './fixtures';

describe('extract_sim_inputs / prepare_numba_inputs', () => {
  for (const { name } of fixtureIndex().plans) {
    describe(name, () => {
      const { plan } = loadPlanFixture(name, 'imported');

      it('extractSimInputs matches inputs.json', () => {
        expectPlanFixture(extractSimInputs(plan), name, 'inputs');
      });

      it('does not mutate the plan', () => {
        const before = JSON.stringify(plan);
        extractSimInputs(plan);
        expect(JSON.stringify(plan)).toBe(before);
      });

      it('prepareNumbaInputs matches numba_inputs.json', () => {
        const nb = prepareNumbaInputs(extractSimInputs(plan));
        expectPlanFixture(nb, name, 'numba_inputs');
      });
    });
  }
});

describe('income helpers grid', () => {
  const f = loadFixture('functions', 'income.json');

  it(`growth factor matches ${f.growth.length} cases`, () => {
    for (const c of f.growth) {
      const cx = f.ctx[c.ctx];
      const got = calculateIncomeGrowthFactor(f.growth_items[c.item], c.t, cx.user_age, cx.user_ret_age, cx.is_married,
        cx.spouse_age, cx.spouse_ret_age, cx.user_age_death, cx.spouse_age_death, f.inflation_rate, null,
        c.custom ? f.custom_inflation_rates : null);
      expect(deepClose(got, c.out), JSON.stringify(c)).toBeNull();
    }
  });

  it(`benefit multiplier matches ${f.mult.length} cases`, () => {
    for (const c of f.mult) {
      const a = c.args;
      const got = calculateIncomeBenefitMultiplier(f.mult_items[c.item], a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
      expect(deepClose(got, c.out, 0), JSON.stringify(c)).toBeNull();
    }
  });
});
