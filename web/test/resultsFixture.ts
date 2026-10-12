import { resultsContext, type Results } from '../src/lib/app/results';
import { loadPlanFixture } from './fixtures';

/** The page's results for a fixture plan, from its det_rows, mc and stress fixtures. */
export function fixtureResults(name: string): Results {
  const { plan } = loadPlanFixture(name, 'imported');
  const mc = loadPlanFixture(name, 'mc');
  return resultsContext(plan, loadPlanFixture(name, 'det_rows'), mc.generate_runs,
    mc.goal_seeking ? mc.binary_search : null, loadPlanFixture(name, 'stress'));
}
