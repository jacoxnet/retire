<!-- The Simulation Results page (results.html) for a set of computed results: the
     Monte Carlo tab with the inputs card, the two deterministic tables, the charts and
     the historical stress test. Running the simulations is the route's job. -->
<script lang="ts">
  import { flushSync } from 'svelte';
  import { alertClass, type FlashMessage } from '../../app/flash.svelte';
  import { providePrintRegistry } from '../../app/printCharts';
  import type { DollarMode } from '../../app/resultCharts';
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat } from '../../app/resultsFormat';
  import type { StressSpec } from '../../engine/crisis';
  import type { ModeChangeInput } from '../../plan/modeChange';
  import ChartsTab from './ChartsTab.svelte';
  import DetTable from './DetTable.svelte';
  import HelpModals from './HelpModals.svelte';
  import InputsPanel from './InputsPanel.svelte';
  import McResults from './McResults.svelte';
  import StressTest from './StressTest.svelte';

  interface Props {
    results: Results;
    messages?: FlashMessage[];
    /** Apply the Simulation Inputs / Mode edits and re-run. */
    onApply?: (input: ModeChangeInput) => void;
    /** Run the stress test for other selections. */
    onStressChange?: (spec: StressSpec) => void;
    /** A stress test is running. */
    stressBusy?: boolean;
    stressProgress?: number | null;
    stressError?: string | null;
    /** Inputs are disabled (e.g. while re-running). */
    busy?: boolean;
  }
  let {
    results, messages = $bindable([]), onApply = () => {}, onStressChange, stressBusy = false, stressProgress = null,
    stressError = null, busy = false,
  }: Props = $props();

  type TabId = 'stats' | 'projection' | 'cashflow' | 'charts' | 'stresstest';
  const TABS: { id: TabId; button: string; label: string; icon?: string }[] = [
    { id: 'stats', button: 'stats-tab', label: 'Monte Carlo Simulation' },
    { id: 'projection', button: 'projection-tab', label: 'Deterministic Projection' },
    { id: 'cashflow', button: 'cashflow-tab', label: 'Deterministic Cash Flow' },
    { id: 'charts', button: 'charts-tab', label: 'Charts', icon: 'fa fa-chart-line me-1' },
    { id: 'stresstest', button: 'stress-tab', label: 'Historical Stress Test', icon: 'fa fa-fire me-1 text-danger' },
  ];

  let active: TabId = $state('stats');
  let mode: DollarMode = $state('nominal');
  let stale = $state(false);
  let printing = $state(false);
  let taxesOpen = $state(false);
  let withdrawalsOpen = $state(false);
  let inputs: ReturnType<typeof InputsPanel> | undefined = $state();

  const setMode = (m: DollarMode) => (mode = m);
  const paneClass = (id: TabId) => ['tab-pane fade', (active === id || printing) && 'show active'];

  // Printing shows every tab and swaps the charts for images (prepareForPrint).
  const charts = providePrintRegistry();
  function prepareForPrint() {
    printing = true;
    flushSync();
    for (const c of charts) c.prepare();
  }
  function restoreAfterPrint() {
    printing = false;
    flushSync();
    for (const c of charts) c.restore();
  }
  function print() {
    prepareForPrint();
    setTimeout(() => window.print(), 80);
  }
</script>

<svelte:window onbeforeprint={prepareForPrint} onafterprint={restoreAfterPrint} />

<div class="mb-4 text-center">
  <h1 class="pageheading mb-2">Retirement Simulation Results</h1>
  <div class="d-inline-flex gap-2">
    <button type="button" class="btn btn-outline-secondary btn-sm shadow-sm" id="btnPrintSummary" title="Print or export clean PDF executive report" onclick={print}>
      <i class="fa-solid fa-print me-1"></i> Print / Export Report
    </button>
  </div>
</div>

