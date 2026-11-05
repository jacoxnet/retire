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

afterEach(cleanup);
window.scrollTo = () => {};

describe('Part 1: Account Tax Bucket Badges & Color Accents', () => {
  const people = personLabels(getDefaultData());

  const accountTypes: Array<{ type: Account['type']; expectedClass: string; expectedBadge: string; expectedIcon: string }> = [
    { type: 'roth', expectedClass: 'account-card-roth', expectedBadge: 'Tax-Free Growth', expectedIcon: 'fa-gem' },
    { type: 'pretax', expectedClass: 'account-card-pretax', expectedBadge: 'Tax-Deferred', expectedIcon: 'fa-hourglass-half' },
    { type: 'taxable', expectedClass: 'account-card-taxable', expectedBadge: 'Flexible / Taxable', expectedIcon: 'fa-coins' },
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

describe('Part 3: Sticky Quick Health Bar on EnterPage', () => {
  it('displays aggregated assets, spending, withdrawal rate, and sticky run button', async () => {
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

    // Total assets: $1,000,000
    expect(healthBar?.textContent).toContain('$1,000,000');
    // Desired spending: $40,000
    expect(healthBar?.textContent).toContain('$40,000/yr');
    // Estimated withdrawal rate: 40000 / 1000000 = 4.0%
    expect(healthBar?.textContent).toContain('4.0%');

    // Sticky Run button triggers onRun
    const btnRun = container.querySelector('#btnStickyRun') as HTMLButtonElement;
    expect(btnRun).not.toBeNull();
    expect(btnRun.disabled).toBe(false);

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

  it('toggles collapsed state when chevron toggle is clicked', async () => {
    const plan = getDefaultData();
    const { container } = render(EnterPage, {
      plan,
      mode: 'simple',
      onModeChange: vi.fn(),
      onRun: vi.fn(),
    });

    const healthBar = container.querySelector('.sticky-health-bar');
    expect(healthBar?.classList.contains('is-collapsed')).toBe(false);

    const toggleBtn = healthBar?.querySelector('button[aria-label*="Quick Health Bar"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();

    await fireEvent.click(toggleBtn);
    expect(healthBar?.classList.contains('is-collapsed')).toBe(true);

    await fireEvent.click(toggleBtn);
    expect(healthBar?.classList.contains('is-collapsed')).toBe(false);
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

    // Future Stage 4 should be non-interactive .stage-upcoming
    const upcomingPills = container.querySelectorAll('.stage-upcoming');
    expect(upcomingPills.length).toBeGreaterThan(0);

    // Verify Running Plan Cart values
    expect(container.querySelector('#cartTotalAssets')?.textContent).toBe('$150,000');
    expect(container.querySelector('#cartMonthlyIncome')?.textContent).toBe('$2,500/mo');
    expect(container.querySelector('#cartDesiredSpending')?.textContent).toBe('$65,000/yr');
  });
});
