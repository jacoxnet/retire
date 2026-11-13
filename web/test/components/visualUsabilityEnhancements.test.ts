// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountCard from '../../src/lib/components/enter/AccountCard.svelte';
import McResults from '../../src/lib/components/results/McResults.svelte';
import EnterPage from '../../src/lib/components/enter/EnterPage.svelte';
import InterviewProgressBar from '../../src/lib/components/enter/interview/InterviewProgressBar.svelte';
import { InterviewState } from '../../src/lib/components/enter/interview/interviewState.svelte';
import { getDefaultData } from '../../src/lib/plan/defaults';
import { personLabels } from '../../src/lib/plan/accountCard';
import type { Account, Plan } from '../../src/lib/plan/types';
import type { Results } from '../../src/lib/app/results';
import { fixtureResults } from '../resultsFixture';
import InputsPanel from '../../src/lib/components/results/InputsPanel.svelte';
import DemographicsTab from '../../src/lib/components/enter/DemographicsTab.svelte';
import { assetBreakdownConfig } from '../../src/lib/app/resultCharts';

afterEach(cleanup);
window.scrollTo = () => {};

describe('Part 1: Account Tax Bucket Badges & Color Accents', () => {
  const people = personLabels(getDefaultData());

  const accountTypes: Array<{ type: Account['type']; expectedClass: string; expectedBadge: string; expectedIcon: string }> = [
    { type: 'roth', expectedClass: 'account-card-roth', expectedBadge: 'Tax-Free Growth', expectedIcon: 'fa-gem' },
    { type: 'pretax', expectedClass: 'account-card-pretax', expectedBadge: 'Tax-Deferred', expectedIcon: 'fa-hourglass-half' },
    { type: 'taxable', expectedClass: 'account-card-taxable', expectedBadge: 'Taxable', expectedIcon: 'fa-coins' },
    { type: 'hsa', expectedClass: 'account-card-hsa', expectedBadge: 'Triple Tax-Advantaged', expectedIcon: 'fa-heart-pulse' },
    { type: 'inherited_pretax', expectedClass: 'account-card-inherited', expectedBadge: 'Inherited Pre-Tax', expectedIcon: 'fa-clock-rotate-left' },
    { type: 'inherited_roth', expectedClass: 'account-card-inherited', expectedBadge: 'Inherited Roth', expectedIcon: 'fa-clock-rotate-left' },
  ];

  it.each(accountTypes)('applies correct class and badge for account type $type', ({ type, expectedClass, expectedBadge, expectedIcon }) => {
    const account: Account = {
      id: 'acc1',
      name: `My ${type} Account`,
      type,
      balance: 50000,
    };

    const { container } = render(AccountCard, {
      account,
      people,
      priorNames: [],
      onDelete: vi.fn(),
      onShowAssumptions: vi.fn(),
    });

    const card = container.querySelector('.account-card');
    expect(card).not.toBeNull();
    expect(card?.classList.contains(expectedClass)).toBe(true);

    const badge = container.querySelector('.badge-tax');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain(expectedBadge);

    const icon = badge?.querySelector('i');
    expect(icon?.classList.contains(expectedIcon)).toBe(true);
  });
});

