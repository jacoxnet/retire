<!-- "How to Use this App" modal, rendered from how-to.md (base.html #howToModal). -->
<script lang="ts">
  import { howToHtml } from '../../app/howTo';

  interface Props {
    open: boolean;
  }
  let { open = $bindable() }: Props = $props();

  // Local, trusted markdown bundled with the app.
  const html = howToHtml();

  function close() {
    open = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal"
    id="howToModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="howToModalTitle"
    tabindex="-1"
    style="display: block;"
    onclick={(e) => e.target === e.currentTarget && close()}
  >
    <div class="modal-content">
      <span
        class="close-modal"
        id="howToClose"
        role="button"
        tabindex="0"
        aria-label="Close"
        onclick={close}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), close())}>&times;</span>
      <div class="markdown-body" id="howToBody">
        <span id="howToModalTitle" class="visually-hidden">How to Use this App</span>
        {@html html}
      </div>
    </div>
  </div>
{/if}
