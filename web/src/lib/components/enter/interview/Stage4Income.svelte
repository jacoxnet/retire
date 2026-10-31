<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { IncomeSource, Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import PercentInput from '../../shared/PercentInput.svelte';
  import { personLabels } from '../../../plan/accountCard';
  import { newIncomeSource, ssView } from '../../../plan/scheduleRows';
  import { formatMoney } from '../../../app/format';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  const userSS = $derived(ssView(plan.social_security, 'user'));
  const spouseSS = $derived(ssView(plan.social_security, 'spouse'));

  let addingStream = $state(false);
  let draftStream: IncomeSource | null = $state(null);
  let streamOwner = $state<'user' | 'spouse'>('user');

  function startAddingStream(name: string, defaultAmount: number) {
    const s = newIncomeSource();
    s.name = name;
    s.amount = defaultAmount;
    s.frequency = 'annual';
    s.start_age_type = 'retirement';
    s.end_age_type = 'death';
    s.has_survivor_benefit = married;
    s.survivor_benefit_pct = 50;
    streamOwner = 'user';
    draftStream = s;
    addingStream = true;
  }

  function saveStream() {
    if (draftStream) {
      if (!draftStream.name?.trim()) draftStream.name = 'Income Stream';
      if (streamOwner === 'spouse') {
        draftStream.start_age_type = draftStream.start_age_type === 'retirement' ? 'spouse_retirement' : draftStream.start_age_type;
        draftStream.end_age_type = 'spouse_death';
      } else {
        draftStream.start_age_type = draftStream.start_age_type === 'spouse_retirement' ? 'retirement' : draftStream.start_age_type;
        draftStream.end_age_type = 'death';
      }
      (plan.income_sources ??= []).push(draftStream);
    }
    addingStream = false;
    draftStream = null;
  }

  function removeStream(index: number) {
    plan.income_sources?.splice(index, 1);
  }

  function onNext() {
    wizard.clearSkipped(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
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

      <div class="d-flex flex-column flex-sm-row gap-3 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {userSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security ??= {};
            plan.social_security.user_receiving = true;
            plan.social_security.user_future_entitled = false;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-check me-2"></i>Yes</div>
          <div class="small opacity-75">I am already receiving monthly payments</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {!userSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security ??= {};
            plan.social_security.user_receiving = false;
            plan.social_security.user_future_entitled = true;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-clock me-2"></i>No</div>
          <div class="small opacity-75">I plan to claim in the future</div>
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
      {:else}
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
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'income_spouse_ss'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Is {people.spouseName} currently receiving Social Security benefits?</h4>
      <p class="text-secondary mb-4">
        Enter your spouse's claiming status and expected benefit amount.
      </p>

      <div class="d-flex flex-column flex-sm-row gap-3 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {spouseSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security ??= {};
            plan.social_security.spouse_receiving = true;
            plan.social_security.spouse_future_entitled = false;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-check me-2"></i>Yes</div>
          <div class="small opacity-75">{people.spouseName} is already receiving benefits</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {!spouseSS.receiving ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            plan.social_security ??= {};
            plan.social_security.spouse_receiving = false;
            plan.social_security.spouse_future_entitled = true;
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-clock me-2"></i>No</div>
          <div class="small opacity-75">Plans to claim in the future</div>
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
      {:else}
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
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'income_streams'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you expect any other steady income sources during retirement?</h4>
      <p class="text-secondary mb-3">
        Enter pensions, annuities, rental property profits, or part-time consulting income.
      </p>

      <!-- Current Income Streams List -->
      {#if (plan.income_sources ?? []).length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each plan.income_sources ?? [] as stream, i (i)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{stream.name}</div>
                <div class="small text-muted">
                  Amount: {formatMoney(Number(stream.amount) || 0)} ({stream.frequency ?? 'annual'}) &bull; Starts: {stream.start_age_type} &bull; Survivor: {stream.has_survivor_benefit ? `${stream.survivor_benefit_pct}%` : 'None'}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeStream(i)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingStream}
        <div class="d-flex flex-wrap gap-2 mb-4" style="max-width: 650px;">
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingStream("Company Pension", 24000)}>
            🏛️ Company or Govt Pension
          </button>
          <button type="button" class="btn btn-outline-primary btn-sm px-3" onclick={() => startAddingStream("Fixed Annuity", 12000)}>
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

      {#if addingStream && draftStream}
        <div class="card p-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary mb-0">Configure Income Stream</h5>
            <button type="button" class="btn-close" aria-label="Cancel" onclick={() => (addingStream = false)}></button>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-7">
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

          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => (addingStream = false)}>Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" onclick={saveStream}>Save Income Stream</button>
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
