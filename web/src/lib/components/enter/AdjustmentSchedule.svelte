<!-- Adjustment schedule for an income stream (periods with From, To, and Inflation/Fixed%/None). -->
<script lang="ts">
  import { ageOptions } from '../../app/ageOptions';
  import type { People } from '../../plan/accountCard';
  import {
    editableSchedule, hasRate, incomeView, newPeriod, type PeriodView,
  } from '../../plan/scheduleRows';
  import type { Adjustment, IncomeSource } from '../../plan/types';
  import AgeSelect from '../shared/AgeSelect.svelte';
  import PercentInput from '../shared/PercentInput.svelte';

  interface Props {
    item: IncomeSource;
    people: People;
    idPrefix?: string;
  }
  let { item = $bindable(), people, idPrefix = 'adj' }: Props = $props();

  const view = $derived(incomeView(item));

  function periodField<K extends keyof PeriodView>(j: number, key: K) {
    return [
      () => view.periods[j]?.[key],
      (v: PeriodView[K]) => ((editableSchedule(item)[j] as Record<string, unknown>)[key] = v),
    ] as const;
  }
</script>

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
            <label class="form-label small mb-1 fw-semibold" for="{idPrefix}-p{j}-start">From:</label>
            <AgeSelect id="{idPrefix}-p{j}-start" small specWidth="80px" options={ageOptions('periodStart', people)} {people}
              selectClass="p-start-type" specClass="p-start-spec" bind:value={getPStart, setPStart} bind:spec={getPStartSpec, setPStartSpec} />
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-1 fw-semibold" for="{idPrefix}-p{j}-end">To:</label>
            <AgeSelect id="{idPrefix}-p{j}-end" small specWidth="80px" options={ageOptions('periodEnd', people)} {people}
              selectClass="p-end-type" specClass="p-end-spec" bind:value={getPEnd, setPEnd} bind:spec={getPEndSpec, setPEndSpec} />
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-1 fw-semibold" for="{idPrefix}-p{j}-adj">Adjustment:</label>
            <div class="d-flex gap-1">
              <select class="form-select form-select-sm p-adj-type" id="{idPrefix}-p{j}-adj" bind:value={getPAdj, setPAdj}>
                <option value="inflation">Inflation</option>
                <option value="none">None (0%)</option>
                <option value="fixed_pct">Fixed %</option>
                <option value="inflation_less_pct">Inflation less %</option>
              </select>
              {#if hasRate(period.adjust_type)}
                <PercentInput id="{idPrefix}-p{j}-val" class="form-control form-control-sm p-adj-val percent-input" bind:value={getPVal, setPVal} />
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

