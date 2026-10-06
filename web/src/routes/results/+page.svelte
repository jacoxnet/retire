<script lang="ts">
  import { resolve } from '$app/paths';
  import { cancelMc, mcEngine, planStore } from '../../lib/app/context';
  import ResultsView from '../../lib/components/results/ResultsView.svelte';

  const store = planStore();
</script>

<svelte:head><title>Simulation Results - Retirement Calculator</title></svelte:head>

<!-- Full width, as in Django (results.html has no container). -->
<div class="main-content">
  <ResultsView {store} engine={mcEngine} cancel={cancelMc} enterHref={resolve('/')} />
</div>