<div class="print-only-header d-none">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h2 class="mb-1 fw-bold text-dark"><i class="fa-solid fa-chart-line text-primary me-2"></i>Retirement Simulation Executive Report</h2>
      <p class="text-secondary mb-0 small">Prepared for: <strong>{results.user_name}{#if results.is_married} &amp; {results.spouse_name}{/if}</strong> | Current Year: {results.current_year}</p>
    </div>
    <div class="text-end">
      <span class="badge bg-primary fs-6 px-3 py-2">
        {#if !results.goal_seeking}Success Rate: {floatformat(results.run_success, 1)}%{:else}Max Spending: ${djangoMoney(results.achieved_spending)}/yr{/if}
      </span>
    </div>
  </div>
</div>

<div id="validationAlertContainer" class="mb-3">
  {#each messages as m, i (i)}
    <div class="alert alert-{alertClass(m.level)} alert-dismissible fade show text-center" role="alert">
      {m.text}
      <button type="button" class="btn-close" aria-label="Close" onclick={() => (messages = messages.filter((x) => x !== m))}></button>
    </div>
  {/each}
</div>

<ul class="nav nav-tabs mb-4 justify-content-center" id="resultsTabs" role="tablist">
  {#each TABS as tab (tab.id)}
    <li class="nav-item" role="presentation">
      <button class={['nav-link', active === tab.id && 'active']} id={tab.button} type="button" role="tab" aria-controls={tab.id}
        aria-selected={active === tab.id} onclick={() => (active = tab.id)}>
        {#if tab.icon}<i class={tab.icon}></i>{/if} {tab.label}
      </button>
    </li>
  {/each}
</ul>

<div class="tab-content" id="resultsTabsContent">
  <div class={paneClass('stats')} id="stats" role="tabpanel" aria-labelledby="stats-tab">
    {#if stale}
      <div id="staleResultsBanner" class="alert alert-warning border border-warning shadow-sm py-2 px-3 mb-4 d-flex align-items-center justify-content-between" role="alert">
        <div class="d-flex align-items-center">
          <i class="fa-solid fa-triangle-exclamation text-warning fs-5 me-2"></i>
          <div>
            <strong class="text-dark">Inputs modified:</strong>
            <span class="text-secondary ms-1">Displayed results reflect previous parameters. Re-run simulation to update results.</span>
          </div>
        </div>
        <button type="button" class="btn btn-warning btn-sm fw-semibold ms-3 px-3 shadow-sm" id="btnStaleReRun" disabled={busy} onclick={() => inputs?.submit()}>
          <i class="fa fa-sync-alt me-1"></i> Update &amp; Re-Run Now
        </button>
      </div>
    {/if}
    <div class="row">
      <div class="col-md-5 mb-4">
        <InputsPanel bind:this={inputs} {results} {onApply} bind:stale disabled={busy} />
      </div>
      <div class="col-md-7 mb-4">
        <McResults {results} />
      </div>
    </div>
  </div>

  <div class={paneClass('projection')} id="projection" role="tabpanel" aria-labelledby="projection-tab">
    <DetTable kind="projection" rows={results.det_rows} inflationRate={results.inflation_rate} {mode} onModeChange={setMode}
      onTaxesHelp={() => (taxesOpen = true)} />
  </div>

  <div class={paneClass('cashflow')} id="cashflow" role="tabpanel" aria-labelledby="cashflow-tab">
    <DetTable kind="cashflow" rows={results.det_rows} inflationRate={results.inflation_rate} {mode} onModeChange={setMode}
      onTaxesHelp={() => (taxesOpen = true)} onWithdrawalsHelp={() => (withdrawalsOpen = true)} />
  </div>

  <div class={paneClass('charts')} id="charts" role="tabpanel" aria-labelledby="charts-tab">
    <ChartsTab {results} {mode} onModeChange={setMode} />
  </div>

  <div class={paneClass('stresstest')} id="stresstest" role="tabpanel" aria-labelledby="stress-tab">
    <StressTest stress={results.stress_test} terminalLifeInsurance={results.terminal_life_insurance} onChange={onStressChange}
      busy={stressBusy} progress={stressProgress} error={stressError} />
  </div>
</div>

<HelpModals bind:taxesOpen bind:withdrawalsOpen startAge={results.desired_spending_start_age} />
