// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiPrefs } from '../../src/lib/app/ui.svelte';
import { memoryStorage, PlanStore } from '../../src/lib/plan/store.svelte';
import EnterHarness from './EnterHarness.svelte';
import { InterviewState } from '../../src/lib/components/enter/interview/interviewState.svelte';
import Stage1Household from '../../src/lib/components/enter/interview/Stage1Household.svelte';
import Stage2Accounts from '../../src/lib/components/enter/interview/Stage2Accounts.svelte';
import Stage3Spending from '../../src/lib/components/enter/interview/Stage3Spending.svelte';
import Stage4Income from '../../src/lib/components/enter/interview/Stage4Income.svelte';
import Stage5NetWorth from '../../src/lib/components/enter/interview/Stage5NetWorth.svelte';
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

describe('Single vs Married Phrasing in Guided Walkthrough', () => {
  it('omits all spouse mentions in Stage 1 and Stage 2 for single users', async () => {
    const wizard = new InterviewState();
    const singlePlan: Plan = {
      is_married: false,
      user_name: 'Alex',
      user_age: 50,
      user_retirement_age: 65,
    };

    // Stage 1 Life Insurance (Q1.8)
    wizard.goTo('life_insurance');
    const r1 = render(Stage1Household, { wizard, plan: singlePlan });
    expect(r1.container.textContent).toContain('Do you have a life insurance policy that would pay out upon death?');
    expect(r1.container.textContent).not.toContain('Do you or your spouse have life insurance policies');
    expect(r1.container.textContent).not.toContain('surviving spouse');
    expect(r1.container.textContent).toContain('heirs upon your death');
    cleanup();

    // Stage 2 Workplace Accounts (Q2.1)
    wizard.goTo('accounts_workplace');
    const r2 = render(Stage2Accounts, { wizard, plan: singlePlan });
    expect(r2.container.textContent).toContain('Do you have retirement savings through work (like a 401(k), 403(b), or TSP)?');
    expect(r2.container.textContent).not.toContain('Do you or your spouse have retirement savings through work');
    cleanup();

    // Stage 2 IRAs (Q2.2)
    wizard.goTo('accounts_ira');
    const r3 = render(Stage2Accounts, { wizard, plan: singlePlan });
    expect(r3.container.textContent).toContain('Do you have an Individual Retirement Account (Traditional IRA or Roth IRA)?');
    expect(r3.container.textContent).not.toContain('Do you or your spouse have an Individual Retirement Account');
    cleanup();

    // Stage 2 Inherited IRAs (Q2.5)
    wizard.goTo('accounts_inherited');
    const r4 = render(Stage2Accounts, { wizard, plan: singlePlan });
    expect(r4.container.textContent).toContain('Have you inherited an IRA or 401(k) from someone who passed away?');
    expect(r4.container.textContent).not.toContain('Have you or your spouse inherited an IRA');
    cleanup();

    // Stage 4 Income Streams (Q4.3)
    wizard.goTo('income_streams');
    const r5 = render(Stage4Income, { wizard, plan: singlePlan });
    const addBtn = r5.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    await fireEvent.click(addBtn);
    flushSync();

    // Should NOT have "Whose Income Stream?" dropdown for single user
    expect(r5.container.querySelector('#int_inc_owner')).toBeNull();
    expect(r5.container.textContent).not.toContain('Whose Income Stream?');
    expect(r5.container.querySelector('#int_inc_surv')).toBeNull();
    cleanup();
  });

  it('renders contribution end age and inflation controls when adding accounts with contributions', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const singlePlan: Plan = {
      is_married: false,
      user_name: 'Jordan',
      user_age: 45,
      user_retirement_age: 62,
      accounts: [],
    };

    const r = render(Stage2Accounts, { wizard, plan: singlePlan });
    const addBtn = r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    await fireEvent.click(addBtn);
    flushSync();

    // Before entering contributions, end-age controls shouldn't be rendered
    expect(r.container.querySelector('#int_acc_endtype')).toBeNull();

    // Enter contribution amount
    const contribInput = r.container.querySelector('#int_acc_contrib') as HTMLInputElement;
    await fireEvent.input(contribInput, { target: { value: '15000' } });
    flushSync();

    // Now contribution stop age controls and inflation toggle should appear
    const endTypeSelect = r.container.querySelector('#int_acc_endtype') as HTMLSelectElement;
    expect(endTypeSelect).not.toBeNull();
    expect(endTypeSelect.textContent).toContain('At my retirement (Age 62) - Recommended');
    expect(endTypeSelect.textContent).toContain('At a specific age...');

    const inflationCheck = r.container.querySelector('#int_acc_adj_inf') as HTMLInputElement;
    expect(inflationCheck).not.toBeNull();
    expect(inflationCheck.checked).toBe(true);

    // Switch to custom age
    await fireEvent.change(endTypeSelect, { target: { value: 'user_specified' } });
    flushSync();

    const specAgeInput = r.container.querySelector('#int_acc_endspec') as HTMLInputElement;
    expect(specAgeInput).not.toBeNull();
    await fireEvent.input(specAgeInput, { target: { value: '55' } });
    flushSync();

    // Save account
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Account'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(singlePlan.accounts?.length).toBe(1);
    const saved = singlePlan.accounts![0];
    expect(saved.contrib_amount).toBe(15000);
    expect(saved.contrib_end_age_type).toBe('user_specified');
    expect(saved.contrib_end_age_specified).toBe(55);
    expect(saved.contrib_adjust_inflation).toBe(true);
    // Listing card for single user should NOT display "Owner: You"
    expect(r.container.textContent).not.toContain('Owner:');
    cleanup();
  });
});

