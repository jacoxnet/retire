<script lang="ts">
  import { ALL_QUESTIONS, type InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';
  import { personLabels } from '../../../plan/accountCard';
  import { formatMoney } from '../../../app/format';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
    onRun: () => void;
    onClose: () => void;
  }
  let { wizard, plan, onRun, onClose }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  const skippedItems = $derived(
    wizard.skippedQuestions
      .filter((id) => wizard.activeQuestionList(plan).includes(id))
      .map((id) => ALL_QUESTIONS.find((q) => q.id === id))
      .filter((q): q is typeof ALL_QUESTIONS[number] => q !== undefined)
  );

  const totalAccountBalance = $derived(
    (plan.accounts ?? []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
  );
  const accountCount = $derived((plan.accounts ?? []).length);

  function handleJump(questionId: string) {
    wizard.goTo(questionId);
  }
</script>

<div class="stage-container py-2">
  <div class="question-card">
    <h4 class="fw-bold text-primary mb-2">You're all set! Here is a summary before we test your retirement plan.</h4>
    <p class="text-secondary mb-4">
      Review your entered information below. You can run your simulation now, or jump to any section to make adjustments.
    </p>

    <!-- Skipped Questions Banner / Card -->
    {#if skippedItems.length > 0}
      <div class="card border-warning bg-warning-subtle shadow-sm p-3 mb-4 rounded-3" style="max-width: 650px;">
        <div class="d-flex align-items-center gap-2 mb-2">
          <i class="fa-solid fa-triangle-exclamation text-warning-emphasis fs-5"></i>
          <h6 class="fw-bold text-warning-emphasis mb-0">You skipped {skippedItems.length} question{skippedItems.length > 1 ? 's' : ''}:</h6>
        </div>
        <p class="small text-secondary mb-3">
          Standard defaults have been applied for these items. You can proceed now or take a moment to answer them:
        </p>

        <div class="d-flex flex-column gap-2">
          {#each skippedItems as item (item.id)}
            <div class="bg-white p-2 px-3 border rounded-2 d-flex justify-content-between align-items-center">
              <div>
                <span class="fw-semibold text-dark small">{item.title}</span>
                <span class="text-muted small ms-2 fst-italic">({item.defaultDescription})</span>
              </div>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm px-2 py-0 small"
                onclick={() => handleJump(item.id)}
              >
                Answer Now
              </button>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-4 rounded-3 small" style="max-width: 650px;">
        <i class="fa-solid fa-circle-check fs-5 me-2 text-success"></i>
        <span><strong>Great job!</strong> All interview questions have been answered.</span>
      </div>
    {/if}

    <!-- Plan Summary Card -->
    <div class="card p-4 border shadow-sm rounded-4 mb-4 bg-light" style="max-width: 650px;">
      <h5 class="fw-bold text-primary mb-3"><i class="fa-solid fa-clipboard-list me-2"></i>Retirement Plan Snapshot</h5>

      <div class="row g-3">
        <!-- Demographics -->
        <div class="col-sm-6">
          <div class="p-3 bg-white border rounded-3 h-100">
            <div class="text-muted small fw-semibold text-uppercase mb-1">Timeline & Household</div>
            <div class="fw-bold text-dark fs-6">{people.userName} (Age {people.userAge})</div>
            <div class="small text-secondary">Retires at: <strong>{people.userRetAge}</strong> &bull; Horizon: <strong>Age {people.userDeathAge}</strong></div>
            {#if married}
              <hr class="my-2" />
              <div class="fw-bold text-dark fs-6">{people.spouseName} (Age {people.spouseAge})</div>
              <div class="small text-secondary">Retires at: <strong>{people.spouseRetAge}</strong> &bull; Horizon: <strong>Age {people.spouseDeathAge}</strong></div>
            {/if}
          </div>
        </div>

        <!-- Accounts -->
        <div class="col-sm-6">
          <div class="p-3 bg-white border rounded-3 h-100">
            <div class="text-muted small fw-semibold text-uppercase mb-1">Retirement Portfolio</div>
            <div class="fw-bold text-primary fs-5">{formatMoney(totalAccountBalance)}</div>
            <div class="small text-secondary">{accountCount} account{accountCount === 1 ? '' : 's'} designated for retirement</div>
          </div>
        </div>

        <!-- Spending -->
        <div class="col-sm-6">
          <div class="p-3 bg-white border rounded-3 h-100">
            <div class="text-muted small fw-semibold text-uppercase mb-1">Retirement Living Costs</div>
            <div class="fw-bold text-dark fs-6">{formatMoney(Number(plan.desired_spending) || 0)} / year</div>
            <div class="small text-secondary">
              {plan.adjust_spending_inflation ? 'Adjusted annually for inflation' : 'Fixed nominal spending'}
            </div>
            {#if married}
              <div class="small text-muted mt-1">Surviving spouse: {formatMoney(Number(plan.survivor_spending) || 0)}/yr</div>
            {/if}
          </div>
        </div>

        <!-- Guaranteed Income -->
        <div class="col-sm-6">
          <div class="p-3 bg-white border rounded-3 h-100">
            <div class="text-muted small fw-semibold text-uppercase mb-1">Social Security & Income</div>
            <div class="fw-bold text-dark fs-6">
              {#if plan.social_security?.user_amount}
                {formatMoney(Number(plan.social_security.user_amount))}/mo
              {:else}
                Social Security modeled
              {/if}
            </div>
            <div class="small text-secondary">
              Claiming at age {plan.social_security?.user_start_age ?? 67}
            </div>
            {#if (plan.income_sources ?? []).length > 0}
              <div class="small text-muted mt-1">{plan.income_sources?.length} additional income stream(s)</div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Launch Buttons -->
  <div class="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3 pt-4 border-top mt-4">
    <button type="button" class="btn btn-outline-secondary px-3" onclick={() => wizard.prev(plan)}>
      <i class="fa-solid fa-arrow-left me-1"></i> Back
    </button>

    <div class="d-flex flex-column flex-sm-row align-items-center gap-2">
      <button type="button" class="btn btn-outline-primary px-3 py-2 fw-semibold" onclick={onClose}>
        <i class="fa-solid fa-table-columns me-1"></i> Review Data in Tabs
      </button>

      <button type="button" class="btn btn-success btn-lg px-4 py-2 fw-bold shadow-sm" onclick={onRun}>
        <i class="fa-solid fa-rocket me-2"></i> Run Retirement Simulation
      </button>
    </div>
  </div>
</div>
