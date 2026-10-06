// Seeded random numbers and correlated per-path returns (generate_correlated_returns
// in core/runs.py, streamed one path at a time).
//
// Every path gets its own generator, seeded from (seed, pathIndex). Results therefore
// don't depend on how paths are split across workers, and re-running with the same seed
// reproduces the same paths. The goal-seek search relies on that for common random
// numbers, as the Python version does by reusing its return matrices.
import { ASSET_CLASS_CHOLESKY, ASSET_CLASS_CORRELATION, inferAssetAllocation } from './constants';
import type { SimInputs } from './inputs';
import type { PathReturns } from './montecarlo';
import { type Dict, get, pyFloat } from './py';

/** splitmix32 step, used to expand seeds into generator state. */
function splitmix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  let z = x;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** xoshiro128** with a Box-Muller standard-normal sampler. */
export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private spare = 0;
  private hasSpare = false;

  constructor(seed = 0, stream = 0) {
    this.reseed(seed, stream);
  }

  /** Reset to the stream identified by (seed, stream), e.g. (job seed, path index). */
  reseed(seed: number, stream: number): void {
    let x = splitmix32((seed >>> 0) ^ 0x6a09e667);
    x = splitmix32(x ^ Math.imul(stream >>> 0, 0x9e3779b1));
    x = splitmix32(x ^ Math.floor(stream / 4294967296));
    this.s0 = x = splitmix32(x);
    this.s1 = x = splitmix32(x);
    this.s2 = x = splitmix32(x);
    this.s3 = splitmix32(x);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
    this.hasSpare = false;
  }

  /** Next 32-bit unsigned integer. */
  nextU32(): number {
    const s0 = this.s0;
    const s1 = this.s1;
    const s2 = this.s2;
    const s3 = this.s3;
    const r = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    this.s2 = s2 ^ s0;
    this.s3 = s3 ^ s1;
    this.s1 = s1 ^ this.s2;
    this.s0 = s0 ^ this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return r;
  }

  /** Uniform double in [0, 1) with 53 bits of randomness. */
  nextDouble(): number {
    const hi = this.nextU32() >>> 5; // 27 bits
    const lo = this.nextU32() >>> 6; // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  /** Standard normal (Box-Muller; the second value of each pair is cached). */
  normal(): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }
    let u = 0;
    while (u === 0) u = this.nextDouble();
    const v = this.nextDouble();
    const r = Math.sqrt(-2.0 * Math.log(u));
    const theta = 2.0 * Math.PI * v;
    this.spare = r * Math.sin(theta);
    this.hasSpare = true;
    return r * Math.cos(theta);
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * One bucket's return model: mean m and sigma s (as fractions) and its stock/bond/cash
 * weights scaled so the blended factor has unit variance. s === 0 means a constant m.
 */
export interface BucketModel {
  m: number;
  s: number;
  w0: number;
  w1: number;
  w2: number;
}

function bucketModel(data: Dict, defaultMean: number, defaultStd: number): BucketModel {
  const mPct = pyFloat(get(data, 'return_mean', defaultMean));
  const sPct = pyFloat(get(data, 'return_std', defaultStd));
  const m = mPct / 100.0;
  const s = sPct / 100.0;
  if (s === 0.0) return { m, s, w0: 0, w1: 0, w2: 0 };
  const [stock, bond, cash] = inferAssetAllocation(mPct);
  const w = [stock / 100.0, bond / 100.0, cash / 100.0];
  let varW = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) varW += w[i] * ASSET_CLASS_CORRELATION[i][j] * w[j];
  const k = 1 / Math.sqrt(varW);
  return { m, s, w0: w[0] * k, w1: w[1] * k, w2: w[2] * k };
}

/** Return models for the six buckets, with the same defaults and spouse fallbacks as Python. */
export interface ReturnModels {
  preUser: BucketModel;
  preSpouse: BucketModel;
  roth: BucketModel;
  taxable: BucketModel;
  hsaUser: BucketModel;
  hsaSpouse: BucketModel;
}

export function returnModels(inputs: SimInputs): ReturnModels {
  const married = inputs.is_married;
  return {
    preUser: bucketModel(inputs.pretax_data, 6.0, 10.0),
    preSpouse: bucketModel(married ? inputs.spouse_pretax_data : inputs.pretax_data, 6.0, 10.0),
    roth: bucketModel(inputs.roth_data, 6.0, 10.0),
    taxable: bucketModel(inputs.taxable_data, 6.0, 8.0),
    hsaUser: bucketModel(inputs.hsa_data, 6.0, 8.0),
    hsaSpouse: bucketModel(married ? inputs.spouse_hsa_data : inputs.hsa_data, 6.0, 8.0),
  };
}

/** Per-path return buffers (one Float64Array of length `years` per bucket). */
export interface PathBuffers extends PathReturns {
  preUser: Float64Array;
  preSpouse: Float64Array;
  roth: Float64Array;
  taxable: Float64Array;
  hsaUser: Float64Array;
  hsaSpouse: Float64Array;
}

export function pathBuffers(years: number): PathBuffers {
  const z = () => new Float64Array(years);
  return { preUser: z(), preSpouse: z(), roth: z(), taxable: z(), hsaUser: z(), hsaSpouse: z() };
}

const L = ASSET_CLASS_CHOLESKY;
const L10 = L[1][0];
const L11 = L[1][1];
const L20 = L[2][0];
const L21 = L[2][1];
const L22 = L[2][2];
const L00 = L[0][0];

function fill(out: Float64Array, b: BucketModel, t: number, zs: number, zb: number, zc: number) {
  out[t] = b.s === 0.0 ? b.m : b.m + b.s * (b.w0 * zs + b.w1 * zb + b.w2 * zc);
}

/**
 * Fill `out` with one path's correlated returns: three independent normals per year,
 * combined by the Cholesky factor into stock/bond/cash factors shared by all buckets.
 */
export function generatePathReturns(models: ReturnModels, years: number, rng: Rng, out: PathBuffers): void {
  for (let t = 0; t < years; t++) {
    const e0 = rng.normal();
    const e1 = rng.normal();
    const e2 = rng.normal();
    const zs = L00 * e0;
    const zb = L10 * e0 + L11 * e1;
    const zc = L20 * e0 + L21 * e1 + L22 * e2;
    fill(out.preUser, models.preUser, t, zs, zb, zc);
    fill(out.preSpouse, models.preSpouse, t, zs, zb, zc);
    fill(out.roth, models.roth, t, zs, zb, zc);
    fill(out.taxable, models.taxable, t, zs, zb, zc);
    fill(out.hsaUser, models.hsaUser, t, zs, zb, zc);
    fill(out.hsaSpouse, models.hsaSpouse, t, zs, zb, zc);
  }
}
