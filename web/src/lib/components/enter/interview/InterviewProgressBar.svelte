<script lang="ts">
  import { STAGES, type InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
    onOpenSkipped: () => void;
  }
  let { wizard, plan, onOpenSkipped }: Props = $props();

  const currentStage = $derived(wizard.currentStage(plan));
  const skippedCount = $derived(wizard.skippedQuestions.length);
</script>

<div class="interview-header mb-4 border-bottom pb-3">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fs-6">
        <i class="fa-solid fa-compass me-1"></i> Guided Retirement Walkthrough
      </span>
      <span class="text-secondary small d-none d-md-inline">Step-by-step plain English setup</span>
    </div>

    {#if skippedCount > 0}
      <button
        type="button"
        class="btn btn-sm btn-outline-warning d-flex align-items-center gap-1 shadow-sm px-2 py-1"
        onclick={onOpenSkipped}
        title="View skipped questions"
      >
        <i class="fa-solid fa-circle-exclamation"></i>
        <span class="fw-semibold">{skippedCount} Skipped</span>
        <span class="badge bg-warning text-dark ms-1">Review</span>
      </button>
    {/if}
  </div>

  <!-- Stage indicator pills -->
  <div class="d-flex flex-wrap gap-1 gap-md-2 justify-content-between align-items-center stage-pills">
    {#each STAGES as s (s.number)}
      {@const isActive = s.number === currentStage}
      {@const isDone = s.number < currentStage}
      <div
        class="stage-pill d-flex align-items-center py-1 px-2 rounded-2 small"
        class:stage-active={isActive}
        class:stage-done={isDone}
        class:stage-upcoming={!isActive && !isDone}
      >
        <span class="stage-num me-1 fw-bold rounded-circle text-center">
          {#if isDone}
            <i class="fa-solid fa-check"></i>
          {:else}
            {s.number}
          {/if}
        </span>
        <span class="stage-label d-none d-sm-inline">{s.short}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .stage-pill {
    transition: all 0.2s ease;
    background-color: var(--bs-gray-100, #f8f9fa);
    color: var(--bs-gray-600, #6c757d);
    border: 1px solid var(--bs-gray-300, #dee2e6);
  }
  .stage-num {
    display: inline-block;
    width: 20px;
    height: 20px;
    line-height: 18px;
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.05);
  }
  .stage-active {
    background-color: #e7f1ff;
    color: #0d6efd;
    border-color: #b6d4fe;
    font-weight: 600;
  }
  .stage-active .stage-num {
    background: #0d6efd;
    color: #fff;
  }
  .stage-done {
    background-color: #f0fdf4;
    color: #198754;
    border-color: #bbf7d0;
  }
  .stage-done .stage-num {
    background: #198754;
    color: #fff;
  }
</style>
