import { describe, expect, it } from 'vitest';
import { extractSimInputs, prepareNumbaInputs } from '../src/lib/engine/inputs';
import { kernelParams, type ReturnMatrices, simulateAllPaths } from '../src/lib/engine/montecarlo';
import { deepClose, fixtureIndex, loadPlanFixture } from './fixtures';

const flat = (rows: number[][]) => Float64Array.from(rows.flat());

describe('njit_simulate_all_paths on fixed returns', () => {
  for (const { name } of fixtureIndex().plans) {
    describe(name, () => {
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
      const nbFor: Record<string, () => ReturnType<typeof prepareNumbaInputs>> = {
        regular: () => prepareNumbaInputs(inputs),
        test_spending: () => prepareNumbaInputs(inputs, k.variants.test_spending.test_spending),
        custom_inflation: () => prepareNumbaInputs(inputs, null, k.variants.custom_inflation.custom_inflation_rates),
      };

      for (const [variant, nb] of Object.entries(nbFor)) {
        it(variant, () => {
          const v = k.variants[variant];
          const ending = new Float64Array(k.runs);
          const flags = new Float64Array(k.runs);
          const traj = v.trajectories ? new Float64Array(k.runs * (k.years + 1)) : null;
          simulateAllPaths(kernelParams(inputs, nb()), m, ending, flags, traj);
          expect(deepClose(ending, v.ending_wealths), 'ending_wealths').toBeNull();
          expect(deepClose(flags, v.success_flags, 0), 'success_flags').toBeNull();
          if (traj) {
            const rows = Array.from({ length: k.runs }, (_, i) => traj.subarray(i * (k.years + 1), (i + 1) * (k.years + 1)));
            expect(deepClose(rows, v.trajectories), 'trajectories').toBeNull();
          }
        });
      }
    });
  }
});
