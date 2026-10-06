<!-- The Enter Data page (enter.html): mode bar, section tabs, tab panes, run buttons. -->
<script lang="ts">
  import { tabBadges, type TabId } from '../../app/badges';
  import type { PlannerMode } from '../../app/ui.svelte';
  import { applyMarriageToAccounts, duplicateAccountNames } from '../../plan/accountCard';
  import { syncAllTabs } from '../../plan/bsSync';
  import { duplicateSheetNames } from '../../plan/bsView';
  import BalanceSheetTab from './BalanceSheetTab.svelte';
  import { applyMarriageToSchedules } from '../../plan/scheduleRows';
  import { onMount } from 'svelte';
  import { ensureTaxableAccountForLifeInsurance } from '../../plan/commit';
  import type { Plan } from '../../plan/types';
  import AccountsTab from './AccountsTab.svelte';
  import DemographicsTab from './DemographicsTab.svelte';
  import IncomeTab from './IncomeTab.svelte';
  import SpendingTab from './SpendingTab.svelte';
  import ModeToggle from './ModeToggle.svelte';
  import PendingTab from './PendingTab.svelte';
  import TabFooter from './TabFooter.svelte';

  interface Props {
    plan: Plan;
    mode: PlannerMode;
    /** Errors from the last run attempt, shown above the form. */
    errors?: string[];
    onModeChange: (mode: PlannerMode) => void;
    /** Validate, save and go to the results; the page shows any errors it returns. */
    onRun: () => void;
  }
  let { plan = $bindable(), mode, errors = $bindable([]), onModeChange, onRun }: Props = $props();

  interface TabDef {
    id: TabId;
    name: string;
    label: string;
    sub?: string;
    advanced?: boolean;
  }
  const TABS: TabDef[] = [
    { id: 'demographics', name: 'Demographics & Plan Details', label: 'Demographics & Plan Details' },
    { id: 'assets', name: 'Accounts for Retirement', label: 'Accounts for Retirement' },
    { id: 'spending', name: 'Spending', label: 'Spending' },
    { id: 'income', name: 'Social Security & Income Streams', label: 'Social Security & Income Streams' },
    { id: 'balance-sheet', name: 'Balance Sheet (optional)', label: 'Balance Sheet', sub: '(optional)', advanced: true },
    { id: 'rebalance', name: 'Rebalance (optional)', label: 'Rebalance', sub: '(optional)', advanced: true },
  ];

  let active: TabId = $state('demographics');

  // As the Django page did on load: a single person's spouse-based choices show as
  // their single-person equivalents (a no-op for almost every plan).
  onMount(() => {
    if (!plan.is_married) {
      applyMarriageToAccounts(plan.accounts, false);
      applyMarriageToSchedules(plan, false);
    }
    synced = snapshot();
  });

  // The balance sheet and the account cards are reconciled when you leave a tab (and
  // before a run), as the page's syncAllTabs did, but only after one of them was
  // edited, so viewing a plan never rewrites it. View settings on the sheet don't count.
  const VIEW_KEYS = ['collapsed_categories', 'collapsed_goals', 'view_mode', 'period_view_limit', 'period_view_frequency',
    'chart_metric', 'marginal_tax_rate_override'];
  function snapshot() {
    const bs = $state.snapshot(plan.balance_sheet) as Record<string, unknown> | undefined;
    const content = bs && typeof bs === 'object' ? Object.fromEntries(Object.entries(bs).filter(([k]) => !VIEW_KEYS.includes(k))) : bs;
    return { accounts: JSON.stringify($state.snapshot(plan.accounts) ?? null), bs: JSON.stringify(content ?? null) };
  }
  let synced = { accounts: '', bs: '' };

  /** Reconcile the balance sheet and the account cards if either changed. */
  export function syncTabs(): void {
    const now = snapshot();
    const accountsEdited = now.accounts !== synced.accounts;
    const sheetEdited = now.bs !== synced.bs;
    if (accountsEdited || sheetEdited) {
      const copy = $state.snapshot(plan) as Plan;
      syncAllTabs(copy, sheetEdited && (active === 'balance-sheet' || !accountsEdited));
      plan.accounts = copy.accounts;
      plan.balance_sheet = copy.balance_sheet;
    }
    synced = snapshot();
  }
  let subnavOpen = $state(false);

  const visibleTabs = $derived(TABS.filter((t) => mode === 'advanced' || !t.advanced));
  const activeTab = $derived(TABS.find((t) => t.id === active) ?? TABS[0]);
  const badges = $derived(tabBadges(plan));
  const duplicates = $derived.by(() => {
    const names = [...duplicateAccountNames(plan.accounts), ...duplicateSheetNames(plan.balance_sheet as Record<string, unknown>)];
    return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  });

  // Simple mode hides the optional tabs; fall back to Accounts if one was open.
  $effect.pre(() => {
    if (mode === 'simple' && activeTab.advanced) active = 'assets';
  });

  function switchTab(id: TabId) {
    syncTabs();
    if (id === 'assets') ensureTaxableAccountForLifeInsurance(plan);
    active = id;
    subnavOpen = false;
    window.scrollTo(0, 0);
  }
