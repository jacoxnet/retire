// Monte Carlo orchestration: generate_runs and binary_search (core/runs.py), streamed.
//
// A job is split into chunks of path indices. Each chunk generates its paths' returns
// on the fly (rng.ts), runs the kernel (montecarlo.ts) and keeps only what the results
// need: every ending wealth (8 bytes/run), the success count, Float32 trajectories for
// the first `trajCap` paths (percentile bands) and full trajectories for the first
// `spaghetti` paths. Chunks run in-process (localRunner) or on the worker pool.
import { crisisSetup, type CrisisSetup, type StressSpec } from './crisis';
import { meanReturns, runSimulationPath } from './deterministic';
import { extractSimInputs, prepareNumbaInputs, type SimInputs } from './inputs';
import { type KernelParams, kernelParams, simulatePath } from './montecarlo';
import { type Dict, get } from './py';
import { generatePathReturns, pathBuffers, Rng, returnModels, type ReturnModels } from './rng';

/** Trajectory percentiles are exact up to this many runs, sampled from the first paths beyond it. */
export const DEFAULT_TRAJ_CAP = 100_000;
export const DEFAULT_SPAGHETTI = 500;

export interface Collect {
  endings: boolean;
  trajCap: number;
  spaghetti: number;
}

/** A serializable description of a Monte Carlo job (sent to workers as-is). */
export interface McJob {
  plan: Dict;
  seed: number;
  testSpending: number | null;
  stress: StressSpec | null;
  collect: Collect;
}

export interface PreparedJob {
  inputs: SimInputs;
  params: KernelParams;
  models: ReturnModels;
  years: number;
  crisis: CrisisSetup | null;
}

export function prepareJob(job: McJob): PreparedJob {
  const inputs = extractSimInputs(job.plan);
  const crisis = job.stress ? crisisSetup(inputs, job.stress) : null;
  const nb = prepareNumbaInputs(inputs, job.testSpending, crisis ? crisis.inflationRates : null);
  return { inputs, params: kernelParams(inputs, nb), models: returnModels(inputs), years: inputs.total_years, crisis };
}

export interface ChunkResult {
  start: number;
  count: number;
  successes: number;
  /** Terminal estates for paths start..start+count-1 (when collect.endings). */
  endings: Float64Array | null;
  /** Float32 rows of length years+1 for paths start..start+trajRows-1. */
  traj: Float32Array | null;
  trajRows: number;
  /** Float64 rows for paths start..start+spaghettiRows-1. */
  spaghetti: Float64Array | null;
  spaghettiRows: number;
}

const BUCKETS = ['preUser', 'preSpouse', 'roth', 'taxable', 'hsaUser', 'hsaSpouse'] as const;

/** Run paths [start, start + count). onProgress receives the number of paths done in this chunk. */
export function runChunk(
  prep: PreparedJob, job: McJob, start: number, count: number,
  onProgress?: (done: number) => void,
): ChunkResult {
  const { years, params, models, crisis } = prep;
  const { collect } = job;
  const width = years + 1;
  const trajRows = Math.max(0, Math.min(count, collect.trajCap - start));
  const spaghettiRows = Math.max(0, Math.min(count, collect.spaghetti - start));
  const endings = collect.endings ? new Float64Array(count) : null;
  const traj = trajRows > 0 ? new Float32Array(trajRows * width) : null;
  const spaghetti = spaghettiRows > 0 ? new Float64Array(spaghettiRows * width) : null;
  const rowBuf = new Float64Array(width);
  const buf = pathBuffers(years);
  const rng = new Rng();
  let successes = 0;
  const progressEvery = 2000;

  for (let k = 0; k < count; k++) {
    const idx = start + k;
    rng.reseed(job.seed, idx);
    generatePathReturns(models, years, rng, buf);
    if (crisis) {
      for (let t = crisis.crisisStartT; t < crisis.crisisEndT; t++) {
        for (let b = 0; b < 6; b++) buf[BUCKETS[b]][t] = crisis.overrides[t * 6 + b];
      }
    }
    const wantRow = k < trajRows || k < spaghettiRows;
    const res = simulatePath(params, buf, wantRow ? rowBuf : null);
    if (endings) endings[k] = res.terminalEstate;
    successes += res.success;
    if (k < trajRows) traj!.set(rowBuf, k * width);
    if (k < spaghettiRows) spaghetti!.set(rowBuf, k * width);
    if (onProgress && (k + 1) % progressEvery === 0) onProgress(k + 1);
  }
  onProgress?.(count);
  return { start, count, successes, endings, traj, trajRows, spaghetti, spaghettiRows };
}

