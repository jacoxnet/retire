// Single-thread Monte Carlo benchmark (npm run bench). Writes bench/results-node.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { generateRuns } from '../src/lib/engine/mc';
import { loadPlanFixture } from '../test/fixtures';

it('generate_runs at 10k / 100k / 1M runs', async () => {
  const { plan } = loadPlanFixture('gemini_and_claude_plan', 'imported'); // 63 years, married
  const rows: Record<string, unknown>[] = [];
  for (const runs of [10_000, 100_000, 1_000_000]) {
    globalThis.gc?.();
    const heap0 = process.memoryUsage();
    let peakRss = heap0.rss;
    const timer = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 50);
    const t0 = performance.now();
    const stats = await generateRuns({ ...plan, runs }, { seed: 1 });
    const ms = performance.now() - t0;
    clearInterval(timer);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    rows.push({
      runs,
      seconds: +(ms / 1000).toFixed(2),
      pathsPerSec: Math.round(runs / (ms / 1000)),
      peakRssMB: Math.round(peakRss / 1e6),
      rssGrowthMB: Math.round((peakRss - heap0.rss) / 1e6),
      success: stats.run_success,
      median: Math.round(stats.run_median),
    });
  }
  writeFileSync(join(__dirname, 'results-node.json'), JSON.stringify(rows, null, 2) + '\n');
}, 1_800_000);
