<!-- Tab 2: Accounts for Retirement (enter.html #assets). -->
<script lang="ts">
  import { duplicateAccountNames, newAccount, personLabels } from '../../plan/accountCard';
  import type { Plan } from '../../plan/types';
  import AccountCard from './AccountCard.svelte';
  import TaxAssumptionsModal from './TaxAssumptionsModal.svelte';
  import TabFooter from './TabFooter.svelte';
  import type { TabId } from '../../app/badges';

  interface Props {
    plan: Plan;
    onSwitch: (to: TabId) => void;
  }
  let { plan = $bindable(), onSwitch }: Props = $props();

  const people = $derived(personLabels(plan));
  const duplicates = $derived(duplicateAccountNames(plan.accounts));
  const dupKeys = $derived(new Map(duplicates.map((d) => [d.toLowerCase(), d])));
  let assumptionsOpen = $state(false);

  const nameOf = (i: number) => String(plan.accounts?.[i]?.name ?? '');

  function addAccount() {
    (plan.accounts ??= []).push(newAccount(plan));
  }

  function removeAccount(i: number) {
    plan.accounts?.splice(i, 1);
  }
</script>

<div class="card p-4 mb-4">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h3 class="mb-1 text-primary">Accounts for Retirement</h3>
      <p class="text-secondary small mb-0">Configure your investment, retirement, brokerage, and HSA accounts.</p>
    </div>
  </div>

  {#if duplicates.length}
    <div id="accountsDuplicateNotice" class="alert alert-danger d-flex mb-3 py-2 px-3 align-items-center shadow-sm" role="alert">
      <i class="fa-solid fa-triangle-exclamation me-2 fs-5"></i>
      <div>
        <strong class="notice-title">Duplicate Account Name Detected:</strong>
        <span class="notice-desc ms-1">Multiple accounts cannot have the same name ({duplicates.map((d) => `"${d}"`).join(', ')}). Please give each account a unique name.</span>
      </div>
    </div>
  {/if}

  <div id="accountsContainer" class="row g-4 mb-3">
    {#each plan.accounts ?? [] as _, i (plan.accounts?.[i]?.id ?? `row-${i}`)}
      <AccountCard
        bind:account={plan.accounts![i]}
        {people}
        priorNames={(plan.accounts ?? []).slice(0, i).map((a) => String(a?.name ?? ''))}
        duplicateName={dupKeys.get(nameOf(i).trim().toLowerCase()) ?? null}
        onDelete={() => removeAccount(i)}
        onShowAssumptions={() => (assumptionsOpen = true)}
      />
    {/each}
  </div>

  <div class="text-center mt-3">
    <button type="button" class="btn btn-secondary btn-sm px-3 py-2" id="btnAddAccount" onclick={addAccount}>
      <i class="fa fa-plus me-1"></i> Add Account
    </button>
  </div>
</div>

<TabFooter back={{ label: 'Back', to: 'demographics' }} next={{ label: 'Next: Spending', to: 'spending' }} {onSwitch} />

<TaxAssumptionsModal bind:open={assumptionsOpen} />
