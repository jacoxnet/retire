<!-- The Results route's logic (results_view): show the cached results when they still
     match the plan, otherwise run the simulations with a progress card; apply the
     inputs card's edits and re-run; run other stress tests on request. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { FlashMessage } from '../../app/flash.svelte';
  import { engineKey, type Results } from '../../app/results';
  import { computeResults, type RunEngine, type RunProgress, runStressTest } from '../../app/runResults';
  import type { StressSpec } from '../../engine/crisis';
  import type { ModeChangeInput } from '../../plan/modeChange';
  import type { PlanStore } from '../../plan/store.svelte';
  import type { Plan } from '../../plan/types';
  import { planErrors } from '../../plan/validate';
  import ResultsPage from './ResultsPage.svelte';
  import RunProgressCard from './RunProgressCard.svelte';

  interface Props {
    store: PlanStore<unknown>;
    /** The runner to use (the worker pool in the browser). */
    engine: () => RunEngine;
    /** Stop a running simulation (terminates the pool); the run then rejects. */
    cancel?: () => void;
    /** Link target for "Enter Data". */
    enterHref: string;
    seed?: number;
  }
  let { store, engine, cancel, enterHref, seed }: Props = $props();

  type State =
    | { kind: 'invalid'; errors: string[] }
    | { kind: 'running'; progress: RunProgress | null }
    | { kind: 'cancelled' }
    | { kind: 'failed'; message: string }
    | { kind: 'ready' };

  let view: State = $state({ kind: 'running', progress: null });
  let results: Results | null = $state.raw(null);
  let messages: FlashMessage[] = $state([]);
  let stressBusy = $state(false);
  let stressProgress: number | null = $state(null);
  let stressError: string | null = $state(null);
  let runId = 0;

  const snapshot = () => $state.snapshot(store.plan) as Plan;

  /** Cached results for this plan, if any (adopting ones whose engine inputs still match). */
  function cached(): Results | null {
    if (store.resultsAreCurrent) return store.cachedResults as Results;
    const prev = store.previousResults as Results | null;
    if (prev?.plan_data_json && engineKey(prev.plan_data_json) === engineKey(snapshot())) {
      store.adoptResults();
      return prev;
    }
    return null;
  }

  async function run(): Promise<void> {
    const errors = planErrors(store.plan);
    if (errors.length) {
      view = { kind: 'invalid', errors };
      return;
    }
    const id = ++runId;
    const plan = snapshot();
    view = { kind: 'running', progress: null };
    try {
      const r = await computeResults(plan, {
        ...engine(),
        seed,
        onProgress: (p) => {
          if (id === runId) view = { kind: 'running', progress: p };
        },
      });
      if (id !== runId) return;
      results = r;
      // Cache them unless the plan changed meanwhile. (Compared by content: autosave
      // bumps the data version shortly after an edit, possibly after this run began.)
      if (engineKey(plan) === engineKey(snapshot())) store.setCachedResults(store.dataVersion, r);
      view = { kind: 'ready' };
    } catch (e) {
      if (id !== runId) return;
      if (e instanceof Error && e.name === 'PoolTerminated') view = { kind: 'cancelled' };
      else view = { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
    }
  }

  function show(): void {
    const c = cached();
    if (c) {
      results = c;
      view = { kind: 'ready' };
    } else {
      void run();
    }
  }

  onMount(() => untrack(show));

  function stop(): void {
    runId++;
    view = { kind: 'cancelled' };
    cancel?.();
  }

  /** The inputs card's edits, as change_mode_view applied them, then a re-run. */
  function apply(input: ModeChangeInput): void {
    const notes = store.applyModeChange(input);
    messages = [
      ...notes.map((n) => ({ level: n.level, text: n.message }) as FlashMessage),
      { level: 'success', text: 'Simulation inputs updated and simulation re-run.' },
    ];
    show();
  }

  async function changeStress(spec: StressSpec): Promise<void> {
    if (!results || stressBusy) return;
    const base = results;
    stressBusy = true;
    stressProgress = 0;
    stressError = null;
    try {
      const stress = await runStressTest(base.plan_data_json, spec, base.stress_test.regular_results, {
        ...engine(),
        seed,
        onProgress: (p) => (stressProgress = p.fraction),
      });
      if (results !== base) return;
      results = { ...base, stress_test: stress };
      // Keep the selection for the next visit, if the plan hasn't changed.
      if (store.cachedResults === base) store.setCachedResults(store.dataVersion, results);
    } catch (e) {
      stressError = e instanceof Error && e.name === 'PoolTerminated' ? null : `Stress test failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      stressBusy = false;
      stressProgress = null;
    }
  }
</script>

{#if view.kind === 'ready' && results}
  <ResultsPage {results} bind:messages onApply={apply} onStressChange={changeStress} {stressBusy} {stressProgress} {stressError} />
{:else}
  <div class="mb-4 text-center">
    <h1 class="pageheading mb-2">Retirement Simulation Results</h1>
  </div>
  {#if view.kind === 'running'}
    {#each messages as m, i (i)}
      <div class="alert alert-{m.level === 'error' ? 'danger' : m.level} text-center" role="alert">{m.text}</div>
    {/each}
    <RunProgressCard progress={view.progress} runs={Number(store.plan.runs) || 10000} goalSeeking={Boolean(store.plan.goal_seeking)} onCancel={stop} />
  {:else if view.kind === 'invalid'}
    <div class="alert alert-danger" role="alert" id="resultsPlanErrors">
      <p class="mb-2 fw-semibold">The plan needs a few corrections before it can be simulated:</p>
      <ul class="mb-2">
        {#each view.errors as err, i (i)}<li>{err}</li>{/each}
      </ul>
      <a class="btn btn-primary btn-sm" href={enterHref}>Go to Enter Data</a>
    </div>
  {:else if view.kind === 'cancelled'}
    <div class="alert alert-secondary text-center" role="alert" id="resultsCancelled">
      <p class="mb-2">The simulation was cancelled.</p>
      <button type="button" class="btn btn-primary btn-sm me-2" onclick={() => void run()}>Run Again</button>
      <a class="btn btn-outline-secondary btn-sm" href={enterHref}>Back to Enter Data</a>
    </div>
  {:else if view.kind === 'failed'}
    <div class="alert alert-danger text-center" role="alert" id="resultsFailed">
      <p class="mb-2">The simulation failed: {view.message}</p>
      <button type="button" class="btn btn-primary btn-sm me-2" onclick={() => void run()}>Try Again</button>
      <a class="btn btn-outline-secondary btn-sm" href={enterHref}>Back to Enter Data</a>
    </div>
  {/if}
{/if}
