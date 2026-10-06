<!-- Tab 5: Personal Balance Sheet (enter.html #balance-sheet). Edits go to the plan's
     balance_sheet; EnterPage syncs them with the account cards when the tab is left. -->
<script lang="ts">
  import type { TabId } from '../../app/badges';
  import { cpiSeries } from '../../app/cpiData';
  import { formatMoney, parseNumberText } from '../../app/format';
  import {
    addDebt, addGoalGroup, addPeriod, addProperty, type ChartMetric, chartSeries, duplicateSheetNames, effectiveTaxRate,
    type GoalStatus, hasRateOverride, kpis, periodLimit, removePeriod, setViewMode, suggestNextPeriod, viewModeState,
    visiblePeriods,
  } from '../../plan/bsView';
  import { calculateMarginalTaxRate } from '../../plan/marginal';
  import { todayIso } from '../../plan/pyutil';
  import type { Plan } from '../../plan/types';
  import AddPeriodModal from './AddPeriodModal.svelte';
  import BsChart from './BsChart.svelte';
  import BsTable from './BsTable.svelte';
  import GoalStatusModal from './GoalStatusModal.svelte';
  import TabFooter from './TabFooter.svelte';
  import TargetCpiModal, { type CpiTarget } from './TargetCpiModal.svelte';

  interface Props {
    plan: Plan;
    onSwitch: (to: TabId) => void;
    today?: string;
  }
  let { plan = $bindable(), onSwitch, today = todayIso() }: Props = $props();

  // The sheet always exists here (ensurePlanBlocks adds one on load).
  const bs = $derived(plan.balance_sheet as Record<string, any>);
  const periods = $derived(visiblePeriods(bs, today));
  const autoRate = $derived(calculateMarginalTaxRate(plan));
  const taxRate = $derived(effectiveTaxRate(bs, autoRate));
  const k = $derived(kpis(bs, taxRate, today));
  const series = $derived(chartSeries(bs, taxRate));
  const metric: ChartMetric = $derived(bs.chart_metric ?? 'gross_net_worth');
  const mode = $derived(viewModeState(bs));
  const duplicates = $derived(duplicateSheetNames(bs));
  const duplicateKeys = $derived(new Set(duplicates.map((d) => d.toLowerCase())));
  const limit = $derived(periodLimit(bs));

  let addOpen = $state(false);
  let goalStatus: GoalStatus | null = $state(null);
  let cpiEdit: CpiTarget | null = $state(null);
  let countText = $state('');
  $effect.pre(() => {
    const l = limit;
    if (l > 0) countText = String(l);
    else if (!(parseInt(countText, 10) > 0)) countText = '3';
  });

  const money = (v: number) => formatMoney(v, true);
  const ask = (msg: string, dflt: string): string | null => (typeof window !== 'undefined' ? window.prompt(msg, dflt) : null);

  function onScope(scope: string) {
    if (scope === 'all') bs.period_view_limit = 0;
    else {
      const v = parseInt(countText, 10);
      bs.period_view_limit = Number.isNaN(v) || v <= 0 ? 3 : v;
    }
  }

  function onCount(e: Event) {
    countText = (e.currentTarget as HTMLInputElement).value;
    const v = parseInt(countText, 10);
    if (!Number.isNaN(v) && v > 0) bs.period_view_limit = v;
  }

  function onRemovePeriod(p: string) {
    if ((bs.periods?.length ?? 0) <= 1) {
      window.alert('Cannot remove the only balance sheet column.');
      return;
    }
    if (window.confirm(`Are you sure you want to remove the balance sheet column for ${p}?`)) removePeriod(bs, p);
  }

  function onAddGoal() {
    const name = ask('Enter goal / sinking fund name (e.g. Vacation Fund, Wedding, New Car):', 'New Goal Fund');
    if (!name) return;
    addGoalGroup(bs, name, parseNumberText(ask('Enter target dollar goal:', '$0.00') ?? '') ?? 0);
  }

  function onAddProperty() {
    const name = ask('Enter property name:', 'Primary Residence');
    if (name) addProperty(bs, name);
  }

  function onAddDebt() {
    const name = ask('Enter debt / liability name (e.g. Auto Loan, Student Loan, Credit Card):', 'New Loan / Debt');
    if (name) addDebt(bs, name);
  }

  const METRICS: { key: ChartMetric; label: string }[] = [
    { key: 'gross_net_worth', label: 'Gross Net Worth' },
    { key: 'liquid_net_worth', label: 'Liquid Net Worth' },
    { key: 'net_retirement', label: 'Retirement Savings (Net of Income Tax)' },
    { key: 'breakdown', label: 'Asset Breakdown' },
  ];
</script>

{#snippet deltaBadge(d: { diff: number; pct: number })}
  {#if d.diff === 0}
    <span class="bs-delta-text bs-delta-text-zero">—</span>
  {:else}
    <span class={['bs-delta-text', d.diff > 0 ? 'bs-delta-text-pos' : 'bs-delta-text-neg']}>{d.diff > 0 ? '+' : '-'}{money(Math.abs(d.diff))}
      <small class="text-muted">({d.pct > 0 ? '+' : ''}{d.pct.toFixed(1)}%)</small></span>
  {/if}
{/snippet}

<div class="card p-4 mb-4">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
    <div>
      <h3 class="mb-1 text-primary">Personal Balance Sheet</h3>
      <p class="text-secondary small mb-0">Track your entire net worth, sinking funds, home equity, and debts over time.</p>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <div class="btn-group btn-group-sm" role="group" id="bsViewModeBtnGroup">
        <button type="button" class={['btn btn-outline-primary', mode === 'detailed' && 'active']} id="btnBsModeDetailed"
          onclick={() => setViewMode(bs, 'detailed')}><i class="fa-solid fa-table-list me-1"></i>Detailed View</button>
        <button type="button" class={['btn btn-outline-primary', mode === 'summary' && 'active']} id="btnBsModeSummary"
          onclick={() => setViewMode(bs, 'summary')}><i class="fa-solid fa-list-check me-1"></i>Summary View</button>
      </div>
      <button type="button" class="btn btn-primary btn-sm px-3" id="btnAddPeriodSnapshot" onclick={() => (addOpen = true)}>
        <i class="fa fa-calendar-plus me-1"></i> Add Balance Sheet Column
      </button>
      <button type="button" class="btn btn-outline-primary btn-sm px-3 shadow-sm" id="btnBsRebalanceLink" title="Open Portfolio Rebalancing Tool"
        onclick={() => onSwitch('rebalance')}>
        <i class="fa-solid fa-scale-balanced me-1"></i> Rebalance?
      </button>
    </div>
  </div>

  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 p-2 px-3 mb-4 rounded bg-light border" id="bsPeriodViewControls">
    <div class="d-flex flex-wrap align-items-center gap-3">
      <div class="d-flex align-items-center gap-2">
        <label for="bsPeriodFrequencySelect" class="small fw-semibold text-secondary mb-0 text-nowrap">
          <i class="fa-regular fa-calendar me-1"></i>Dates:
        </label>
        <select class="form-select form-select-sm" id="bsPeriodFrequencySelect" style="width: auto;"
          bind:value={() => bs.period_view_frequency || 'all', (v) => (bs.period_view_frequency = ['all', 'quarterly', 'yearly'].includes(v) ? v : 'all')}>
          <option value="all">All Recorded Dates</option>
          <option value="quarterly">Quarter-Ends Only</option>
          <option value="yearly">Year-Ends Only</option>
        </select>
      </div>
      <div class="vr d-none d-sm-block text-muted opacity-25" style="height: 22px;"></div>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <select class="form-select form-select-sm" id="bsColumnScopeSelect" aria-label="Column scope" style="width: auto;"
          value={limit === 0 ? 'all' : 'recent'} onchange={(e) => onScope((e.currentTarget as HTMLSelectElement).value)}>
          <option value="all">Show Full History</option>
          <option value="recent">Show Most Recent History</option>
        </select>
        {#if limit !== 0}
          <div id="bsColRecentCountContainer" class="d-flex align-items-center gap-2">
            <label for="bsColLimitInput" class="small fw-semibold text-secondary mb-0 text-nowrap">How many dates should be shown?</label>
            <input type="number" min="1" max="999" step="1" class="form-control form-control-sm text-center fw-bold" id="bsColLimitInput"
              style="width: 75px;" title="Number of dates to show" value={countText} oninput={onCount} />
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="row g-3 mb-4">
    <div class="col-6 col-lg">
      <div class="bs-kpi-card p-3 shadow-sm h-100" style="border-top-color: #3b82f6;">
        <div class="bs-kpi-title">Gross Net Worth</div>
        <div class="bs-kpi-val" id="kpiGrossNetWorth">{money(k.current.grossNetWorth)}</div>
        <div class="mt-1">{@render deltaBadge(k.grossDelta)}</div>
      </div>
    </div>
    <div class="col-6 col-lg">
      <div class="bs-kpi-card p-3 shadow-sm h-100" style="border-top-color: #10b981;">
        <div class="bs-kpi-title">Liquid Net Worth</div>
        <div class="bs-kpi-val" id="kpiLiquidNetWorth">{money(k.current.liquid)}</div>
        <div class="mt-1">{@render deltaBadge(k.liquidDelta)}</div>
      </div>
    </div>
    <div class="col-6 col-lg">
      <div class="bs-kpi-card p-3 shadow-sm h-100" style="border-top-color: #8b5cf6;">
        <div class="bs-kpi-title">Retirement Savings (Net of Income Tax)</div>
        <div class="bs-kpi-val" id="kpiNetRetirement">{money(k.current.netRetirement)}</div>
        <div class="small text-muted">Net of def. tax</div>
      </div>
    </div>
    <div class="col-6 col-lg">
      <div class="bs-kpi-card p-3 shadow-sm h-100" style="border-top-color: #06b6d4;">
        <div class="bs-kpi-title">Home Equity</div>
        <div class="bs-kpi-val" id="kpiHomeEquity">{money(k.current.netEquity)}</div>
        <div class="small text-muted">Value − Mortgage</div>
      </div>
    </div>
    <div class="col-6 col-lg">
      <div class="bs-kpi-card p-3 shadow-sm h-100" style="border-top-color: #ef4444;">
        <div class="bs-kpi-title">Total Debts</div>
        <div class="bs-kpi-val text-danger" id="kpiTotalDebts">{money(k.current.totalDebts)}</div>
        <div class="small text-muted">All liabilities</div>
      </div>
    </div>
  </div>

  {#if duplicates.length}
    <div id="bsDuplicateNotice" class="alert alert-danger d-flex mb-3 py-2 px-3 align-items-center shadow-sm" role="alert">
      <i class="fa-solid fa-triangle-exclamation me-2 fs-5"></i>
      <div>
        <strong class="notice-title">Duplicate Account Name Detected:</strong>
        <span class="notice-desc ms-1">Multiple accounts cannot have the same name ({duplicates.map((d) => `"${d}"`).join(', ')}). Please give each account a unique name in the Balance Sheet.</span>
      </div>
    </div>
  {/if}

  <div class="bs-table-container mb-4">
    <BsTable bind:bs={() => plan.balance_sheet as Record<string, any>, (v) => (plan.balance_sheet = v)} {periods} {taxRate} {autoRate} hasOverride={hasRateOverride(bs)} cpi={cpiSeries}
      {duplicateKeys} {onRemovePeriod} onShowGoal={(s) => (goalStatus = s)} onEditTarget={(t) => (cpiEdit = t)}
      onOverrideRate={(v) => (bs.marginal_tax_rate_override = v)} {onAddGoal} {onAddProperty} {onAddDebt} />
  </div>

  <div class="card border-0 bg-light p-3 rounded-3 mb-2">
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3">
      <h5 class="fw-bold text-dark mb-0">Net Worth & Asset History</h5>
      <div class="btn-group btn-group-sm" role="group" id="bsChartMetricToggle">
        {#each METRICS as m (m.key)}
          <button type="button" class={['btn btn-outline-primary bs-chart-toggle-btn', metric === m.key && 'active']} data-metric={m.key}
            onclick={() => (bs.chart_metric = m.key)}>{m.label}</button>
        {/each}
      </div>
    </div>
    <BsChart {series} {metric} />
  </div>
</div>

<TabFooter back={{ label: 'Back: Social Security & Income Streams', to: 'income' }}
  next={{ label: 'Next: Rebalance (optional)', to: 'rebalance' }} run {onSwitch} />

<AddPeriodModal bind:open={addOpen} suggested={suggestNextPeriod(bs)} onConfirm={(d) => addPeriod(bs, d)} />
<GoalStatusModal bind:status={goalStatus} />
<TargetCpiModal bind:edit={cpiEdit} cpi={cpiSeries} currentPeriod={bs.current_period} />
