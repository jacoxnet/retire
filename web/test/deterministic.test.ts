import { describe, expect, it } from 'vitest';
import { runDeterministic } from '../src/lib/engine/deterministic';
import { expectPlanFixture, fixtureIndex, loadPlanFixture } from './fixtures';

describe('run_deterministic', () => {
  for (const { name } of fixtureIndex().plans) {
    it(`${name}: det_rows match`, () => {
      const { plan } = loadPlanFixture(name, 'imported');
      expectPlanFixture(runDeterministic(plan), name, 'det_rows');
    });
  }
});
