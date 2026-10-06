// Monte Carlo web worker entry point. Created by pool.ts via
// new Worker(new URL('./mcWorker.ts', import.meta.url), { type: 'module' }).
import { createHandler, type ToWorker } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const handle = createHandler((msg, transfer) => ctx.postMessage(msg, transfer ?? []));
ctx.onmessage = (e) => handle(e.data);
