<!-- The info icon with a hover/focus popover (replaces Bootstrap's popover JS). -->
<script lang="ts">
  interface Props {
    title: string;
    content: string;
    /** Render `content` as HTML (static, trusted help text only). */
    html?: boolean;
  }
  let { title, content, html = false }: Props = $props();
  let open = $state(false);
</script>

<span class="help-popover-wrap position-relative d-inline-block">
  <i
    class="fa-solid fa-circle-info text-secondary ms-1 help-popover"
    tabindex="0"
    role="button"
    aria-label={title}
    style="cursor: pointer;"
    onmouseenter={() => (open = true)}
    onmouseleave={() => (open = false)}
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
  ></i>
  {#if open}
    <div class="popover bs-popover-top help-popover-box" role="tooltip">
      <h3 class="popover-header">{title}</h3>
      <div class="popover-body">{#if html}{@html content}{:else}{content}{/if}</div>
    </div>
  {/if}
</span>

<style>
  .help-popover-box {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: 276px;
    font-weight: normal;
    text-transform: none;
  }
</style>