describe('Part 2: Modern Radial Success Gauge in McResults', () => {
  it('renders SVG radial meter and retains .display-5 class on percentage', () => {
    const r = fixtureResults('sept27');
    const { container } = render(McResults, { results: r });

    const meter = container.querySelector('svg.radial-gauge-svg[role="meter"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute('aria-valuenow')).toBe(String(r.run_success));

    const display = container.querySelector('#mcResultsCard .display-5');
    expect(display).not.toBeNull();
    expect(display?.textContent).toContain(`${r.run_success.toFixed(1)}%`);

    // Verify arc SVG elements exist
    expect(container.querySelector('.radial-gauge-track')).not.toBeNull();
    expect(container.querySelector('.radial-gauge-fill')).not.toBeNull();
  });

  it('classifies confidence status based on success rate thresholds', () => {
    const baseResults = fixtureResults('sept27');

    // High confidence: >= 85%
    const rHigh = { ...baseResults, run_success: 91.5 };
    const { container: cHigh } = render(McResults, { results: rHigh });
    expect(cHigh.textContent).toContain('High Confidence Plan');

    cleanup();

    // Solid Foundation: 75% - 84.9%
    const rSolid = { ...baseResults, run_success: 78.0 };
    const { container: cSolid } = render(McResults, { results: rSolid });
    expect(cSolid.textContent).toContain('Solid Foundation');

    cleanup();

    // Moderate Risk: 60% - 74.9%
    const rMod = { ...baseResults, run_success: 67.2 };
    const { container: cMod } = render(McResults, { results: rMod });
    expect(cMod.textContent).toContain('Moderate Risk');

    cleanup();

    // Shortfall Risk: < 60%
    const rShort = { ...baseResults, run_success: 42.0 };
    const { container: cShort } = render(McResults, { results: rShort });
    expect(cShort.textContent).toContain('Shortfall Risk');
  });
});

describe('Part 3: Sticky Summary Bar on EnterPage', () => {
  it('displays aggregated assets, spending, and sticky run button without withdrawal rate', async () => {
    const plan: Plan = {
      ...getDefaultData(),
      accounts: [
        { id: '1', name: '401k', type: 'pretax', balance: 600000 },
        { id: '2', name: 'Roth', type: 'roth', balance: 400000 },
      ],
      desired_spending: 40000,
    };

    const onRun = vi.fn();
    const { container } = render(EnterPage, {
      plan,
      mode: 'simple',
      onModeChange: vi.fn(),
      onRun,
    });

    const healthBar = container.querySelector('.sticky-health-bar');
    expect(healthBar).not.toBeNull();

    // Total assets for retirement: $1,000,000
    expect(healthBar?.textContent).toContain('Total Assets for Retirement');
    expect(healthBar?.textContent).toContain('$1,000,000');
    // Desired recurring spending: $40,000
    expect(healthBar?.textContent).toContain('Desired Recurring Spending');
    expect(healthBar?.textContent).toContain('$40,000/yr');
    // Estimated withdrawal rate should not be displayed
    expect(healthBar?.textContent).not.toContain('EST. WITHDRAWAL RATE');

    // Sticky Run button triggers onRun
    const btnRun = container.querySelector('#btnStickyRun') as HTMLButtonElement;
    expect(btnRun).not.toBeNull();
    expect(btnRun.disabled).toBe(false);
    expect(btnRun.textContent?.trim()).toContain('Run Simulation');
    expect(btnRun.getAttribute('aria-label')).toBe('Run Simulation');

    await fireEvent.click(btnRun);
    expect(onRun).toHaveBeenCalled();
  });

  it('disables sticky run button when duplicate account names exist', () => {
    const plan: Plan = {
      ...getDefaultData(),
      accounts: [
        { id: '1', name: 'Primary 401(k)', type: 'pretax', balance: 500000 },
        { id: '2', name: 'Primary 401(k)', type: 'pretax', balance: 100000 },
      ],
    };

    const { container } = render(EnterPage, {
      plan,
      mode: 'simple',
      onModeChange: vi.fn(),
      onRun: vi.fn(),
    });

    const btnRun = container.querySelector('#btnStickyRun') as HTMLButtonElement;
    expect(btnRun.disabled).toBe(true);
    expect(container.querySelector('.sticky-health-bar')?.textContent).toContain('Duplicate');
  });

  it('always displays expanded summary metrics without toggle button', () => {
    const plan = getDefaultData();
    const { container } = render(EnterPage, {
      plan,
      mode: 'simple',
      onModeChange: vi.fn(),
      onRun: vi.fn(),
    });

    const healthBar = container.querySelector('.sticky-health-bar');
    expect(healthBar).not.toBeNull();

    // Toggle button should not be present
    const toggleBtn = healthBar?.querySelector('button[aria-label*="Summary Bar"]');
    expect(toggleBtn).toBeNull();

    // Summary metrics should always be visible
    expect(healthBar?.textContent).toContain('Total Assets for Retirement');
    expect(healthBar?.textContent).toContain('Desired Recurring Spending');
  });
});

describe('Part 4: Guided Walkthrough Enhancements', () => {
  it('renders stage category icons and allows jumping to reached stages', async () => {
    const wizard = new InterviewState();
    const plan: Plan = {
      ...getDefaultData(),
      accounts: [{ id: '1', name: 'IRA', type: 'roth', balance: 150000 }],
      desired_spending: 65000,
      social_security: {
        user_receiving: true,
        user_amount: 2500,
        user_freq: 'monthly',
      },
    };

    // Advance wizard to Stage 2 (accounts_workplace)
    wizard.goTo('accounts_workplace');

    const { container } = render(InterviewProgressBar, {
      wizard,
      plan,
      onOpenSkipped: vi.fn(),
    });

    // Verify icons on stage pills
    expect(container.querySelector('.fa-house-user')).not.toBeNull();
    expect(container.querySelector('.fa-wallet')).not.toBeNull();
    expect(container.querySelector('.fa-basket-shopping')).not.toBeNull();

    // Stage 1 is reached (isDone) -> button should be clickable
    const buttons = container.querySelectorAll('.stage-pill-btn');
    expect(buttons.length).toBeGreaterThanOrEqual(2); // Stage 1 and Stage 2

    // Click Stage 1 pill to jump back to Stage 1 entry question
    const stage1Btn = buttons[0];
    await fireEvent.click(stage1Btn);
    expect(wizard.currentQuestionId).toBe('user_name_age');

    // Future stages are muted (.stage-upcoming) but clickable
    const upcomingPills = container.querySelectorAll('button.stage-upcoming');
    expect(upcomingPills.length).toBe(5);

    // Answer the first question, then skip ahead to Stage 3 (Spending)
    wizard.markAnswered('user_name_age');
    await fireEvent.click(container.querySelectorAll('.stage-pill-btn')[2]);
    expect(wizard.currentQuestionId).toBe('spending_start');
    // Answered question is left alone; everything else passed over is skipped
    expect(wizard.isSkipped('user_name_age')).toBe(false);
    expect(wizard.isSkipped('user_ret_age')).toBe(true);
    expect(wizard.isSkipped('accounts_inherited')).toBe(true);
    expect(wizard.isSkipped('spending_start')).toBe(false);
    expect(wizard.isSkipped('spouse_name_age')).toBe(false); // inactive (single)
    expect(wizard.isSkipped('gateway_advanced')).toBe(false); // not passed yet

    // Jumping backward skips nothing further
    const skippedBefore = wizard.skippedQuestions.length;
    await fireEvent.click(container.querySelectorAll('.stage-pill-btn')[1]);
    expect(wizard.currentQuestionId).toBe('accounts_workplace');
    expect(wizard.skippedQuestions.length).toBe(skippedBefore);

    // Skipping ahead to Review passes the Stage 5 gateway but not its hidden sub-questions
    await fireEvent.click(container.querySelectorAll('.stage-pill-btn')[5]);
    expect(wizard.currentQuestionId).toBe('review_skipped');
    expect(wizard.isSkipped('gateway_advanced')).toBe(true);
    expect(wizard.isSkipped('nw_cash')).toBe(false);
    expect(container.querySelectorAll('.stage-done').length).toBe(0);

    // Verify Running Plan Cart values
    expect(container.querySelector('#cartTotalAssets')?.textContent).toBe('$150,000');
    expect(container.querySelector('#cartMonthlyIncome')?.textContent).toBe('$2,500/mo');
    expect(container.querySelector('#cartDesiredSpending')?.textContent).toBe('$65,000/yr');
  });
});

describe('Part 5: Tax Bucket Color Harmonization in Charts & InputsPanel', () => {
  it('aligns Asset Breakdown chart dataset colors with the tax bucket color tokens', () => {
    const results = fixtureResults('aug_13_plan');
    const chart = assetBreakdownConfig(results, 'nominal');

    // Pretax: #2563eb
    expect(chart.data.datasets[0].borderColor).toBe('#2563eb');
    expect(chart.data.datasets[0].backgroundColor).toBe('rgba(37, 99, 235, 0.75)');

    // Roth: #8b5cf6
    expect(chart.data.datasets[1].borderColor).toBe('#8b5cf6');
    expect(chart.data.datasets[1].backgroundColor).toBe('rgba(139, 92, 246, 0.75)');

    // Taxable: #059669
    expect(chart.data.datasets[2].borderColor).toBe('#059669');
    expect(chart.data.datasets[2].backgroundColor).toBe('rgba(5, 150, 105, 0.75)');

    // HSA: #0891b2
    expect(chart.data.datasets[3].borderColor).toBe('#0891b2');
    expect(chart.data.datasets[3].backgroundColor).toBe('rgba(8, 145, 178, 0.75)');
  });

  it('renders tax bucket border stripes and badges on InputsPanel return sliders', () => {
    const results = fixtureResults('aug_13_plan');
    const { container } = render(InputsPanel, {
      results,
      onApply: vi.fn(),
    });

    // Check presence of tax-specific slider cards
    expect(container.querySelector('.slider-tax-pretax')).not.toBeNull();
    expect(container.querySelector('.slider-tax-roth')).not.toBeNull();
    expect(container.querySelector('.slider-tax-taxable')).not.toBeNull();
    expect(container.querySelector('.slider-tax-hsa')).not.toBeNull();

    // Check presence of badge-tax chips inside the slider cards
    const pretaxBadge = container.querySelector('.slider-tax-pretax .badge-tax-pretax');
    expect(pretaxBadge).not.toBeNull();
    expect(pretaxBadge?.textContent).toContain('Pre-Tax');

    const rothBadge = container.querySelector('.slider-tax-roth .badge-tax-roth');
    expect(rothBadge).not.toBeNull();
    expect(rothBadge?.textContent).toContain('Roth');

    // Check Update Inputs button text
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn?.textContent?.trim()).toContain('Update Inputs');
    expect(submitBtn?.textContent?.trim()).not.toContain('Re-Run Simulation');
  });
});

