<!-- Guided Interview Modal (Option A): One question at a time TurboTax-style walkthrough -->
<script lang="ts">
  import Modal from '../shared/Modal.svelte';
  import { InterviewState } from './interview/interviewState.svelte';
  import InterviewProgressBar from './interview/InterviewProgressBar.svelte';
  import SkippedDrawer from './interview/SkippedDrawer.svelte';
  import Stage1Household from './interview/Stage1Household.svelte';
  import Stage2Accounts from './interview/Stage2Accounts.svelte';
  import Stage3Spending from './interview/Stage3Spending.svelte';
  import Stage4Income from './interview/Stage4Income.svelte';
  import Stage5NetWorth from './interview/Stage5NetWorth.svelte';
  import Stage6Review from './interview/Stage6Review.svelte';
  import type { Plan } from '../../plan/types';

  interface Props {
    open: boolean;
    plan: Plan;
    onRun: () => void;
  }
  let { open = $bindable(), plan = $bindable(), onRun }: Props = $props();

  const wizard = new InterviewState(plan);
  let skippedDrawerOpen = $state(false);

  const currentStage = $derived(wizard.currentStage(plan));

  function handleRun() {
    open = false;
    onRun();
  }
</script>

<Modal bind:open id="guidedInterviewModal" size="xl" scrollable>
  {#snippet title()}
    <span class="d-flex align-items-center gap-2">
      <i class="fa-solid fa-compass text-primary"></i>
      <span>Step-by-Step Retirement Interview</span>
    </span>
  {/snippet}

  <div class="interview-modal-body p-2 p-md-3">
    <InterviewProgressBar {wizard} {plan} onOpenSkipped={() => (skippedDrawerOpen = true)} />

    {#if currentStage === 1}
      <Stage1Household {wizard} bind:plan />
    {:else if currentStage === 2}
      <Stage2Accounts {wizard} bind:plan />
    {:else if currentStage === 3}
      <Stage3Spending {wizard} bind:plan />
    {:else if currentStage === 4}
      <Stage4Income {wizard} bind:plan />
    {:else if currentStage === 5}
      <Stage5NetWorth {wizard} bind:plan />
    {:else}
      <Stage6Review {wizard} {plan} onRun={handleRun} onClose={() => (open = false)} />
    {/if}
  </div>
</Modal>

<SkippedDrawer
  {wizard}
  {plan}
  bind:open={skippedDrawerOpen}
  onClose={() => (skippedDrawerOpen = false)}
/>
