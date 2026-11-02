<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { AdditionalSpendingItem, Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import { personLabels } from '../../../plan/accountCard';
  import { newSpendingItem } from '../../../plan/scheduleRows';
  import { formatMoney } from '../../../app/format';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  let addingMilestone = $state(false);
  let editingMilestoneIndex: number | null = $state(null);
  let draftItem: AdditionalSpendingItem | null = $state(null);

  function startAddingMilestone(name: string, defaultAmount: number, interval: number) {
    editingMilestoneIndex = null;
    const item = newSpendingItem();
    item.name = name;
    item.amount = defaultAmount;
    item.start_age = people.userRetAge;
    item.start_age_type = 'user';
    item.interval = interval;
    item.adjust_inflation = true;
    draftItem = item;
    addingMilestone = true;
  }

  function startEditingMilestone(index: number) {
    const item = plan.additional_spending?.[index];
    if (!item) return;
    addingMilestone = false;
    editingMilestoneIndex = index;
    draftItem = { ...item };
  }

  function cancelMilestone() {
    addingMilestone = false;
    editingMilestoneIndex = null;
    draftItem = null;
  }

  function saveMilestone() {
    if (draftItem) {
      if (!draftItem.name?.trim()) draftItem.name = 'Milestone Expense';
      if (editingMilestoneIndex !== null) {
        Object.assign(plan.additional_spending![editingMilestoneIndex], draftItem);
      } else {
        (plan.additional_spending ??= []).push(draftItem);
      }
    }
    addingMilestone = false;
    editingMilestoneIndex = null;
    draftItem = null;
  }

  function removeMilestone(index: number) {
    if (editingMilestoneIndex === index) {
      cancelMilestone();
    } else if (editingMilestoneIndex !== null && editingMilestoneIndex > index) {
      editingMilestoneIndex--;
    }
    plan.additional_spending?.splice(index, 1);
  }

  // Safety net: clean up draft state on question change
  let lastQuestionId = $state<string | null>(null);
  $effect(() => {
    const current = wizard.currentQuestionId;
    if (lastQuestionId !== null && current !== lastQuestionId) {
      cancelMilestone();
    }
    lastQuestionId = current;
  });

  function onNext() {
    if ((addingMilestone || editingMilestoneIndex !== null) && draftItem) {
      if ((Number(draftItem.amount) || 0) > 0) {
        saveMilestone();
      } else {
        cancelMilestone();
      }
    }
    wizard.clearSkipped(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
    cancelMilestone();
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'spending_start'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">When would you like your retirement living expenses to begin?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-circle-info text-primary me-2"></i>
        Until retirement spending begins, the tool assumes your day-to-day living expenses are covered by your regular job income.
      </div>

      <div class="d-flex flex-column gap-2 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {plan.begin_spending_age_type === 'retirement' || !plan.begin_spending_age_type ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => (plan.begin_spending_age_type = 'retirement')}
        >
          <div class="fw-bold">When I retire (Age {people.userRetAge})</div>
          <div class="small opacity-75">Start living off savings and retirement income at your retirement age</div>
        </button>

        {#if married}
          <button
            type="button"
            class="btn p-3 border rounded-3 text-start {plan.begin_spending_age_type === 'spouse_retirement' ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
            onclick={() => (plan.begin_spending_age_type = 'spouse_retirement')}
          >
            <div class="fw-bold">When {people.spouseName} retires (Age {people.spouseRetAge})</div>
            <div class="small opacity-75">Begin retirement spending when your spouse stops working</div>
          </button>
        {/if}

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {plan.begin_spending_age_type === 'user_specified' ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => (plan.begin_spending_age_type = 'user_specified')}
        >
          <div class="fw-bold">At a specific age</div>
          <div class="small opacity-75">Pick a custom age for spending to begin</div>
        </button>
      </div>

      {#if plan.begin_spending_age_type === 'user_specified'}
        <div class="mb-4" style="max-width: 250px;">
          <label for="int_spending_spec_age" class="form-label small fw-semibold">Custom Start Age</label>
          <input
            type="number"
            class="form-control form-control-lg text-center fw-bold"
            id="int_spending_spec_age"
            min="18"
            max="120"
            bind:value={plan.begin_spending_age_specified}
            placeholder="e.g. 62"
          />
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'spending_desired'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">In today's dollars, how much do you estimate needing each year for regular living expenses in retirement?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-calculator text-primary me-2"></i>
        <div>
          <strong>Helpful Guidelines:</strong>
          <ul class="mb-0 mt-1 ps-3">
            <li>Do not include income taxes here—the calculator estimates your federal and state taxes for you automatically.</li>
            <li>A typical benchmark is 80% to 90% of your current gross income, since you will no longer be paying payroll (FICA) taxes, saving for retirement, or paying work-related commuting costs.</li>
          </ul>
        </div>
      </div>

      <div class="mb-4" style="max-width: 320px;">
        <label for="int_desired_spending" class="form-label fw-semibold">Desired Annual Living Expenses</label>
        <div class="input-group input-group-lg">
          <span class="input-group-text">$</span>
          <MoneyInput id="int_desired_spending" class="form-control fw-bold" bind:value={plan.desired_spending} />
          <span class="input-group-text text-muted small">/ year</span>
        </div>
      </div>

      <div class="form-check form-switch ps-5 mb-4">
        <input
          class="form-check-input"
          type="checkbox"
          id="int_spending_inf"
          bind:checked={() => plan.adjust_spending_inflation ?? true, (v) => (plan.adjust_spending_inflation = v)}
        />
        <label class="form-check-label fw-semibold" for="int_spending_inf">
          Adjust this spending amount each year for inflation (Recommended)
        </label>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'spending_survivor'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">If one of you passes away, how much will the surviving spouse need each year?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-heart-pulse text-primary me-2"></i>
        Household expenses for a single person are typically 80% to 95% of what a couple spends (mortgage, property taxes, utilities, and home upkeep stay largely the same).
      </div>

      <div class="mb-4" style="max-width: 320px;">
        <label for="int_survivor_spending" class="form-label fw-semibold">Surviving Spouse Annual Spending</label>
        <div class="input-group input-group-lg">
          <span class="input-group-text">$</span>
          <MoneyInput id="int_survivor_spending" class="form-control fw-bold" bind:value={plan.survivor_spending} />
          <span class="input-group-text text-muted small">/ year</span>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'spending_milestones'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you anticipate any big, irregular expenses during retirement?</h4>
      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-circle-info text-primary me-2"></i>
        Only include major expenses that aren't already part of your normal annual budget.
      </div>

      <!-- Current Items -->
      {#if (plan.additional_spending ?? []).length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each plan.additional_spending ?? [] as item, i (i)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center {editingMilestoneIndex === i ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark">
                  {item.name}
                  {#if editingMilestoneIndex === i}
                    <span class="badge bg-primary text-white ms-2 small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  Amount: {formatMoney(Number(item.amount) || 0)} &bull; Start Age: {item.start_age} &bull; {Number(item.interval) > 0 ? `Repeats every ${item.interval} years` : 'One-time'}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditingMilestone(i)} aria-label="Edit {item.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeMilestone(i)} aria-label="Delete {item.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingMilestone && editingMilestoneIndex === null}
        <div class="d-flex flex-wrap gap-2 mb-4" style="max-width: 650px;">
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingMilestone('Vehicle Replacement', 35000, 8)}>
            🚗 Vehicle Replacement (e.g. every 8 yrs)
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingMilestone('Home Renovation / Roof', 25000, 0)}>
            🏡 Home Renovation (One-time)
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingMilestone('Dream Vacation', 15000, 0)}>
            ✈️ Milestone Vacation (One-time)
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm px-3" onclick={() => startAddingMilestone('Other Milestone', 10000, 0)}>
            ➕ Custom Expense
          </button>
        </div>
      {/if}

      {#if (addingMilestone || editingMilestoneIndex !== null) && draftItem}
        <div class="card p-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary mb-0">{editingMilestoneIndex !== null ? 'Edit Milestone Expense' : 'Configure Milestone Expense'}</h5>
            <button type="button" class="btn-close" aria-label="Cancel" onclick={cancelMilestone}></button>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-7">
              <label for="int_ms_name" class="form-label small fw-semibold">Expense Name</label>
              <input type="text" class="form-control form-control-sm" id="int_ms_name" bind:value={draftItem.name} />
            </div>
            <div class="col-sm-5">
              <label for="int_ms_amount" class="form-label small fw-semibold">Amount (Today's $)</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_ms_amount" class="form-control" bind:value={draftItem.amount} />
              </div>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_ms_age" class="form-label small fw-semibold">Start Age</label>
              <input type="number" class="form-control form-control-sm" id="int_ms_age" min="18" max="120" bind:value={draftItem.start_age} />
            </div>
            <div class="col-sm-6">
              <label for="int_ms_interval" class="form-label small fw-semibold">Repeats Every (Years)</label>
              <input type="number" class="form-control form-control-sm" id="int_ms_interval" min="0" max="50" placeholder="0 = One-time" bind:value={draftItem.interval} />
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={cancelMilestone}>Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" onclick={saveMilestone}>{editingMilestoneIndex !== null ? 'Save Changes' : 'Save Expense'}</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer Actions -->
  <div class="d-flex justify-content-between align-items-center pt-4 border-top mt-4">
    <button type="button" class="btn btn-outline-secondary px-3" onclick={() => wizard.prev(plan)}>
      <i class="fa-solid fa-arrow-left me-1"></i> Back
    </button>

    <div class="d-flex align-items-center gap-3">
      <button type="button" class="btn btn-link text-muted p-0 small" onclick={onSkip}>
        Skip for now
      </button>

      <button type="button" class="btn btn-primary px-4 fw-semibold" onclick={onNext}>
        Next <i class="fa-solid fa-arrow-right ms-1"></i>
      </button>
    </div>
  </div>
</div>
