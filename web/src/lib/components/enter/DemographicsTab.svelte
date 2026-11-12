<!-- Tab 1: Demographics & Plan Details (enter.html #demographics). -->
<script lang="ts">
  import { applyMarriageToAccounts } from '../../plan/accountCard';
  import { applyMarriageToSchedules } from '../../plan/scheduleRows';
  import { ensureTaxableAccountForLifeInsurance, newLifeInsurancePolicy, newPolicyId } from '../../plan/commit';
  import { getFloat } from '../../plan/coerce';
  import type { LifeInsurancePolicy, LifeInsuranceType, Plan } from '../../plan/types';
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
    applyMarriageToAccounts(plan.accounts, checked);
    applyMarriageToSchedules(plan, checked);
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

  const userPolicies = $derived.by<LifeInsurancePolicy[]>(() => {
    if (Array.isArray(plan.life_insurance_policies)) {
      const filtered = plan.life_insurance_policies.filter((p) => p.owner !== 'spouse');
      if (filtered.length > 0) return filtered;
    }
    return [
      {
        id: 'user_policy_1',
        name: '',
        owner: 'user',
        amount: getFloat(plan.user_life_insurance_amount, 0),
        type: (plan.user_life_insurance_type as LifeInsuranceType) || 'permanent',
        term_age: Math.trunc(Number(plan.user_life_insurance_term_age)) || 70,
      },
    ];
  });

  const spousePolicies = $derived.by<LifeInsurancePolicy[]>(() => {
    if (!married) return [];
    if (Array.isArray(plan.life_insurance_policies)) {
      const filtered = plan.life_insurance_policies.filter((p) => p.owner === 'spouse');
      if (filtered.length > 0) return filtered;
    }
    return [
      {
        id: 'spouse_policy_1',
        name: '',
        owner: 'spouse',
        amount: getFloat(plan.spouse_life_insurance_amount, 0),
        type: (plan.spouse_life_insurance_type as LifeInsuranceType) || 'permanent',
        term_age: Math.trunc(Number(plan.spouse_life_insurance_term_age)) || 70,
      },
    ];
  });

  function ensurePolicies(): LifeInsurancePolicy[] {
    if (!Array.isArray(plan.life_insurance_policies)) {
      const pols: LifeInsurancePolicy[] = [
        {
          id: 'user_policy_1',
          name: '',
          owner: 'user',
          amount: getFloat(plan.user_life_insurance_amount, 0),
          type: (plan.user_life_insurance_type as LifeInsuranceType) || 'permanent',
          term_age: Math.trunc(Number(plan.user_life_insurance_term_age)) || 70,
        },
      ];
      if (married || getFloat(plan.spouse_life_insurance_amount, 0) > 0) {
        pols.push({
          id: 'spouse_policy_1',
          name: '',
          owner: 'spouse',
          amount: getFloat(plan.spouse_life_insurance_amount, 0),
          type: (plan.spouse_life_insurance_type as LifeInsuranceType) || 'permanent',
          term_age: Math.trunc(Number(plan.spouse_life_insurance_term_age)) || 70,
        });
      }
      plan.life_insurance_policies = pols;
    }
    return plan.life_insurance_policies;
  }

  function addUserPolicy() {
    const current = ensurePolicies();
    plan.life_insurance_policies = [
      ...current,
      newLifeInsurancePolicy('user'),
    ];
    syncLegacyUser();
  }

  function addSpousePolicy() {
    const current = ensurePolicies();
    plan.life_insurance_policies = [
      ...current,
      newLifeInsurancePolicy('spouse'),
    ];
    syncLegacySpouse();
  }

  function removePolicy(id?: string) {
    if (!id || !Array.isArray(plan.life_insurance_policies)) return;
    plan.life_insurance_policies = plan.life_insurance_policies.filter((p) => p.id !== id);
    syncLegacyUser();
    syncLegacySpouse();
  }

  function updateUserPolicy(
    id: string | undefined,
    update: (p: LifeInsurancePolicy) => void,
    updateLegacy?: (val: any) => void,
    val?: any
  ) {
    if (!Array.isArray(plan.life_insurance_policies)) {
      if (updateLegacy) {
        updateLegacy(val);
        return;
      }
      ensurePolicies();
    }
    const p = id ? plan.life_insurance_policies?.find((x) => x.id === id) : plan.life_insurance_policies?.[0];
    if (p) {
      update(p);
      syncLegacyUser();
    }
  }

  function updateSpousePolicy(
    id: string | undefined,
    update: (p: LifeInsurancePolicy) => void,
    updateLegacy?: (val: any) => void,
    val?: any
  ) {
    if (!Array.isArray(plan.life_insurance_policies)) {
      if (updateLegacy) {
        updateLegacy(val);
        return;
      }
      ensurePolicies();
    }
    const p = id
      ? plan.life_insurance_policies?.find((x) => x.id === id)
      : plan.life_insurance_policies?.filter((x) => x.owner === 'spouse')[0];
    if (p) {
      update(p);
      syncLegacySpouse();
    }
  }

  function syncLegacyUser() {
    if (!Array.isArray(plan.life_insurance_policies)) return;
    const up = plan.life_insurance_policies.filter((p) => p.owner !== 'spouse');
    plan.user_life_insurance_amount = up.reduce((sum, p) => sum + getFloat(p.amount, 0), 0);
    if (up[0]) {
      plan.user_life_insurance_type = up[0].type || 'permanent';
      plan.user_life_insurance_term_age = up[0].term_age || 70;
    }
  }

  function syncLegacySpouse() {
    if (!Array.isArray(plan.life_insurance_policies)) return;
    const sp = plan.life_insurance_policies.filter((p) => p.owner === 'spouse');
    plan.spouse_life_insurance_amount = married ? sp.reduce((sum, p) => sum + getFloat(p.amount, 0), 0) : 0;
    if (sp[0]) {
      plan.spouse_life_insurance_type = sp[0].type || 'permanent';
      plan.spouse_life_insurance_term_age = sp[0].term_age || 70;
    }
  }

  const ensureTaxable = () => ensureTaxableAccountForLifeInsurance(plan);

  // What the selects show for missing or legacy values (the Django template's
  // selection rules); binding these instead of the raw fields keeps a missing
  // value from being written back just by viewing the tab.
  const policyType = (t: unknown) => (t === 'term' ? 'term' : 'permanent');
  const filingShown = $derived.by(() => {
    const f = String(plan.filing_status ?? '');
    if (married && f === 'single') return 'joint';
    return ['joint', 'single', 'hoh'].includes(f) ? f : 'joint';
  });
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
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h3 class="mb-1 text-primary">Demographics & Plan Details</h3>
      <p class="text-secondary small mb-0">Define personal horizons, ages, and household members for your retirement simulation.</p>
    </div>
  </div>

  <div class="person-section person-section-user p-3 mb-4 rounded-3 border bg-light-subtle">
    <div class="d-flex align-items-center gap-2 mb-3">
      <span class="badge badge-person badge-person-user">
        <i class="fa-solid fa-user me-1"></i>Primary Planner
      </span>
      <h4 class="h6 fw-bold mb-0 text-primary">{plan.user_name || 'Your Details'}</h4>
    </div>
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
      <div class="col-md-6 mb-3 mb-md-0">
        <label for="user_retirement_age" class="form-label">Your Retirement Age</label>
        <input type="number" class="form-control" id="user_retirement_age" bind:value={plan.user_retirement_age}
          min="18" max="120" required />
      </div>
      <div class="col-md-6 mb-0">
        <label for="user_age_death" class="form-label">Your Age at Death</label>
        <input type="number" class="form-control" id="user_age_death" bind:value={plan.user_age_death}
          min="18" max="120" required />
      </div>
    </div>
  </div>

  <div class="form-check form-switch mb-4 ps-5">
    <input class="form-check-input" type="checkbox" id="is_married" checked={married} onchange={onMarriedChange} />
    <label class="form-check-label font-weight-bold" for="is_married">Are you married?</label>
  </div>

  {#if married}
    <div id="spouse_section" class="person-section person-section-spouse p-3 mb-4 rounded-3 border bg-light-subtle">
      <div class="d-flex align-items-center gap-2 mb-3">
        <span class="badge badge-person badge-person-spouse">
          <i class="fa-solid fa-user-group me-1"></i>Spouse
        </span>
        <h4 class="h6 fw-bold mb-0 text-info">{plan.spouse_name || "Spouse's Details"}</h4>
      </div>
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
        <div class="col-md-6 mb-3 mb-md-0">
          <label for="spouse_retirement_age" class="form-label">Spouse's Retirement Age</label>
          <input type="number" class="form-control" id="spouse_retirement_age" bind:value={plan.spouse_retirement_age}
            min="18" max="120" />
        </div>
        <div class="col-md-6 mb-0">
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
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="text-secondary mb-0">
          <i class="fa-solid fa-user me-2"></i>{married ? 'Your Life Insurance Policies' : 'Life Insurance Policies'}
        </h5>
        <button type="button" class="btn btn-outline-primary btn-sm" onclick={addUserPolicy} id="add_user_life_insurance_btn">
          <i class="fa-solid fa-plus me-1"></i>Add Policy
        </button>
      </div>

      {#each userPolicies as policy, i (policy.id || i)}
        <div class="p-3 mb-3 bg-white rounded border {i > 0 ? 'mt-2' : ''}" id={`user_policy_card_${i}`}>
          <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-secondary-subtle text-secondary fw-semibold">Policy #{i + 1}</span>
              <input
                type="text"
                class="form-control form-control-sm"
                placeholder="Optional policy name / description"
                style="max-width: 250px;"
                bind:value={() => policy.name ?? '', (v) => updateUserPolicy(policy.id, (p) => { p.name = v; })}
              />
            </div>
            {#if userPolicies.length > 1}
              <button
                type="button"
                class="btn btn-outline-danger btn-sm py-0 px-2"
                onclick={() => removePolicy(policy.id)}
                title="Remove policy"
                aria-label="Remove policy"
              >
                <i class="fa-solid fa-trash me-1"></i>Remove
              </button>
            {/if}
          </div>

          <div class="row">
            <div class="col-md-6 mb-3">
              <label for={i === 0 ? 'user_life_insurance_amount' : `user_life_insurance_amount_${i}`} class="form-label">
                <span id={i === 0 ? 'user_life_insurance_label_text' : `user_life_insurance_label_text_${i}`}>
                  {married
                    ? 'Lump-sum death benefit paid to surviving spouse upon your death'
                    : 'Lump-sum death benefit paid upon your death (to heirs / estate)'}
                </span>
                <HelpPopover title="Life Insurance Death Benefit"
                  content="Fixed nominal lump-sum benefit payable upon your death. If your spouse survives you, this amount is deposited into Taxable Brokerage assets in the year after your death to support ongoing retirement expenses. If no spouse survives (or you are unmarried), this amount is added to your terminal estate / legacy at death." />
              </label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <MoneyInput id={i === 0 ? 'user_life_insurance_amount' : `user_life_insurance_amount_${i}`} class="form-control dollar-input"
                  bind:value={() => policy.amount, (v) => updateUserPolicy(policy.id, (p) => { p.amount = v; }, (v) => { plan.user_life_insurance_amount = v; }, v)} onblur={ensureTaxable} />
              </div>
            </div>
            <div class="col-md-3 mb-3">
              <label for={i === 0 ? 'user_life_insurance_type' : `user_life_insurance_type_${i}`} class="form-label">Policy Type</label>
              <select class="form-select" id={i === 0 ? 'user_life_insurance_type' : `user_life_insurance_type_${i}`}
                bind:value={() => policyType(policy.type), (v) => updateUserPolicy(policy.id, (p) => { p.type = v as LifeInsuranceType; }, (v) => { plan.user_life_insurance_type = v; }, v)}>
                <option value="permanent">Permanent / Whole Life</option>
                <option value="term">Term Life</option>
              </select>
            </div>
            {#if policy.type === 'term'}
              <div class="col-md-3 mb-3" id={i === 0 ? 'user_term_age_group' : `user_term_age_group_${i}`}>
                <label for={i === 0 ? 'user_life_insurance_term_age' : `user_life_insurance_term_age_${i}`} class="form-label">Term Expiration Age</label>
                <input type="number" class="form-control" id={i === 0 ? 'user_life_insurance_term_age' : `user_life_insurance_term_age_${i}`}
                  bind:value={() => policy.term_age, (v) => updateUserPolicy(policy.id, (p) => { p.term_age = v; }, (v) => { plan.user_life_insurance_term_age = v; }, v)} min="18" max="120" />
              </div>
            {/if}
          </div>
          <div id={i === 0 ? 'user_life_ins_badge_container' : `user_life_ins_badge_container_${i}`}>
            {@render policyBadge(policyStatus(policy.amount, policy.type, policy.term_age, plan.user_age_death), 'your')}
          </div>
        </div>
      {/each}

      <div class="text-end">
        <button type="button" class="btn btn-outline-primary btn-sm" onclick={addUserPolicy}>
          <i class="fa-solid fa-plus me-1"></i>Add Another Policy
        </button>
      </div>
    </div>

    {#if married}
      <div id="spouse_life_insurance_section" class="card p-3 mb-3 bg-light border">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="text-secondary mb-0">
            <i class="fa-solid fa-user-group me-2"></i>Spouse's Life Insurance Policies
          </h5>
          <button type="button" class="btn btn-outline-primary btn-sm" onclick={addSpousePolicy} id="add_spouse_life_insurance_btn">
            <i class="fa-solid fa-plus me-1"></i>Add Policy
          </button>
        </div>

        {#each spousePolicies as policy, i (policy.id || i)}
          <div class="p-3 mb-3 bg-white rounded border {i > 0 ? 'mt-2' : ''}" id={`spouse_policy_card_${i}`}>
            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-secondary-subtle text-secondary fw-semibold">Policy #{i + 1}</span>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Optional policy name / description"
                  style="max-width: 250px;"
                  bind:value={() => policy.name ?? '', (v) => updateSpousePolicy(policy.id, (p) => { p.name = v; })}
                />
              </div>
              {#if spousePolicies.length > 1}
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm py-0 px-2"
                  onclick={() => removePolicy(policy.id)}
                  title="Remove policy"
                  aria-label="Remove policy"
                >
                  <i class="fa-solid fa-trash me-1"></i>Remove
                </button>
              {/if}
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label for={i === 0 ? 'spouse_life_insurance_amount' : `spouse_life_insurance_amount_${i}`} class="form-label">
                  Lump-sum death benefit paid to surviving spouse upon spouse's death
                  <HelpPopover title="Spouse Life Insurance Benefit"
                    content="Fixed nominal lump-sum benefit payable upon your spouse's death. If you survive your spouse, this amount is deposited into your Taxable Brokerage assets in the year after death to support ongoing retirement expenses. If both pass together or you predecease, this amount flows to your estate / heirs." />
                </label>
                <div class="input-group">
                  <span class="input-group-text">$</span>
                  <MoneyInput id={i === 0 ? 'spouse_life_insurance_amount' : `spouse_life_insurance_amount_${i}`} class="form-control dollar-input"
                    bind:value={() => policy.amount, (v) => updateSpousePolicy(policy.id, (p) => { p.amount = v; }, (v) => { plan.spouse_life_insurance_amount = v; }, v)} onblur={ensureTaxable} />
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <label for={i === 0 ? 'spouse_life_insurance_type' : `spouse_life_insurance_type_${i}`} class="form-label">Policy Type</label>
                <select class="form-select" id={i === 0 ? 'spouse_life_insurance_type' : `spouse_life_insurance_type_${i}`}
                  bind:value={() => policyType(policy.type), (v) => updateSpousePolicy(policy.id, (p) => { p.type = v as LifeInsuranceType; }, (v) => { plan.spouse_life_insurance_type = v; }, v)}>
                  <option value="permanent">Permanent / Whole Life</option>
                  <option value="term">Term Life</option>
                </select>
              </div>
              {#if policy.type === 'term'}
                <div class="col-md-3 mb-3" id={i === 0 ? 'spouse_term_age_group' : `spouse_term_age_group_${i}`}>
                  <label for={i === 0 ? 'spouse_life_insurance_term_age' : `spouse_life_insurance_term_age_${i}`} class="form-label">Term Expiration Age</label>
                  <input type="number" class="form-control" id={i === 0 ? 'spouse_life_insurance_term_age' : `spouse_life_insurance_term_age_${i}`}
                    bind:value={() => policy.term_age, (v) => updateSpousePolicy(policy.id, (p) => { p.term_age = v; }, (v) => { plan.spouse_life_insurance_term_age = v; }, v)} min="18" max="120" />
                </div>
              {/if}
            </div>
            <div id={i === 0 ? 'spouse_life_ins_badge_container' : `spouse_life_ins_badge_container_${i}`}>
              {@render policyBadge(policyStatus(policy.amount, policy.type, policy.term_age, plan.spouse_age_death), "spouse's")}
            </div>
          </div>
        {/each}

        <div class="text-end">
          <button type="button" class="btn btn-outline-primary btn-sm" onclick={addSpousePolicy}>
            <i class="fa-solid fa-plus me-1"></i>Add Another Policy
          </button>
        </div>
      </div>
    {/if}
  </div>

  <hr class="my-4" />

  <h3 class="mb-4">Basic Plan Details</h3>

  <div class="row">
    <div class="col-md-4 mb-3">
      <label for="filing_status" class="form-label">Tax Filing Status</label>
      <select class="form-select" id="filing_status" bind:value={() => filingShown, (v) => (plan.filing_status = v)}>
        <option value="joint">Married Filing Jointly</option>
        <!-- Married people can't file Single (the engine treats it as joint). -->
        {#if !married}<option value="single">Single</option>{/if}
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
        <input class="form-check-input" type="checkbox" id="state_ss_exempt" bind:checked={() => plan.state_ss_exempt ?? true, (v) => (plan.state_ss_exempt = v)} />
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
