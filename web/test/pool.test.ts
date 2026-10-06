import { describe, expect, it } from 'vitest';
import { generateRuns, localRunner } from '../src/lib/engine/mc';
import { McPool, PoolTerminated, type WorkerLike } from '../src/lib/workers/pool';
import { createHandler, type FromWorker, type ToWorker } from '../src/lib/workers/protocol';
import { deepClose, loadPlanFixture } from './fixtures';

/** In-process stand-in for a Worker: messages are delivered asynchronously, like the real thing. */
function fakeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg: ToWorker) {
      setTimeout(() => handle(structuredClone(msg)), 0);
    },
    terminate() {},
  };
  const handle = createHandler((msg: FromWorker) => setTimeout(() => w.onmessage?.({ data: msg }), 0));
  return w;
}

describe('McPool', () => {
  it('gives the same statistics as the local runner', async () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    const small = { ...plan, runs: 3000 };
    const pool = new McPool(3, fakeWorker);
    const seen: number[] = [];
    const viaPool = await generateRuns(small, { seed: 5, runner: pool.runner, chunks: pool.chunks, onProgress: (d) => seen.push(d) });
    const local = await generateRuns(small, { seed: 5, runner: localRunner });
    expect(deepClose(viaPool, local, 0)).toBeNull();
    expect(seen.at(-1)).toBe(3000);
    pool.terminate();
  }, 60_000);

  it('rejects when a worker fails, and can run again afterwards', async () => {
    const pool = new McPool(2, fakeWorker);
    const job = { plan: { user_age: 'x' }, seed: 1, testSpending: null, stress: null, collect: { endings: true, trajCap: 0, spaghetti: 0 } };
    await expect(pool.runner(job, [[0, 5], [5, 5]])).rejects.toThrow(/invalid literal for int/);
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    const stats = await generateRuns({ ...plan, runs: 200 }, { seed: 1, runner: pool.runner, chunks: 4 });
    expect(stats.run_success).toBe(100);
    pool.terminate();
  });

  it('rejects a running job when terminated', async () => {
    const pool = new McPool(2, fakeWorker);
    const { plan } = loadPlanFixture('sept27', 'imported');
    const running = generateRuns({ ...plan, runs: 50_000 }, { seed: 1, runner: pool.runner, chunks: pool.chunks });
    pool.terminate();
    await expect(running).rejects.toBeInstanceOf(PoolTerminated);
  });
});