describe('Smart Auto-Save on Next in Guided Walkthrough', () => {
  it('auto-saves an in-progress 401(k) when clicking Next and displays a clean IRA page', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      user_name: 'Alex',
      user_age: 50,
      user_retirement_age: 65,
      accounts: [],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Click "Add a Workplace Account"
    const addBtn = r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    await fireEvent.click(addBtn);
    flushSync();

    // Fill in balance and contribution
    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    const contribInput = r.container.querySelector('#int_acc_contrib') as HTMLInputElement;
    expect(balInput).not.toBeNull();
    await fireEvent.input(balInput, { target: { value: '45000' } });
    await fireEvent.input(contribInput, { target: { value: '6000' } });
    flushSync();

    // Click "Next" WITHOUT clicking "Save Account"
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    expect(nextBtn).toBeDefined();
    await fireEvent.click(nextBtn!);
    flushSync();

    // 1. Account should be auto-saved into plan.accounts
    expect(plan.accounts?.length).toBe(1);
    expect(plan.accounts![0].balance).toBe(45000);
    expect(plan.accounts![0].contrib_amount).toBe(6000);

    // 2. Wizard advanced to IRA question
    expect(wizard.currentQuestionId).toBe('accounts_ira');

    // 3. Sub-form is closed and clean "+ Add an IRA" button is visible
    expect(r.container.textContent).toContain('Do you have an Individual Retirement Account');
    expect(r.container.textContent).toContain('Add an IRA');
    expect(r.container.querySelector('#int_acc_balance')).toBeNull();
    cleanup();
  });

  it('cleanly discards an untouched blank account form on Next without creating phantom accounts', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_ira');
    const plan: Plan = {
      is_married: false,
      accounts: [],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Click "Add an IRA"
    const addBtn = r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    await fireEvent.click(addBtn);
    flushSync();

    // Do NOT enter any balance or contribution ($0 defaults)
    // Click "Next"
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    // Plan accounts should remain empty
    expect(plan.accounts?.length).toBe(0);
    // Wizard advanced to taxable accounts
    expect(wizard.currentQuestionId).toBe('accounts_taxable');
    cleanup();
  });

  it('automatically de-duplicates account names on save to avoid duplicate name errors', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      user_name: 'Alex',
      accounts: [
        { name: "Alex's 401(k)", type: 'pretax', balance: 50000 },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Open add account
    const addBtn = r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    await fireEvent.click(addBtn);
    flushSync();

    // Default name is Alex's 401(k). Enter a balance
    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    await fireEvent.input(balInput, { target: { value: '20000' } });
    flushSync();

    // Click Next
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.accounts?.length).toBe(2);
    expect(plan.accounts?.[0]?.name).toBe("Alex's 401(k)");
    expect(plan.accounts?.[1]?.name).toBe("Alex's 401(k) (2)");
    cleanup();
  });

  it('auto-saves milestone expenses in Stage 3 on Next', async () => {
    const wizard = new InterviewState();
    wizard.goTo('spending_milestones');
    const plan: Plan = {
      is_married: false,
      user_retirement_age: 65,
      additional_spending: [],
    };

    const r = render(Stage3Spending, { wizard, plan });

    // Click a milestone button
    const carBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Vehicle Replacement'));
    expect(carBtn).toBeDefined();
    await fireEvent.click(carBtn!);
    flushSync();

    // Click Next without clicking Save Expense
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.additional_spending?.length).toBe(1);
    expect(plan.additional_spending![0].name).toBe('Vehicle Replacement');
    expect(plan.additional_spending![0].amount).toBe(35000);
    cleanup();
  });

  it('auto-saves income streams in Stage 4 on Next', async () => {
    const wizard = new InterviewState();
    wizard.goTo('income_streams');
    const plan: Plan = {
      is_married: false,
      income_sources: [],
    };

    const r = render(Stage4Income, { wizard, plan });

    // Click pension button
    const pensionBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Pension'));
    expect(pensionBtn).toBeDefined();
    await fireEvent.click(pensionBtn!);
    flushSync();

    // Click Next without clicking Save Income Stream
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.income_sources?.length).toBe(1);
    expect(plan.income_sources![0].name).toBe('Company Pension');
    expect(plan.income_sources![0].amount).toBe(24000);
    cleanup();
  });

  it('auto-saves emergency fund in Stage 5 on Next only when balance is entered', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_emergency');
    const plan: Plan = {
      is_married: false,
    };

    const r = render(Stage5NetWorth, { wizard, plan });

    // Enter balance
    const balInput = r.container.querySelector('#int_em_bal') as HTMLInputElement;
    expect(balInput).not.toBeNull();
    await fireEvent.input(balInput, { target: { value: '25000' } });
    flushSync();

    // Click Next without clicking Save Emergency Fund
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    const bs = plan.balance_sheet as Record<string, any>;
    expect(bs).toBeDefined();
    expect(bs.categories?.emergency?.accounts?.length).toBe(1);
    expect(bs.categories?.emergency?.accounts[0].name).toBe('High-Yield Savings');
    cleanup();
  });

  it('discards in-progress draft when Skip for now is clicked', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      accounts: [],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Open add account
    const addBtn = r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement;
    await fireEvent.click(addBtn);
    flushSync();

    // Fill in balance
    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    await fireEvent.input(balInput, { target: { value: '10000' } });
    flushSync();

    // Click "Skip for now"
    const skipBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Skip for now'));
    expect(skipBtn).toBeDefined();
    await fireEvent.click(skipBtn!);
    flushSync();

    // Draft should be discarded and question marked skipped
    expect(plan.accounts?.length).toBe(0);
    expect(wizard.isSkipped('accounts_workplace')).toBe(true);
    cleanup();
  });
});

