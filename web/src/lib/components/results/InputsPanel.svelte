<!-- The Simulation Inputs and Simulation Mode cards on the Monte Carlo tab. The fields
     start from the values the results were computed with; applying them sends the
     fields the way the Django form posted them (see plan/modeChange.ts). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat } from '../../app/resultsFormat';
  import { GK_SIMULATION_TYPE, GK_TARGET_SUCCESS_RATE, guardrailSolves } from '../../engine/guardrails';
  import { pyStr } from '../../plan/coerce';
  import type { ModeChangeInput } from '../../plan/modeChange';
  import EssentialSpendingModal from './EssentialSpendingModal.svelte';

  interface Props {
    results: Results;
    /** Apply the edits and re-run. */
    onApply: (input: ModeChangeInput) => void;
    /** True while any field differs from the results' values. */
    stale?: boolean;
    disabled?: boolean;
  }
  let { results: r, onApply, stale = $bindable(false), disabled = false }: Props = $props();

  interface Slider {
    name: string;
    label: string;
    min: number;
    max: number;
    step: number;
    width: number;
    unit: '$' | '%' | 'yrs';
    balance?: number;
    taxBucket?: 'pretax' | 'roth' | 'taxable' | 'hsa';
  }

  /** results.js formatPercent: the typed digits with a "%" sign. */
  function percentText(val: string): string {
    const str = val.replace(/[^0-9.-]/g, '');
    if (!str || str === '-') return str ? str + '%' : '';
    return str + '%';
  }

  /** The results' mode, and whether its spending was solved for (so there is none to edit). */
  const simType = $derived(r.simulation_type || (r.goal_seeking ? 'goal_seeking' : 'regular'));
  const guardrailsSolved = $derived(guardrailSolves(r.plan_data_json));
  const spendingSolved = $derived(simType === 'goal_seeking' || guardrailsSolved);
  /** The plan's own desired spending (the results' is the solved one after a search). */
  const planSpending = $derived(Number((r.original_plan_data_json ?? r.plan_data_json)?.desired_spending) || 0);

  // The form as the template rendered it.
  function initialValues(): Record<string, string> {
    const currentSimType = simType;
    const v: Record<string, string> = {
      simulation_type: currentSimType,
      target_success_rate: percentText(floatformat(r.target_success_rate || 85.0, -2)),
      inflation_rate: floatformat(r.inflation_rate, 1),
      user_age_death: pyStr(r.user_age_death),
      pretax_return_mean: floatformat(r.pretax_assets?.return_mean, 1),
      roth_return_mean: floatformat(r.roth_assets?.return_mean, 1),
      taxable_return_mean: floatformat(r.taxable_assets?.return_mean, 1),
      hsa_return_mean: floatformat(r.hsa_assets?.return_mean, 1),
      runs: pyStr(r.runs || 50000),
    };
    if (currentSimType === 'earliest_retirement') {
      v.earliest_retirement_strategy = (r.plan_data_json?.earliest_retirement_strategy as string) || (r as any).strategy || 'simultaneous';
    }
    if (currentSimType === GK_SIMULATION_TYPE) {
      v.gk_spending_mode = guardrailsSolved ? 'solve' : 'specified';
      const ess = Number(r.plan_data_json?.essential_spending);
      v.essential_spending = ess > 0 ? floatformat(ess, 0) : '';
      v.gk_protect_essential_floor = ess > 0 && r.plan_data_json?.gk_protect_essential_floor ? 'true' : 'false';
    }
    if (!spendingSolved) v.desired_spending = floatformat(r.desired_spending, 0);
    if (r.is_married) v.spouse_age_death = pyStr(r.spouse_age_death);
    return v;
  }

  const initial = $derived(initialValues());
  let values: Record<string, string> = $state(untrack(() => ({ ...initialValues() })));
  let runsInvalid = $state(false);
  let targetInvalid = $state(false);
  let essentialInvalid = $state(false);
  let essentialError = $state('Annual Non-Discretionary Living Expenses must be a valid non-negative number.');
  let essentialModalOpen = $state(false);

  // Results for a new plan (after a re-run) reset the form; a new stress test doesn't.
  let shownFor = untrack(() => r.plan_data_json);
  $effect.pre(() => {
    if (r.plan_data_json !== shownFor) {
      shownFor = r.plan_data_json;
      values = { ...initialValues() };
      runsInvalid = targetInvalid = essentialInvalid = false;
      essentialError = 'Annual Non-Discretionary Living Expenses must be a valid non-negative number.';
    }
  });

  $effect(() => {
    stale = Object.keys(initial).some((k) => values[k] !== initial[k]);
  });

  const topSliders = $derived<Slider[]>([
    ...(!spendingSolved
      ? [{ name: 'desired_spending', label: 'Desired Regular Retirement Spending', min: 0, max: 500000, step: 1000, width: 145, unit: '$' as const }]
      : []),
    { name: 'inflation_rate', label: 'Inflation Rate', min: 0, max: 15, step: 0.1, width: 90, unit: '%' },
    { name: 'user_age_death', label: 'Your Age at Death', min: 60, max: 110, step: 1, width: 90, unit: 'yrs' },
    ...(r.is_married
      ? [{ name: 'spouse_age_death', label: "Spouse's Age at Death", min: 60, max: 110, step: 1, width: 90, unit: 'yrs' as const }]
      : []),
  ]);
  const returnSliders = $derived<Slider[]>([
    { name: 'pretax_return_mean', label: 'Pretax', taxBucket: 'pretax', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.pretax_assets?.present_balance },
    { name: 'roth_return_mean', label: 'Roth', taxBucket: 'roth', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.roth_assets?.present_balance },
    { name: 'taxable_return_mean', label: 'Taxable', taxBucket: 'taxable', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.taxable_assets?.present_balance },
    { name: 'hsa_return_mean', label: 'HSA', taxBucket: 'hsa', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.hsa_assets?.present_balance },
  ]);

  const set = (name: string) => (e: Event) => (values[name] = (e.currentTarget as HTMLInputElement).value);

  function parsePercent(val: string): number {
    const num = parseFloat(val.replace(/[%,\s]/g, '').trim());
    return Number.isNaN(num) ? 0 : num;
  }

  /** Validate as results.js did, then apply. */
  export function submit(): void {
    const runs = parseInt(values.runs, 10);
    runsInvalid = Number.isNaN(runs) || runs < 1 || runs > 1000000;
    if (runsInvalid) {
      document.getElementById('input_runs')?.focus();
      return;
    }
    if (values.simulation_type === 'goal_seeking' || values.simulation_type === 'earliest_retirement') {
      const t = parsePercent(values.target_success_rate);
      targetInvalid = Number.isNaN(t) || t < 1.0 || t > 99.0;
      if (targetInvalid) {
        document.getElementById('results_target_success_rate')?.focus();
        return;
      }
    }
    const rawEssential = (values.essential_spending ?? '').trim();
    let hasPositiveEssential = false;
    if (values.simulation_type === GK_SIMULATION_TYPE && rawEssential !== '') {
      const ess = Number(rawEssential.replace(/[$,\s]/g, ''));
      essentialInvalid = Number.isNaN(ess) || ess < 0;
      if (essentialInvalid) {
        essentialError = 'Annual Non-Discretionary Living Expenses must be a valid non-negative number.';
        document.getElementById('input_essential_spending')?.focus();
        return;
      }
      hasPositiveEssential = ess > 0;
    } else {
      essentialInvalid = false;
    }
    if (values.simulation_type === GK_SIMULATION_TYPE && values.gk_protect_essential_floor === 'true' && !hasPositiveEssential) {
      essentialInvalid = true;
      essentialError = 'Please enter a positive Annual Non-Discretionary Living Expenses amount to protect, or turn off Protect Non-Discretionary Spending.';
      document.getElementById('input_essential_spending')?.focus();
      return;
    }
    // The guardrails options belong to the guardrails mode only.
    const { gk_spending_mode, essential_spending, gk_protect_essential_floor, ...rest } = values;
    onApply(
      values.simulation_type === GK_SIMULATION_TYPE
        ? {
            ...rest,
            gk_spending_mode: gk_spending_mode || 'solve',
            essential_spending: essential_spending ?? '',
            gk_protect_essential_floor: hasPositiveEssential && gk_protect_essential_floor === 'true' ? 'true' : 'false',
          }
        : rest,
    );
  }
