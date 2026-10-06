<!-- The Historical Stress Test tab: scenario, allocation and timing selectors, and the
     stress test compared with the regular Monte Carlo (results.js updateStressComparisonView).
     Changing a selector asks the page to run that stress test. -->
<script lang="ts">
  import type { StressSpec } from '../../engine/crisis';
  import type { StressData } from '../../app/results';
  import { djangoMoney, stressDeltaMoney, stressDeltaPercent, stressMoney } from '../../app/resultsFormat';

  interface Props {
    stress: StressData;
    terminalLifeInsurance: number;
    /** Run the stress test for new selections (the page shows `busy` meanwhile). */
    onChange?: (spec: StressSpec) => void;
    busy?: boolean;
    /** Progress of a running stress test, 0..1. */
    progress?: number | null;
    error?: string | null;
  }
  let { stress, terminalLifeInsurance, onChange, busy = false, progress = null, error = null }: Props = $props();

  const SCENARIOS: [string, string][] = [
    ['2000_dotcom', 'The Dot-Com Crash & "Lost Decade" (2000–2012)'],
    ['1973_stagflation', 'The 1970s Stagflation & Inflation Shock (1973–1982)'],
    ['2008_gfc', 'The Great Recession (2007–2009)'],
    ['1929_depression', 'The Great Depression (1929–1941)'],
    ['2022_rate_spike', 'The 2022 Inflation & Rate Spike Shock (2022–2024)'],
    ['1966_bear', 'The 1966 Sideways Market (Classic 4% Rule Stress)'],
  ];
  const ALLOCATIONS: [string, string][] = [
    ['matched', 'Matched to My Expected Returns'],
    ['100_stock', '100% Stock / 0% Bond'],
    ['80_20', '80% Stock / 20% Bond'],
    ['60_40', '60% Stock / 40% Bond (Moderate)'],
    ['40_60', '40% Stock / 60% Bond (Conservative)'],
    ['100_bond', '0% Stock / 100% Bond'],
  ];
  const TIMINGS: [string, string][] = [
    ['retirement', 'Hit Market Crisis at Retirement Start'],
    ['current', 'Hit Market Crisis Immediately (Plan Inception)'],
  ];

  // The selectors show the scenario on display (the default one at first).
  const spec = $derived<StressSpec>({
    scenarioKey: stress.scenario?.key ?? '2000_dotcom',
    assetAllocation: stress.asset_allocation ?? 'matched',
    crisisTiming: stress.crisis_timing ?? 'retirement',
  });
  function change(field: keyof StressSpec, e: Event) {
    onChange?.({ ...spec, [field]: (e.currentTarget as HTMLSelectElement).value });
  }

  const reg = $derived(stress.regular_results ?? ({} as StressData['regular_results']));
  const st = $derived(stress.stress_results ?? ({} as StressData['stress_results']));
  const deltas = $derived(stress.deltas ?? {});
  const scenario = $derived(stress.scenario ?? {});
  const stressRate = $derived(st.run_success || 0);
  const stressBox = $derived(stressRate >= 80.0 ? 'alert-success' : stressRate >= 60.0 ? 'alert-warning' : 'alert-danger');
  const deltaSuccess = $derived(deltas.delta_success || 0);

  const ROWS: Array<{ label: string; reg: 'run_mean' | 'run_median' | 'run_25' | 'run_10' | 'run_max' | 'run_min'; delta: string; bold: boolean }> = [
    { label: 'Mean Ending Wealth', reg: 'run_mean', delta: 'delta_mean', bold: false },
    { label: 'Median Ending Wealth', reg: 'run_median', delta: 'delta_median', bold: true },
    { label: '25th Percentile Ending Wealth', reg: 'run_25', delta: 'delta_25', bold: false },
    { label: '10th Percentile Ending Wealth', reg: 'run_10', delta: 'delta_10', bold: true },
    { label: 'Maximum Wealth', reg: 'run_max', delta: 'delta_max', bold: false },
    { label: 'Minimum Wealth', reg: 'run_min', delta: 'delta_min', bold: false },
  ];
</script>

