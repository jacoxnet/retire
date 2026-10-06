<!-- A Bootstrap-styled modal without Bootstrap's JS: shown while `open`, closed by
     the close button, Escape or a click on the backdrop. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    id: string;
    size?: 'sm' | 'lg' | 'xl' | '';
    scrollable?: boolean;
    title: Snippet;
    children: Snippet;
    footer?: Snippet;
  }
  let { open = $bindable(), id, size = '', scrollable = false, title, children, footer }: Props = $props();
  const close = () => (open = false);
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal fade show" {id} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="{id}Label"
    style="display: block; z-index: 1065;" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class={['modal-dialog modal-dialog-centered', size && `modal-${size}`, scrollable && 'modal-dialog-scrollable']}>
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title fw-bold text-primary" id="{id}Label">{@render title()}</h5>
          <button type="button" class="btn-close" aria-label="Close" onclick={close}></button>
        </div>
        <div class="modal-body py-3">{@render children()}</div>
        {#if footer}<div class="modal-footer border-0 pt-0">{@render footer()}</div>{/if}
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}
