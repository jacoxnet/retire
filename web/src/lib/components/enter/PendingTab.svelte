<!-- Placeholder for a tab not yet ported; keeps the tab's navigation buttons. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    phase: string;
    children: Snippet;
  }
  let { title, phase, children }: Props = $props();
</script>

<div class="card p-4 mb-4">
  <h3 class="mb-3">{title}</h3>
  <p class="text-secondary mb-0">This section is ported in phase {phase}. Values already in the plan are kept.</p>
  {@render children()}
</div>
