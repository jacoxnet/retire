// The seeded historical stress test (default scenario) for every plan: exact snapshot
// in stress.json, as the Results page's stress tab starts.
import { describe, expect, it } from 'vitest';
import { runHistoricalStressTest } from '../src/lib/engine/stress';
import { expectPlanFixture, fixtureIndex, loadPlanFixture } from './fixtures';

const SEED = fixtureIndex().generated_with.mc_seed;
const CHUNKS = 3;

describe('historical stress test (stress.json, default scenario)', () => {
  for (const { name } of fixtureIndex().plans) {
    it(name, async () => {
      const { plan } = loadPlanFixture(name, 'imported');
      const { scenarios_list: _, ...ts } = await runHistoricalStressTest(plan, { seed: SEED, chunks: CHUNKS });
      expect(ts.scenario.key).toBe('2000_dotcom');
      expect(ts.crisis_length).toBe(ts.crisis_end_year - ts.crisis_start_year + 1);
      expectPlanFixture(ts, name, 'stress');
    }, 300_000);
  }

  it('rejects scenarios outside the historical data', async () => {
    const { plan } = loadPlanFixture('sept27', 'imported');
    // Unknown keys fall back to 2000_dotcom
    const ts = await runHistoricalStressTest(plan, { seed: 1, scenarioKey: 'nope', regularMcResults: { run_success: 0 } as any });
    expect(ts.scenario.key).toBe('2000_dotcom');
  }, 120_000);
});
