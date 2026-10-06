<!-- "Goal Funding Status" (enter.js openGoalShortageModal). -->
<script lang="ts">
  import { formatMoney } from '../../app/format';
  import type { GoalStatus } from '../../plan/bsView';
  import Modal from '../shared/Modal.svelte';

  interface Props {
    status: GoalStatus | null;
  }
  let { status = $bindable() }: Props = $props();
  const money = (v: number) => formatMoney(v, true);
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v}`;
</script>

<Modal id="goalShortageModal" bind:open={() => status !== null, (v) => !v && (status = null)}>
  {#snippet title()}<i class="fa-solid fa-bullseye me-2"></i>Goal Funding Status{/snippet}
  {#if status}
    {@const s = status}
    <h6 class="fw-bold mb-3" id="modalGoalName">{s.name}</h6>
    <div class="p-3 bg-light rounded-3 mb-3">
      {#if s.calc.autoInflate}
        <div class="d-flex justify-content-between mb-2" id="modalGoalBaseTargetRow">
          <span class="text-secondary">Base Target:</span>
          <strong class="text-dark fs-6">{money(s.calc.baseTarget)} (Ref Month: {s.calc.baseMonth})</strong>
        </div>
      {/if}
      <div class="d-flex justify-content-between mb-2">
        <span class="text-secondary">{s.calc.autoInflate ? 'CPI-Adjusted Target:' : 'Target Goal Amount:'}</span>
        <div class="text-end">
          <strong class="text-dark fs-6" id="modalGoalTarget">{money(s.target)}</strong>
          {#if s.calc.autoInflate}
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-1">{pct(s.calc.inflationPct)}% CPI-U ({s.calc.evalMonth})</span>
          {/if}
        </div>
      </div>
      <div class="d-flex justify-content-between mb-2">
        <span class="text-secondary">Current Funded Balance:</span>
        <strong class="text-primary fs-6" id="modalGoalCurrent">{money(s.current)}</strong>
      </div>
      <hr class="my-2" />
      <div class="d-flex justify-content-between">
        <span class="fw-bold">{s.shortage > 0 ? 'Remaining amount to reach goal:' : 'Goal Status:'}</span>
        <strong class={['fs-5 fw-bold', s.shortage > 0 ? 'text-danger' : 'text-success']} id="modalGoalShortage">
          {s.shortage > 0 ? money(s.shortage) : s.surplus > 0 ? `Goal Reached! (Surplus: ${money(s.surplus)})` : 'Goal Fully Funded!'}
        </strong>
      </div>
    </div>
    <div class="mb-2">
      <div class="d-flex justify-content-between small text-muted mb-1">
        <span>Funding Progress</span><span id="modalGoalPercent">{s.percent}%</span>
      </div>
      <div class="progress" style="height: 10px;">
        <div class={['progress-bar', s.percent >= 100 ? 'bg-success' : 'bg-primary']} role="progressbar" style="width: {Math.min(100, s.percent)}%"></div>
      </div>
    </div>
    {#if s.accounts.length}
      <div class="mt-3 small text-muted" id="modalGoalAccountsList">
        <div class="fw-semibold mb-1">Accounts contributing to this goal:</div>
        <ul class="mb-0 ps-3">{#each s.accounts as a, i (i)}<li>{a.name} ({money(a.value)})</li>{/each}</ul>
      </div>
    {/if}
  {/if}
  {#snippet footer()}
    <button type="button" class="btn btn-secondary btn-sm px-3" onclick={() => (status = null)}>Close</button>
  {/snippet}
</Modal>
