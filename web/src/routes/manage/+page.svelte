<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { planStore } from '../../lib/app/context';
  import ManagePage from '../../lib/components/manage/ManagePage.svelte';

  const store = planStore();
</script>

<svelte:head><title>Save / Load / Clear Data - Retirement Calculator</title></svelte:head>

<ManagePage {store} onDone={() => goto(resolve('/'))} />
