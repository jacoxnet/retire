<!-- "CPI-U Inflation Adjustment" for the emergency fund or a goal target
     (enter.js openTargetCpiModal / updateCpiModalPreview / saveTargetCpiModal). -->
<script lang="ts">
  import { formatMoney } from '../../app/format';
  import { type CpiSeries, effectiveTarget } from '../../plan/bsView';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import Modal from '../shared/Modal.svelte';

  export interface CpiTarget {
    title: string;
    target: number;
    autoInflate: boolean;
    baseDate: string;
    save: (target: number, autoInflate: boolean, baseDate: string) => void;
  }
  interface Props {
    edit: CpiTarget | null;
    cpi: CpiSeries;
    currentPeriod: string;
  }
  let { edit = $bindable(), cpi, currentPeriod }: Props = $props();

  let amount = $state(0);
  let auto = $state(false);
  let month = $state('01');
  let year = $state('2026');

  $effect.pre(() => {
    if (!edit) return;
    amount = edit.target;
    auto = edit.autoInflate;
    const parts = String(edit.baseDate).split('-');
    year = parts[0] || '2026';
    month = (parts[1] || '01').padStart(2, '0');
  });

  const baseDate = $derived(`${year || '2026'}-${month}-01`);
  const calc = $derived(effectiveTarget(cpi, amount, true, baseDate, currentPeriod));
  const diff = $derived(calc.effectiveTarget - calc.baseTarget);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function save() {
    edit?.save(amount, auto, baseDate);
    edit = null;
  }
</script>

<Modal id="targetCpiModal" bind:open={() => edit !== null, (v) => !v && (edit = null)}>
  {#snippet title()}<i class="fa-solid fa-arrow-trend-up me-2"></i>{edit?.title ?? 'CPI-U Inflation Adjustment'}{/snippet}
  <div class="p-3 bg-light rounded-3 mb-3 border">
    <div class="form-check form-switch">
      <input class="form-check-input" type="checkbox" role="switch" id="cpiModalAutoInflate" bind:checked={auto} />
      <label class="form-check-label fw-bold text-dark" for="cpiModalAutoInflate">Automatically adjust target with CPI-U</label>
    </div>
    <div class="small text-muted mt-1 ps-1">
      Index your nominal target to actual changes in the Consumer Price Index (CPI-U) to maintain true purchasing power over time.
    </div>
  </div>

  <div id="cpiModalConfigBody" style="opacity: {auto ? 1.0 : 0.45};">
    <div class="mb-3">
      <label for="cpiModalTargetAmount" class="form-label small fw-bold text-secondary text-uppercase mb-1">Base Target Amount ($)</label>
      <div class="input-group">
        <span class="input-group-text fw-semibold">$</span>
        <MoneyInput id="cpiModalTargetAmount" class="form-control fw-semibold text-end currency-input" bind:value={amount} />
      </div>
      <div class="form-text small">Nominal baseline dollar target before inflation adjustment.</div>
    </div>

    <div class="mb-3">
      <span class="form-label small fw-bold text-secondary text-uppercase mb-1 d-block">Price Level Reference Date</span>
      <div class="row g-2">
        <div class="col-7">
          <select class="form-select form-select-sm" id="cpiModalMonth" aria-label="Month" bind:value={month}>
            {#each MONTHS as name, i (name)}<option value={String(i + 1).padStart(2, '0')}>{name}</option>{/each}
          </select>
        </div>
        <div class="col-5">
          <input type="text" inputmode="numeric" class="form-control form-control-sm text-center fw-semibold" id="cpiModalYear"
            aria-label="Year" bind:value={year} />
        </div>
      </div>
      <div class="form-text small text-muted">
        Select the month when this dollar target was priced (or established). Inflation is measured automatically from the <strong>month prior</strong> (reflecting the official BLS publication lag).
      </div>
    </div>

    <div class="card border border-primary-subtle bg-primary-subtle bg-opacity-10 rounded-3 p-3 mb-1" id="cpiModalPreviewCard">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small fw-bold text-primary text-uppercase"><i class="fa-solid fa-calculator me-1"></i>Live Inflation Calculation</span>
        <span class="badge bg-white text-primary border border-primary-subtle shadow-xs">Source: FRED (CPIAUCNS)</span>
      </div>
      <div class="d-flex justify-content-between small py-1 border-bottom border-light">
        <span class="text-secondary">Base Index Month (Month Prior):</span>
        <span class="fw-semibold text-dark" id="cpiModalBaseMonthDisplay">{calc.baseMonth || '—'} (CPI-U: {calc.baseIndex ? calc.baseIndex.toFixed(3) : '—'})</span>
      </div>
      <div class="d-flex justify-content-between small py-1 border-bottom border-light">
        <span class="text-secondary">Current / Latest Month:</span>
        <span class="fw-semibold text-dark">{calc.evalMonth || '—'} (CPI-U: {calc.evalIndex ? calc.evalIndex.toFixed(3) : '—'} - Latest FRED)</span>
      </div>
      <div class="d-flex justify-content-between small py-1 border-bottom border-light">
        <span class="text-secondary">Cumulative Inflation:</span>
        <span class={['fw-bold fs-6', calc.inflationPct >= 0 ? 'text-primary' : 'text-success']} id="cpiModalInflationPctDisplay">
          {calc.inflationPct >= 0 ? '+' : ''}{calc.inflationPct.toFixed(2)}%</span>
      </div>
      <div class="d-flex justify-content-between align-items-center pt-2">
        <span class="fw-bold text-dark">Effective Target Today:</span>
        <span class="fw-bold text-success fs-5" id="cpiModalEffectiveTargetDisplay">{formatMoney(calc.effectiveTarget, true)}</span>
      </div>
      <div class="text-end small text-muted mt-1">
        {diff !== 0 ? `(${diff > 0 ? '+' : ''}${formatMoney(diff, true)} inflation adjustment)` : '(Zero inflation change for this period)'}
      </div>
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-secondary btn-sm px-3" onclick={() => (edit = null)}>Cancel</button>
    <button type="button" class="btn btn-primary btn-sm px-3 shadow-sm" id="saveTargetCpi" onclick={save}>Save Target Settings</button>
  {/snippet}
</Modal>