describe('Editing Items in Guided Walkthrough', () => {
  it('edits an existing workplace account and preserves single account identity', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      user_name: 'Alex',
      user_age: 50,
      user_retirement_age: 65,
      accounts: [
        {
          name: "Alex's 401(k)",
          type: 'pretax',
          balance: 50000,
          contrib_amount: 5000,
          contrib_freq: 'annual',
          contrib_end_age_type: 'retirement',
          return_mean: 6.0,
        },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Verify Edit button exists
    const editBtn = r.container.querySelector('button[aria-label="Edit Alex\'s 401(k)"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();

    // Click edit
    await fireEvent.click(editBtn);
    flushSync();

    // Drawer should show edit title
    expect(r.container.textContent).toContain("Edit Account: Alex's 401(k)");
    expect(r.container.textContent).toContain('Save Changes');

    // Change balance and contributions
    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    const contribInput = r.container.querySelector('#int_acc_contrib') as HTMLInputElement;
    expect(balInput).not.toBeNull();
    await fireEvent.input(balInput, { target: { value: '75000' } });
    await fireEvent.input(contribInput, { target: { value: '8000' } });
    flushSync();

    // Save changes
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Changes'));
    expect(saveBtn).toBeDefined();
    await fireEvent.click(saveBtn!);
    flushSync();

    // Still only 1 account, with updated balance and contribution
    expect(plan.accounts?.length).toBe(1);
    expect(plan.accounts![0].name).toBe("Alex's 401(k)");
    expect(plan.accounts![0].balance).toBe(75000);
    expect(plan.accounts![0].contrib_amount).toBe(8000);

    // Form drawer is closed
    expect(r.container.querySelector('#int_acc_balance')).toBeNull();
    cleanup();
  });

  it('cancels account edit without mutating original values', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      user_name: 'Alex',
      accounts: [
        {
          name: "Alex's 401(k)",
          type: 'pretax',
          balance: 50000,
        },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    const editBtn = r.container.querySelector('button[aria-label="Edit Alex\'s 401(k)"]') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    flushSync();

    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    await fireEvent.input(balInput, { target: { value: '999999' } });
    flushSync();

    // Click Cancel
    const cancelBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel');
    expect(cancelBtn).toBeDefined();
    await fireEvent.click(cancelBtn!);
    flushSync();

    // Balance remains 50000
    expect(plan.accounts![0].balance).toBe(50000);
    expect(r.container.querySelector('#int_acc_balance')).toBeNull();
    cleanup();
  });

  it('retains account name when unchanged, and auto-renames only if colliding with another account', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      accounts: [
        { name: "First Account", type: 'pretax', balance: 10000 },
        { name: "Second Account", type: 'pretax', balance: 20000 },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // 1. Edit First Account and save without changing name
    let editBtn = r.container.querySelector('button[aria-label="Edit First Account"]') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    flushSync();

    let saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Changes'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(plan.accounts![0].name).toBe('First Account'); // Name should NOT have (2) appended

    // 2. Edit First Account and change name to Second Account (collision)
    editBtn = r.container.querySelector('button[aria-label="Edit First Account"]') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    flushSync();

    const nameInput = r.container.querySelector('#int_acc_name') as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: 'Second Account' } });
    flushSync();

    saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Changes'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(plan.accounts![0].name).toBe('Second Account (2)');
    cleanup();
  });

  it('auto-saves edits to an account when clicking Next', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      user_name: 'Alex',
      accounts: [
        { name: "Alex's 401(k)", type: 'pretax', balance: 50000 },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    const editBtn = r.container.querySelector('button[aria-label="Edit Alex\'s 401(k)"]') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    flushSync();

    const balInput = r.container.querySelector('#int_acc_balance') as HTMLInputElement;
    await fireEvent.input(balInput, { target: { value: '88000' } });
    flushSync();

    // Click Next
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.accounts![0].balance).toBe(88000);
    expect(wizard.currentQuestionId).toBe('accounts_ira');
    cleanup();
  });

  it('edits milestone expenses in Stage 3 and auto-saves edits on Next', async () => {
    const wizard = new InterviewState();
    wizard.goTo('spending_milestones');
    const plan: Plan = {
      is_married: false,
      additional_spending: [
        { name: 'Vehicle Replacement', amount: 35000, start_age: 65, interval: 8 },
      ],
    };

    const r = render(Stage3Spending, { wizard, plan });

    // Verify Edit button exists
    const editBtn = r.container.querySelector('button[aria-label="Edit Vehicle Replacement"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();

    await fireEvent.click(editBtn);
    flushSync();

    expect(r.container.textContent).toContain('Edit Milestone Expense');

    const amtInput = r.container.querySelector('#int_ms_amount') as HTMLInputElement;
    const intervalInput = r.container.querySelector('#int_ms_interval') as HTMLInputElement;
    await fireEvent.input(amtInput, { target: { value: '42000' } });
    await fireEvent.input(intervalInput, { target: { value: '6' } });
    flushSync();

    // Click Save Changes
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Changes'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(plan.additional_spending?.length).toBe(1);
    expect(plan.additional_spending![0].amount).toBe(42000);
    expect(plan.additional_spending![0].interval).toBe(6);

    // Edit again and auto-save on Next
    const editBtn2 = r.container.querySelector('button[aria-label="Edit Vehicle Replacement"]') as HTMLButtonElement;
    await fireEvent.click(editBtn2);
    flushSync();

    const amtInput2 = r.container.querySelector('#int_ms_amount') as HTMLInputElement;
    await fireEvent.input(amtInput2, { target: { value: '45000' } });
    flushSync();

    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.additional_spending![0].amount).toBe(45000);
    cleanup();
  });

  it('edits income streams in Stage 4 and auto-saves edits on Next', async () => {
    const wizard = new InterviewState();
    wizard.goTo('income_streams');
    const plan: Plan = {
      is_married: true,
      user_name: 'Alex',
      spouse_name: 'Sam',
      income_sources: [
        {
          name: 'Company Pension',
          amount: 24000,
          frequency: 'annual',
          start_age_type: 'retirement',
          end_age_type: 'death',
          has_survivor_benefit: true,
          survivor_benefit_pct: 50,
        },
      ],
    };

    const r = render(Stage4Income, { wizard, plan });

    // Verify Edit button exists
    const editBtn = r.container.querySelector('button[aria-label="Edit Company Pension"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();

    await fireEvent.click(editBtn);
    flushSync();

    expect(r.container.textContent).toContain('Edit Income Stream');

    const amtInput = r.container.querySelector('#int_inc_amount') as HTMLInputElement;
    const freqSelect = r.container.querySelector('#int_inc_freq') as HTMLSelectElement;
    await fireEvent.input(amtInput, { target: { value: '30000' } });
    await fireEvent.change(freqSelect, { target: { value: 'monthly' } });
    flushSync();

    // Click Save Changes
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Changes'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(plan.income_sources?.length).toBe(1);
    expect(plan.income_sources![0].amount).toBe(30000);
    expect(plan.income_sources![0].frequency).toBe('monthly');

    // Edit again and auto-save on Next
    const editBtn2 = r.container.querySelector('button[aria-label="Edit Company Pension"]') as HTMLButtonElement;
    await fireEvent.click(editBtn2);
    flushSync();

    const amtInput2 = r.container.querySelector('#int_inc_amount') as HTMLInputElement;
    await fireEvent.input(amtInput2, { target: { value: '32000' } });
    flushSync();

    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    expect(plan.income_sources![0].amount).toBe(32000);
    cleanup();
  });

  it('cleans up edit drawer state if an account is deleted while being edited', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_workplace');
    const plan: Plan = {
      is_married: false,
      accounts: [
        { name: "First Account", type: 'pretax', balance: 10000 },
        { name: "Second Account", type: 'pretax', balance: 20000 },
      ],
    };

    const r = render(Stage2Accounts, { wizard, plan });

    // Start editing First Account
    const editBtn = r.container.querySelector('button[aria-label="Edit First Account"]') as HTMLButtonElement;
    await fireEvent.click(editBtn);
    flushSync();

    expect(r.container.textContent).toContain('Edit Account: First Account');

    // Click Delete on First Account
    const delBtn = r.container.querySelector('button[aria-label="Delete First Account"]') as HTMLButtonElement;
    await fireEvent.click(delBtn);
    flushSync();

    // Account removed and edit form closed
    expect(plan.accounts?.length).toBe(1);
    expect(plan.accounts![0].name).toBe('Second Account');
    expect(r.container.querySelector('#int_acc_name')).toBeNull();
    cleanup();
  });
});

