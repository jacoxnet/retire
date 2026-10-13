import { describe, expect, it } from 'vitest';
import { earliestRetirementSearch } from '../src/lib/engine/earliestRetirement';
import { localRunner } from '../src/lib/engine/mc';
import { loadPlanFixture } from './fixtures';

describe('earliestRetirementSearch', () => {
  it('single user: finds the minimum age meeting target success rate', async () => {
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    const smallPlan = { ...plan, runs: 1000, target_success_rate: 85.0 };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.achieved_user_ret_age).toBeGreaterThanOrEqual(smallPlan.user_age);
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(85.0);
    expect(res.searches).toBeLessThanOrEqual(10);
    expect(res.unreachable).toBe(false);
  });

  it('single user immediate retirement: succeeds at current age', async () => {
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    // 5% target success rate should succeed immediately
    const smallPlan = { ...plan, runs: 500, target_success_rate: 5.0 };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.immediate).toBe(true);
    expect(res.achieved_user_ret_age).toBe(smallPlan.user_age);
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(5.0);
  });

  it('single user unreachable: returns max age with unreachable flag', async () => {
    const { plan } = loadPlanFixture('early_suzie_plan', 'imported');
    // Desired spending 500k with 99% target is unreachable
    const smallPlan = { ...plan, runs: 500, desired_spending: 500000, target_success_rate: 99.0 };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.unreachable).toBe(true);
    expect(res.achieved_user_ret_age).toBe(80);
    expect(res.achieved_success_rate).toBeLessThan(99.0);
  });

  it('married simultaneous: both retire in the same calendar year', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const smallPlan = {
      ...plan,
      runs: 500,
      target_success_rate: 80.0,
      earliest_retirement_strategy: 'simultaneous',
    };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.strategy).toBe('simultaneous');
    expect(res.achieved_spouse_ret_age).toBeDefined();
    // Years to retirement must be equal
    const userYears = res.achieved_user_ret_age - smallPlan.user_age;
    const spouseYears = res.achieved_spouse_ret_age! - smallPlan.spouse_age;
    expect(userYears).toBe(spouseYears);
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(80.0);
  });

  it('married same_age: both retire at the exact same age', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const smallPlan = {
      ...plan,
      runs: 500,
      target_success_rate: 80.0,
      earliest_retirement_strategy: 'same_age',
    };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.strategy).toBe('same_age');
    expect(res.achieved_user_ret_age).toBe(res.achieved_spouse_ret_age);
    expect(res.achieved_user_ret_age).toBeGreaterThanOrEqual(Math.max(smallPlan.user_age, smallPlan.spouse_age));
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(80.0);
  });

  it('married solve_user: spouse age is kept fixed', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const smallPlan = {
      ...plan,
      runs: 500,
      target_success_rate: 80.0,
      spouse_retirement_age: 65,
      earliest_retirement_strategy: 'solve_user',
    };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.strategy).toBe('solve_user');
    expect(res.achieved_spouse_ret_age).toBe(65);
    expect(res.achieved_user_ret_age).toBeGreaterThanOrEqual(smallPlan.user_age);
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(80.0);
  });

  it('married solve_spouse: user age is kept fixed', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const smallPlan = {
      ...plan,
      runs: 500,
      target_success_rate: 70.0,
      user_retirement_age: 67,
      earliest_retirement_strategy: 'solve_spouse',
    };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.strategy).toBe('solve_spouse');
    expect(res.achieved_user_ret_age).toBe(67);
    expect(res.achieved_spouse_ret_age).toBeGreaterThanOrEqual(smallPlan.spouse_age);
    expect(res.achieved_success_rate).toBeGreaterThanOrEqual(70.0);
  });

  it('married frontier: produces valid non-increasing curve of retirement age pairs', async () => {
    const { plan } = loadPlanFixture('syn_spouse_first', 'imported');
    const smallPlan = {
      ...plan,
      runs: 500,
      target_success_rate: 80.0,
      earliest_retirement_strategy: 'simultaneous',
    };

    const res = await earliestRetirementSearch(smallPlan, { runner: localRunner, chunks: 1, seed: 42 });

    expect(res.frontier).toBeDefined();
    expect(res.frontier!.length).toBeGreaterThan(0);
    const selected = res.frontier!.find((p) => p.is_selected);
    expect(selected).toBeDefined();

    // When user works longer, spouse retirement age should be non-increasing
    for (let i = 1; i < res.frontier!.length; i++) {
      expect(res.frontier![i].user_ret_age).toBeGreaterThan(res.frontier![i - 1].user_ret_age);
      expect(res.frontier![i].spouse_ret_age).toBeLessThanOrEqual(res.frontier![i - 1].spouse_ret_age);
    }
  });
});
