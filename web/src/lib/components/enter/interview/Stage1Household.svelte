<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import PercentInput from '../../shared/PercentInput.svelte';
  import { applyMarriageToAccounts } from '../../../plan/accountCard';
  import { applyMarriageToSchedules } from '../../../plan/scheduleRows';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const married = $derived(!!plan.is_married);

  function handleMarriageToggle(val: boolean) {
    plan.is_married = val;
    plan.filing_status = val ? 'joint' : 'single';
    applyMarriageToAccounts(plan.accounts, val);
    applyMarriageToSchedules(plan, val);
  }

  function onNext() {
    wizard.markAnswered(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'user_name_age'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Let's start with the basics. Who are we planning for?</h4>
      <p class="text-secondary mb-4">
        Your age determines how many years your savings have left to grow before retirement, and how many years of living expenses they will need to support.
      </p>

      <div class="row g-3 mb-4" style="max-width: 550px;">
        <div class="col-sm-6">
          <label for="int_user_name" class="form-label fw-semibold">Your Name or Nickname</label>
          <input
            type="text"
            class="form-control form-control-lg"
            id="int_user_name"
            placeholder="e.g. Mike"
            bind:value={plan.user_name}
          />
        </div>
        <div class="col-sm-6">
          <label for="int_user_age" class="form-label fw-semibold">Your Present Age</label>
          <input
            type="number"
            class="form-control form-control-lg"
            id="int_user_age"
            min="18"
            max="120"
            placeholder="e.g. 58"
            bind:value={plan.user_age}
          />
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'user_ret_age'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">At what age do you hope to stop working or retire?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-circle-info text-primary me-2"></i>
        Don't worry if you aren't sure of the exact date. Pick your ideal target (such as 62, 65, or 67). Once your plan is set up, this tool can test different retirement ages or calculate the earliest age you may be able to safely retire. If you are already retired, enter your current age.
      </div>

      <div class="mb-4" style="max-width: 250px;">
        <label for="int_user_ret_age" class="form-label fw-semibold">Target Retirement Age</label>
        <input
          type="number"
          class="form-control form-control-lg text-center fw-bold"
          id="int_user_ret_age"
          min="18"
          max="120"
          placeholder="65"
          bind:value={plan.user_retirement_age}
        />
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'user_death_age'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Until what age would you like your savings to last?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-shield-heart text-primary me-2"></i>
        In financial planning, it's safer to plan for a longer lifespan than an average one to reduce your risk of outliving your money. Most financial planners recommend planning to age 90 or 95.
      </div>

      <div class="mb-4" style="max-width: 250px;">
        <label for="int_user_death_age" class="form-label fw-semibold">Planning Horizon (Age)</label>
        <input
          type="number"
          class="form-control form-control-lg text-center fw-bold"
          id="int_user_death_age"
          min="50"
          max="120"
          placeholder="95"
          bind:value={plan.user_age_death}
        />
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'is_married'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Are you planning retirement on your own, or together with a spouse?</h4>
      <p class="text-secondary mb-4">
        For married couples, the calculator coordinates both spouses' retirement dates, Social Security claiming strategies, and household expenses if one spouse outlives the other.
      </p>

      <div class="d-flex flex-column flex-sm-row gap-3 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {plan.is_married === false ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => handleMarriageToggle(false)}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-user me-2"></i>Single / Individual</div>
          <div class="small opacity-75">I am planning my retirement independently</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start flex-fill {plan.is_married === true ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => handleMarriageToggle(true)}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-user-group me-2"></i>Married / Couple</div>
          <div class="small opacity-75">We are coordinating retirement together</div>
        </button>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'spouse_name_age'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">What is your spouse's name and present age?</h4>
      <p class="text-secondary mb-4">
        Tracking both ages ensures joint cash flows and survivor benefits are modeled accurately.
      </p>

      <div class="row g-3 mb-4" style="max-width: 550px;">
        <div class="col-sm-6">
          <label for="int_spouse_name" class="form-label fw-semibold">Spouse's Name</label>
          <input
            type="text"
            class="form-control form-control-lg"
            id="int_spouse_name"
            placeholder="e.g. Mary"
            bind:value={plan.spouse_name}
          />
        </div>
        <div class="col-sm-6">
          <label for="int_spouse_age" class="form-label fw-semibold">Spouse's Present Age</label>
          <input
            type="number"
            class="form-control form-control-lg"
            id="int_spouse_age"
            min="18"
            max="120"
            placeholder="e.g. 56"
            bind:value={plan.spouse_age}
          />
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'spouse_ret_death'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">At what age does your spouse plan to retire?</h4>
      <p class="text-secondary mb-3">
        Couples frequently retire at different times. If your spouse is already retired, enter their current age.
      </p>

      <div class="row g-3 mb-4" style="max-width: 550px;">
        <div class="col-sm-6">
          <label for="int_spouse_ret_age" class="form-label fw-semibold">Spouse's Retirement Age</label>
          <input
            type="number"
            class="form-control form-control-lg text-center fw-bold"
            id="int_spouse_ret_age"
            min="18"
            max="120"
            placeholder="65"
            bind:value={plan.spouse_retirement_age}
          />
        </div>
        <div class="col-sm-6">
          <label for="int_spouse_death_age" class="form-label fw-semibold">Spouse's Planning Lifespan</label>
          <input
            type="number"
            class="form-control form-control-lg text-center fw-bold"
            id="int_spouse_death_age"
            min="50"
            max="120"
            placeholder="95"
            bind:value={plan.spouse_age_death}
          />
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'state_tax_rate'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">What is your estimated state income tax rate?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-landmark text-primary me-2"></i>
        Enter 0% if you live in (or plan to retire in) a state with no income tax (such as Alaska, Florida, Nevada, South Dakota, Tennessee, Texas, Washington, or Wyoming). For other states, enter your estimated effective state income tax rate (typically between 3% and 7%). Most states do not tax Social Security benefits.
      </div>

      <div class="row g-3 mb-4" style="max-width: 550px;">
        <div class="col-sm-6">
          <label for="int_state_tax_rate" class="form-label fw-semibold">State Income Tax Rate %</label>
          <PercentInput
            id="int_state_tax_rate"
            class="form-control form-control-lg text-center fw-bold percent-input"
            bind:value={plan.state_tax_rate}
            emptyValue={0}
          />
        </div>
        <div class="col-sm-6 d-flex align-items-center">
          <div class="form-check form-switch ps-5 pt-3">
            <input
              class="form-check-input"
              type="checkbox"
              id="int_state_ss_exempt"
              bind:checked={() => plan.state_ss_exempt ?? true, (v) => (plan.state_ss_exempt = v)}
            />
            <label class="form-check-label fw-semibold small" for="int_state_ss_exempt">
              Exempt Social Security from state tax
            </label>
          </div>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'life_insurance'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        {married ? 'Do you or your spouse have life insurance policies that would pay out upon death?' : 'Do you have a life insurance policy that would pay out upon death?'}
      </h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-shield-halved text-primary me-2"></i>
        {#if married}
          For married couples, life insurance proceeds paid upon the first death are treated as having been deposited into your taxable brokerage assets to help fund ongoing living costs for the surviving spouse.
        {:else}
          Life insurance proceeds will flow to your estate or designated heirs upon your death.
        {/if}
      </div>

      <div class="card p-3 mb-3 bg-light border rounded-3" style="max-width: 650px;">
        <h6 class="fw-bold text-primary mb-2">{married ? 'Your Life Insurance Policy' : 'Life Insurance Policy'}</h6>
        <div class="row g-2 align-items-center">
          <div class="col-md-6">
            <label for="int_user_life_amt" class="form-label small fw-semibold">Death Benefit Amount</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_user_life_amt" class="form-control" bind:value={plan.user_life_insurance_amount} />
            </div>
          </div>
          <div class="col-md-6">
            <label for="int_user_life_type" class="form-label small fw-semibold">Policy Type</label>
            <select class="form-select" id="int_user_life_type" bind:value={plan.user_life_insurance_type}>
              <option value="permanent">Permanent / Whole Life</option>
              <option value="term">Term Life</option>
            </select>
          </div>
        </div>
        {#if plan.user_life_insurance_type === 'term'}
          <div class="mt-2" style="max-width: 250px;">
            <label for="int_user_term_age" class="form-label small fw-semibold">Term Expiration Age</label>
            <input
              type="number"
              class="form-control form-control-sm"
              id="int_user_term_age"
              min="18"
              max="120"
              placeholder="70"
              bind:value={plan.user_life_insurance_term_age}
            />
          </div>
        {/if}
      </div>

      {#if married}
        <div class="card p-3 mb-3 bg-light border rounded-3" style="max-width: 650px;">
          <h6 class="fw-bold text-primary mb-2">Spouse's Life Insurance Policy</h6>
          <div class="row g-2 align-items-center">
            <div class="col-md-6">
              <label for="int_spouse_life_amt" class="form-label small fw-semibold">Death Benefit Amount</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_spouse_life_amt" class="form-control" bind:value={plan.spouse_life_insurance_amount} />
              </div>
            </div>
            <div class="col-md-6">
              <label for="int_spouse_life_type" class="form-label small fw-semibold">Policy Type</label>
              <select class="form-select" id="int_spouse_life_type" bind:value={plan.spouse_life_insurance_type}>
                <option value="permanent">Permanent / Whole Life</option>
                <option value="term">Term Life</option>
              </select>
            </div>
          </div>
          {#if plan.spouse_life_insurance_type === 'term'}
            <div class="mt-2" style="max-width: 250px;">
              <label for="int_spouse_term_age" class="form-label small fw-semibold">Term Expiration Age</label>
              <input
                type="number"
                class="form-control form-control-sm"
                id="int_spouse_term_age"
                min="18"
                max="120"
                placeholder="70"
                bind:value={plan.spouse_life_insurance_term_age}
              />
            </div>
          {/if}
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
