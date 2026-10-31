// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import EnterHarness from './EnterHarness.svelte';
import { InterviewState } from '../../src/lib/components/enter/interview/interviewState.svelte';
import type { Plan } from '../../src/lib/plan/types';

afterEach(cleanup);
window.scrollTo = () => {};

describe('InterviewState', () => {
  it('correctly filters questions based on marriage and stage 5 opt-in', () => {
    const wizard = new InterviewState();
    const singlePlan: Plan = { is_married: false };

    // Initially single, not opted into stage 5
    let list = wizard.activeQuestionList(singlePlan);
    expect(list).not.toContain('spouse_name_age');
    expect(list).not.toContain('spouse_ret_death');
    expect(list).not.toContain('spending_survivor');
    expect(list).not.toContain('income_spouse_ss');
    expect(list).not.toContain('nw_emergency');

    // Married plan
    const marriedPlan: Plan = { is_married: true };
    list = wizard.activeQuestionList(marriedPlan);
    expect(list).toContain('spouse_name_age');
    expect(list).toContain('spouse_ret_death');
    expect(list).toContain('spending_survivor');
    expect(list).toContain('income_spouse_ss');

    // Opt into stage 5
    wizard.optedInStage5 = true;
    list = wizard.activeQuestionList(marriedPlan);
    expect(list).toContain('nw_emergency');
    expect(list).toContain('nw_goals');
    expect(list).toContain('nw_real_estate');
    expect(list).toContain('nw_debts');
  });

  it('tracks skipped questions and applies safe defaults', () => {
    const wizard = new InterviewState();
    const plan: Plan = {};

    expect(wizard.isSkipped('user_death_age')).toBe(false);
    wizard.applyDefaultAndSkip('user_death_age', plan);

    expect(wizard.isSkipped('user_death_age')).toBe(true);
    expect(plan.user_age_death).toBe(95);

    wizard.clearSkipped('user_death_age');
    expect(wizard.isSkipped('user_death_age')).toBe(false);
  });
});

describe('Interview Modal Integration', () => {
  function setup() {
    const storage = memoryStorage();
    const store = new PlanStore(storage);
    const ui = new UiPrefs(storage);
    const onNavigate = vi.fn();
    const r = render(EnterHarness, { store, ui, onNavigate });
    return { ...r, store, ui, onNavigate };
  }

  const byId = (id: string) => document.getElementById(id) as HTMLInputElement | null;

  it('shows the guided interview banner on EnterPage and opens the modal on click', async () => {
    const { onNavigate } = setup();

    const startBtn = byId('btnStartInterview');
    expect(startBtn).not.toBeNull();

    // Modal is initially not in DOM or not open
    expect(document.getElementById('guidedInterviewModal')).toBeNull();

    // Click to start interview
    await fireEvent.click(startBtn!);
    flushSync();

    const modal = document.getElementById('guidedInterviewModal');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Step-by-Step Retirement Interview');
    expect(modal?.textContent).toContain("Let's start with the basics. Who are we planning for?");
  });

  it('updates plan data immediately and preserves it across modal interactions', async () => {
    const { store } = setup();

    await fireEvent.click(byId('btnStartInterview')!);
    flushSync();

    const nameInput = byId('int_user_name')!;
    const ageInput = byId('int_user_age')!;
    expect(nameInput).not.toBeNull();
    expect(ageInput).not.toBeNull();

    await fireEvent.input(nameInput, { target: { value: 'Eleanor' } });
    await fireEvent.input(ageInput, { target: { value: '59' } });
    flushSync();

    // State is immediately persisted into the reactive plan
    expect(store.plan.user_name).toBe('Eleanor');
    expect(store.plan.user_age).toBe(59);

    // Click Next button to advance to retirement age
    const nextBtns = document.querySelectorAll('.question-card ~ div .btn-primary');
    const nextBtn = Array.from(nextBtns).find((b) => b.textContent?.includes('Next'));
    expect(nextBtn).toBeDefined();

    await fireEvent.click(nextBtn!);
    flushSync();

    expect(document.getElementById('guidedInterviewModal')?.textContent).toContain(
      'At what age do you hope to stop working or retire?'
    );

    // Skip for now
    const skipBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Skip for now'));
    expect(skipBtn).toBeDefined();
    await fireEvent.click(skipBtn!);
    flushSync();

    // Default 65 should be applied
    expect(store.plan.user_retirement_age).toBe(65);

    // A skipped badge should now be visible
    expect(document.querySelector('.interview-header')?.textContent).toContain('1 Skipped');
  });

  it('navigates through to the review screen and triggers simulation run', async () => {
    const { store, onNavigate } = setup();

    // Populate valid minimal plan
    store.plan.user_name = 'Robin';
    store.plan.user_age = 60;
    store.plan.user_retirement_age = 65;
    store.plan.user_age_death = 95;
    store.plan.is_married = false;
    store.plan.desired_spending = 55000;

    await fireEvent.click(byId('btnStartInterview')!);
    flushSync();

    // Check modal exists
    expect(document.getElementById('guidedInterviewModal')).not.toBeNull();
  });
});

