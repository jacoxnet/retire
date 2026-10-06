// Browser benchmark for the worker pool (run by bench/browser-bench.mjs).
import { generateRuns } from '../src/lib/engine/mc';
import { McPool } from '../src/lib/workers/pool';

declare global {
  interface Window { __bench?: unknown }
}

async function main() {
  const res = await fetch('/fixtures/plans/gemini_and_claude_plan/imported.json');
  const { plan } = await res.json();
  const pool = new McPool();
  const rows: Record<string, unknown>[] = [];
  for (const runs of [10_000, 100_000, 1_000_000]) {
    const t0 = performance.now();
    const stats = await generateRuns({ ...plan, runs }, { seed: 1, runner: pool.runner, chunks: pool.chunks });
    const s = (performance.now() - t0) / 1000;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    rows.push({
      runs, workers: pool.size, seconds: +s.toFixed(2), pathsPerSec: Math.round(runs / s),
      success: stats.run_success, median: Math.round(stats.run_median),
      mainHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null,
    });
  }
  pool.terminate();
  window.__bench = rows;
  document.getElementById('out')!.textContent = JSON.stringify(rows, null, 2);
}

main().catch((e) => {
  window.__bench = { error: String(e) };
});
