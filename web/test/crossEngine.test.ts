// The Monte Carlo kernel run at constant mean returns must reproduce the deterministic
// projection year by year. This is what exposed the tot_div bug in njit_simulate_path.
import { describe, expect, it } from 'vitest';
import { meanReturns, runDeterministic } from '../src/lib/engine/deterministic';
import { extractSimInputs, prepareNumbaInputs } from '../src/lib/engine/inputs';
import { kernelParams, simulatePath } from '../src/lib/engine/montecarlo';
import { fixtureIndex, loadPlanFixture } from './fixtures';

// Known pre-existing difference between the Python engines (and so the ports): an
// "other tax" whose inflation adjustment starts before the current age is inflated
// retroactively by simulate_step ((1+i)^(age - start)) but not by prepare_numba_inputs
// (inf_factors ratio with start_t clamped to 0). sept3testplan has such an item.
const KNOWN_DIFFERENT = new Set(['sept3testplan']);

function maxRelDiff(name: string): number {
  const { plan } = loadPlanFixture(name, 'imported');
  const inputs = extractSimInputs(plan);
  const years = inputs.total_years;
  const m = meanReturns(inputs);
  const s = (v: number) => new Float64Array(years).fill(v);
  const traj = new Float64Array(years + 1);
  simulatePath(kernelParams(inputs, prepareNumbaInputs(inputs)), {
    preUser: s(m.pretax), preSpouse: s(m.pretaxSpouse), roth: s(m.roth),
    taxable: s(m.taxable), hsaUser: s(m.hsa), hsaSpouse: s(m.hsaSpouse),
  }, traj);
  let worst = 0;
  for (const r of runDeterministic(plan)) {
    const e = r.ending_assets.total;
    worst = Math.max(worst, Math.abs(e - traj[r.year_index + 1]) / Math.max(1, Math.abs(e)));
  }
  return worst;
}

describe('MC kernel at mean returns == deterministic projection', () => {
  for (const { name } of fixtureIndex().plans) {
    const test = KNOWN_DIFFERENT.has(name) ? it.fails : it;
    test(name, () => {
      expect(maxRelDiff(name)).toBeLessThan(1e-12);
    });
  }
});
