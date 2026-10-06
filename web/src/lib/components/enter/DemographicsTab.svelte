<!-- Tab 1: Demographics & Plan Details (enter.html #demographics). -->
<script lang="ts">
  import { ensureTaxableAccountForLifeInsurance } from '../../plan/commit';
  import { getFloat } from '../../plan/coerce';
  import type { Plan } from '../../plan/types';
  import HelpPopover from '../shared/HelpPopover.svelte';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import PercentInput from '../shared/PercentInput.svelte';

  interface Props {
    plan: Plan;
    onNext: () => void;
  }
  let { plan = $bindable(), onNext }: Props = $props();

  const married = $derived(!!plan.is_married);

  // Toggling marriage picks the matching filing status (enter.js toggleSpouseSection).
  function onMarriedChange(e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    plan.is_married = checked;
    plan.filing_status = checked ? 'joint' : 'single';
  }

  interface PolicyStatus {
    ok: boolean;
    termAge?: number;
    deathAge?: number;
  }

  // The status line under each policy (enter.js updateLifeInsuranceUI).
  function policyStatus(amount: unknown, type: unknown, termAge: unknown, deathAge: unknown): PolicyStatus | null {
    if (!(getFloat(amount, 0) > 0)) return null;
    if (type !== 'term') return { ok: true };
    const t = Math.trunc(Number(termAge)) || 70;
    const d = Math.trunc(Number(deathAge)) || 90;
    return { ok: d <= t, termAge: t, deathAge: d };
  }

  const userPolicy = $derived(policyStatus(
    plan.user_life_insurance_amount, plan.user_life_insurance_type, plan.user_life_insurance_term_age, plan.user_age_death));
  const spousePolicy = $derived(married ? policyStatus(
    plan.spouse_life_insurance_amount, plan.spouse_life_insurance_type, plan.spouse_life_insurance_term_age, plan.spouse_age_death) : null);

  const ensureTaxable = () => ensureTaxableAccountForLifeInsurance(plan);
</script>

{#snippet policyBadge(status: PolicyStatus | null, whose: string)}
  {#if status}
    {#if status.termAge === undefined}
      <div class="alert alert-success py-1 px-3 small mb-0 d-flex align-items-center">
        <i class="fa-solid fa-circle-check me-2"></i>
        <span>Permanent policy &mdash; Benefit is guaranteed payable upon death.</span>
      </div>
    {:else if status.ok}
      <div class="alert alert-success py-1 px-3 small mb-0 d-flex align-items-center">
        <i class="fa-solid fa-circle-check me-2"></i>
        <span>Policy active at assumed death (age {status.deathAge} &le; expiration age {status.termAge}).</span>
      </div>
    {:else}
      <div class="alert alert-warning py-1 px-3 small mb-0 d-flex align-items-center">
        <i class="fa-solid fa-triangle-exclamation me-2"></i>
        <span>Term policy expires at age <strong>{status.termAge}</strong>, before {whose} assumed age at death
          (<strong>{status.deathAge}</strong>). No death benefit will be paid.</span>
      </div>
    {/if}
  {/if}
{/snippet}

<div class="card p-4 mb-4">
  <h3 class="mb-4">Demographics</h3>

  <div class="row">
    <div class="col-md-6 mb-3">
      <label for="user_name" class="form-label">Your Name</label>
      <input type="text" class="form-control" id="user_name" bind:value={plan.user_name} required />
    </div>
    <div class="col-md-6 mb-3">
      <label for="user_age" class="form-label">Your Present Age</label>
      <input type="number" class="form-control" id="user_age" bind:value={plan.user_age} min="18" max="120" required />
    </div>
  </div>
  <div class="row">
    <div class="col-md-6 mb-3">
      <label for="user_retirement_age" class="form-label">Your Retirement Age</label>
      <input type="number" class="form-control" id="user_retirement_age" bind:value={plan.user_retirement_age}
        min="18" max="120" required />
    </div>
    <div class="col-md-6 mb-3">
      <label for="user_age_death" class="form-label">Your Age at Death</label>
      <input type="number" class="form-control" id="user_age_death" bind:value={plan.user_age_death}
        min="18" max="120" required />
    </div>
  </div>

  <div class="form-check form-switch mb-4 ps-5">
    <input class="form-check-input" type="checkbox" id="is_married" checked={married} onchange={onMarriedChange} />
    <label class="form-check-label font-weight-bold" for="is_married">Are you married?</label>
  </div>

  {#if married}
    <div id="spouse_section">
      <h4 class="text-secondary mb-3">Spouse Details</h4>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label for="spouse_name" class="form-label">Spouse's Name</label>
          <input type="text" class="form-control" id="spouse_name" bind:value={plan.spouse_name} />
        </div>
        <div class="col-md-6 mb-3">
          <label for="spouse_age" class="form-label">Spouse's Present Age</label>
          <input type="number" class="form-control" id="spouse_age" bind:value={plan.spouse_age} min="18" max="120" />
        </div>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label for="spouse_retirement_age" class="form-label">Spouse's Retirement Age</label>
          <input type="number" class="form-control" id="spouse_retirement_age" bind:value={plan.spouse_retirement_age}
            min="18" max="120" />
        </div>
        <div class="col-md-6 mb-3">
          <label for="spouse_age_death" class="form-label">Spouse's Age at Death</label>
          <input type="number" class="form-control" id="spouse_age_death" bind:value={plan.spouse_age_death}
            min="18" max="120" />
        </div>
      </div>
    </div>
  {/if}

  <hr class="my-4" />

  <div class="mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h3 class="mb-1 text-primary">
          <i class="fa-solid fa-shield-halved me-2"></i>Life Insurance &amp; Survivorship
        </h3>
        <p class="text-secondary small mb-0">Specify any life insurance proceeds payable upon death. For married couples,
          benefits payable to a surviving spouse are deposited directly into Taxable Brokerage assets to fund continuing
          living expenses. Benefits payable with no surviving spouse flow to your terminal estate / heirs.</p>
      </div>
    </div>

    <div class="card p-3 mb-3 bg-light border">
      <h5 class="text-secondary mb-3">Your Life Insurance Policy</h5>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label for="user_life_insurance_amount" class="form-label">
            <span id="user_life_insurance_label_text">
              {married
                ? 'Lump-sum death benefit paid to surviving spouse upon your death'
                : 'Lump-sum death benefit paid upon your death (to heirs / estate)'}
            </span>
            <HelpPopover title="Life Insurance Death Benefit"
              content="Fixed nominal lump-sum benefit payable upon your death. If your spouse survives you, this amount is deposited into Taxable Brokerage assets in the year after your death to support ongoing retirement expenses. If no spouse survives (or you are unmarried), this amount is added to your terminal estate / legacy at death." />
          </label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <MoneyInput id="user_life_insurance_amount" class="form-control dollar-input"
              bind:value={plan.user_life_insurance_amount} onblur={ensureTaxable} />
          </div>
        </div>
        <div class="col-md-3 mb-3">
          <label for="user_life_insurance_type" class="form-label">Policy Type</label>
          <select class="form-select" id="user_life_insurance_type" bind:value={plan.user_life_insurance_type}>
            <option value="permanent">Permanent / Whole Life</option>
            <option value="term">Term Life</option>
          </select>
        </div>
        {#if plan.user_life_insurance_type === 'term'}
          <div class="col-md-3 mb-3" id="user_term_age_group">
            <label for="user_life_insurance_term_age" class="form-label">Term Expiration Age</label>
            <input type="number" class="form-control" id="user_life_insurance_term_age"
              bind:value={plan.user_life_insurance_term_age} min="18" max="120" />
          </div>
        {/if}
      </div>
      <div id="user_life_ins_badge_container">{@render policyBadge(userPolicy, 'your')}</div>
    </div>

    {#if married}
      <div id="spouse_life_insurance_section" class="card p-3 mb-3 bg-light border">
        <h5 class="text-secondary mb-3">Spouse's Life Insurance Policy</h5>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="spouse_life_insurance_amount" class="form-label">
              Lump-sum death benefit paid to surviving spouse upon spouse's death
              <HelpPopover title="Spouse Life Insurance Benefit"
                content="Fixed nominal lump-sum benefit payable upon your spouse's death. If you survive your spouse, this amount is deposited into your Taxable Brokerage assets in the year after death to support ongoing retirement expenses. If both pass together or you predecease, this amount flows to your estate / heirs." />
            </label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput id="spouse_life_insurance_amount" class="form-control dollar-input"
                bind:value={plan.spouse_life_insurance_amount} onblur={ensureTaxable} />
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <label for="spouse_life_insurance_type" class="form-label">Policy Type</label>
            <select class="form-select" id="spouse_life_insurance_type" bind:value={plan.spouse_life_insurance_type}>
              <option value="permanent">Permanent / Whole Life</option>
              <option value="term">Term Life</option>
            </select>
          </div>
          {#if plan.spouse_life_insurance_type === 'term'}
            <div class="col-md-3 mb-3" id="spouse_term_age_group">
              <label for="spouse_life_insurance_term_age" class="form-label">Term Expiration Age</label>
              <input type="number" class="form-control" id="spouse_life_insurance_term_age"
                bind:value={plan.spouse_life_insurance_term_age} min="18" max="120" />
            </div>
          {/if}
        </div>
        <div id="spouse_life_ins_badge_container">{@render policyBadge(spousePolicy, "spouse's")}</div>
      </div>
    {/if}
  </div>

  <hr class="my-4" />

  <h3 class="mb-4">Basic Plan Details</h3>

  <div class="row">
    <div class="col-md-4 mb-3">
      <label for="filing_status" class="form-label">Tax Filing Status</label>
      <select class="form-select" id="filing_status" bind:value={plan.filing_status}>
        <option value="joint">Married Filing Jointly</option>
        <option value="single">Single</option>
        <option value="hoh">Head of Household</option>
      </select>
    </div>
    <div class="col-md-4 mb-3">
      <label for="state_tax_rate" class="form-label">
        State Income Tax Rate %
        <HelpPopover title="State Income Tax Rate (%)"
          content="Set the estimated flat or effective state income tax rate for your state of residence. Enter 0% if you live in a state with no income tax (e.g., FL, TX, WA, NV, TN, WY, SD, AK)." />
      </label>
      <PercentInput id="state_tax_rate" class="form-control percent-input" bind:value={plan.state_tax_rate} />
    </div>
    <div class="col-md-4 mb-3 d-flex align-items-center">
      <div class="form-check form-switch ps-5 pt-3">
        <input class="form-check-input" type="checkbox" id="state_ss_exempt" bind:checked={plan.state_ss_exempt} />
        <label class="form-check-label font-weight-bold" for="state_ss_exempt">
          Exempt Social Security from State Income Tax
          <HelpPopover title="Social Security State Exemption"
            content="Most U.S. states exempt Social Security benefits from state income taxes. Keep this checked if your state does not tax Social Security." />
        </label>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-md-4 mb-3">
      <label for="current_year" class="form-label">Current Year</label>
      <input type="number" class="form-control" id="current_year" bind:value={plan.current_year} min="2020" max="2100"
        required />
    </div>
    <div class="col-md-4 mb-3">
      <label for="inflation_rate" class="form-label">Inflation Rate %</label>
      <PercentInput id="inflation_rate" class="form-control percent-input" bind:value={plan.inflation_rate} emptyValue={2.5} />
    </div>
  </div>

  <div class="text-center mt-4">
    <button type="button" class="btn btn-secondary me-2" onclick={onNext}>Next: Accounts for Retirement</button>
  </div>
</div>