/** Runs a job's chunks somewhere (in-process, or on the worker pool). */
export type ChunkRunner = (
  job: McJob, ranges: Array<[number, number]>, onProgress?: (done: number) => void,
) => Promise<ChunkResult[]>;

/** Split [0, runs) into n near-equal contiguous ranges. */
export function splitRanges(runs: number, n: number): Array<[number, number]> {
  const parts = Math.max(1, Math.min(n, runs));
  const out: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const count = Math.floor(runs / parts) + (i < runs % parts ? 1 : 0);
    out.push([start, count]);
    start += count;
  }
  return out;
}

/** Runs chunks one after another on the current thread (tests, small jobs, worker fallback). */
export const localRunner: ChunkRunner = async (job, ranges, onProgress) => {
  const prep = prepareJob(job);
  let before = 0;
  const out: ChunkResult[] = [];
  for (const [s, c] of ranges) {
    out.push(runChunk(prep, job, s, c, onProgress ? (d) => onProgress(before + d) : undefined));
    before += c;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Statistics

/** numpy.percentile with the default 'linear' method, on a sorted array. */
export function percentileSorted(a: ArrayLike<number>, q: number): number {
  const n = a.length;
  if (n === 0) return NaN;
  const pos = ((n - 1) * q) / 100;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, n - 1);
  const f = pos - lo;
  const x = a[lo];
  const y = a[hi];
  // numpy's _lerp: symmetric form for accuracy near the upper end
  return f >= 0.5 ? y - (y - x) * (1 - f) : x + (y - x) * f;
}

export interface McStats {
  run_mean: number;
  run_median: number;
  run_10: number;
  run_25: number;
  run_min: number;
  run_max: number;
  run_success: number;
  mc_p10: number[];
  mc_p50: number[];
  mc_p90: number[];
  mc_spaghetti_paths: number[][];
}

/** Combine chunk results into generate_runs' statistics. */
export function summarize(chunks: ChunkResult[], runs: number, years: number): McStats {
  const sorted = [...chunks].sort((a, b) => a.start - b.start);
  const width = years + 1;

  const endings = new Float64Array(runs);
  let successes = 0;
  let sum = 0;
  for (const c of sorted) {
    successes += c.successes;
    if (c.endings) {
      endings.set(c.endings, c.start);
      for (let i = 0; i < c.endings.length; i++) sum += c.endings[i];
    }
  }
  endings.sort();

  const kept = sorted.reduce((n, c) => n + c.trajRows, 0);
  const col = new Float64Array(kept);
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (let t = 0; t < width; t++) {
    let j = 0;
    for (const c of sorted) for (let r = 0; r < c.trajRows; r++) col[j++] = c.traj![r * width + t];
    col.sort();
    p10.push(percentileSorted(col, 10));
    p50.push(percentileSorted(col, 50));
    p90.push(percentileSorted(col, 90));
  }

  const spaghetti: number[][] = [];
  for (const c of sorted) {
    for (let r = 0; r < c.spaghettiRows; r++) spaghetti.push(Array.from(c.spaghetti!.subarray(r * width, (r + 1) * width)));
  }

  return {
    run_mean: sum / runs,
    run_median: percentileSorted(endings, 50),
    run_10: percentileSorted(endings, 10),
    run_25: percentileSorted(endings, 25),
    run_min: endings[0],
    run_max: endings[runs - 1],
    run_success: (successes / runs) * 100.0,
    mc_p10: p10,
    mc_p50: p50,
    mc_p90: p90,
    mc_spaghetti_paths: spaghetti,
  };
}

// ---------------------------------------------------------------------------
// generate_runs / binary_search

export interface RunOptions {
  /** Seed for the path generators; a random seed when omitted. */
  seed?: number;
  runner?: ChunkRunner;
  /** How many chunks to split the runs into (defaults to 1 for localRunner). */
  chunks?: number;
  /** Paths done so far across the whole operation, and the total. */
  onProgress?: (done: number, total: number) => void;
  trajCap?: number;
}

export const randomSeed = () => (Math.random() * 4294967296) >>> 0;

/** generate_runs: Monte Carlo statistics for the plan (optionally at a test spending level). */
export async function generateRuns(
  plan: Dict, opts: RunOptions & { testSpending?: number | null; stress?: StressSpec | null } = {},
): Promise<McStats> {
  const inputs = extractSimInputs(plan);
  const runs = inputs.runs;
  const job: McJob = {
    plan,
    seed: opts.seed ?? randomSeed(),
    testSpending: opts.testSpending ?? null,
    stress: opts.stress ?? null,
    collect: { endings: true, trajCap: opts.trajCap ?? DEFAULT_TRAJ_CAP, spaghetti: DEFAULT_SPAGHETTI },
  };
  const runner = opts.runner ?? localRunner;
  const chunks = await runner(job, splitRanges(runs, opts.chunks ?? 1),
    opts.onProgress ? (d) => opts.onProgress!(d, runs) : undefined);
  return summarize(chunks, runs, inputs.total_years);
}

export interface GoalSeekResult {
  achieved_spending: number;
  /** Percent. */
  achieved_success_rate: number;
  searches: number;
  /** First-year spending achieved on the mean-return path. */
  achieved_spending_y1: number;
}

/**
 * binary_search: the highest desired spending whose success rate meets the target.
 * Every iteration reuses the same seed, so all candidates see the same paths.
 */
export async function binarySearch(plan: Dict, opts: RunOptions = {}): Promise<GoalSeekResult> {
  const inputs = extractSimInputs(plan);
  const runs = inputs.runs;
  const years = inputs.total_years;
  const seed = opts.seed ?? randomSeed();
  const runner = opts.runner ?? localRunner;
  const ranges = splitRanges(runs, opts.chunks ?? 1);
  const maxSearches = 25;

  const bal = (d: Dict) => get(d, 'present_balance', 0.0);
  const totalWealth = bal(inputs.pretax_data) + bal(inputs.spouse_pretax_data) + bal(inputs.roth_data) +
    bal(inputs.taxable_data) + bal(inputs.hsa_data) + bal(inputs.spouse_hsa_data);

  let lower = 0.0;
  let upper = Math.max(1000000.0, totalWealth);
  const target = inputs.target_success_rate / 100.0;
  let bestMid = 0.0;
  let bestRate = 0.0;
  let rate = 0.0;
  let searches = 0;

  while (upper - lower > 1.0 && searches < maxSearches) {
    searches += 1;
    const mid = (upper + lower) / 2.0;
    const job: McJob = { plan, seed, testSpending: mid, stress: null, collect: { endings: false, trajCap: 0, spaghetti: 0 } };
    const done = (searches - 1) * runs;
    const chunks = await runner(job, ranges,
      opts.onProgress ? (d) => opts.onProgress!(done + d, maxSearches * runs) : undefined);
    rate = chunks.reduce((n, c) => n + c.successes, 0) / runs;
    if (rate >= target) {
      bestMid = mid;
      bestRate = rate;
      lower = mid;
    } else {
      upper = mid;
    }
  }

  const solved = bestMid > 0 ? bestMid : lower;
  const solvedRate = bestMid > 0 ? bestRate : rate;

  const m = meanReturns(inputs);
  const series = (v: number) => new Array<number>(years).fill(v);
  const det = runSimulationPath(inputs, series(m.pretax), series(m.roth), series(m.taxable), series(m.hsa),
    solved, series(m.pretaxSpouse), series(m.hsaSpouse));
  const y1 = det[0];

  return {
    achieved_spending: solved,
    achieved_success_rate: solvedRate * 100.0,
    searches,
    achieved_spending_y1: y1.withdrawals.total + y1.income_sources_total - y1.taxes_paid,
  };
}
