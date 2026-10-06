import { describe, expect, it } from 'vitest';
import { getDefaultData } from '../../src/lib/plan/defaults';
import { applyModeChange } from '../../src/lib/plan/modeChange';
import { deepClose, loadFixture } from '../fixtures';

describe('apply_mode_change grid', () => {
  const cases = loadFixture<any[]>('functions', 'mode_change.json');
  cases.forEach((c, i) => {
    it(`case ${i}: ${JSON.stringify(c.post)}`, () => {
      const plan = structuredClone(c.plan);
      const notes = applyModeChange(plan, c.post);
      expect(notes.map((n) => [n.level, n.message])).toEqual(c.messages);
      expect(deepClose(plan, c.result, 0)).toBeNull();
    });
  });
});

// Ports of the change_mode tests in core/tests.py
describe('change_mode tests', () => {
  it('switches to goal seeking and back, changing runs', () => {
    const plan = getDefaultData();
    applyModeChange(plan, { simulation_type: 'goal_seeking', target_success_rate: '85.0' });
    expect(plan.goal_seeking).toBe(true);
    expect(plan.target_success_rate).toBe(85.0);
    applyModeChange(plan, { simulation_type: 'regular', runs: '20000' });
    expect(plan.goal_seeking).toBe(false);
    expect(plan.runs).toBe(20000);
  });

  it('clamps an invalid target success rate with a message', () => {
    const plan = getDefaultData();
    const notes = applyModeChange(plan, { simulation_type: 'goal_seeking', target_success_rate: '150.0' });
    expect(notes.map((n) => n.message)).toContain('Target Success Rate must be between 1% and 99% for Maximum Spending simulation.');
    expect(plan.target_success_rate).toBe(99.0);
  });

  it('applies stepper inputs', () => {
    const plan = getDefaultData();
    applyModeChange(plan, { simulation_type: 'regular', desired_spending: '48000', inflation_rate: '3.2',
      user_age_death: '95', pretax_return_mean: '7.5', roth_return_mean: '8.0' });
    expect(plan.desired_spending).toBe(48000.0);
    expect(plan.inflation_rate).toBe(3.2);
    expect(plan.user_age_death).toBe(95);
    expect(plan.pretax_assets!.return_mean).toBe(7.5);
    expect(plan.roth_assets!.return_mean).toBe(8.0);
  });

  it('updates the spouse HSA return', () => {
    const plan: any = { is_married: true, user_age: 60, spouse_age: 58,
      spouse_hsa_assets: { present_balance: 15000.0, return_mean: 5.0, return_std: 8.0 } };
    applyModeChange(plan, { simulation_type: 'regular', spouse_hsa_return_mean: '7.5' });
    expect(plan.spouse_hsa_assets.return_mean).toBe(7.5);
  });
});
