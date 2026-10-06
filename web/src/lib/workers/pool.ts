// Spreads Monte Carlo chunks over a pool of workers. pool.runner is a ChunkRunner, so
// generateRuns / binarySearch / runHistoricalStressTest run on it unchanged:
//   const pool = new McPool();
//   const stats = await generateRuns(plan, { runner: pool.runner, chunks: pool.chunks });
import type { ChunkResult, ChunkRunner, McJob } from '../engine/mc';
import type { FromWorker, ToWorker } from './protocol';

/** The part of the Worker interface the pool uses (lets tests supply an in-process fake). */
export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror?: ((e: unknown) => void) | null;
  terminate(): void;
}

export const createBrowserWorker = (): WorkerLike =>
  new Worker(new URL('./mcWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const defaultSize = () =>
  Math.max(1, Math.min(16, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4));

export class McPool {
  readonly size: number;
  /** Suggested chunk count: several per worker so faster workers pick up more. */
  readonly chunks: number;
  private workers: WorkerLike[];
  private nextJobId = 1;
  private busy = false;

  constructor(size = defaultSize(), factory: () => WorkerLike = createBrowserWorker) {
    this.size = size;
    this.chunks = size * 4;
    this.workers = Array.from({ length: size }, factory);
  }

  readonly runner: ChunkRunner = (job, ranges, onProgress) => this.run(job, ranges, onProgress);

  private run(job: McJob, ranges: Array<[number, number]>, onProgress?: (done: number) => void): Promise<ChunkResult[]> {
    if (this.busy) return Promise.reject(new Error('McPool is already running a job'));
    this.busy = true;
    const jobId = this.nextJobId++;
    const results: ChunkResult[] = new Array(ranges.length);
    const progress = new Array<number>(ranges.length).fill(0);
    let next = 0;
    let finished = 0;

    return new Promise<ChunkResult[]>((resolve, reject) => {
      const fail = (err: Error) => {
        this.busy = false;
        for (const w of this.workers) w.onmessage = null;
        reject(err);
      };
      const dispatch = (w: WorkerLike) => {
        if (next >= ranges.length) return;
        const chunkId = next++;
        const [start, count] = ranges[chunkId];
        w.postMessage({ type: 'chunk', jobId, chunkId, start, count });
      };
      for (const w of this.workers) {
        w.onmessage = ({ data }) => {
          if (data.jobId !== jobId) return;
          if (data.type === 'progress') {
            progress[data.chunkId] = data.done;
            onProgress?.(progress.reduce((a, b) => a + b, 0));
          } else if (data.type === 'error') {
            fail(new Error(data.message));
          } else {
            results[data.chunkId] = data.result;
            progress[data.chunkId] = data.result.count;
            finished++;
            if (finished === ranges.length) {
              this.busy = false;
              resolve(results);
            } else {
              dispatch(w);
            }
          }
        };
        w.onerror = (e) => fail(e instanceof Error ? e : new Error('worker error'));
        w.postMessage({ type: 'job', jobId, job });
      }
      if (ranges.length === 0) {
        this.busy = false;
        resolve([]);
        return;
      }
      for (const w of this.workers) dispatch(w);
    });
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}
