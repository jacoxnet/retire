<!-- Planner mode bar: Advanced (default) vs Simple. -->
<script lang="ts">
  import type { PlannerMode } from '../../app/ui.svelte';

  interface Props {
    mode: PlannerMode;
    onchange: (mode: PlannerMode) => void;
  }
  let { mode, onchange }: Props = $props();
</script>

<div class="planner-mode-bar d-flex justify-content-between align-items-center mb-4 p-2 px-3 rounded-3 shadow-sm flex-wrap gap-2">
  <div class="d-flex align-items-center gap-2">
    <span class="small fw-bold text-secondary text-uppercase" style="font-size: 0.75rem; letter-spacing: 0.5px;">Planner Mode:</span>
    <div class="btn-group btn-group-sm" role="group" id="plannerModeToggle" aria-label="Planner View Mode">
      <input type="radio" class="btn-check" name="planner_mode" id="mode_advanced" value="advanced" autocomplete="off"
        checked={mode === 'advanced'} onchange={() => onchange('advanced')} />
      <label class="btn btn-outline-primary px-3 fw-semibold" for="mode_advanced">
        <i class="fa-solid fa-sliders me-1"></i> Advanced Mode (Default)
      </label>
      <input type="radio" class="btn-check" name="planner_mode" id="mode_simple" value="simple" autocomplete="off"
        checked={mode === 'simple'} onchange={() => onchange('simple')} />
      <label class="btn btn-outline-primary px-3 fw-semibold" for="mode_simple">
        <i class="fa-solid fa-wand-magic-sparkles me-1"></i> Simple Mode
      </label>
    </div>
  </div>
  <div class="text-secondary small" id="plannerModeDescription">
    {#if mode === 'advanced'}
      <span id="descAdvanced"><i class="fa-solid fa-circle-check text-primary me-1"></i>Includes ability to change the standard deviation of each account held for retirement, ability to address other types of taxes/surcharges, balance sheet net worth tracking, and portfolio rebalancing.</span>
    {:else}
      <span id="descSimple"><i class="fa-solid fa-circle-info text-primary me-1"></i>Includes a streamlined 4-step wizard based on essential retirement assets, timeline, and baseline spending. Excludes ability to change the standard deviation of each account held for retirement, ability to address other types of taxes/surcharges, balance sheet net worth tracking, and portfolio rebalancing.</span>
    {/if}
  </div>
</div>
