// Messages between the pool and Monte Carlo workers, and the worker-side handler.
// Kept free of Worker globals so tests can drive it in-process.
import { type ChunkResult, type McJob, type PreparedJob, prepareJob, runChunk } from '../engine/mc';

export type ToWorker =
  | { type: 'job'; jobId: number; job: McJob }
  | { type: 'chunk'; jobId: number; chunkId: number; start: number; count: number };

export type FromWorker =
  | { type: 'progress'; jobId: number; chunkId: number; done: number }
  | { type: 'result'; jobId: number; chunkId: number; result: ChunkResult }
  | { type: 'error'; jobId: number; chunkId: number; message: string };

/** Buffers in a chunk result that can be transferred instead of copied. */
export function transferables(r: ChunkResult): ArrayBuffer[] {
  return [r.endings, r.traj, r.spaghetti].filter((a) => a !== null).map((a) => a!.buffer as ArrayBuffer);
}

/** Worker-side state machine: caches the prepared job and runs chunks for it. */
export function createHandler(post: (msg: FromWorker, transfer?: ArrayBuffer[]) => void) {
  let jobId = -1;
  let job: McJob | null = null;
  let prepared: PreparedJob | null = null;
  return (msg: ToWorker) => {
    if (msg.type === 'job') {
      jobId = msg.jobId;
      job = msg.job;
      prepared = null;
      return;
    }
    try {
      if (msg.jobId !== jobId || !job) throw new Error(`chunk for unknown job ${msg.jobId}`);
      prepared ??= prepareJob(job);
      const result = runChunk(prepared, job, msg.start, msg.count, (done) =>
        post({ type: 'progress', jobId: msg.jobId, chunkId: msg.chunkId, done }));
      post({ type: 'result', jobId: msg.jobId, chunkId: msg.chunkId, result }, transferables(result));
    } catch (e) {
      post({ type: 'error', jobId: msg.jobId, chunkId: msg.chunkId, message: e instanceof Error ? e.message : String(e) });
    }
  };
}
