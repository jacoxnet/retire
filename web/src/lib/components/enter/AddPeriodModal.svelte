<!-- "Add Balance Sheet Column" (enter.js promptAddPeriodSnapshot / confirmAddPeriodSnapshot). -->
<script lang="ts">
  import Modal from '../shared/Modal.svelte';

  interface Props {
    open: boolean;
    suggested: string;
    /** Try to add the column; returns an error message, or null when added. */
    onConfirm: (date: string) => string | null;
  }
  let { open = $bindable(), suggested, onConfirm }: Props = $props();
  let date = $state('');
  let error = $state('');

  $effect.pre(() => {
    if (open) {
      date = suggested;
      error = '';
    }
  });

  function confirm() {
    const err = onConfirm(date);
    if (err) error = err;
    else open = false;
  }
</script>

<Modal id="addPeriodModal" size="sm" bind:open>
  {#snippet title()}<i class="fa fa-calendar-plus me-2"></i>Add Balance Sheet Column{/snippet}
  <label for="addPeriodDate" class="form-label small fw-bold text-secondary text-uppercase mb-1">Column Date</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input type="date" class="form-control fw-semibold" id="addPeriodDate" min="1900-01-01" max="2200-12-31" required autofocus
    bind:value={date} oninput={() => (error = '')} />
  <div class="form-text small">Balances from the latest column are copied into the new column.</div>
  {#if error}<div class="small text-danger mt-1" id="addPeriodError">{error}</div>{/if}
  {#snippet footer()}
    <button type="button" class="btn btn-secondary btn-sm px-3" onclick={() => (open = false)}>Cancel</button>
    <button type="button" class="btn btn-primary btn-sm px-3" id="confirmAddPeriod" onclick={confirm}>Add Column</button>
  {/snippet}
</Modal>
