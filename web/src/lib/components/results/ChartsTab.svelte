<!-- The Charts tab: five Chart.js charts with a nominal / real toggle, and an enlarged
     view with milestone markers (results.js initAllCharts / expandChart). -->
<script lang="ts">
  import { chartConfig, CHART_TITLES, type ChartKind, type DollarMode, milestonePlugin, milestonesList, modalConfig, SPAGHETTI_COUNTS } from '../../app/resultCharts';
  import type { Results } from '../../app/results';
  import Modal from '../shared/Modal.svelte';
  import ResultChart from './ResultChart.svelte';

  interface Props {
    results: Results;
    mode: DollarMode;
    onModeChange: (mode: DollarMode) => void;
  }
  let { results, mode, onModeChange }: Props = $props();

  let pathCount = $state(100);
  let expanded: ChartKind | null = $state(null);
  let modalOpen = $state(false);

  const configs = $derived({
    spaghetti: chartConfig('spaghetti', results, mode, pathCount),
    trajectory: chartConfig('trajectory', results, mode),
    assetBreakdown: chartConfig('assetBreakdown', results, mode),
    incomeSpending: chartConfig('incomeSpending', results, mode),
    taxLiability: chartConfig('taxLiability', results, mode),
  });
  const milestones = $derived(milestonesList(results));
  const isDark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

  function expand(kind: ChartKind) {
    expanded = kind;
    modalOpen = true;
  }

  interface Card {
    kind: ChartKind;
    col: string;
    icon: string;
    sub: string;
    canvas: string;
    img: string;
    alt: string;
  }
  const CARDS: Card[] = [
    { kind: 'spaghetti', col: 'col-lg-6 col-print-6', icon: 'fa-line-chart', sub: 'Selected simulated portfolio paths over time', canvas: 'spaghettiChartCanvas', img: 'spaghettiChartPrintImg', alt: 'Spaghetti Chart' },
    { kind: 'trajectory', col: 'col-lg-6 col-print-6', icon: 'fa-area-chart', sub: '90th (Optimistic), 50th (Median), and 10th (Pessimistic) percentiles', canvas: 'trajectoryChartCanvas', img: 'trajectoryChartPrintImg', alt: 'Monte Carlo Wealth Trajectory' },
    { kind: 'assetBreakdown', col: 'col-lg-6 col-print-12', icon: 'fa-layer-group', sub: 'Deterministic baseline: Pretax, Roth, Taxable, and HSA balances over time', canvas: 'assetBreakdownChartCanvas', img: 'assetBreakdownChartPrintImg', alt: 'Asset Breakdown Chart' },
    { kind: 'incomeSpending', col: 'col-lg-6 col-print-6', icon: 'fa-balance-scale', sub: 'Deterministic baseline: Inflows (SS, Pensions, Withdrawals) vs Outflows (Spending & Taxes)', canvas: 'incomeSpendingChartCanvas', img: 'incomeSpendingChartPrintImg', alt: 'Income vs Spending Chart' },
    { kind: 'taxLiability', col: 'col-12 col-print-6', icon: 'fa-file-invoice-dollar', sub: 'Deterministic baseline: Year-by-year income taxes paid, highlighting RMD spikes', canvas: 'taxLiabilityChartCanvas', img: 'taxLiabilityChartPrintImg', alt: 'Lifetime Tax Liability Chart' },
  ];
</script>

<div class="card p-3 mb-4 shadow-sm border-0 bg-light">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
    <div class="d-flex align-items-center gap-2">
      <i class="fa fa-chart-pie text-primary fs-5"></i>
      <h4 class="mb-0 text-dark fw-bold">Interactive Financial Visualizations</h4>
    </div>
    <div class="d-flex align-items-center gap-3">
      <span class="text-secondary small fw-bold">Display Mode:</span>
      <div class="btn-group btn-group-sm" role="group" aria-label="Chart Dollar Mode">
        <input type="radio" class="btn-check" name="chart_dollar_mode" id="chart_nominal" value="nominal" checked={mode === 'nominal'} onclick={() => onModeChange('nominal')}>
        <label class="btn btn-outline-primary" for="chart_nominal"><i class="fa fa-dollar-sign me-1"></i>Nominal</label>
        <input type="radio" class="btn-check" name="chart_dollar_mode" id="chart_real" value="real" checked={mode === 'real'} onclick={() => onModeChange('real')}>
        <label class="btn btn-outline-primary" for="chart_real"><i class="fa fa-filter me-1"></i>Real (Inflation-Adjusted)</label>
      </div>
    </div>
  </div>
</div>

<div class="row g-4">
  {#each CARDS as c (c.kind)}
    <div class={c.col}>
      <div class={['card shadow-sm border-0 chart-card', c.kind !== 'taxLiability' && 'h-100']}>
        <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
          <div>
            <h5 class="card-title text-primary mb-0 fw-bold"><i class="fa {c.icon} me-2"></i>{CHART_TITLES[c.kind].card}</h5>
            <small class="text-muted">{c.sub}</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            {#if c.kind === 'spaghetti'}
              <select id="spaghettiPathCount" class="form-select form-select-sm" style="width: auto;" title="Number of paths to display" bind:value={pathCount}>
                {#each SPAGHETTI_COUNTS as n (n)}<option value={n}>{n} Paths</option>{/each}
              </select>
            {/if}
            <button type="button" class="btn btn-sm btn-outline-secondary chart-expand-btn" title="Click to enlarge" aria-label="Enlarge {CHART_TITLES[c.kind].modal}" onclick={() => expand(c.kind)}>
              <i class="fa fa-expand"></i>
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="chart-canvas-container">
            <ResultChart config={configs[c.kind]} canvasId={c.canvas} printImgId={c.img} alt={c.alt} />
          </div>
        </div>
      </div>
    </div>
  {/each}
</div>

<Modal bind:open={modalOpen} id="chartModal" size="xl">
  {#snippet title()}{expanded ? CHART_TITLES[expanded].modal : ''}{/snippet}
  {#if expanded}
    <div style="height: 520px; position: relative;">
      <ResultChart config={modalConfig(configs[expanded])} plugins={[milestonePlugin(milestones, isDark)]} canvasId="modalChartCanvas" />
    </div>
  {/if}
  {#snippet footer()}<button type="button" class="btn btn-secondary btn-sm" onclick={() => (modalOpen = false)}>Close</button>{/snippet}
</Modal>
