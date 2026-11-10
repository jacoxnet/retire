<script lang="ts">
  import { STAGES, type InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';
  import { formatMoney } from '../../../app/format';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
    onOpenSkipped: () => void;
  }
  let { wizard, plan, onOpenSkipped }: Props = $props();

  const currentStage = $derived(wizard.currentStage(plan));
  const skippedCount = $derived(
    wizard.skippedQuestions.filter((id) => wizard.activeQuestionList(plan).includes(id)).length
  );

  const STAGE_ICONS: Record<number, string> = {
    1: 'fa-house-user',
    2: 'fa-wallet',
    3: 'fa-basket-shopping',
    4: 'fa-money-bill-trend-up',
    5: 'fa-landmark-dome',
    6: 'fa-flag-checkered',
  };

  function jumpToStage(stageNum: number) {
    wizard.jumpToStage(stageNum, plan);
  }

  const totalAssets = $derived(
    (plan.accounts ?? []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
  );

  const monthlyGuaranteedIncome = $derived.by(() => {
    let monthly = 0;
    const ss = plan.social_security;
    if (ss) {
      if (ss.user_receiving || ss.user_future_entitled) {
        const uAmt = Number(ss.user_amount) || 0;
        monthly += ss.user_freq === 'annual' ? uAmt / 12 : uAmt;
      }
      if (plan.is_married && (ss.spouse_receiving || ss.spouse_future_entitled)) {
        const sAmt = Number(ss.spouse_amount) || 0;
        monthly += ss.spouse_freq === 'annual' ? sAmt / 12 : sAmt;
      }
    }
    for (const inc of plan.income_sources ?? []) {
      const amt = Number(inc.amount) || 0;
      monthly += inc.frequency === 'annual' ? amt / 12 : amt;
    }
    return Math.round(monthly);
  });

  const desiredSpending = $derived(Number(plan.desired_spending) || 0);
</script>

<div class="interview-header mb-4 border-bottom pb-3">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fs-6">
        <i class="fa-solid fa-compass me-1"></i> Guided Retirement Walkthrough
      </span>
      <span class="text-secondary small d-none d-md-inline">Step-by-step plain English setup</span>
    </div>

    {#if skippedCount > 0}
      <button
        type="button"
        class="btn btn-sm btn-outline-warning d-flex align-items-center gap-1 shadow-sm px-2 py-1"
        onclick={onOpenSkipped}
        title="View skipped questions"
      >
        <i class="fa-solid fa-circle-exclamation"></i>
        <span class="fw-semibold">{skippedCount} Skipped</span>
        <span class="badge bg-warning text-dark ms-1">Review</span>
      </button>
    {/if}
  </div>

  <!-- Stage indicator pills -->
  <div class="d-flex flex-wrap gap-1 gap-md-2 justify-content-between align-items-center stage-pills">
    {#each STAGES as s (s.number)}
      {@const isActive = s.number === currentStage}
      {@const isDone = !isActive && wizard.isStageAnswered(s.number, plan)}
      {@const isUpcoming = s.number > currentStage && !isDone}
      <button
        type="button"
        class="stage-pill stage-pill-btn d-flex align-items-center py-1 px-2 rounded-2 small"
        class:stage-active={isActive}
        class:stage-done={isDone}
        class:stage-upcoming={isUpcoming}
        onclick={() => jumpToStage(s.number)}
        title={isUpcoming
          ? `Skip ahead to Stage ${s.number}: ${s.name} (unanswered questions go to the skipped list)`
          : `Jump to Stage ${s.number}: ${s.name}`}
      >
        <span class="stage-num me-1 fw-bold rounded-circle text-center">
          {#if isDone}
            <i class="fa-solid fa-check"></i>
          {:else}
            {s.number}
          {/if}
        </span>
        <i class="fa-solid {STAGE_ICONS[s.number]} me-1 small"></i>
        <span class="stage-label d-none d-sm-inline">{s.short}</span>
      </button>
    {/each}
  </div>

  <!-- Running Plan Cart Summary -->
  <div class="plan-cart d-flex flex-wrap gap-2 gap-md-4 align-items-center justify-content-between p-2 mt-3 rounded-2 bg-light-subtle border">
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-secondary-subtle text-secondary small py-1 px-2">
        <i class="fa-solid fa-cart-flatbed-suitcase me-1"></i>Plan Running Total
      </span>
    </div>
    <div class="d-flex align-items-center flex-wrap gap-3 gap-md-4">
      <div class="d-flex align-items-center gap-1">
        <i class="fa-solid fa-briefcase text-primary"></i>
        <span class="text-secondary small">Assets:</span>
        <span class="fw-bold text-dark small" id="cartTotalAssets">${formatMoney(totalAssets)}</span>
      </div>
      <div class="d-flex align-items-center gap-1">
        <i class="fa-solid fa-hand-holding-dollar text-success"></i>
        <span class="text-secondary small">Income:</span>
        <span class="fw-bold text-dark small" id="cartMonthlyIncome">${formatMoney(monthlyGuaranteedIncome)}/mo</span>
      </div>
      <div class="d-flex align-items-center gap-1">
        <i class="fa-solid fa-basket-shopping text-warning-emphasis"></i>
        <span class="text-secondary small">Spending:</span>
        <span class="fw-bold text-dark small" id="cartDesiredSpending">${formatMoney(desiredSpending)}/yr</span>
      </div>
    </div>
  </div>
</div>

<style>
  .stage-pill {
    transition: all 0.2s ease;
    background-color: var(--bs-gray-100, #f8f9fa);
    color: var(--bs-gray-600, #6c757d);
    border: 1px solid var(--bs-gray-300, #dee2e6);
  }
  .stage-pill-btn {
    cursor: pointer;
    background: var(--bs-gray-100, #f8f9fa);
    text-align: inherit;
    font: inherit;
  }
  .stage-pill-btn:hover {
    border-color: #0d6efd;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .stage-upcoming {
    color: var(--bs-gray-700, #495057);
  }
  .stage-upcoming:hover {
    color: var(--bs-gray-900, #212529);
  }
  .stage-num {
    display: inline-block;
    width: 20px;
    height: 20px;
    line-height: 18px;
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.05);
  }
  .stage-active {
    background-color: #e7f1ff;
    color: #0d6efd;
    border-color: #b6d4fe;
    font-weight: 600;
  }
  .stage-active .stage-num {
    background: #0d6efd;
    color: #fff;
  }
  .stage-done {
    background-color: #f0fdf4;
    color: #198754;
    border-color: #bbf7d0;
  }
  .stage-done .stage-num {
    background: #198754;
    color: #fff;
  }
</style>
