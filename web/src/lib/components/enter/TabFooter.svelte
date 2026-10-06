<!-- Back / Next / Run Simulation buttons at the bottom of a tab. -->
<script lang="ts">
  import type { TabId } from '../../app/badges';

  interface Step {
    label: string;
    to: TabId;
  }
  interface Props {
    back?: Step;
    next?: Step;
    /** Show the Run Simulation (form submit) button. */
    run?: boolean;
    onSwitch: (to: TabId) => void;
  }
  let { back, next, run = false, onSwitch }: Props = $props();
</script>

<div class="text-center mt-4 mb-3">
  {#if back}
    <button type="button" class="btn btn-secondary me-2" onclick={() => onSwitch(back.to)}>{back.label}</button>
  {/if}
  {#if next}
    <button type="button" class="btn btn-secondary me-2" onclick={() => onSwitch(next.to)}>{next.label}</button>
  {/if}
  {#if run}
    <button type="submit" class="btn btn-primary btn-lg px-4 shadow-sm run-simulation-btn">
      <i class="fa fa-play me-2"></i> Run Simulation
    </button>
  {/if}
</div>
