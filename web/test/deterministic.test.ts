import { describe, expect, it } from 'vitest';
import { runDeterministic } from '../src/lib/engine/deterministic';
import { deepClose, fixtureIndex, loadPlanFixture } from './fixtures';

describe('run_deterministic', () => {
  for (const { name } of fixtureIndex().plans) {
    it(`${name}: det_rows match`, () => {
      const { plan } = loadPlanFixture(name, 'imported');
      expect(deepClose(runDeterministic(plan), loadPlanFixture(name, 'det_rows'))).toBeNull();
    });
  }
});
