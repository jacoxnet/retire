<!-- One "Other Taxes" item (enter.js addOtherTaxRow). -->
<script lang="ts">
  import { ageOptions } from '../../app/ageOptions';
  import type { People } from '../../plan/accountCard';
  import { hasRate, isOneTime, otherTaxView } from '../../plan/scheduleRows';
  import type { OtherTax } from '../../plan/types';
  import AgeSelect from '../shared/AgeSelect.svelte';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import PercentInput from '../shared/PercentInput.svelte';

  interface Props {
    item: OtherTax;
    people: People;
    onDelete: () => void;
  }
  let { item = $bindable(), people, onDelete }: Props = $props();
  const uid = $props.id();
  const view = $derived(otherTaxView(item));

  function field<K extends keyof ReturnType<typeof otherTaxView>>(key: K) {
    return [() => view[key], (v: unknown) => ((item as Record<string, unknown>)[key] = v)] as const;
  }
  const [getName, setName] = field('name');
  const [getAmount, setAmount] = field('amount');
  const [getFreq, setFreq] = field('frequency');
  const [getStart, setStart] = field('start_age_type');
  const [getStartSpec, setStartSpec] = field('start_age_specified');
  const [getEnd, setEnd] = field('end_age_type');
  const [getEndSpec, setEndSpec] = field('end_age_specified');
  const [getAdj, setAdj] = field('adjust_type');
  const [getAdjVal, setAdjVal] = field('adjust_val');
  const [getAdjStart, setAdjStart] = field('adjust_start_age_type');
  const [getAdjStartSpec, setAdjStartSpec] = field('adjust_start_age_specified');
</script>

<div class="card border shadow-sm mb-3 other-tax-card">
  <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
    <div class="d-flex align-items-center gap-2 flex-grow-1 me-3" style="max-width: 450px;">
      <label class="form-label mb-0 fw-bold text-nowrap" for="{uid}-name">Tax Description:</label>
      <input type="text" class="form-control form-control-sm ot-name" id="{uid}-name" placeholder="e.g. Capital Gains, Other Taxes"
        required bind:value={getName, setName} />
    </div>
    <button type="button" class="btn btn-outline-danger btn-sm btnDeleteRow" title="Delete" aria-label="Delete" onclick={onDelete}>
      <i class="fa fa-trash"></i>
    </button>
  </div>
  <div class="card-body p-3">
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-amount">Amount of Other Taxes</label>
        <MoneyInput id="{uid}-amount" class="form-control currency-input" dollarSign bind:value={getAmount, setAmount} />
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-freq">Frequency</label>
        <select class="form-select ot-frequency" id="{uid}-freq" bind:value={getFreq, setFreq}>
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
          <option value="one_time">One-Time Tax</option>
        </select>
      </div>
    </div>

    <div class="row g-3 mb-3 align-items-start">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-start">Starts At</label>
        <AgeSelect id="{uid}-start" options={ageOptions('start', people)} {people} selectClass="ot-start-type" specClass="ot-start-spec"
          bind:value={getStart, setStart} bind:spec={getStartSpec, setStartSpec} />
      </div>
      {#if !isOneTime(view.frequency)}
        <div class="col-md-6 ot-end-group">
          <label class="form-label fw-semibold" for="{uid}-end">Ends At</label>
          <AgeSelect id="{uid}-end" options={ageOptions('end', people)} {people} selectClass="ot-end-type" specClass="ot-end-spec"
            bind:value={getEnd, setEnd} bind:spec={getEndSpec, setEndSpec} />
        </div>
      {/if}
    </div>

    <div class="row g-3 align-items-start">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-adj">Adjust for Inflation?</label>
        <div class="d-flex gap-2">
          <select class="form-select ot-adjust-type" id="{uid}-adj" bind:value={getAdj, setAdj}>
            <option value="inflation">Yes</option>
            <option value="none">No</option>
            <option value="fixed_pct">By a Fixed Percentage</option>
            <option value="inflation_less_pct">Inflation less a Fixed Percentage</option>
          </select>
          {#if hasRate(view.adjust_type)}
            <PercentInput id="{uid}-adjval" class="form-control ot-adjust-val percent-input" bind:value={getAdjVal, setAdjVal} />
          {/if}
        </div>
      </div>
      {#if view.adjust_type !== 'none'}
        <div class="col-md-6 ot-adjust-start-group">
          <label class="form-label fw-semibold" for="{uid}-adjstart">Adjustment Begins At</label>
          <AgeSelect id="{uid}-adjstart" options={ageOptions('taxAdjustStart', people)} {people} selectClass="ot-adjust-start-type"
            specClass="ot-adjust-start-spec" bind:value={getAdjStart, setAdjStart} bind:spec={getAdjStartSpec, setAdjStartSpec} />
        </div>
      {/if}
    </div>
  </div>
</div>