describe('Part 6: Household Identity Badges & Accents in Demographics & Account Cards', () => {
  it('renders primary planner and spouse sections with person identity badges', () => {
    const plan: Plan = {
      ...getDefaultData(),
      user_name: 'Elizabeth Bennet',
      is_married: true,
      spouse_name: 'Fitzwilliam Darcy',
    };

    const { container } = render(DemographicsTab, {
      plan,
      onNext: vi.fn(),
    });

    // Primary planner card
    const userSection = container.querySelector('.person-section-user');
    expect(userSection).not.toBeNull();
    const userBadge = userSection?.querySelector('.badge-person-user');
    expect(userBadge).not.toBeNull();
    expect(userBadge?.textContent).toContain('Primary Planner');

    // Spouse card
    const spouseSection = container.querySelector('#spouse_section.person-section-spouse');
    expect(spouseSection).not.toBeNull();
    const spouseBadge = spouseSection?.querySelector('.badge-person-spouse');
    expect(spouseBadge).not.toBeNull();
    expect(spouseBadge?.textContent).toContain('Spouse');
  });

  it('renders person ownership badges on Account Cards when married', () => {
    const plan: Plan = {
      ...getDefaultData(),
      user_name: 'Alex',
      is_married: true,
      spouse_name: 'Taylor',
    };
    const people = personLabels(plan);

    const userAccount: Account = {
      id: 'acc-user',
      name: 'Alex 401(k)',
      type: 'pretax',
      owner: 'user',
      balance: 100000,
    };

    const spouseAccount: Account = {
      id: 'acc-spouse',
      name: 'Taylor IRA',
      type: 'roth',
      owner: 'spouse',
      balance: 75000,
    };

    // User Account Card
    const { container: userContainer } = render(AccountCard, {
      account: userAccount,
      people,
      priorNames: [],
      onDelete: vi.fn(),
      onShowAssumptions: vi.fn(),
    });

    const userBadge = userContainer.querySelector('.badge-person-user');
    expect(userBadge).not.toBeNull();
    expect(userBadge?.textContent).toContain('Alex');

    // Spouse Account Card
    const { container: spouseContainer } = render(AccountCard, {
      account: spouseAccount,
      people,
      priorNames: [],
      onDelete: vi.fn(),
      onShowAssumptions: vi.fn(),
    });

    const spouseBadge = spouseContainer.querySelector('.badge-person-spouse');
    expect(spouseBadge).not.toBeNull();
    expect(spouseBadge?.textContent).toContain('Taylor');
  });

  it('does not render person ownership badge on Account Cards when single', () => {
    const singlePlan: Plan = {
      ...getDefaultData(),
      user_name: 'Single Planner',
      is_married: false,
    };
    const singlePeople = personLabels(singlePlan);

    const account: Account = {
      id: 'acc-single',
      name: 'My Roth',
      type: 'roth',
      owner: 'user',
      balance: 50000,
    };

    const { container } = render(AccountCard, {
      account,
      people: singlePeople,
      priorNames: [],
      onDelete: vi.fn(),
      onShowAssumptions: vi.fn(),
    });

    expect(container.querySelector('.badge-person')).toBeNull();
  });
});
