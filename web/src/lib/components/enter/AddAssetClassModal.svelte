<!-- "Add Custom Asset Class" (enter.js promptAddAssetClass / confirmAddAssetClass). -->
<script lang="ts">
  import Modal from '../shared/Modal.svelte';

  interface Props {
    open: boolean;
    color: string;
    onAdd: (name: string, target: number, color: string) => void;
  }
  let { open = $bindable(), color: suggested, onAdd }: Props = $props();
  let name = $state('');
  let target = $state('10.0');
  let color = $state('#3b82f6');

  $effect.pre(() => {
    if (open) {
      name = '';
      target = '10.0';
      color = suggested;
    }
  });

  function add() {
    if (!name.trim()) {
      window.alert('Please enter a name for the asset class.');
      return;
    }
    const t = parseFloat(String(target));
    onAdd(name.trim(), Number.isNaN(t) || t < 0 ? 0 : t, color);
    open = false;
  }
</script>

<Modal id="addAssetClassModal" bind:open>
  {#snippet title()}<i class="fa-solid fa-plus-circle me-2"></i>Add Custom Asset Class{/snippet}
  <div class="mb-3">
    <label for="newAssetClassName" class="form-label fw-semibold">Asset Class Name</label>
    <input type="text" class="form-control" id="newAssetClassName" placeholder="e.g. Small Cap Value, Commodities, Crypto, Beanie Babies..." bind:value={name} />
  </div>
  <div class="mb-3">
    <label for="newAssetClassTarget" class="form-label fw-semibold">Target Allocation %</label>
    <div class="input-group">
      <input type="number" class="form-control" id="newAssetClassTarget" min="0" max="100" step="0.5" placeholder="10.0" bind:value={target} />
      <span class="input-group-text">%</span>
    </div>
  </div>
  <div class="mb-3">
    <label for="newAssetClassColor" class="form-label fw-semibold">Color Tag</label>
    <div class="d-flex align-items-center gap-2">
      <input type="color" class="form-control form-control-color" id="newAssetClassColor" title="Choose a color" bind:value={color} />
      <span class="small text-muted">Used for charts and indicators</span>
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-secondary btn-sm" onclick={() => (open = false)}>Cancel</button>
    <button type="button" class="btn btn-primary btn-sm px-3" id="confirmAddAssetClass" onclick={add}>Add Class</button>
  {/snippet}
</Modal>