</script>

<div class="container main-content mt-4">
  <div class="mb-4 text-center">
    <h1 class="pageheading mb-0">Retirement Planner Data Entry</h1>
  </div>

  <div id="validationAlertContainer" class="mb-3">
    {#if duplicates.length}
      <div id="globalDuplicateNotice" class="alert alert-danger d-flex mb-3 py-2 px-3 align-items-center shadow-sm" role="alert">
        <i class="fa-solid fa-triangle-exclamation me-2 fs-5"></i>
        <div>
          <strong class="notice-title">Duplicate Account Name:</strong>
          <span class="notice-desc ms-1">Multiple accounts cannot have the same name ({duplicates.map((d) => `"${d}"`).join(', ')}). Please give each account a unique name.</span>
        </div>
      </div>
    {/if}
    {#if errors.length}
      <div class="alert alert-danger alert-dismissible fade show text-center mb-3" role="alert">
        <div class="mb-1">
          <i class="fa fa-exclamation-triangle me-2"></i><strong>Simulation Cannot Be Run - Please Correct The Following Errors:</strong>
        </div>
        <ul class="mb-0 text-start d-inline-block">
          {#each errors as err, i (i)}<li>{err}</li>{/each}
        </ul>
        <button type="button" class="btn-close" aria-label="Close" onclick={() => (errors = [])}></button>
      </div>
    {/if}
  </div>

  <form id="enterDataForm" class={[mode === 'simple' && 'planner-simple-mode']} novalidate
    onsubmit={(e) => { e.preventDefault(); syncTabs(); onRun(); }}>
    <ModeToggle {mode} onchange={(m) => { syncTabs(); onModeChange(m); }} />

    <div class="subnav-container mb-4" id="dataEntrySubNav">
      <div class="subnav-mobile-bar d-flex justify-content-between align-items-center">
        <div class="subnav-active-info d-flex align-items-center me-2" style="min-width: 0;">
          <span class="subnav-icon me-2 text-primary flex-shrink-0"><i class="fa-solid fa-layer-group"></i></span>
          <span class="subnav-title-label text-secondary me-1 small flex-shrink-0">Section:</span>
          <span id="currentSubmenuText" class="subnav-active-name fw-bold text-dark text-truncate">{activeTab.name}</span>
        </div>
        <button class="navbar-toggler subnav-toggler flex-shrink-0" type="button" aria-controls="dataEntryTabsCollapse"
          aria-expanded={subnavOpen} aria-label="Toggle submenu navigation" onclick={() => (subnavOpen = !subnavOpen)}>
          <span class="fa fa-bars"></span>
        </button>
      </div>

      <div class={['collapse subnav-collapse', subnavOpen && 'show']} id="dataEntryTabsCollapse">
        <ul class="nav nav-tabs justify-content-center" id="dataEntryTabs" role="tablist">
          {#each visibleTabs as tab (tab.id)}
            {@const badge = badges[tab.id]}
            <li class="nav-item" role="presentation">
              <button class={['nav-link', active === tab.id && 'active']} id="{tab.id}-tab" type="button" role="tab"
                aria-controls={tab.id} aria-selected={active === tab.id} onclick={() => switchTab(tab.id)}>
                <span class="tab-label-main">{tab.label}</span>
                {#if tab.sub}<span class="tab-label-sub">{tab.sub}</span>{/if}
                <span class="tab-summary-badge">
                  {#if badge}
                    <span class={['badge', badge.tone === 'warn' && 'text-warning', badge.tone === 'muted' && 'text-muted']}>
                      {#if badge.tone === 'done'}<i class="fa-solid fa-circle-check text-success"></i>
                      {:else if badge.tone === 'warn'}<i class="fa-solid fa-circle-exclamation"></i>{/if}{badge.text}
                    </span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="tab-content" id="dataEntryTabsContent">
      <div class="tab-pane fade show active" id={active} role="tabpanel" aria-labelledby="{active}-tab">
        {#if active === 'demographics'}
          <DemographicsTab bind:plan onNext={() => switchTab('assets')} />
        {:else if active === 'assets'}
          <AccountsTab bind:plan onSwitch={switchTab} />
        {:else if active === 'spending'}
          <SpendingTab bind:plan onSwitch={switchTab} />
        {:else if active === 'income'}
          <IncomeTab bind:plan {mode} onSwitch={switchTab} />
        {:else if active === 'balance-sheet'}
          <BalanceSheetTab bind:plan onSwitch={switchTab} />
        {:else if active === 'rebalance'}
          <PendingTab title="Rebalance" phase="5d">
            <TabFooter back={{ label: 'Back: Balance Sheet', to: 'balance-sheet' }} run onSwitch={switchTab} />
          </PendingTab>
        {/if}
      </div>
    </div>
  </form>
</div>
