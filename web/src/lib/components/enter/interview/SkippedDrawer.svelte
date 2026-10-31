<script lang="ts">
  import { ALL_QUESTIONS, type InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
    open: boolean;
    onClose: () => void;
  }
  let { wizard, plan, open = $bindable(), onClose }: Props = $props();

  const skippedItems = $derived(
    wizard.skippedQuestions
      .map((id) => ALL_QUESTIONS.find((q) => q.id === id))
      .filter((q): q is typeof ALL_QUESTIONS[number] => q !== undefined)
  );

  function handleJump(id: string) {
    wizard.goTo(id);
    onClose();
  }
</script>

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1070; cursor: default;"
    aria-label="Close skipped questions drawer"
    onclick={onClose}
  ></button>

  <div class="skipped-drawer shadow-lg bg-white p-4" style="z-index: 1075;" role="dialog" aria-modal="true">
    <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
      <div class="d-flex align-items-center gap-2">
        <i class="fa-solid fa-circle-exclamation text-warning fs-5"></i>
        <h5 class="mb-0 fw-bold">Skipped Questions ({skippedItems.length})</h5>
      </div>
      <button type="button" class="btn-close" aria-label="Close" onclick={onClose}></button>
    </div>

    {#if skippedItems.length === 0}
      <div class="alert alert-success d-flex align-items-center py-2 px-3 small">
        <i class="fa-solid fa-circle-check me-2"></i>
        <span>No questions are currently skipped!</span>
      </div>
    {:else}
      <p class="text-secondary small mb-3">
        The tool has assigned safe, standard assumptions for these items. You can click any question to answer it now with your exact information:
      </p>

      <div class="d-flex flex-column gap-2 overflow-auto" style="max-height: 400px;">
        {#each skippedItems as item (item.id)}
          <div class="card p-3 border shadow-sm rounded-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-bold text-dark">{item.title}</div>
                <div class="small text-muted fst-italic">Default used: {item.defaultDescription}</div>
              </div>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm px-3 text-nowrap"
                onclick={() => handleJump(item.id)}
              >
                Answer Now
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="text-end mt-4">
      <button type="button" class="btn btn-secondary btn-sm px-3" onclick={onClose}>Done</button>
    </div>
  </div>
{/if}

<style>
  .skipped-drawer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 520px;
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }
</style>
