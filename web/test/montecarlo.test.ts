// The path kernel over fixed return matrices (kernel.json's `returns`, stored inputs),
// for each plan and three spending/inflation variants: exact snapshot of the prepared
// kernel inputs, ending wealths, success flags and trajectories.
import { describe, it } from 'vitest';
import { extractSimInputs, prepareNumbaInputs } from '../src/lib/engine/inputs';
import { kernelParams, type ReturnMatrices, simulateAllPaths } from '../src/lib/engine/montecarlo';
import { expectPlanFixture, fixtureIndex, loadPlanFixture } from './fixtures';

const flat = (rows: number[][]) => Float64Array.from(rows.flat());

describe('njit_simulate_all_paths on fixed returns', () => {
  for (const { name } of fixtureIndex().plans) {
    it(name, () => {
      const { plan } = loadPlanFixture(name, 'imported');
      const k = loadPlanFixture(name, 'kernel');
      const m: ReturnMatrices = {
        runs: k.runs,
        years: k.years,
        preUser: flat(k.returns.pre_user),
        preSpouse: flat(k.returns.pre_spouse),
        roth: flat(k.returns.roth),
        taxable: flat(k.returns.taxable),
        hsaUser: flat(k.returns.hsa_user),
        hsaSpouse: flat(k.returns.hsa_spouse),
      };
      const inputs = extractSimInputs(plan);
      const { test_spending } = k.variants.test_spending;
      const { custom_inflation_rates } = k.variants.custom_inflation;

      const run = (nb: ReturnType<typeof prepareNumbaInputs>, withTrajectories: boolean) => {
        const ending = new Float64Array(k.runs);
        const flags = new Float64Array(k.runs);
        const traj = withTrajectories ? new Float64Array(k.runs * (k.years + 1)) : null;
        simulateAllPaths(kernelParams(inputs, nb), m, ending, flags, traj);
        return {
          numba_inputs: nb,
          ending_wealths: ending,
          success_flags: flags,
          ...(traj && { trajectories: Array.from({ length: k.runs }, (_, i) => traj.subarray(i * (k.years + 1), (i + 1) * (k.years + 1))) }),
        };
      };

      expectPlanFixture({
        runs: k.runs,
        years: k.years,
        seed: k.seed,
        returns: k.returns,
        variants: {
          regular: run(prepareNumbaInputs(inputs), true),
          test_spending: { test_spending, ...run(prepareNumbaInputs(inputs, test_spending), false) },
          custom_inflation: { custom_inflation_rates, ...run(prepareNumbaInputs(inputs, null, custom_inflation_rates), true) },
        },
      }, name, 'kernel');
    });
  }
});