</script>

{#snippet slider(s: Slider, boxClass: string)}
  <div class="{boxClass} p-2 bg-light rounded border {s.taxBucket ? `slider-tax-${s.taxBucket}` : ''}">
    <div class="d-flex justify-content-between align-items-center mb-1">
      {#if s.balance !== undefined}
        <div class="d-flex align-items-center gap-2">
          {#if s.taxBucket}
            <span class="badge badge-tax badge-tax-{s.taxBucket}">
              {#if s.taxBucket === 'pretax'}
                <i class="fa-solid fa-hourglass-half me-1"></i>Pre-Tax
              {:else if s.taxBucket === 'roth'}
                <i class="fa-solid fa-gem me-1"></i>Roth
              {:else if s.taxBucket === 'taxable'}
                <i class="fa-solid fa-coins me-1"></i>Taxable
              {:else if s.taxBucket === 'hsa'}
                <i class="fa-solid fa-heart-pulse me-1"></i>HSA
              {/if}
            </span>
          {:else}
            <span class="fw-bold small">{s.label}:</span>
          {/if}
          <span class="small text-muted">${djangoMoney(s.balance)}</span>
        </div>
      {:else}
        <label for="input_{s.name}" class="form-label small fw-bold mb-0">{s.label}</label>
      {/if}
      <div class="input-group input-group-sm" style="width: {s.width}px;">
        {#if s.unit === '$'}<span class="input-group-text">$</span>{/if}
        <input type="number" class="form-control text-center px-1 fw-bold num-sync" id="input_{s.name}" name={s.name}
          value={values[s.name]} min={s.min} max={s.max} step={s.step} oninput={set(s.name)} {disabled}>
        {#if s.unit !== '$'}<span class="input-group-text px-1">{s.unit}</span>{/if}
        {#if s.name === 'desired_spending'}<span class="input-group-text px-1 text-secondary">/yr</span>{/if}
      </div>
    </div>
    <input type="range" class="form-range range-sync" id="range_{s.name}" aria-label={s.label}
      min={s.min} max={s.max} step={s.step} value={values[s.name]} oninput={set(s.name)} {disabled}>
  </div>
{/snippet}

<form id="resultsInputsForm" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div class="card p-4 shadow-sm">
    <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
      <h3 class="text-primary mb-0">Simulation Inputs</h3>
      <span class="badge bg-light text-secondary border fw-normal"><i class="fa fa-sliders me-1"></i> Interactive Tweak</span>
    </div>

    <div>
      <p class="mb-2"><strong>Initial Wealth:</strong> <span class="dollar-amount-static">${djangoMoney(r.initial_wealth)}</span></p>
      <p class="mb-3"><strong>Projection Years:</strong> {r.years} years</p>

      {#if (r.simulation_type ?? (r.goal_seeking ? 'goal_seeking' : 'regular')) === 'goal_seeking'}
        <div class="mb-3 p-2 bg-light rounded border border-success-subtle" id="results_solved_spending_display">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-success"><i class="fa-solid fa-calculator me-1"></i>Desired Annual Spending (Solved)</span>
            <span class="badge bg-success fs-6">${djangoMoney(r.achieved_spending || r.desired_spending)}/yr</span>
          </div>
          <small class="text-muted d-block">Solved dynamically for target {floatformat(r.target_success_rate || 85.0, 1)}% confidence.</small>
        </div>
      {/if}
      {#if guardrailsSolved}
        <div class="mb-3 p-2 bg-light rounded border border-success-subtle" id="results_solved_guardrails_display">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-success"><i class="fa-solid fa-road-barrier me-1"></i>Starting Annual Spending (Solved)</span>
            <span class="badge bg-success fs-6">${djangoMoney(r.achieved_spending || r.desired_spending)}/yr</span>
          </div>
          <small class="text-muted d-block">Solved for {floatformat(GK_TARGET_SUCCESS_RATE, 0)}% confidence under the guardrail rules, in today's dollars.</small>
        </div>
      {/if}
      {#if r.simulation_type === 'earliest_retirement' && r.achieved_user_ret_age}
        <div class="mb-3 p-2 bg-light rounded border border-primary-subtle" id="results_solved_earliest_ret_display">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-primary"><i class="fa-solid fa-clock me-1"></i>Earliest Retirement (Solved)</span>
            <span class="badge bg-primary fs-6">Age {r.achieved_user_ret_age}{#if r.is_married && r.achieved_spouse_ret_age !== undefined} / {r.achieved_spouse_ret_age}{/if}</span>
          </div>
          <small class="text-muted d-block">Solved dynamically for target {floatformat(r.target_success_rate || 85.0, 1)}% confidence.</small>
        </div>
      {/if}

      {#each topSliders as s (s.name)}{@render slider(s, 'mb-3')}{/each}

      <h5 class="mt-4 border-bottom pb-1 text-secondary">Asset Allocations & Average Returns</h5>
      {#each returnSliders as s (s.name)}{@render slider(s, 'mb-2')}{/each}

      <div class="mt-3 mb-2 p-2 bg-light rounded border">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <label for="input_runs" class="form-label small fw-bold mb-0">Number of Simulations (MC Paths)</label>
          <div class="input-group input-group-sm" style="width: 110px;">
            <input type="number" class={['form-control text-center px-1 fw-bold', runsInvalid && 'is-invalid']} id="input_runs" name="runs"
              value={values.runs} min="1" max="1000000" oninput={(e) => { set('runs')(e); runsInvalid = false; }} {disabled}>
          </div>
        </div>
        <div class={['invalid-feedback', runsInvalid && 'd-block']} id="input_runs_feedback">
          Number of Simulations must be an integer between 1 and 1,000,000.
        </div>
      </div>

      <button type="submit" class={['btn btn-primary btn-md w-100 mt-3 shadow-sm', stale && 'btn-rerun-highlight']} {disabled}>
        <i class="fa fa-sync-alt me-1"></i> Update Inputs
      </button>
    </div>
  </div>

  <div class="card p-4 mt-4 shadow-sm">
    <h4 class="border-bottom pb-2 text-primary">Simulation Mode</h4>
    <div class="form-check mb-2">
      <input class="form-check-input" type="radio" name="simulation_type" id="results_sim_type_regular" value="regular"
        checked={values.simulation_type === 'regular'} onchange={set('simulation_type')} {disabled}>
      <label class="form-check-label fw-semibold" for="results_sim_type_regular">
        Regular Simulation <span class="text-muted fw-normal small">(Calculates Success Rate)</span>
      </label>
    </div>
    <div class="form-check mb-2">
      <input class="form-check-input" type="radio" name="simulation_type" id="results_sim_type_goal" value="goal_seeking"
        checked={values.simulation_type === 'goal_seeking'} onchange={(e) => {
          set('simulation_type')(e);
          if (!values.target_success_rate) values.target_success_rate = '85%';
        }} {disabled}>
      <label class="form-check-label fw-semibold" for="results_sim_type_goal">
        Maximum Regular Retirement Spending Simulation <span class="text-muted fw-normal small">(Solves for Spending)</span>
      </label>
    </div>
    <div class="form-check mb-2">
      <input class="form-check-input" type="radio" name="simulation_type" id="results_sim_type_earliest" value="earliest_retirement"
        checked={values.simulation_type === 'earliest_retirement'} onchange={(e) => {
          set('simulation_type')(e);
          if (!values.target_success_rate) values.target_success_rate = '85%';
        }} {disabled}>
      <label class="form-check-label fw-semibold" for="results_sim_type_earliest">
        Earliest Retirement Age Simulation <span class="text-secondary fw-normal small">(Solves for Retirement Age)</span>
      </label>
    </div>
    <div class="form-check mb-3">
      <input class="form-check-input" type="radio" name="simulation_type" id="results_sim_type_guardrails" value={GK_SIMULATION_TYPE}
        checked={values.simulation_type === GK_SIMULATION_TYPE} onchange={(e) => {
          set('simulation_type')(e);
          if (!values.gk_spending_mode) values.gk_spending_mode = 'solve';
          if (values.essential_spending === undefined) {
            const ess = Number(r.plan_data_json?.essential_spending);
            values.essential_spending = ess > 0 ? floatformat(ess, 0) : '';
          }
          if (values.gk_protect_essential_floor === undefined) {
            const ess = Number(r.plan_data_json?.essential_spending);
            values.gk_protect_essential_floor = ess > 0 && r.plan_data_json?.gk_protect_essential_floor ? 'true' : 'false';
          }
        }} {disabled}>
      <label class="form-check-label fw-semibold" for="results_sim_type_guardrails">
        Guardrails <span class="text-muted fw-normal small">(Spending Adjusts with the Portfolio)</span>
      </label>
    </div>
    {#if values.simulation_type === GK_SIMULATION_TYPE}
      <div class="mb-3 p-3 bg-light rounded border" id="results_guardrails_group">
        <div class="fw-semibold mb-2">Starting Spending at Retirement</div>
        <div class="form-check mb-1">
          <input class="form-check-input" type="radio" name="gk_spending_mode" id="results_gk_solve" value="solve"
            checked={values.gk_spending_mode !== 'specified'} onchange={set('gk_spending_mode')} {disabled}>
          <label class="form-check-label" for="results_gk_solve">
            Solve for the maximum <span class="text-muted small">({floatformat(GK_TARGET_SUCCESS_RATE, 0)}% success rate)</span>
          </label>
        </div>
        <div class="form-check">
          <input class="form-check-input" type="radio" name="gk_spending_mode" id="results_gk_specified" value="specified"
            checked={values.gk_spending_mode === 'specified'} onchange={set('gk_spending_mode')} {disabled}>
          <label class="form-check-label" for="results_gk_specified">
            Use my Desired Regular Retirement Spending
            {#if spendingSolved}<span class="text-muted small">(${djangoMoney(planSpending)}/yr)</span>{/if}
          </label>
        </div>
        <div class="form-text mt-2">
          Each year after retirement begins, regular spending rises with inflation (skipped after a down year while withdrawals run
          above their starting rate), is cut 10% if the withdrawal rate climbs more than 20% above its starting level (never in the
          final 15 years), and is raised 10% if it falls more than 20% below.
        </div>

        <hr class="my-3">

        <div class="small fw-bold mb-2" id="gkNonDiscretionaryPrompt">
          Would you like this simulation to prohibit spending cuts or skipping inflation raises if that would reduce your Regular Retirement Spending below your non-discretionary expenses?
        </div>

        <div class="form-check form-switch mb-2">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            id="results_gk_protect_floor"
            name="gk_protect_essential_floor"
            checked={values.gk_protect_essential_floor === 'true'}
            {disabled}
            onchange={(e) => {
              values.gk_protect_essential_floor = e.currentTarget.checked ? 'true' : 'false';
              if (!e.currentTarget.checked) essentialInvalid = false;
            }}
          >
          <label class="form-check-label small fw-normal" for="results_gk_protect_floor">
            Protect Non-Discretionary Spending
          </label>
        </div>

        <div class="d-flex justify-content-between align-items-start gap-1 mb-1">
          <label for="input_essential_spending" class="form-label small fw-normal mb-0">
            Annual Non-Discretionary Living Expenses (in today's dollars)
          </label>
          <button
            type="button"
            class="btn btn-link p-0 text-primary text-decoration-none flex-shrink-0"
            id="btnEssentialSpendingHelp"
            title="What expenses to include and exclude"
            aria-label="What counts as Annual Non-Discretionary Living Expenses?"
            onclick={() => (essentialModalOpen = true)}
          >
            <i class="fa-solid fa-circle-question fs-6"></i>
          </button>
        </div>
        <div class="input-group input-group-sm">
          <span class="input-group-text">$</span>
          <input
            type="number"
            class={['form-control fw-semibold', essentialInvalid && 'is-invalid']}
            id="input_essential_spending"
            name="essential_spending"
            min="0"
            step="1000"
            placeholder="Optional"
            value={values.essential_spending ?? ''}
            oninput={(e) => {
              values.essential_spending = e.currentTarget.value;
              essentialInvalid = false;
            }}
            {disabled}
          >
          <span class="input-group-text text-secondary">/yr</span>
        </div>
        <div class={['invalid-feedback', essentialInvalid && 'd-block']} id="input_essential_spending_feedback">
          {essentialError}
        </div>
      </div>
    {/if}
    <div class="mb-3" id="results_target_success_group" style="display: {values.simulation_type === 'goal_seeking' || values.simulation_type === 'earliest_retirement' ? 'block' : 'none'};">
      <label for="results_target_success_rate" class="form-label fw-semibold">Target Success Rate %</label>
      <input type="text" inputmode="decimal" class={['form-control percent-input', targetInvalid && 'is-invalid']} id="results_target_success_rate"
        name="target_success_rate" value={values.target_success_rate} {disabled}
        oninput={(e) => { values.target_success_rate = percentText(e.currentTarget.value); e.currentTarget.value = values.target_success_rate; targetInvalid = false; }}
        onblur={(e) => { const v = e.currentTarget.value.trim(); values.target_success_rate = v === '%' || v === '' ? '' : percentText(v); e.currentTarget.value = values.target_success_rate; }}>
      <div class={['invalid-feedback', targetInvalid && 'd-block']} id="results_target_success_rate_feedback">
        Target Success Rate must be between 1% and 99%.
      </div>
    </div>
    {#if values.simulation_type === 'earliest_retirement' && r.is_married}
      <div class="mb-3" id="results_strategy_group">
        <label for="results_strategy" class="form-label fw-semibold">Retirement Strategy</label>
        <select class="form-select" id="results_strategy" name="earliest_retirement_strategy"
          value={values.earliest_retirement_strategy} onchange={set('earliest_retirement_strategy')} {disabled}>
          <option value="simultaneous">Retire Simultaneously (Same Year)</option>
          <option value="same_age">Retire at the Same Age</option>
          <option value="solve_user">Solve for You (Keep Spouse's Retirement Age Fixed)</option>
          <option value="solve_spouse">Solve for Spouse (Keep Your Retirement Age Fixed)</option>
        </select>
        <div class="form-text">
          Choose how to solve for combined retirement ages.
        </div>
      </div>
    {/if}
    <button type="submit" class={['btn btn-primary btn-md w-100 shadow-sm', stale && 'btn-rerun-highlight']} {disabled}>
      <i class="fa fa-sync-alt me-1"></i> Update Simulation Mode
    </button>
  </div>
</form>

<EssentialSpendingModal bind:open={essentialModalOpen} />
