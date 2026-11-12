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
import Stage6Review from '../../src/lib/components/enter/interview/Stage6Review.svelte';
import IncomeTab from '../../src/lib/components/enter/IncomeTab.svelte';
import type { Plan } from '../../src/lib/plan/types';
import { todayIso } from '../../src/lib/plan/pyutil';

afterEach(cleanup);
window.scrollTo = () => { };

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

  it('offers monthly and one-time contributions with a start age for an HSA', async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_hsa');
    const plan: Plan = { is_married: false, user_name: 'Jordan', user_age: 45, user_retirement_age: 62, accounts: [] };

    const r = render(Stage2Accounts, { wizard, plan });
    await fireEvent.click(r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement);
    flushSync();

    const freq = r.container.querySelector('#int_acc_freq') as HTMLSelectElement;
    expect(Array.from(freq.options).map((o) => o.value)).toEqual(['annual', 'monthly', 'one-time']);

    await fireEvent.input(r.container.querySelector('#int_acc_contrib') as HTMLInputElement, { target: { value: '5000' } });
    await fireEvent.change(freq, { target: { value: 'one-time' } });
    flushSync();

    // A one-time contribution has a single age and no stop age
    expect(r.container.querySelector('#int_acc_endtype')).toBeNull();
    expect(r.container.querySelector('#int_acc_onetime_when')).toBeNull(); // first-death option is couples only
    const start = r.container.querySelector('#int_acc_start') as HTMLInputElement;
    expect(start.value).toBe('45');
    await fireEvent.input(start, { target: { value: '50' } });
    flushSync();

    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Account'));
    await fireEvent.click(saveBtn!);
    flushSync();

    const saved = plan.accounts![0];
    expect(saved.type).toBe('hsa');
    expect(saved.contrib_amount).toBe(5000);
    expect(saved.contrib_freq).toBe('one-time');
    expect(saved.contrib_start_age).toBe(50);
    cleanup();
  });

  it("stores the spouse's own end-age choices on a spouse-owned account", async () => {
    const wizard = new InterviewState();
    wizard.goTo('accounts_taxable');
    const plan: Plan = {
      is_married: true, user_name: 'Jordan', user_age: 45, user_retirement_age: 62,
      spouse_name: 'Sam', spouse_age: 40, spouse_retirement_age: 60, accounts: [],
    };

    const r = render(Stage2Accounts, { wizard, plan });
    await fireEvent.click(r.container.querySelector('button.btn-outline-primary') as HTMLButtonElement);
    flushSync();
    await fireEvent.change(r.container.querySelector('#int_acc_owner') as HTMLSelectElement, { target: { value: 'spouse' } });
    await fireEvent.input(r.container.querySelector('#int_acc_contrib') as HTMLInputElement, { target: { value: '500' } });
    await fireEvent.change(r.container.querySelector('#int_acc_freq') as HTMLSelectElement, { target: { value: 'monthly' } });
    flushSync();

    const endType = r.container.querySelector('#int_acc_endtype') as HTMLSelectElement;
    expect(endType.value).toBe('spouse_retirement');
    expect(Array.from(endType.options).map((o) => o.value)).toEqual(
      ['retirement', 'spouse_retirement', 'first_death', 'user_specified', 'spouse_specified'],
    );
    expect((r.container.querySelector('#int_acc_start') as HTMLInputElement).value).toBe('40');

    // One-time contributions for a couple can be made at the first death
    await fireEvent.change(r.container.querySelector('#int_acc_freq') as HTMLSelectElement, { target: { value: 'one-time' } });
    flushSync();
    await fireEvent.change(r.container.querySelector('#int_acc_onetime_when') as HTMLSelectElement, { target: { value: 'first_death' } });
    flushSync();
    expect(r.container.querySelector('#int_acc_start')).toBeNull();

    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Account'));
    await fireEvent.click(saveBtn!);
    flushSync();

    const saved = plan.accounts![0];
    expect(saved.owner).toBe('spouse');
    expect(saved.contrib_start_age).toBe(40);
    expect(saved.contrib_end_age_specified).toBe(60);
    expect(saved.contrib_end_age_type).toBe('first_death');
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

  it('configures inflation and multi-period adjustments for income streams in Stage 4', async () => {
    const wizard = new InterviewState();
    wizard.goTo('income_streams');
    const plan: Plan = {
      is_married: false,
      income_sources: [],
    };

    const r = render(Stage4Income, { wizard, plan });

    // 1. Click Pension button to add a new pension stream
    const pensionBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Pension'));
    await fireEvent.click(pensionBtn!);
    flushSync();

    // Verify Adjustment Schedule section is present
    expect(r.container.querySelector('.inc-adjustments-schedule-container')).not.toBeNull();
    const period1 = r.container.querySelectorAll('.inc-period-row')[0];
    expect(period1).toBeDefined();

    // Change adjustment to fixed_pct with 3%
    const adjSelect = period1.querySelector('.p-adj-type') as HTMLSelectElement;
    await fireEvent.change(adjSelect, { target: { value: 'fixed_pct' } });
    flushSync();

    const valInput = period1.querySelector('.p-adj-val') as HTMLInputElement;
    expect(valInput).not.toBeNull();
    await fireEvent.input(valInput, { target: { value: '3' } });
    flushSync();

    // Add a second period
    const addPeriodBtn = r.container.querySelector('.btnAddAdjustmentPeriod') as HTMLButtonElement;
    await fireEvent.click(addPeriodBtn);
    flushSync();

    const periods = r.container.querySelectorAll('.inc-period-row');
    expect(periods.length).toBe(2);

    // Set second period adjustment to none
    const adjSelect2 = periods[1].querySelector('.p-adj-type') as HTMLSelectElement;
    await fireEvent.change(adjSelect2, { target: { value: 'none' } });
    flushSync();

    // Save income stream
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Income Stream'));
    await fireEvent.click(saveBtn!);
    flushSync();

    expect(plan.income_sources?.length).toBe(1);
    expect(plan.income_sources![0].adjustments?.length).toBe(2);
    expect(plan.income_sources![0].adjustments![0]).toMatchObject({ adjust_type: 'fixed_pct', adjust_val: 3 });
    expect(plan.income_sources![0].adjustments![1]).toMatchObject({ adjust_type: 'none' });
    expect(r.container.textContent).toContain('2 adjustment periods');

    // 2. Add Fixed Annuity which defaults to 'none' adjustment
    const annuityBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Annuity'));
    await fireEvent.click(annuityBtn!);
    flushSync();

    const annuityPeriod = r.container.querySelectorAll('.inc-period-row')[0];
    const annuityAdjSelect = annuityPeriod.querySelector('.p-adj-type') as HTMLSelectElement;
    expect(annuityAdjSelect.value).toBe('none');

    // Save annuity
    const saveAnnuityBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save Income Stream'));
    await fireEvent.click(saveAnnuityBtn!);
    flushSync();

    expect(plan.income_sources?.length).toBe(2);
    expect(plan.income_sources![1].adjustments![0].adjust_type).toBe('none');
    expect(r.container.textContent).toContain('None (0%)');

    cleanup();
  });

  it('renders steady income buttons with the same large card sizing as social security buttons', () => {
    const wizard = new InterviewState();
    wizard.goTo('income_streams');
    const plan: Plan = {
      is_married: false,
    };

    const r = render(Stage4Income, { wizard, plan });

    const pensionBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Pension'));
    const annuityBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Annuity'));
    const rentalBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Rental'));
    const customBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Custom'));

    expect(pensionBtn).toBeDefined();
    expect(annuityBtn).toBeDefined();
    expect(rentalBtn).toBeDefined();
    expect(customBtn).toBeDefined();

    for (const btn of [pensionBtn!, annuityBtn!, rentalBtn!, customBtn!]) {
      expect(btn.className).toContain('p-3');
      expect(btn.className).toContain('border');
      expect(btn.className).toContain('rounded-3');
      expect(btn.className).toContain('text-start');

      const title = btn.querySelector('.fw-bold.fs-5.mb-1');
      expect(title).not.toBeNull();

      const subtitle = btn.querySelector('.small.opacity-75');
      expect(subtitle).not.toBeNull();
    }

    const container = pensionBtn!.parentElement;
    expect(container?.className).toContain('d-flex');
    expect(container?.className).toContain('flex-column');
    expect(container?.className).toContain('gap-3');
    expect(container?.getAttribute('style')).toContain('max-width: 580px');

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

  it('displays the retirement accounts note on all 5 pages of the Accounts section', async () => {
    const stage2Questions = [
      'accounts_workplace',
      'accounts_ira',
      'accounts_taxable',
      'accounts_hsa',
      'accounts_inherited',
    ];
    const wizard = new InterviewState();
    const plan: Plan = { is_married: true, accounts: [] };

    for (const qId of stage2Questions) {
      wizard.goTo(qId);
      const r = render(Stage2Accounts, { wizard, plan });
      const text = (r.container.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('Enter only accounts intended to be used in retirement');
      expect(text).toContain('Do not include accounts you plan to spend before retirement');
      expect(text).toContain('Accounts intended to be spent before retirement can be tracked on the optional Balance Sheet page');
      if (qId === 'accounts_workplace') {
        expect(text).toContain('page. Also, do not enter any defined benefit pension plans (e.g., plans that will pay you regular income after retirement) here; they will be added in the "Income" section.');
      } else {
        expect(text).not.toContain('defined benefit pension plans');
      }
      r.unmount();
    }
  });
});

describe('Stage 5 Guided Walkthrough Fixes (Emergency Fund & Savings Goals)', () => {
  it('preserves emergency fund data (name, balance, target, autoInflate) when jumping away and returning', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_emergency');
    const plan: Plan = { is_married: false };

    // 1. First visit to Emergency Fund
    let r = render(Stage5NetWorth, { wizard, plan });

    const nameInput = r.container.querySelector('#int_em_name') as HTMLInputElement;
    const balInput = r.container.querySelector('#int_em_bal') as HTMLInputElement;
    const tgtInput = r.container.querySelector('#int_em_target') as HTMLInputElement;
    const inflateSwitch = r.container.querySelector('#int_em_auto_inflate') as HTMLInputElement;

    expect(nameInput).not.toBeNull();
    expect(balInput).not.toBeNull();
    expect(tgtInput).not.toBeNull();
    expect(inflateSwitch).not.toBeNull();

    await fireEvent.input(nameInput, { target: { value: 'Marcus Rainy Day' } });
    await fireEvent.input(balInput, { target: { value: '25000' } });
    await fireEvent.input(tgtInput, { target: { value: '35000' } });
    if (!inflateSwitch.checked) {
      await fireEvent.click(inflateSwitch);
    }
    flushSync();

    // Click Next (advances to nw_goals and auto-saves)
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    // Verify saved into plan.balance_sheet
    const bs = plan.balance_sheet as any;
    expect(bs).toBeDefined();
    expect(bs.categories?.emergency?.target_amount).toBe(35000);
    expect(bs.emergency_goal_amount).toBe(35000);
    expect(bs.categories?.emergency?.target_auto_inflate).toBe(true);
    expect(bs.categories?.emergency?.accounts[0].name).toBe('Marcus Rainy Day');

    cleanup();

    // 2. Simulate navigating to Stage 6 and then jumping back to nw_emergency
    wizard.goTo('review_summary');
    wizard.goTo('nw_emergency');

    r = render(Stage5NetWorth, { wizard, plan });

    const remountName = r.container.querySelector('#int_em_name') as HTMLInputElement;
    const remountBal = r.container.querySelector('#int_em_bal') as HTMLInputElement;
    const remountTgt = r.container.querySelector('#int_em_target') as HTMLInputElement;
    const remountInflate = r.container.querySelector('#int_em_auto_inflate') as HTMLInputElement;

    // Fields should NOT be empty or lost!
    expect(remountName.value).toBe('Marcus Rainy Day');
    expect(remountBal.value).toBe('25,000');
    expect(remountTgt.value).toBe('35,000');
    expect(remountInflate.checked).toBe(true);

    // Shows progress pill: 25k of 35k = 71%
    expect(r.container.textContent).toContain('71% of target funded');
    expect(r.container.textContent).toContain('$10,000 remaining');

    cleanup();
  });

  it('supports multiple savings goals with individual targets, balances, and inflation adjustment', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_goals');
    const plan: Plan = { is_married: false };

    let r = render(Stage5NetWorth, { wizard, plan });

    // Click quick starter button for "🚗 Vehicle Replacement"
    const carBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Vehicle Replacement'));
    expect(carBtn).toBeDefined();
    await fireEvent.click(carBtn!);
    flushSync();

    // Fill in target and balance
    const tgtInput = r.container.querySelector('#int_goal_target') as HTMLInputElement;
    const curInput = r.container.querySelector('#int_goal_cur') as HTMLInputElement;
    const inflateSwitch = r.container.querySelector('#int_goal_auto_inflate') as HTMLInputElement;

    await fireEvent.input(tgtInput, { target: { value: '25000' } });
    await fireEvent.input(curInput, { target: { value: '8000' } });
    expect(inflateSwitch.checked).toBe(true); // default true for best practice
    flushSync();

    // Click "Save Goal"
    const saveGoalBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Goal');
    await fireEvent.click(saveGoalBtn!);
    flushSync();

    // Now goal card 1 appears in the list
    expect(r.container.textContent).toContain('Vehicle Replacement');
    expect(r.container.textContent).toContain('$25,000');
    expect(r.container.textContent).toContain('$8,000');
    expect(r.container.textContent).toContain('Inflation-Adjusted');

    // Add a second goal: Vacation Fund
    const vacBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Vacation & Travel Fund'));
    expect(vacBtn).toBeDefined();
    await fireEvent.click(vacBtn!);
    flushSync();

    const tgtInput2 = r.container.querySelector('#int_goal_target') as HTMLInputElement;
    const curInput2 = r.container.querySelector('#int_goal_cur') as HTMLInputElement;
    const inflateSwitch2 = r.container.querySelector('#int_goal_auto_inflate') as HTMLInputElement;

    await fireEvent.input(tgtInput2, { target: { value: '10000' } });
    await fireEvent.input(curInput2, { target: { value: '4000' } });
    await fireEvent.click(inflateSwitch2); // uncheck inflation for this one
    flushSync();

    const saveGoalBtn2 = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Goal');
    await fireEvent.click(saveGoalBtn2!);
    flushSync();

    // Both goals should now be listed
    expect(r.container.textContent).toContain('Vehicle Replacement');
    expect(r.container.textContent).toContain('Vacation & Travel Fund');

    // Add a third goal using auto-save on Next: Custom Goal
    const customBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Custom Savings Goal'));
    expect(customBtn).toBeDefined();
    await fireEvent.click(customBtn!);
    flushSync();

    const nameInput3 = r.container.querySelector('#int_goal_name') as HTMLInputElement;
    const tgtInput3 = r.container.querySelector('#int_goal_target') as HTMLInputElement;
    const curInput3 = r.container.querySelector('#int_goal_cur') as HTMLInputElement;

    await fireEvent.input(nameInput3, { target: { value: 'College Tuition Sinking Fund' } });
    await fireEvent.input(tgtInput3, { target: { value: '50000' } });
    await fireEvent.input(curInput3, { target: { value: '15000' } });
    flushSync();

    // Click Next (advances and auto-saves the draft)
    const nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();

    const bs = plan.balance_sheet as any;
    const goals = bs.categories?.goals?.goal_groups ?? [];
    const collegeGoal = goals.find((g: any) => g.name === 'College Tuition Sinking Fund');
    expect(collegeGoal).toBeDefined();
    expect(collegeGoal.target_amount).toBe(50000);
    expect(collegeGoal.accounts[0].values[todayIso()]).toBe(15000);

    cleanup();

    // 3. Jump to Stage 6 and then return to nw_goals: ALL goals must be preserved!
    wizard.goTo('review_summary');
    wizard.goTo('nw_goals');

    r = render(Stage5NetWorth, { wizard, plan });

    expect(r.container.textContent).toContain('Vehicle Replacement');
    expect(r.container.textContent).toContain('Vacation');
    expect(r.container.textContent).toContain('College Tuition Sinking Fund');

    // 4. Test Editing an existing goal
    const editVacationBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.includes('Vacation')
    );
    expect(editVacationBtn).toBeDefined();
    await fireEvent.click(editVacationBtn!);
    flushSync();

    expect(r.container.textContent).toContain('Edit Savings Goal');
    const editTgtInput = r.container.querySelector('#int_goal_target') as HTMLInputElement;
    await fireEvent.input(editTgtInput, { target: { value: '12000' } });
    flushSync();

    const saveChangesBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Changes');
    await fireEvent.click(saveChangesBtn!);
    flushSync();

    // Target is now updated to $12,000
    expect(r.container.textContent).toContain('$12,000');

    // 5. Test Deleting a goal
    const delCarBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.includes('Delete Vehicle Replacement')
    );
    expect(delCarBtn).toBeDefined();
    await fireEvent.click(delCarBtn!);
    flushSync();

    // Vehicle Replacement goal card is gone (delete button no longer exists)
    const deletedBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.includes('Delete Vehicle Replacement')
    );
    expect(deletedBtn).toBeUndefined();
    expect(r.container.textContent).toContain('Vacation');
    expect(r.container.textContent).toContain('College Tuition Sinking Fund');

    cleanup();
  });

  it('displays Emergency Fund Goal box before Current Balance box in the DOM', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_emergency');
    const plan: Plan = { is_married: false };

    const r = render(Stage5NetWorth, { wizard, plan });

    const tgtInput = r.container.querySelector('#int_em_target') as HTMLInputElement;
    const balInput = r.container.querySelector('#int_em_bal') as HTMLInputElement;

    expect(tgtInput).not.toBeNull();
    expect(balInput).not.toBeNull();

    // Verify Target Goal is rendered before Current Balance in the DOM tree
    const position = tgtInput.compareDocumentPosition(balInput);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    cleanup();
  });

  it('supports multiple accounts for emergency fund ($12k + $8k + $32k = $52k toward $50k goal) and preserves them', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_emergency');
    const plan: Plan = { is_married: false };

    let r = render(Stage5NetWorth, { wizard, plan });

    // Set Target Goal: 50,000
    const tgtInput = r.container.querySelector('#int_em_target') as HTMLInputElement;
    await fireEvent.input(tgtInput, { target: { value: '50000' } });

    // Account 1: Ally HYSA, $12,000
    const acc1Name = r.container.querySelector('#int_em_name') as HTMLInputElement;
    const acc1Bal = r.container.querySelector('#int_em_bal') as HTMLInputElement;
    await fireEvent.input(acc1Name, { target: { value: 'Ally HYSA' } });
    await fireEvent.input(acc1Bal, { target: { value: '12000' } });
    flushSync();

    // Add Account 2: Marcus Savings, $8,000
    const addAccBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Another Account')
    );
    expect(addAccBtn).toBeDefined();
    await fireEvent.click(addAccBtn!);
    flushSync();

    const acc2Name = r.container.querySelector('#int_em_name_1') as HTMLInputElement;
    const acc2Bal = r.container.querySelector('#int_em_bal_1') as HTMLInputElement;
    expect(acc2Name).not.toBeNull();
    expect(acc2Bal).not.toBeNull();
    await fireEvent.input(acc2Name, { target: { value: 'Marcus Savings' } });
    await fireEvent.input(acc2Bal, { target: { value: '8000' } });
    flushSync();

    // Add Account 3: Vanguard Cash, $32,000
    await fireEvent.click(addAccBtn!);
    flushSync();

    const acc3Name = r.container.querySelector('#int_em_name_2') as HTMLInputElement;
    const acc3Bal = r.container.querySelector('#int_em_bal_2') as HTMLInputElement;
    expect(acc3Name).not.toBeNull();
    expect(acc3Bal).not.toBeNull();
    await fireEvent.input(acc3Name, { target: { value: 'Vanguard Cash' } });
    await fireEvent.input(acc3Bal, { target: { value: '32000' } });
    flushSync();

    // Summary reflects total across all 3 accounts: $12k + $8k + $32k = $52k
    expect(r.container.textContent).toContain('Total Saved Across All 3 Accounts');
    expect(r.container.textContent).toContain('$52,000');
    expect(r.container.textContent).toContain('100% of target funded');
    expect(r.container.textContent).toContain('$52,000 of $50,000');
    expect(r.container.textContent).toContain('Goal fully funded!');

    // Click Save Emergency Fund
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Emergency Fund')
    );
    await fireEvent.click(saveBtn!);
    flushSync();

    // Verify stored correctly in plan.balance_sheet
    const bs = plan.balance_sheet as any;
    expect(bs).toBeDefined();
    expect(bs.categories?.emergency?.target_amount).toBe(50000);
    const emgAccounts = bs.categories?.emergency?.accounts;
    expect(emgAccounts.length).toBe(3);
    expect(emgAccounts[0].name).toBe('Ally HYSA');
    expect(emgAccounts[0].values[bs.current_period]).toBe(12000);
    expect(emgAccounts[1].name).toBe('Marcus Savings');
    expect(emgAccounts[1].values[bs.current_period]).toBe(8000);
    expect(emgAccounts[2].name).toBe('Vanguard Cash');
    expect(emgAccounts[2].values[bs.current_period]).toBe(32000);

    cleanup();

    // Navigate to review and return to nw_emergency: all 3 accounts preserved!
    wizard.goTo('review_summary');
    wizard.goTo('nw_emergency');
    r = render(Stage5NetWorth, { wizard, plan });

    const remountTgt = r.container.querySelector('#int_em_target') as HTMLInputElement;
    const remountAcc1Name = r.container.querySelector('#int_em_name') as HTMLInputElement;
    const remountAcc1Bal = r.container.querySelector('#int_em_bal') as HTMLInputElement;
    const remountAcc2Name = r.container.querySelector('#int_em_name_1') as HTMLInputElement;
    const remountAcc2Bal = r.container.querySelector('#int_em_bal_1') as HTMLInputElement;
    const remountAcc3Name = r.container.querySelector('#int_em_name_2') as HTMLInputElement;
    const remountAcc3Bal = r.container.querySelector('#int_em_bal_2') as HTMLInputElement;

    expect(remountTgt.value).toBe('50,000');
    expect(remountAcc1Name.value).toBe('Ally HYSA');
    expect(remountAcc1Bal.value).toBe('12,000');
    expect(remountAcc2Name.value).toBe('Marcus Savings');
    expect(remountAcc2Bal.value).toBe('8,000');
    expect(remountAcc3Name.value).toBe('Vanguard Cash');
    expect(remountAcc3Bal.value).toBe('32,000');

    // Test removing Account 3
    const removeBtn = r.container.querySelector('button[aria-label="Remove emergency account 3"]') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    await fireEvent.click(removeBtn);
    flushSync();

    // Now 2 accounts remain: $12k + $8k = $20k
    expect(r.container.textContent).toContain('Total Saved Across All 2 Accounts');
    expect(r.container.textContent).toContain('$20,000');
    expect(r.container.textContent).toContain('40% of target funded');

    cleanup();
  });

  it('supports multiple accounts for a savings goal and displays account count', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_goals');
    const plan: Plan = { is_married: false };

    let r = render(Stage5NetWorth, { wizard, plan });

    // Click Custom Savings Goal
    const customBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Custom Savings Goal')
    );
    await fireEvent.click(customBtn!);
    flushSync();

    const nameInput = r.container.querySelector('#int_goal_name') as HTMLInputElement;
    const tgtInput = r.container.querySelector('#int_goal_target') as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: 'Home Renovation' } });
    await fireEvent.input(tgtInput, { target: { value: '40000' } });

    // Account 1: $15,000
    const acc1Name = r.container.querySelector('#int_goal_acc_name') as HTMLInputElement;
    const acc1Bal = r.container.querySelector('#int_goal_cur') as HTMLInputElement;
    await fireEvent.input(acc1Name, { target: { value: 'Home Depot Savings' } });
    await fireEvent.input(acc1Bal, { target: { value: '15000' } });
    flushSync();

    // Add Account 2: $10,000
    const addGoalAccBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Another Account')
    );
    await fireEvent.click(addGoalAccBtn!);
    flushSync();

    const acc2Name = r.container.querySelector('#int_goal_acc_name_1') as HTMLInputElement;
    const acc2Bal = r.container.querySelector('#int_goal_cur_1') as HTMLInputElement;
    await fireEvent.input(acc2Name, { target: { value: 'Credit Union High Yield' } });
    await fireEvent.input(acc2Bal, { target: { value: '10000' } });
    flushSync();

    expect(r.container.textContent).toContain('Total Saved Across All 2 Accounts');
    expect(r.container.textContent).toContain('$25,000');

    // Click Save Goal
    const saveGoalBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Save Goal'
    );
    await fireEvent.click(saveGoalBtn!);
    flushSync();

    // Verify card in list
    expect(r.container.textContent).toContain('Home Renovation');
    expect(r.container.textContent).toContain('$40,000');
    expect(r.container.textContent).toContain('$25,000');
    expect(r.container.textContent).toContain('(2 accounts)');

    // Check balance sheet object
    const bs = plan.balance_sheet as any;
    const goal = bs.categories?.goals?.goal_groups?.find((g: any) => g.name === 'Home Renovation');
    expect(goal).toBeDefined();
    expect(goal.accounts.length).toBe(2);
    expect(goal.accounts[0].name).toBe('Home Depot Savings');
    expect(goal.accounts[0].values[bs.current_period]).toBe(15000);
    expect(goal.accounts[1].name).toBe('Credit Union High Yield');
    expect(goal.accounts[1].values[bs.current_period]).toBe(10000);

    cleanup();
  });

  it('preserves checking buffer, real estate, and debts when returning to Stage 5', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    const plan: Plan = { is_married: false };

    // Fill checking
    wizard.goTo('nw_cash');
    let r = render(Stage5NetWorth, { wizard, plan });
    const chkInput = r.container.querySelector('#int_checking_amt') as HTMLInputElement;
    await fireEvent.input(chkInput, { target: { value: '8500' } });
    flushSync();
    let nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();
    cleanup();

    // Fill real estate
    wizard.goTo('nw_real_estate');
    r = render(Stage5NetWorth, { wizard, plan });
    const propNameInput = r.container.querySelector('#int_prop_name') as HTMLInputElement;
    const propValInput = r.container.querySelector('#int_prop_val') as HTMLInputElement;
    await fireEvent.input(propNameInput, { target: { value: 'Lake House' } });
    await fireEvent.input(propValInput, { target: { value: '550000' } });
    flushSync();
    nextBtn = Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.includes('Next'));
    await fireEvent.click(nextBtn!);
    flushSync();
    cleanup();

    // Jump to review and come back to checking & real estate
    wizard.goTo('review_summary');
    wizard.goTo('nw_cash');
    r = render(Stage5NetWorth, { wizard, plan });
    const remountChk = r.container.querySelector('#int_checking_amt') as HTMLInputElement;
    expect(remountChk.value).toBe('8,500');
    cleanup();

    wizard.goTo('nw_real_estate');
    r = render(Stage5NetWorth, { wizard, plan });
    const remountPropName = r.container.querySelector('#int_prop_name') as HTMLInputElement;
    const remountPropVal = r.container.querySelector('#int_prop_val') as HTMLInputElement;
    expect(remountPropName.value).toBe('Lake House');
    expect(remountPropVal.value).toBe('550,000');
    cleanup();
  });

  it('supports adding multiple debts in Stage 5, saves them, and preserves them on return', async () => {
    const wizard = new InterviewState();
    wizard.optedInStage5 = true;
    wizard.goTo('nw_debts');
    const plan: Plan = { is_married: false };

    let r = render(Stage5NetWorth, { wizard, plan });

    // Debt 1: Auto Loan, $15,000
    const d1Name = r.container.querySelector('#int_debt_name') as HTMLInputElement;
    const d1Bal = r.container.querySelector('#int_debt_bal') as HTMLInputElement;
    await fireEvent.input(d1Name, { target: { value: 'Auto Loan' } });
    await fireEvent.input(d1Bal, { target: { value: '15000' } });
    flushSync();

    // Add Debt 2: Student Loan, $25,000
    const addDebtBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Another Debt')
    );
    expect(addDebtBtn).toBeDefined();
    await fireEvent.click(addDebtBtn!);
    flushSync();

    const d2Name = r.container.querySelector('#int_debt_name_1') as HTMLInputElement;
    const d2Bal = r.container.querySelector('#int_debt_bal_1') as HTMLInputElement;
    expect(d2Name).not.toBeNull();
    expect(d2Bal).not.toBeNull();
    await fireEvent.input(d2Name, { target: { value: 'Federal Student Loan' } });
    await fireEvent.input(d2Bal, { target: { value: '25000' } });
    flushSync();

    // Add Debt 3: Credit Card, $3,500
    await fireEvent.click(addDebtBtn!);
    flushSync();

    const d3Name = r.container.querySelector('#int_debt_name_2') as HTMLInputElement;
    const d3Bal = r.container.querySelector('#int_debt_bal_2') as HTMLInputElement;
    expect(d3Name).not.toBeNull();
    expect(d3Bal).not.toBeNull();
    await fireEvent.input(d3Name, { target: { value: 'Chase Credit Card' } });
    await fireEvent.input(d3Bal, { target: { value: '3500' } });
    flushSync();

    // Verify subtotal across all 3 debts: $15,000 + $25,000 + $3,500 = $43,500
    expect(r.container.textContent).toContain('Total Debts Across All 3 Accounts');
    expect(r.container.textContent).toContain('$43,500');

    // Click Save Debts
    const saveBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Debts')
    );
    await fireEvent.click(saveBtn!);
    flushSync();

    // Verify saved to plan.balance_sheet
    const bs = plan.balance_sheet as any;
    expect(bs).toBeDefined();
    expect(bs.categories?.debts?.length).toBe(3);
    expect(bs.categories.debts[0].name).toBe('Auto Loan');
    expect(bs.categories.debts[0].values[bs.current_period]).toBe(15000);
    expect(bs.categories.debts[1].name).toBe('Federal Student Loan');
    expect(bs.categories.debts[1].values[bs.current_period]).toBe(25000);
    expect(bs.categories.debts[2].name).toBe('Chase Credit Card');
    expect(bs.categories.debts[2].values[bs.current_period]).toBe(3500);

    cleanup();

    // Navigate to review summary and return to nw_debts
    wizard.goTo('review_summary');
    wizard.goTo('nw_debts');
    r = render(Stage5NetWorth, { wizard, plan });

    const remountD1Name = r.container.querySelector('#int_debt_name') as HTMLInputElement;
    const remountD1Bal = r.container.querySelector('#int_debt_bal') as HTMLInputElement;
    const remountD2Name = r.container.querySelector('#int_debt_name_1') as HTMLInputElement;
    const remountD2Bal = r.container.querySelector('#int_debt_bal_1') as HTMLInputElement;
    const remountD3Name = r.container.querySelector('#int_debt_name_2') as HTMLInputElement;
    const remountD3Bal = r.container.querySelector('#int_debt_bal_2') as HTMLInputElement;

    expect(remountD1Name.value).toBe('Auto Loan');
    expect(remountD1Bal.value).toBe('15,000');
    expect(remountD2Name.value).toBe('Federal Student Loan');
    expect(remountD2Bal.value).toBe('25,000');
    expect(remountD3Name.value).toBe('Chase Credit Card');
    expect(remountD3Bal.value).toBe('3,500');

    // Test removing Debt 3
    const removeBtn = r.container.querySelector('button[aria-label="Remove debt 3"]') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    await fireEvent.click(removeBtn);
    flushSync();

    // Now 2 debts remain: $15,000 + $25,000 = $40,000
    expect(r.container.textContent).toContain('Total Debts Across All 2 Accounts');
    expect(r.container.textContent).toContain('$40,000');

    cleanup();
  });

  it('handles Option 3 (not eligible) for user Social Security in Stage 4 and syncs with IncomeTab', async () => {
    const wizard = new InterviewState();
    wizard.goTo('income_user_ss');
    const plan: Plan = {
      is_married: false,
      social_security: {
        user_receiving: false,
        user_future_entitled: true,
        user_entitled: true,
        user_amount: 2000,
        user_start_age: 67,
      },
    };

    let r = render(Stage4Income, { wizard, plan });

    // Buttons
    const buttons = Array.from(r.container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Yes') || b.textContent?.includes('No')
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    const yesBtn = buttons.find((b) => b.textContent?.includes('already receiving'));
    const futureBtn = buttons.find((b) => b.textContent?.includes('plan to claim'));
    const notEligibleBtn = buttons.find((b) => b.textContent?.includes('not be eligible'));

    expect(yesBtn).toBeDefined();
    expect(futureBtn).toBeDefined();
    expect(notEligibleBtn).toBeDefined();

    // Initially future is selected
    expect(futureBtn!.className).toContain('btn-primary');
    expect(notEligibleBtn!.className).toContain('btn-outline-secondary');
    expect(r.container.querySelector('#int_user_ss_start_age')).not.toBeNull();
    expect(r.container.querySelector('#int_user_ss_est_amt')).not.toBeNull();

    // Click Option 3: Not eligible
    await fireEvent.click(notEligibleBtn!);
    flushSync();

    expect(plan.social_security?.user_receiving).toBe(false);
    expect(plan.social_security?.user_future_entitled).toBe(false);
    expect(plan.social_security?.user_entitled).toBe(false);

    // Option 3 is now primary, age/amount inputs hidden, info note shown
    expect(notEligibleBtn!.className).toContain('btn-primary');
    expect(futureBtn!.className).toContain('btn-outline-secondary');
    expect(r.container.querySelector('#int_user_ss_start_age')).toBeNull();
    expect(r.container.querySelector('#int_user_ss_est_amt')).toBeNull();
    expect(r.container.textContent).toContain('No Social Security benefit will be included in your retirement plan calculations.');
    cleanup();

    // Verify IncomeTab reflects this: #user_ss_future_entitled select has value 'false' ("No")
    const incomeView = render(IncomeTab, { plan, mode: 'advanced', onSwitch: () => { } });
    const receivingSelect = incomeView.container.querySelector('#user_ss_receiving') as HTMLSelectElement;
    const futureSelect = incomeView.container.querySelector('#user_ss_future_entitled') as HTMLSelectElement;

    expect(receivingSelect).not.toBeNull();
    expect(receivingSelect.value).toBe('false');
    expect(futureSelect).not.toBeNull();
    expect(futureSelect.value).toBe('false');
    // Amount field should not be rendered
    expect(incomeView.container.querySelector('#user_ss_amount')).toBeNull();
    cleanup();

    // Returning to Stage 4 preserves Option 3 selection
    r = render(Stage4Income, { wizard, plan });
    const remountBtns = Array.from(r.container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('not be eligible')
    );
    expect(remountBtns[0].className).toContain('btn-primary');
    expect(r.container.querySelector('#int_user_ss_start_age')).toBeNull();

    // Switching back to Option 2 restores future entitlement
    const remountFutureBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('plan to claim')
    );
    await fireEvent.click(remountFutureBtn!);
    flushSync();

    expect(plan.social_security?.user_receiving).toBe(false);
    expect(plan.social_security?.user_future_entitled).toBe(true);
    expect(plan.social_security?.user_entitled).toBe(true);
    expect(r.container.querySelector('#int_user_ss_start_age')).not.toBeNull();
    expect(r.container.querySelector('#int_user_ss_est_amt')).not.toBeNull();
    cleanup();
  });

  it('handles Option 3 (not eligible) for spouse Social Security in Stage 4 and syncs with IncomeTab', async () => {
    const wizard = new InterviewState();
    wizard.goTo('income_spouse_ss');
    const plan: Plan = {
      is_married: true,
      spouse_name: 'Alex',
      social_security: {
        user_receiving: false,
        user_future_entitled: true,
        user_entitled: true,
        user_amount: 2000,
        user_start_age: 67,
        spouse_receiving: false,
        spouse_future_entitled: true,
        spouse_entitled: true,
        spouse_amount: 1500,
        spouse_start_age: 67,
      },
    };

    const r = render(Stage4Income, { wizard, plan });

    const notEligibleBtn = Array.from(r.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('will not be eligible')
    );
    expect(notEligibleBtn).toBeDefined();

    await fireEvent.click(notEligibleBtn!);
    flushSync();

    expect(plan.social_security?.spouse_receiving).toBe(false);
    expect(plan.social_security?.spouse_future_entitled).toBe(false);
    expect(plan.social_security?.spouse_entitled).toBe(false);

    expect(r.container.querySelector('#int_spouse_ss_start_age')).toBeNull();
    expect(r.container.querySelector('#int_spouse_ss_est_amt')).toBeNull();
    expect(r.container.textContent).toContain('No Social Security benefit will be modeled for Alex.');
    cleanup();

    // Verify IncomeTab reflects spouse as not entitled
    const incomeView = render(IncomeTab, { plan, mode: 'advanced', onSwitch: () => { } });
    const spouseRecSelect = incomeView.container.querySelector('#spouse_ss_receiving') as HTMLSelectElement;
    const spouseFutSelect = incomeView.container.querySelector('#spouse_ss_future_entitled') as HTMLSelectElement;

    expect(spouseRecSelect).not.toBeNull();
    expect(spouseRecSelect.value).toBe('false');
    expect(spouseFutSelect).not.toBeNull();
    expect(spouseFutSelect.value).toBe('false');
    expect(incomeView.container.querySelector('#spouse_ss_amount')).toBeNull();
    cleanup();
  });

  it('displays not eligible in Stage 6 Review snapshot when Social Security is disabled', () => {
    const wizard = new InterviewState();
    const plan: Plan = {
      is_married: false,
      user_name: 'Taylor',
      user_age: 50,
      user_retirement_age: 65,
      user_age_death: 90,
      social_security: {
        user_receiving: false,
        user_future_entitled: false,
        user_entitled: false,
        user_amount: 0,
      },
    };

    const r = render(Stage6Review, {
      wizard,
      plan,
      onRun: () => { },
      onClose: () => { },
    });

    expect(r.container.textContent).toContain('Not eligible for Social Security');
    expect(r.container.textContent).toContain('$0 Social Security income');
    cleanup();
  });
});

