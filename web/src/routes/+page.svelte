<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { planStore, uiPrefs } from '../lib/app/context';
  import EnterPage from '../lib/components/enter/EnterPage.svelte';
  import { prepareEnterPlan } from '../lib/plan/commit';
  import { takeFlash } from '../lib/app/flash.svelte';

  const store = planStore();
  const ui = uiPrefs();
  let errors: string[] = $state([]);
  // Messages from the Manage page (import / clear), shown once.
  let messages = $state(takeFlash());
  let page: ReturnType<typeof EnterPage> | undefined = $state();

  const resultsPath = resolve('/results');

  /** Save the plan as the Django Enter form did; returns the errors, if any. */
  function prepare(): string[] {
    page?.syncTabs();
    errors = prepareEnterPlan(store.plan);
    if (errors.length) window.scrollTo(0, 0);
    return errors;
  }

  function run() {
    if (!prepare().length) goto(resultsPath);
  }

  // Leaving for the results validates first, like the Django nav link did; other
  // destinations just save the coerced plan.
  beforeNavigate((nav) => {
    if (nav.to && nav.to.url.pathname.replace(/\/+$/, '') === resultsPath) {
      if (nav.type !== 'goto' && prepare().length) nav.cancel();
    } else if (nav.to) {
      page?.syncTabs();
      prepareEnterPlan(store.plan);
    }
  });
</script>

<svelte:head><title>Enter Data - Retirement Calculator</title></svelte:head>

<EnterPage bind:this={page} bind:plan={store.plan} bind:errors bind:messages mode={ui.mode} onModeChange={(m) => ui.setMode(m)} onRun={run} />
