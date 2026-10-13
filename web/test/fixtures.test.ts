import { describe, expect, it } from 'vitest';
import { close, FIXTURE_TOL, fixtureIndex, loadFixture, loadPlanFixture, parseFixture, stringifyFixture } from './fixtures';

const PLAN_FILES = ['imported', 'inputs', 'numba_inputs', 'det_rows', 'kernel', 'mc', 'stress', 'results', 'results-page'];

describe('fixture loader', () => {
  it('decodes non-finite sentinels', () => {
    const v = parseFixture<number[]>('["NaN","Infinity","-Infinity",1.5]');
    expect(Number.isNaN(v[0])).toBe(true);
    expect(v.slice(1)).toEqual([Infinity, -Infinity, 1.5]);
  });

  it('close() uses relative tolerance', () => {
    expect(close(1e9, 1e9 + 0.5)).toBe(true);
    expect(close(1, 1 + 1e-6)).toBe(false);
    expect(close(NaN, NaN)).toBe(true);
    // Snapshots absorb cross-platform float noise in Monte Carlo means, but not real changes.
    expect(close(-19261651.63528176, -19261653.57758715, FIXTURE_TOL)).toBe(true);
    expect(close(1_000_000, 1_000_002, FIXTURE_TOL)).toBe(false);
  });
});

describe('regression fixtures', () => {
  const index = fixtureIndex();

  it('cover every saved plan', () => {
    expect(index.plans.length).toBe(12);
  });

  it('round-trip through stringifyFixture', () => {
    const v = { a: Float64Array.of(1.5, NaN), b: [Infinity, -Infinity], c: 'x' };
    expect(parseFixture(stringifyFixture(v))).toEqual({ a: [1.5, NaN], b: [Infinity, -Infinity], c: 'x' });
  });

  for (const plan of index.plans) {
    describe(plan.name, () => {
      for (const file of PLAN_FILES) {
        it(`has ${file}.json`, () => {
          expect(loadPlanFixture(plan.name, file)).toBeTruthy();
        });
      }

      it('kernel trajectories are consistent with dimensions', () => {
        const k = loadPlanFixture(plan.name, 'kernel');
        expect(k.years).toBe(plan.years);
        expect(k.returns.pre_user.length).toBe(k.runs);
        expect(k.returns.pre_user[0].length).toBe(k.years);
        const reg = k.variants.regular;
        expect(reg.ending_wealths.length).toBe(k.runs);
        expect(reg.trajectories[0].length).toBe(k.years + 1);
      });

      it('det_rows has one row per year', () => {
        expect(loadPlanFixture<unknown[]>(plan.name, 'det_rows').length).toBe(plan.years);
      });
    });
  }

  it('has function grids', () => {
    for (const f of ['tax', 'misc', 'cpi', 'constants']) {
      expect(loadFixture('functions', `${f}.json`)).toBeTruthy();
    }
  });
});
