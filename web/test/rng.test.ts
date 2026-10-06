import { describe, expect, it } from 'vitest';
import { ASSET_CLASS_CORRELATION, inferAssetAllocation } from '../src/lib/engine/constants';
import { extractSimInputs } from '../src/lib/engine/inputs';
import { generatePathReturns, pathBuffers, Rng, returnModels } from '../src/lib/engine/rng';
import { loadPlanFixture } from './fixtures';

describe('Rng', () => {
  it('is deterministic per (seed, stream) and streams differ', () => {
    const a = new Rng(42, 7);
    const b = new Rng(42, 7);
    const c = new Rng(42, 8);
    const sa = Array.from({ length: 8 }, () => a.nextU32());
    expect(Array.from({ length: 8 }, () => b.nextU32())).toEqual(sa);
    expect(Array.from({ length: 8 }, () => c.nextU32())).not.toEqual(sa);
    a.reseed(42, 7);
    expect(a.nextU32()).toBe(sa[0]);
  });

  it('nextDouble is in [0,1) with mean 1/2', () => {
    const r = new Rng(1, 0);
    let s = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const u = r.nextDouble();
      expect(u >= 0 && u < 1).toBe(true);
      s += u;
    }
    expect(Math.abs(s / n - 0.5)).toBeLessThan(4 * Math.sqrt(1 / 12 / n));
  });

  it('normal() has mean 0, variance 1, and normal tails', () => {
    const r = new Rng(2, 0);
    const n = 1_000_000;
    let s = 0;
    let s2 = 0;
    let tail = 0;
    for (let i = 0; i < n; i++) {
      const z = r.normal();
      s += z;
      s2 += z * z;
      if (Math.abs(z) > 1.96) tail++;
    }
    expect(Math.abs(s / n)).toBeLessThan(4 / Math.sqrt(n));
    expect(Math.abs(s2 / n - 1)).toBeLessThan(4 * Math.sqrt(2 / n));
    expect(Math.abs(tail / n - 0.05)).toBeLessThan(4 * Math.sqrt(0.05 * 0.95 / n));
  });
});

describe('correlated path returns', () => {
  it('match each bucket mean/sigma and the implied cross-bucket correlation', () => {
    const inputs = extractSimInputs(loadPlanFixture('sept27', 'imported').plan);
    const models = returnModels(inputs);
    const years = 10;
    const n = 20_000;
    const buf = pathBuffers(years);
    const rng = new Rng();
    const keys = ['preUser', 'roth', 'taxable', 'hsaUser'] as const;
    const sums = keys.map(() => 0);
    const sq = keys.map(() => 0);
    let cross = 0;
    for (let i = 0; i < n; i++) {
      rng.reseed(99, i);
      generatePathReturns(models, years, rng, buf);
      for (let t = 0; t < years; t++) {
        keys.forEach((k, j) => {
          sums[j] += buf[k][t];
          sq[j] += buf[k][t] ** 2;
        });
        cross += (buf.preUser[t] - models.preUser.m) * (buf.taxable[t] - models.taxable.m);
      }
    }
    const N = n * years;
    keys.forEach((k, j) => {
      const { m, s } = models[k];
      const mean = sums[j] / N;
      const sd = Math.sqrt(sq[j] / N - mean * mean);
      expect(Math.abs(mean - m), `${k} mean`).toBeLessThan(4 * s / Math.sqrt(N) + 1e-12);
      expect(Math.abs(sd - s), `${k} sd`).toBeLessThan(0.02 * s + 1e-12);
    });
    // Expected correlation between two buckets: w_a' C w_b / sqrt(var_a var_b)
    const w = (mean: number) => inferAssetAllocation(mean * 100).map((x) => x / 100);
    const wa = w(models.preUser.m);
    const wb = w(models.taxable.m);
    const q = (x: number[], y: number[]) => {
      let v = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) v += x[i] * ASSET_CLASS_CORRELATION[i][j] * y[j];
      return v;
    };
    const rho = q(wa, wb) / Math.sqrt(q(wa, wa) * q(wb, wb));
    const got = cross / N / (models.preUser.s * models.taxable.s);
    expect(Math.abs(got - rho)).toBeLessThan(0.02);
  });
});