{#snippet select(id: string, label: string, options: [string, string][], value: string, field: keyof StressSpec)}
  <div class="col-md-4">
    <label class="form-label fw-semibold" for={id}>{label}</label>
    <select class="form-select" {id} {value} disabled={busy} onchange={(e) => change(field, e)}>
      {#each options as [v, text] (v)}<option value={v}>{text}</option>{/each}
    </select>
  </div>
{/snippet}

<div class="card p-4 shadow-sm mb-4 border-0 bg-white">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 border-bottom pb-3 mb-3">
    <div>
      <h4 class="fw-bold text-danger mb-0"><i class="fa fa-fire me-2"></i>Historical Crisis & Sequence-of-Returns Stress Test</h4>
      <small class="text-secondary">Simulate your retirement plan under historical crisis returns and inflation within a full Monte Carlo framework.</small>
    </div>
    <span class="badge bg-light text-danger border border-danger px-3 py-2 fs-6 fw-semibold">
      <i class="fa fa-chart-line me-1"></i> Monte Carlo Stress Test
    </span>
  </div>

  <div class="row g-3 align-items-end">
    {@render select('stressScenarioSelect', 'Select Crisis Scenario', SCENARIOS, spec.scenarioKey, 'scenarioKey')}
    {@render select('stressAllocationSelect', 'Asset Allocation During Crisis', ALLOCATIONS, spec.assetAllocation, 'assetAllocation')}
    {@render select('stressTimingSelect', 'Crisis Timing', TIMINGS, spec.crisisTiming, 'crisisTiming')}
  </div>

  {#if busy}
    <div class="mt-3" id="stressProgress">
      <div class="small text-secondary mb-1"><i class="fa fa-spinner fa-spin me-1"></i> Running stress test…</div>
      {#if progress !== null}
        <div class="progress" role="progressbar" aria-label="Stress test progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin="0" aria-valuemax="100" style="height: 6px;">
          <div class="progress-bar bg-danger" style="width: {Math.round(progress * 100)}%"></div>
        </div>
      {/if}
    </div>
  {/if}
  {#if error}
    <div class="alert alert-danger mt-3 mb-0" role="alert">{error}</div>
  {/if}

  <div class="mt-3 p-3 bg-light rounded border" id="stressScenarioDescription">
    <div class="d-flex align-items-center gap-2 mb-1">
      <span class="badge bg-danger" id="stressScenarioBadge">{scenario.badge || scenario.key}</span>
      <strong class="text-dark" id="stressScenarioTitle">{scenario.name || scenario.short_name || 'Crisis Scenario'}</strong>
      <span class="badge bg-secondary ms-auto" id="stressScenarioDurationBadge">{stress.crisis_length || scenario.length || 10} Years Duration</span>
    </div>
    <p class="mb-0 text-secondary small" id="stressScenarioText">{scenario.description || ''}</p>
  </div>
</div>

<div class="row justify-content-center mb-4">
  <div class="col-12">
    <div class="card p-4 shadow-sm border-0 h-100 bg-white" class:opacity-50={busy}>
      <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
        <h3 class="text-primary mb-0"><i class="fa fa-scale-balanced me-2"></i>Results Comparison</h3>
        <span class="badge bg-light text-secondary border fw-normal">Stress Test vs. Regular Monte Carlo</span>
      </div>

      <div class="row g-3 mb-4 text-center">
        <div class="col-sm-6">
          <div class="alert alert-success border h-100 py-3 mb-0">
            <small class="text-muted text-uppercase fw-semibold d-block">Regular Simulation</small>
            <h5 class="mb-1 text-success fw-bold">Success Rate</h5>
            <span class="display-6 font-weight-bold text-success" id="cmpRegularSuccess">{(reg.run_success || 0).toFixed(1)}%</span>
            <div class="mt-1 small text-muted">Baseline Monte Carlo</div>
          </div>
        </div>
        <div class="col-sm-6">
          <div class="alert {stressBox} border h-100 py-3 mb-0" id="cmpStressSuccessBox">
            <small class="text-muted text-uppercase fw-semibold d-block">Historical Stress Test</small>
            <h5 class="mb-1 text-danger fw-bold">Success Rate</h5>
            <span class="display-6 font-weight-bold text-danger" id="cmpStressSuccess">{stressRate.toFixed(1)}%</span>
            <div class={['mt-1 small fw-bold', deltaSuccess >= 0 ? 'text-success' : 'text-danger']} id="cmpDeltaSuccess">{stressDeltaPercent(deltaSuccess)} vs Regular Sim</div>
          </div>
        </div>
      </div>

      <div class="p-2 px-3 bg-light rounded border mb-3 d-flex justify-content-between align-items-center">
        <strong>Desired Recurring Annual Spending:</strong>
        <span class="fw-bold text-success fs-6" id="cmpDesiredSpending">{stressMoney(stress.desired_spending)}</span>
      </div>

      <h5 class="text-secondary mt-3 border-bottom pb-2">Ending Wealth Percentiles (Nominal)</h5>
      {#if terminalLifeInsurance > 0}
        <div class="alert alert-info py-1 px-2 small mb-2 d-flex align-items-center">
          <i class="fa-solid fa-shield-halved me-2 text-info"></i>
          <span>Includes <strong>${djangoMoney(terminalLifeInsurance)}</strong> life insurance death benefit paid to estate/heirs.</span>
        </div>
      {/if}
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="stressComparisonTable">
          <thead class="table-light">
            <tr>
              <th>Metric</th>
              <th class="text-end">Regular Sim</th>
              <th class="text-end">Stress Test</th>
              <th class="text-end">Difference (Impact)</th>
            </tr>
          </thead>
          <tbody>
            {#each ROWS as row (row.label)}
              {@const d = deltas[row.delta]}
              <tr>
                <td><strong>{row.label}</strong></td>
                <td class={['text-end', row.bold && 'font-weight-bold']}>{stressMoney(reg[row.reg])}</td>
                <td class={['text-end', row.bold ? 'font-weight-bold' : 'fw-semibold']}>{stressMoney(st[row.reg])}</td>
                <td class={['text-end fw-bold', (d ?? 0) >= 0 ? 'text-success' : 'text-danger']}>{stressDeltaMoney(d)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="alert alert-light border p-3 mt-4 mb-0">
        <p class="mb-0 text-secondary small">
          <strong>Stress Test Methodology:</strong> The historical crisis scenario replaces the stochastic market returns and inflation during the designated crisis window (<span id="stressTimelineText">{stress.crisis_start_year}–{stress.crisis_end_year} ({stress.crisis_length} years)</span>). All other plan years utilize the regular stochastic Monte Carlo parameters.
        </p>
      </div>
    </div>
  </div>
</div>
