<!-- One income stream (enter.js addIncomeRow) with its survivor benefit and its
     adjustment schedule (addAdjustmentPeriodRow). -->
<script lang="ts">
  import { ageOptions } from '../../app/ageOptions';
  import type { People } from '../../plan/accountCard';
  import {
    editableSchedule, hasRate, incomeView, isOneTime, newPeriod, type PeriodView, showsSurvivor,
  } from '../../plan/scheduleRows';
  import type { Adjustment, IncomeSource } from '../../plan/types';
  import AgeSelect from '../shared/AgeSelect.svelte';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import PercentInput from '../shared/PercentInput.svelte';

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

  /** Bind a period field: read the shown schedule, write to the item's own schedule. */
  function periodField<K extends keyof PeriodView>(j: number, key: K) {
    return [
      () => view.periods[j][key],
      (v: PeriodView[K]) => ((editableSchedule(item)[j] as Record<string, unknown>)[key] = v),
    ] as const;
  }

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

    <div class="border rounded p-3 mb-3 bg-white inc-adjustments-schedule-container">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="form-label fw-bold mb-0 text-primary"><i class="fa fa-chart-line me-1"></i> Adjustment Schedule</span>
        <button type="button" class="btn btn-sm btn-outline-primary btnAddAdjustmentPeriod"
          onclick={() => { const s = editableSchedule(item); s.push(newPeriod(s.length) as Adjustment); }}>
          <i class="fa fa-plus me-1"></i> Add Another Period
        </button>
      </div>
      <div class="inc-adjustment-periods-list">
        {#each view.periods as period, j (j)}
          {@const [getPStart, setPStart] = periodField(j, 'start_type')}
          {@const [getPStartSpec, setPStartSpec] = periodField(j, 'start_spec')}
          {@const [getPEnd, setPEnd] = periodField(j, 'end_type')}
          {@const [getPEndSpec, setPEndSpec] = periodField(j, 'end_spec')}
          {@const [getPAdj, setPAdj] = periodField(j, 'adjust_type')}
          {@const [getPVal, setPVal] = periodField(j, 'adjust_val')}
          <div class="p-2 mb-2 bg-light rounded border inc-period-row">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge bg-secondary period-badge">Period {j + 1}</span>
              {#if j > 0}
                <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btnDeletePeriod" title="Remove Period"
                  onclick={() => editableSchedule(item).splice(j, 1)}>
                  <i class="fa fa-times me-1"></i> Remove
                </button>
              {/if}
            </div>
            <div class="row g-2 align-items-center">
              <div class="col-md-4">
                <label class="form-label small mb-1 fw-semibold" for="{uid}-p{j}-start">From:</label>
                <AgeSelect id="{uid}-p{j}-start" small specWidth="80px" options={ageOptions('periodStart', people)} {people}
                  selectClass="p-start-type" specClass="p-start-spec" bind:value={getPStart, setPStart} bind:spec={getPStartSpec, setPStartSpec} />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1 fw-semibold" for="{uid}-p{j}-end">To:</label>
                <AgeSelect id="{uid}-p{j}-end" small specWidth="80px" options={ageOptions('periodEnd', people)} {people}
                  selectClass="p-end-type" specClass="p-end-spec" bind:value={getPEnd, setPEnd} bind:spec={getPEndSpec, setPEndSpec} />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1 fw-semibold" for="{uid}-p{j}-adj">Adjustment:</label>
                <div class="d-flex gap-1">
                  <select class="form-select form-select-sm p-adj-type" id="{uid}-p{j}-adj" bind:value={getPAdj, setPAdj}>
                    <option value="inflation">Inflation</option>
                    <option value="none">None (0%)</option>
                    <option value="fixed_pct">Fixed %</option>
                    <option value="inflation_less_pct">Inflation less %</option>
                  </select>
                  {#if hasRate(period.adjust_type)}
                    <PercentInput id="{uid}-p{j}-val" class="form-control form-control-sm p-adj-val percent-input" bind:value={getPVal, setPVal} />
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

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
