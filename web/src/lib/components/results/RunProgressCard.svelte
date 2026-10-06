<!-- Progress of a Results run: the current step and how far along it is. -->
<script lang="ts">
  import { GOAL_SEEK_RUNS_CAP, type RunProgress, STAGE_LABELS } from '../../app/runResults';

  interface Props {
    progress: RunProgress | null;
    runs: number;
    goalSeeking: boolean;
    onCancel: () => void;
  }
  let { progress, runs, goalSeeking, onCancel }: Props = $props();
  const pct = $derived(Math.round((progress?.fraction ?? 0) * 100));
</script>

<div class="row justify-content-center">
  <div class="col-lg-6 col-md-8">
    <div class="card p-4 shadow-sm text-center" id="runProgressCard">
      <h4 class="text-primary mb-3"><i class="fa fa-spinner fa-spin me-2"></i>Running simulations…</h4>
      <p class="text-secondary small mb-3">
        {runs.toLocaleString('en-US')} Monte Carlo paths{#if goalSeeking}, solving for the maximum spending (each search step uses up to {Math.min(runs, GOAL_SEEK_RUNS_CAP).toLocaleString('en-US')} paths){/if}.
      </p>
      {#if progress}
        <div class="small fw-semibold mb-1" id="runProgressStage">Step {progress.step} of {progress.steps}: {STAGE_LABELS[progress.stage]}</div>
      {:else}
        <div class="small fw-semibold mb-1" id="runProgressStage">Preparing…</div>
      {/if}
      <div class="progress mb-3" role="progressbar" aria-label="Simulation progress" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" style="height: 10px;">
        <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: {pct}%"></div>
      </div>
      <div>
        <button type="button" class="btn btn-outline-secondary btn-sm" id="btnCancelRun" onclick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>
</div>
