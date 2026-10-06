<!-- The Simulation Inputs and Simulation Mode cards on the Monte Carlo tab. The fields
     start from the values the results were computed with; applying them sends the
     fields the way the Django form posted them (see plan/modeChange.ts). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat } from '../../app/resultsFormat';
  import { pyStr } from '../../plan/coerce';
  import type { ModeChangeInput } from '../../plan/modeChange';

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
  }

  /** results.js formatPercent: the typed digits with a "%" sign. */
  function percentText(val: string): string {
    const str = val.replace(/[^0-9.-]/g, '');
    if (!str || str === '-') return str ? str + '%' : '';
    return str + '%';
  }

  // The form as the template rendered it.
  function initialValues(): Record<string, string> {
    const v: Record<string, string> = {
      simulation_type: r.goal_seeking ? 'goal_seeking' : 'regular',
      target_success_rate: percentText(floatformat(r.target_success_rate || 80.0, -2)),
      inflation_rate: floatformat(r.inflation_rate, 1),
      user_age_death: pyStr(r.user_age_death),
      pretax_return_mean: floatformat(r.pretax_assets?.return_mean, 1),
      roth_return_mean: floatformat(r.roth_assets?.return_mean, 1),
      taxable_return_mean: floatformat(r.taxable_assets?.return_mean, 1),
      hsa_return_mean: floatformat(r.hsa_assets?.return_mean, 1),
      runs: pyStr(r.runs || 10000),
    };
    if (!r.goal_seeking) v.desired_spending = floatformat(r.desired_spending, 0);
    if (r.is_married) v.spouse_age_death = pyStr(r.spouse_age_death);
    return v;
  }

  const initial = $derived(initialValues());
  let values: Record<string, string> = $state(untrack(() => ({ ...initialValues() })));
  let runsInvalid = $state(false);
  let targetInvalid = $state(false);

  // Results for a new plan (after a re-run) reset the form; a new stress test doesn't.
  let shownFor = untrack(() => r.plan_data_json);
  $effect.pre(() => {
    if (r.plan_data_json !== shownFor) {
      shownFor = r.plan_data_json;
      values = { ...initialValues() };
      runsInvalid = targetInvalid = false;
    }
  });

  $effect(() => {
    stale = Object.keys(initial).some((k) => values[k] !== initial[k]);
  });

  const topSliders = $derived<Slider[]>([
    ...(!r.goal_seeking
      ? [{ name: 'desired_spending', label: 'Desired Annual Recurring Spending', min: 0, max: 500000, step: 1000, width: 120, unit: '$' as const }]
      : []),
    { name: 'inflation_rate', label: 'Inflation Rate', min: 0, max: 15, step: 0.1, width: 90, unit: '%' },
    { name: 'user_age_death', label: 'Your Age at Death', min: 60, max: 110, step: 1, width: 90, unit: 'yrs' },
    ...(r.is_married
      ? [{ name: 'spouse_age_death', label: "Spouse's Age at Death", min: 60, max: 110, step: 1, width: 90, unit: 'yrs' as const }]
      : []),
  ]);
  const returnSliders = $derived<Slider[]>([
    { name: 'pretax_return_mean', label: 'Pretax:', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.pretax_assets?.present_balance },
    { name: 'roth_return_mean', label: 'Roth:', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.roth_assets?.present_balance },
    { name: 'taxable_return_mean', label: 'Taxable:', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.taxable_assets?.present_balance },
    { name: 'hsa_return_mean', label: 'HSA:', min: -10, max: 25, step: 0.1, width: 90, unit: '%', balance: r.hsa_assets?.present_balance },
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
    if (values.simulation_type === 'goal_seeking') {
      const t = parsePercent(values.target_success_rate);
      targetInvalid = Number.isNaN(t) || t < 1.0 || t > 99.0;
      if (targetInvalid) {
        document.getElementById('results_target_success_rate')?.focus();
        return;
      }
    }
    onApply({ ...values });
  }
</script>

{#snippet slider(s: Slider, boxClass: string)}
  <div class="{boxClass} p-2 bg-light rounded border">
    <div class="d-flex justify-content-between align-items-center mb-1">
      {#if s.balance !== undefined}
        <div>
          <span class="fw-bold small">{s.label}</span> <span class="small text-muted">${djangoMoney(s.balance)}</span>
        </div>
      {:else}
        <label for="input_{s.name}" class="form-label small fw-bold mb-0">{s.label}</label>
      {/if}
      <div class="input-group input-group-sm" style="width: {s.width}px;">
        {#if s.unit === '$'}<span class="input-group-text">$</span>{/if}
        <input type="number" class="form-control text-center px-1 fw-bold num-sync" id="input_{s.name}" name={s.name}
          value={values[s.name]} min={s.min} max={s.max} step={s.step} oninput={set(s.name)} {disabled}>
        {#if s.unit !== '$'}<span class="input-group-text px-1">{s.unit}</span>{/if}
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
        <i class="fa fa-sync-alt me-1"></i> Update Inputs & Re-Run Simulation
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
    <div class="form-check mb-3">
      <input class="form-check-input" type="radio" name="simulation_type" id="results_sim_type_goal" value="goal_seeking"
        checked={values.simulation_type === 'goal_seeking'} onchange={set('simulation_type')} {disabled}>
      <label class="form-check-label fw-semibold" for="results_sim_type_goal">
        Maximum Spending Simulation <span class="text-muted fw-normal small">(Solves for Spending)</span>
      </label>
    </div>
    <div class="mb-3" id="results_target_success_group" style="display: {values.simulation_type === 'goal_seeking' ? 'block' : 'none'};">
      <label for="results_target_success_rate" class="form-label fw-semibold">Target Success Rate %</label>
      <input type="text" inputmode="decimal" class={['form-control percent-input', targetInvalid && 'is-invalid']} id="results_target_success_rate"
        name="target_success_rate" value={values.target_success_rate} {disabled}
        oninput={(e) => { values.target_success_rate = percentText(e.currentTarget.value); e.currentTarget.value = values.target_success_rate; targetInvalid = false; }}
        onblur={(e) => { const v = e.currentTarget.value.trim(); values.target_success_rate = v === '%' || v === '' ? '' : percentText(v); e.currentTarget.value = values.target_success_rate; }}>
      <div class={['invalid-feedback', targetInvalid && 'd-block']} id="results_target_success_rate_feedback">
        Target Success Rate must be between 1% and 99%.
      </div>
    </div>
    <button type="submit" class={['btn btn-primary btn-md w-100 shadow-sm', stale && 'btn-rerun-highlight']} {disabled}>
      <i class="fa fa-sync-alt me-1"></i> Update Simulation Mode
    </button>
  </div>
</form>
