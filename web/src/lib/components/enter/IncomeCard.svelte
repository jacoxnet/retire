<!-- One income stream (enter.js addIncomeRow) with its survivor benefit and its
     adjustment schedule (addAdjustmentPeriodRow). -->
<script lang="ts">
  import { ageOptions } from '../../app/ageOptions';
  import type { People } from '../../plan/accountCard';
  import { incomeView, isOneTime, showsSurvivor } from '../../plan/scheduleRows';
  import type { IncomeSource } from '../../plan/types';
  import AgeSelect from '../shared/AgeSelect.svelte';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import PercentInput from '../shared/PercentInput.svelte';
  import AdjustmentSchedule from './AdjustmentSchedule.svelte';

  interface Props {
    item: IncomeSource;
    people: People;
    onDelete: () => void;
  }
  let { item = $bindable(), people, onDelete }: Props = $props();
  const uid = $props.id();
  const view = $derived(incomeView(item));

  type View = ReturnType<typeof incomeView>;
  function field<K extends keyof View>(key: K) {
    return [() => view[key], (v: View[K]) => ((item as Record<string, unknown>)[key] = v)] as const;
  }
  const [getName, setName] = field('name');
  const [getAmount, setAmount] = field('amount');
  const [getFreq, setFreq] = field('frequency');
  const [getStart, setStart] = field('start_age_type');
  const [getStartSpec, setStartSpec] = field('start_age_specified');
  const [getEnd, setEnd] = field('end_age_type');
  const [getEndSpec, setEndSpec] = field('end_age_specified');
  const [getSurvivor, setSurvivor] = field('has_survivor_benefit');
  const [getPct, setPct] = field('survivor_benefit_pct');

  const survivorName = $derived(people.spouseName);
  const pctShown = $derived(Number(view.survivor_benefit_pct ?? 100));
</script>

<div class="card border shadow-sm mb-3 income-stream-card">
  <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
    <div class="d-flex align-items-center gap-2 flex-grow-1 me-3" style="max-width: 450px;">
      <label class="form-label mb-0 fw-bold text-nowrap" for="{uid}-name">Stream Name:</label>
      <input type="text" class="form-control form-control-sm inc-name" id="{uid}-name" placeholder="e.g. Pension, Annuity" required
        bind:value={getName, setName} />
    </div>
    <button type="button" class="btn btn-outline-danger btn-sm btnDeleteRow" title="Delete" aria-label="Delete" onclick={onDelete}>
      <i class="fa fa-trash"></i>
    </button>
  </div>
  <div class="card-body p-3">
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-amount">Amount</label>
        <MoneyInput id="{uid}-amount" class="form-control currency-input" dollarSign bind:value={getAmount, setAmount} />
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-freq">Frequency</label>
        <select class="form-select inc-frequency" id="{uid}-freq" bind:value={getFreq, setFreq}>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="one_time">One-Time Payment</option>
        </select>
      </div>
    </div>

    <div class="row g-3 mb-3 align-items-start">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-start">Starts At</label>
        <AgeSelect id="{uid}-start" options={ageOptions('start', people)} {people} selectClass="inc-start-type" specClass="inc-start-spec"
          bind:value={getStart, setStart} bind:spec={getStartSpec, setStartSpec} />
      </div>
      {#if !isOneTime(view.frequency)}
        <div class="col-md-6 inc-end-group">
          <label class="form-label fw-semibold" for="{uid}-end">Ends At</label>
          <AgeSelect id="{uid}-end" options={ageOptions('end', people)} {people} selectClass="inc-end-type" specClass="inc-end-spec"
            bind:value={getEnd, setEnd} bind:spec={getEndSpec, setEndSpec} />
        </div>
      {/if}
    </div>

    {#if showsSurvivor(view, people.isMarried)}
      <div class="row g-3 mb-3 inc-survivor-group">
        <div class="col-12">
          <div class="p-3 bg-light rounded border">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="form-label fw-bold mb-0 inc-survivor-title">Survivor Benefit for {view.end_age_type === 'death' ? survivorName : people.userName}</span>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input inc-has-survivor" type="checkbox" id="{uid}-surv" bind:checked={getSurvivor, setSurvivor} />
                <label class="form-check-label fw-semibold small" for="{uid}-surv">Provide Survivor Benefit</label>
              </div>
            </div>
            {#if view.has_survivor_benefit}
              <div class="inc-survivor-details">
                <div class="row g-2 align-items-center">
                  <div class="col-auto">
                    <label class="form-label small fw-semibold mb-0" for="{uid}-pct">Survivor Percentage:</label>
                  </div>
                  <div class="col-auto">
                    <div class="input-group input-group-sm" style="width: 100px;">
                      <PercentInput id="{uid}-pct" class="form-control text-center fw-bold percent-input inc-survivor-pct" emptyValue={100}
                        bind:value={getPct, setPct} />
                    </div>
                  </div>
                </div>
                <div class="form-text small text-muted mt-1 inc-survivor-hint">
                  {#if view.end_age_type === 'death'}
                    Upon your death, {survivorName} will receive {pctShown}% of the adjusted benefit until their death.
                  {:else}
                    Upon {survivorName}'s death, {people.userName} will receive {pctShown}% of the adjusted benefit until death.
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <AdjustmentSchedule bind:item {people} idPrefix={uid} />

    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold" for="{uid}-tax">Subject to Income Tax?</label>
        <select class="form-select inc-subject-to-tax" id="{uid}-tax" value={view.subject_to_tax ? 'true' : 'false'}
          onchange={(e) => (item.subject_to_tax = (e.currentTarget as HTMLSelectElement).value === 'true')}>
          <option value="true">Yes (Taxable)</option>
          <option value="false">No (Tax-Free)</option>
        </select>
      </div>
    </div>
  </div>
</div>
