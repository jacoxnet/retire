<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Adjustment, IncomeSource, Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import PercentInput from '../../shared/PercentInput.svelte';
  import { personLabels } from '../../../plan/accountCard';
  import { editableSchedule, incomeView, newIncomeSource, periodView, ssView } from '../../../plan/scheduleRows';
  import { formatMoney } from '../../../app/format';
  import AdjustmentSchedule from '../AdjustmentSchedule.svelte';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  let ssVersion = $state(0);
  const userSS = $derived.by(() => {
    ssVersion;
    return ssView(plan.social_security, 'user');
  });
  const spouseSS = $derived.by(() => {
    ssVersion;
    return ssView(plan.social_security, 'spouse');
  });

  let streamVersion = $state(0);
  const incomeSources = $derived.by(() => {
    streamVersion;
    return plan.income_sources ?? [];
  });

  let addingStream = $state(false);
  let editingStreamIndex: number | null = $state(null);
  let draftStream: IncomeSource | null = $state(null);
  let streamOwner = $state<'user' | 'spouse'>('user');

  function adjustmentSummary(stream: IncomeSource): string {
    const periods = incomeView(stream).periods;
    if (!periods || periods.length === 0) return 'None (0%)';
    if (periods.length === 1) {
      const p = periods[0];
      if (p.adjust_type === 'none') return 'None (0%)';
      if (p.adjust_type === 'inflation') return 'Inflation';
      if (p.adjust_type === 'fixed_pct') return `${p.adjust_val ?? 0}% Fixed`;
      if (p.adjust_type === 'inflation_less_pct') return `Inflation less ${p.adjust_val ?? 0}%`;
      return p.adjust_type;
    }
    return `${periods.length} adjustment periods`;
  }

  function startAddingStream(name: string, defaultAmount: number, defaultAdjType: string = 'inflation') {
    editingStreamIndex = null;
    const s = newIncomeSource();
    s.name = name;
    s.amount = defaultAmount;
    s.frequency = 'annual';
    s.start_age_type = 'retirement';
    s.end_age_type = 'death';
    s.has_survivor_benefit = married;
    s.survivor_benefit_pct = 50;
    streamOwner = 'user';
    const schedule = editableSchedule(s);
    if (schedule.length > 0 && defaultAdjType !== 'inflation') {
      schedule[0].adjust_type = defaultAdjType;
    }
    s.adjust_type = defaultAdjType;
    draftStream = {
      ...s,
      adjustments: schedule.map((p, i) => ({ ...periodView(p, i) }) as Adjustment),
    };
    addingStream = true;
  }

  function startEditingStream(index: number) {
    const stream = plan.income_sources?.[index];
    if (!stream) return;
    addingStream = false;
    editingStreamIndex = index;
    streamOwner = (stream.start_age_type === 'spouse_retirement' || stream.end_age_type === 'spouse_death') ? 'spouse' : 'user';
    const schedule = editableSchedule(stream);
    draftStream = {
      ...stream,
      adjustments: schedule.map((p, i) => ({ ...periodView(p, i) }) as Adjustment),
    };
  }

  function cancelStream() {
    addingStream = false;
    editingStreamIndex = null;
    draftStream = null;
  }

  function saveStream() {
    if (draftStream) {
      if (!draftStream.name?.trim()) draftStream.name = 'Income Stream';
      if (!married) {
        draftStream.has_survivor_benefit = false;
        draftStream.start_age_type = 'retirement';
        draftStream.end_age_type = 'death';
      } else if (streamOwner === 'spouse') {
        draftStream.start_age_type = draftStream.start_age_type === 'retirement' ? 'spouse_retirement' : draftStream.start_age_type;
        draftStream.end_age_type = 'spouse_death';
      } else {
        draftStream.start_age_type = draftStream.start_age_type === 'spouse_retirement' ? 'retirement' : draftStream.start_age_type;
        draftStream.end_age_type = 'death';
      }
      if (draftStream.adjustments && draftStream.adjustments.length > 0) {
        draftStream.adjust_type = draftStream.adjustments[0].adjust_type;
        draftStream.adjust_val = draftStream.adjustments[0].adjust_val;
      }
      if (editingStreamIndex !== null) {
        Object.assign(plan.income_sources![editingStreamIndex], draftStream);
        plan.income_sources = [...plan.income_sources!];
      } else {
        plan.income_sources = [...(plan.income_sources ?? []), draftStream];
      }
      streamVersion++;
    }
    addingStream = false;
    editingStreamIndex = null;
    draftStream = null;
  }

  function removeStream(index: number) {
    if (editingStreamIndex === index) {
      cancelStream();
    } else if (editingStreamIndex !== null && editingStreamIndex > index) {
      editingStreamIndex--;
    }
    plan.income_sources?.splice(index, 1);
    plan.income_sources = [...(plan.income_sources ?? [])];
    streamVersion++;
  }

  // Safety net: clean up draft state on question change
  let lastQuestionId = $state<string | null>(null);
  $effect(() => {
    const current = wizard.currentQuestionId;
    if (lastQuestionId !== null && current !== lastQuestionId) {
      cancelStream();
    }
    lastQuestionId = current;
  });

  function onNext() {
    if ((addingStream || editingStreamIndex !== null) && draftStream) {
      if ((Number(draftStream.amount) || 0) > 0) {
        saveStream();
      } else {
        cancelStream();
      }
    }
    wizard.markAnswered(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
    cancelStream();
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'income_user_ss'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Are you currently receiving Social Security benefits?</h4>
      <p class="text-secondary mb-4">
        Social Security provides inflation-protected, guaranteed monthly retirement income for the rest of your life.
      </p>

      <div class="d-flex flex-column gap-3 mb-4" style="max-width: 580px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {userSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              user_receiving: true,
              user_future_entitled: false,
              user_entitled: true,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-check me-2"></i>Yes</div>
          <div class="small opacity-75">I am already receiving monthly payments</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!userSS.receiving && userSS.future_entitled ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              user_receiving: false,
              user_future_entitled: true,
              user_entitled: true,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-clock me-2"></i>No</div>
          <div class="small opacity-75">I plan to claim in the future</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!userSS.receiving && !userSS.future_entitled ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              user_receiving: false,
              user_future_entitled: false,
              user_entitled: false,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-ban me-2"></i>No</div>
          <div class="small opacity-75">I will not be eligible to receive Social Security payments</div>
        </button>
      </div>

      {#if userSS.receiving}
        <div class="mb-4" style="max-width: 300px;">
          <label for="int_user_ss_cur_amt" class="form-label fw-semibold">Current Monthly Benefit</label>
          <div class="input-group input-group-lg">
            <span class="input-group-text">$</span>
            <MoneyInput
              id="int_user_ss_cur_amt"
              class="form-control fw-bold"
              bind:value={plan.social_security!.user_amount}
            />
            <span class="input-group-text text-muted small">/ mo</span>
          </div>
        </div>
      {:else if userSS.future_entitled}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 600px;">
          <div class="row g-3">
            <div class="col-sm-6">
              <label for="int_user_ss_start_age" class="form-label small fw-semibold">Planned Claiming Age (62–70)</label>
              <input
                type="number"
                class="form-control form-control-lg text-center fw-bold"
                id="int_user_ss_start_age"
                min="62"
                max="70"
                placeholder="67"
                bind:value={plan.social_security!.user_start_age}
              />
              <div class="small text-muted mt-1">Full Retirement Age is 67 for most people.</div>
            </div>
            <div class="col-sm-6">
              <label for="int_user_ss_est_amt" class="form-label small fw-semibold">Estimated Monthly Benefit</label>
              <div class="input-group input-group-lg">
                <span class="input-group-text">$</span>
                <MoneyInput
                  id="int_user_ss_est_amt"
                  class="form-control fw-bold"
                  bind:value={plan.social_security!.user_amount}
                />
                <span class="input-group-text text-muted small">/ mo</span>
              </div>
              <div class="small text-muted mt-1 fst-italic">Check ssa.gov/myaccount for your estimate. If unsure, $2,000/month may be a reasonable estimate.</div>
            </div>
          </div>
        </div>
      {:else}
        <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
          <i class="fa-solid fa-circle-info text-primary me-2"></i>
          No Social Security benefit will be included in your retirement plan calculations.
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'income_spouse_ss'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Is {people.spouseName} currently receiving Social Security benefits?</h4>
      <p class="text-secondary mb-4">
        Enter your spouse's claiming status and expected benefit amount.
      </p>

      <div class="d-flex flex-column gap-3 mb-4" style="max-width: 580px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {spouseSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              spouse_receiving: true,
              spouse_future_entitled: false,
              spouse_entitled: true,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-check me-2"></i>Yes</div>
          <div class="small opacity-75">{people.spouseName} is already receiving benefits</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!spouseSS.receiving && spouseSS.future_entitled ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              spouse_receiving: false,
              spouse_future_entitled: true,
              spouse_entitled: true,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-clock me-2"></i>No</div>
          <div class="small opacity-75">Plans to claim in the future</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!spouseSS.receiving && !spouseSS.future_entitled ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security = {
              ...(plan.social_security ?? {}),
              spouse_receiving: false,
              spouse_future_entitled: false,
              spouse_entitled: false,
            };
            ssVersion++;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-ban me-2"></i>No</div>
          <div class="small opacity-75">{people.spouseName} will not be eligible to receive Social Security payments</div>
        </button>
      </div>

      {#if spouseSS.receiving}
        <div class="mb-4" style="max-width: 300px;">
          <label for="int_spouse_ss_cur_amt" class="form-label fw-semibold">Current Monthly Benefit</label>
          <div class="input-group input-group-lg">
            <span class="input-group-text">$</span>
            <MoneyInput
              id="int_spouse_ss_cur_amt"
              class="form-control fw-bold"
              bind:value={plan.social_security!.spouse_amount}
            />
            <span class="input-group-text text-muted small">/ mo</span>
          </div>
        </div>
      {:else if spouseSS.future_entitled}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 600px;">
          <div class="row g-3">
            <div class="col-sm-6">
              <label for="int_spouse_ss_start_age" class="form-label small fw-semibold">{people.spouseName}'s Planned Claiming Age</label>
              <input
                type="number"
                class="form-control form-control-lg text-center fw-bold"
                id="int_spouse_ss_start_age"
                min="62"
                max="70"
                placeholder="67"
                bind:value={plan.social_security!.spouse_start_age}
              />
            </div>
            <div class="col-sm-6">
              <label for="int_spouse_ss_est_amt" class="form-label small fw-semibold">Estimated Monthly Benefit</label>
              <div class="input-group input-group-lg">
                <span class="input-group-text">$</span>
                <MoneyInput
                  id="int_spouse_ss_est_amt"
                  class="form-control fw-bold"
                  bind:value={plan.social_security!.spouse_amount}
                />
                <span class="input-group-text text-muted small">/ mo</span>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
          <i class="fa-solid fa-circle-info text-primary me-2"></i>
          No Social Security benefit will be modeled for {people.spouseName}.
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'income_streams'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you expect any other steady income sources during retirement?</h4>
      <p class="text-secondary mb-3">
        Enter pensions, annuities, rental property profits, or part-time consulting income.
      </p>

      <!-- Current Income Streams List -->
      {#if incomeSources.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each incomeSources as stream, i (i)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center {editingStreamIndex === i ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark">
                  {stream.name}
                  {#if editingStreamIndex === i}
                    <span class="badge bg-primary text-white ms-2 small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  Amount: {formatMoney(Number(stream.amount) || 0)} ({stream.frequency ?? 'annual'}) &bull; Starts: {stream.start_age_type} &bull; Adjustment: {adjustmentSummary(stream)}{#if married} &bull; Survivor: {stream.has_survivor_benefit ? `${stream.survivor_benefit_pct}%` : 'None'}{/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditingStream(i)} aria-label="Edit {stream.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeStream(i)} aria-label="Delete {stream.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingStream && editingStreamIndex === null}
        <div class="d-flex flex-wrap gap-2 mb-4" style="max-width: 650px;">
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingStream("Company Pension", 24000)}>
            🏛️ Company or Govt Pension
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingStream("Fixed Annuity", 12000, "none")}>
            📜 Annuity Payment
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingStream("Rental Income", 18000)}>
            🏢 Rental Property Income
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm px-3" onclick={() => startAddingStream("Consulting / Work", 15000)}>
            ➕ Custom Income Stream
          </button>
        </div>
      {/if}

      {#if (addingStream || editingStreamIndex !== null) && draftStream}
        <div class="card p-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary mb-0">{editingStreamIndex !== null ? 'Edit Income Stream' : 'Configure Income Stream'}</h5>
            <button type="button" class="btn-close" aria-label="Cancel" onclick={cancelStream}></button>
          </div>

          <div class="row g-3 mb-3">
            <div class={married ? 'col-sm-7' : 'col-12'}>
              <label for="int_inc_name" class="form-label small fw-semibold">Income Name</label>
              <input type="text" class="form-control form-control-sm" id="int_inc_name" bind:value={draftStream.name} />
            </div>
            {#if married}
              <div class="col-sm-5">
                <label for="int_inc_owner" class="form-label small fw-semibold">Whose Income Stream?</label>
                <select class="form-select form-select-sm" id="int_inc_owner" bind:value={streamOwner}>
                  <option value="user">{people.userName}</option>
                  <option value="spouse">{people.spouseName}</option>
                </select>
              </div>
            {/if}
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_inc_amount" class="form-label small fw-semibold">Amount</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_inc_amount" class="form-control" bind:value={draftStream.amount} />
              </div>
            </div>
            <div class="col-sm-6">
              <label for="int_inc_freq" class="form-label small fw-semibold">Frequency</label>
              <select class="form-select form-select-sm" id="int_inc_freq" bind:value={draftStream.frequency}>
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {#if married}
            <div class="p-3 bg-white border rounded-3 mb-3">
              <div class="form-check form-switch ps-5 mb-2">
                <input class="form-check-input" type="checkbox" id="int_inc_surv" bind:checked={draftStream.has_survivor_benefit} />
                <label class="form-check-label small fw-bold" for="int_inc_surv">
                  Does it continue after death for the surviving spouse?
                </label>
              </div>
              {#if draftStream.has_survivor_benefit}
                <div class="d-flex align-items-center gap-2 mt-2">
                  <span class="small fw-semibold">Survivor Benefit Percentage:</span>
                  <div style="max-width: 90px;">
                    <PercentInput class="form-control form-control-sm percent-input text-center" bind:value={draftStream.survivor_benefit_pct} emptyValue={100} />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <AdjustmentSchedule bind:item={draftStream} {people} idPrefix="int_inc_adj" />

          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={cancelStream}>Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" onclick={saveStream}>{editingStreamIndex !== null ? 'Save Changes' : 'Save Income Stream'}</button>
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
