<!-- Test harness: wires EnterPage to a PlanStore and UiPrefs the way routes/+page.svelte does. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { FlashMessage } from '../../src/lib/app/flash.svelte';
  import type { UiPrefs } from '../../src/lib/app/ui.svelte';
  import EnterPage from '../../src/lib/components/enter/EnterPage.svelte';
  import { prepareEnterPlan } from '../../src/lib/plan/commit';
  import type { PlanStore } from '../../src/lib/plan/store.svelte';

  interface Props {
    store: PlanStore;
    ui: UiPrefs;
    onNavigate: () => void;
    messages?: FlashMessage[];
  }
  let { store, ui, onNavigate, messages = [] }: Props = $props();
  let shown = $state(untrack(() => messages));
  let errors: string[] = $state([]);

  function run() {
    errors = prepareEnterPlan(store.plan, '2026-01-15');
    if (!errors.length) onNavigate();
  }
</script>

<EnterPage bind:plan={store.plan} bind:errors bind:messages={shown} mode={ui.mode} onModeChange={(m) => ui.setMode(m)} onRun={run} />
