<!-- Tab 4: Social Security & Income Streams (enter.html #income). -->
<script lang="ts">
  import type { TabId } from '../../app/badges';
  import { spendingStartText } from '../../app/spendingStartText';
  import type { PlannerMode } from '../../app/ui.svelte';
  import { personLabels } from '../../plan/accountCard';
  import { newIncomeSource, type SsPersonView, ssView } from '../../plan/scheduleRows';
  import type { Plan, SocialSecurity } from '../../plan/types';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import IncomeCard from './IncomeCard.svelte';
  import TabFooter from './TabFooter.svelte';

  interface Props {
    plan: Plan;
    mode: PlannerMode;
    onSwitch: (to: TabId) => void;
  }
  let { plan = $bindable(), mode, onSwitch }: Props = $props();

  const people = $derived(personLabels(plan));

  /** Bind one Social Security field: read the shown value, write to the plan's block. */
  function ssField<K extends keyof SsPersonView>(who: 'user' | 'spouse', key: K) {
    const prop = key === 'future_entitled' ? `${who}_future_entitled` : `${who}_${key}`;
    return [
      () => ssView(plan.social_security, who)[key],
      (v: SsPersonView[K]) => ((plan.social_security ??= {}) as Record<string, unknown>)[prop] = v,
    ] as const;
  }
  const yesNo = (v: boolean) => (v ? 'true' : 'false');
</script>

{#snippet ssPerson(who: 'user' | 'spouse')}
  {@const v = ssView(plan.social_security, who)}
  {@const [getAmount, setAmount] = ssField(who, 'amount')}
  {@const [getFreq, setFreq] = ssField(who, 'freq')}
  {@const [getAge, setAge] = ssField(who, 'start_age')}
  {@const [, setReceiving] = ssField(who, 'receiving')}
  {@const [, setFuture] = ssField(who, 'future_entitled')}
  {@const you = who === 'user'}
  <div class="mb-3">
    <label class="form-label fw-bold" for="{who}_ss_receiving">{you ? 'Are you receiving Social Security?' : 'Is your spouse receiving Social Security?'}</label>
    <select class="form-select" id="{who}_ss_receiving" value={yesNo(v.receiving)}
      onchange={(e) => setReceiving((e.currentTarget as HTMLSelectElement).value === 'true')}>
      <option value="false">No</option>
      <option value="true">Yes</option>
    </select>
  </div>
  {#if !v.receiving}
    <div class="mb-3" id="{who}_ss_future_group">
      <label class="form-label fw-bold" for="{who}_ss_future_entitled">{you ? 'Will you become entitled to receive Social Security in the future?' : 'Will your spouse become entitled to receive Social Security in the future?'}</label>
      <select class="form-select" id="{who}_ss_future_entitled" value={yesNo(v.future_entitled)}
        onchange={(e) => setFuture((e.currentTarget as HTMLSelectElement).value === 'true')}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  {/if}
  {#if v.receiving || v.future_entitled}
    <div id="{who}_ss_fields_group">
      <div class="row">
        <div class="col-6 mb-3">
          <label class="form-label fw-semibold" for="{who}_ss_amount">{v.receiving ? 'Current Benefit Amount' : 'Initial Amount'}</label>
          <MoneyInput id="{who}_ss_amount" class="form-control currency-input" dollarSign bind:value={getAmount, setAmount} />
        </div>
        <div class="col-6 mb-3">
          <label class="form-label fw-semibold" for="{who}_ss_freq">Frequency</label>
          <select class="form-select" id="{who}_ss_freq" bind:value={getFreq, setFreq}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
      </div>
      {#if !v.receiving && v.future_entitled}
        <div class="mb-3" id="{who}_ss_claiming_age_group">
          <label class="form-label fw-semibold" for="{who}_ss_start_age">{you ? 'Your' : "Spouse's"} Age at Claiming (62 – 70)</label>
          <input type="number" class="form-control" id="{who}_ss_start_age" min="62" max="70" bind:value={getAge, setAge} />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="card p-4 mb-4 border-primary">
  <h3 class="mb-1 text-primary">Social Security</h3>
  <p class="text-secondary small mb-3">Configure Social Security benefits for you and your spouse.</p>
  <div class="row">
    <div class="col-md-6 border-end" id="user_ss_container">
      <h4 class="h6 fw-bold text-primary mb-3">Your Social Security</h4>
      {@render ssPerson('user')}
    </div>
    {#if people.isMarried}
      <div class="col-md-6" id="spouse_ss_container">
        <h4 class="h6 fw-bold text-info mb-3">Spouse's Social Security</h4>
        {@render ssPerson('spouse')}
      </div>
    {/if}
  </div>
</div>

<div class="card p-4 mb-4">
  <h3 class="mb-1">Other Income Streams & Benefits</h3>
  <p class="text-secondary small mb-3">Enter pensions, annuity payments, consulting income, spouse's continuing income or other non-Social Security sources of non-portfolio income that will be received after <span id="otherIncomeSpendingStartAgeText">{spendingStartText(plan, people)}</span>.</p>

  <div id="incomeStreamsContainer" class="mb-3">
    {#each plan.income_sources ?? [] as _, i (plan.income_sources![i])}
      <IncomeCard bind:item={plan.income_sources![i]} {people} onDelete={() => plan.income_sources?.splice(i, 1)} />
    {/each}
  </div>

  <div class="text-center">
    <button type="button" class="btn btn-secondary btn-sm" id="btnAddIncomeRow"
      onclick={() => (plan.income_sources ??= []).push(newIncomeSource())}>
      <i class="fa fa-plus me-1"></i> Add Income Source
    </button>
  </div>
</div>

<TabFooter back={{ label: 'Back', to: 'spending' }}
  next={mode === 'advanced' ? { label: 'Next: Balance Sheet (optional)', to: 'balance-sheet' } : undefined} run {onSwitch} />
