<!-- Tab 6: Portfolio Rebalancing (enter.html #rebalance). Works from the balance
     sheet's latest column; settings live in the plan's rebalancing block. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { TabId } from '../../app/badges';
  import { formatMoney } from '../../app/format';
  import { periodLabel } from '../../plan/bsView';
  import { buildDefaultRebalancing } from '../../plan/defaults';
  import type { Obj } from '../../plan/pyutil';
  import { todayIso } from '../../plan/pyutil';
  import {
    accountAllocation, addAssetClass, applyPreset, assignRemaining, corridor, deleteAssetClass, latestSheetAccounts, nextColor,
    type RebAccount, rebalanceResults, seedRebalancing, selectAccounts, setAllocation, targetPortfolio, targetSum, toggleAccount,
    tolerance, tradePlan,
  } from '../../plan/rebalance';
  import type { Plan, Rebalancing } from '../../plan/types';
  import DecimalInput from '../shared/DecimalInput.svelte';
  import HelpPopover from '../shared/HelpPopover.svelte';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import AddAssetClassModal from './AddAssetClassModal.svelte';
  import RebChart from './RebChart.svelte';
  import TabFooter from './TabFooter.svelte';

  interface Props {
    plan: Plan;
    onSwitch: (to: TabId) => void;
    today?: string;
  }
  let { plan = $bindable(), onSwitch, today = todayIso() }: Props = $props();

  const reb = $derived((plan.rebalancing ?? buildDefaultRebalancing()) as Rebalancing);
  const sheet = $derived(latestSheetAccounts(plan.balance_sheet as Obj, today));
  const accounts = $derived(sheet.accounts);
  const portfolio = $derived(targetPortfolio(reb, accounts));
  const tol = $derived(tolerance(reb));
  const sum = $derived(targetSum(reb));
  const results = $derived(rebalanceResults(reb, accounts));
  const plan4 = $derived(tradePlan(results.classes, reb.rebalance_mode));
  const included = $derived(new Set(reb.included_account_ids ?? []));
  let addOpen = $state(false);

  // Opening the tool fills in a default selection and allocations, as the page did.
  onMount(() => {
    plan.rebalancing ??= buildDefaultRebalancing();
    const draft = $state.snapshot(plan.rebalancing) as Rebalancing;
    if (seedRebalancing(draft, accounts)) plan.rebalancing = draft;
  });

  const money = (v: number) => formatMoney(v, true);
  const BADGE: Record<string, string> = { pretax: 'bg-primary', roth: 'bg-success', taxable: 'bg-info text-dark', hsa: 'bg-warning text-dark' };
  const badge = (a: RebAccount) => BADGE[a.category] ?? 'bg-secondary';
  const sortOrder: Record<string, number> = { pretax: 1, roth: 2, hsa: 3, taxable: 4, emergency: 5, goals: 6, daily: 7 };
  const hasTaxable = $derived(results.included.some((a) => a.category === 'taxable'));

  function refresh() {
    seedRebalancing(reb, accounts, true);
  }
</script>

<div class="card p-4 mb-4 shadow-sm">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
    <div>
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1"><i class="fa-solid fa-scale-balanced me-1"></i> Portfolio Tool</span>
        <h3 class="mb-0 text-primary fw-bold">Portfolio Rebalancing</h3>
      </div>
      <p class="text-secondary small mb-0">
        Compare your actual portfolio investments against your target asset allocation. Based on balances from your latest balance sheet date:
        <strong id="rebLatestPeriodDate" class="text-dark">{sheet.latestPeriod ? periodLabel(sheet.latestPeriod) : 'Current'}</strong>.
      </p>
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button type="button" class="btn btn-outline-secondary btn-sm" id="rebRefresh" title="Reload accounts and balances from the latest balance sheet column" onclick={refresh}>
        <i class="fa-solid fa-arrows-rotate me-1"></i> Refresh from Balance Sheet
      </button>
    </div>
  </div>

  <div class="row g-3">
    <div class="col-6 col-md-3">
      <div class="reb-kpi-card p-3 rounded-3 border bg-light h-100">
        <div class="small text-secondary fw-semibold text-uppercase" style="font-size: 0.72rem; letter-spacing: 0.5px;">Portfolio for Rebalancing</div>
        <div class="fs-4 fw-bold text-dark mt-1" id="rebKpiTotalVal">{money(portfolio.selected)}</div>
        <div class="small text-muted" id="rebKpiAccSummary">{results.included.length} of {accounts.length} accounts included</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="reb-kpi-card p-3 rounded-3 border bg-light h-100">
        <div class="small text-secondary fw-semibold text-uppercase" style="font-size: 0.72rem; letter-spacing: 0.5px;">Rebalancing Status</div>
        <div class="mt-1" id="rebKpiStatusBadge">
          {#if results.outOfRange === 0}
            <span class="badge bg-success-subtle text-success border border-success-subtle fs-6 py-1 px-2"><i class="fa fa-check-circle me-1"></i> Balanced</span>
          {:else}
            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fs-6 py-1 px-2"><i class="fa fa-triangle-exclamation me-1"></i> Rebalance Needed</span>
          {/if}
        </div>
        <div class="small text-muted mt-1" id="rebKpiDriftSummary">
          {results.outOfRange ? `${results.outOfRange} of ${results.classes.length} classes out of range` : 'All classes in range'}
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="reb-kpi-card p-3 rounded-3 border bg-light h-100">
        <div class="small text-secondary fw-semibold text-uppercase" style="font-size: 0.72rem; letter-spacing: 0.5px;">Relative Tolerance Band</div>
        <div class="fs-4 fw-bold text-primary mt-1" id="rebKpiTolerance">±{tol.toFixed(1)}%</div>
        <div class="small text-muted">Rebalance corridor</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="reb-kpi-card p-3 rounded-3 border bg-light h-100">
        <div class="small text-secondary fw-semibold text-uppercase" style="font-size: 0.72rem; letter-spacing: 0.5px;">Trading Strategy Mode</div>
        <div class="fs-5 fw-bold text-dark mt-1" id="rebKpiMode">{reb.rebalance_mode === 'minimal' ? 'Minimal Trading' : 'Return to Target'}</div>
        <div class="small text-muted">{reb.rebalance_mode === 'minimal' ? 'Return to Corridor Boundary' : '100% Target Alignment'}</div>
      </div>
    </div>
  </div>
</div>

{#snippet step(n: number, title: string, text: string)}
  <div>
    <h4 class="mb-1 text-dark fw-bold">
      <span class="badge bg-primary rounded-circle me-2" style="font-size: 0.85rem; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;">{n}</span>
      {title}
    </h4>
    <p class="text-secondary small mb-0">{text}</p>
  </div>
{/snippet}

<!-- Step 1 -->
<div class="card p-4 mb-4 shadow-sm border">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    {@render step(1, 'Choose Accounts to Include in Rebalancing', 'Select which balance sheet accounts to include in your rebalancing plan. Debts and real estate equity are excluded automatically.')}
    <div class="btn-group btn-group-sm" role="group">
      <button type="button" class="btn btn-outline-primary" onclick={() => selectAccounts(reb, accounts, 'investment')}>Investment Only</button>
      <button type="button" class="btn btn-outline-primary" onclick={() => selectAccounts(reb, accounts, 'all')}>Select All</button>
      <button type="button" class="btn btn-outline-secondary" onclick={() => selectAccounts(reb, accounts, 'none')}>Deselect All</button>
    </div>
  </div>
  <div class="table-responsive mb-2">
    <table class="table table-hover align-middle mb-0" id="rebAccountsTable">
      <thead class="table-light">
        <tr>
          <th style="width: 48px;" class="text-center">Include?</th>
          <th>Account Name</th>
          <th>Account Type</th>
          <th>Institution / Notes</th>
          <th class="text-end">Balance (Latest Snapshot)</th>
        </tr>
      </thead>
      <tbody id="rebAccountsTableBody">
        {#each accounts as acc (acc.id)}
          <tr class={included.has(acc.id) ? 'table-active-subtle' : 'opacity-75'}>
            <td class="text-center">
              <input type="checkbox" class="form-check-input reb-include" style="cursor: pointer;" aria-label="Include {acc.name}"
                checked={included.has(acc.id)} onchange={(e) => toggleAccount(reb, acc.id, (e.currentTarget as HTMLInputElement).checked)} />
            </td>
            <td><strong class="text-dark">{acc.name || 'Account'}</strong></td>
            <td><span class={['badge', badge(acc)]}>{acc.category_title}</span></td>
            <td class="text-secondary small">{acc.institution || '—'}</td>
            <td class="text-end fw-semibold">{money(acc.balance)}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="text-center text-muted py-3">No accounts found in the latest balance sheet column. Please add accounts on the Balance Sheet tab.</td></tr>
        {/each}
      </tbody>
      <tfoot class="table-group-divider fw-bold">
        <tr class="table-light">
          <td colspan="4" class="text-end">Total Capital Selected for Rebalancing:</td>
          <td class="text-end text-primary fs-5" id="rebAccountsTableTotal">{money(portfolio.selected)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<!-- Step 2 -->
<div class="card p-4 mb-4 shadow-sm border">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    {@render step(2, 'Set Your Target Asset Allocation & Tolerance', 'Customize your desired asset classes and specify your rebalancing tolerance band.')}
    <button type="button" class="btn btn-primary btn-sm" id="rebAddClass" onclick={() => (addOpen = true)}><i class="fa fa-plus me-1"></i> Add Custom Asset Class</button>
  </div>

  <div class="p-3 mb-4 rounded bg-light border">
    <div class="row g-3 align-items-center">
      <div class="col-md-4">
        <label for="rebToleranceInput" class="form-label fw-semibold small mb-1">
          Relative Tolerance Band %
          <HelpPopover title="Relative Tolerance Band" content="A rebalancing trade is suggested when an asset class deviates from its target by more than this percentage of its target. For example, with a 10% tolerance, an asset class with a 30% target allows an actual share between 27.0% and 33.0% (30% ± 3%)." />
        </label>
        <div class="input-group input-group-sm">
          <span class="input-group-text">±</span>
          <input type="number" class="form-control text-center fw-bold" id="rebToleranceInput" min="1" max="100" step="0.5" value={reb.tolerance_percent}
            oninput={(e) => { const n = parseFloat((e.currentTarget as HTMLInputElement).value); if (!Number.isNaN(n) && n > 0) reb.tolerance_percent = n; }} />
          <span class="input-group-text">%</span>
        </div>
      </div>
      <div class="col-md-4">
        <label for="rebModeSelect" class="form-label fw-semibold small mb-1">
          Rebalance Strategy Mode
          <HelpPopover title="Rebalance Strategy Mode" html content="<b>Return to Target:</b> Trades are calculated to bring every asset class back to its exact 100% target percentage.<br><br><b>Return to Boundary:</b> Trades only the minimum necessary to pull out-of-range asset classes just back within acceptable tolerance bounds." />
        </label>
        <select class="form-select form-select-sm" id="rebModeSelect"
          bind:value={() => (reb.rebalance_mode === 'minimal' ? 'minimal' : 'target'), (v) => (reb.rebalance_mode = v)}>
          <option value="target">Full Rebalance (Return to 100% Target)</option>
          <option value="minimal">Minimal-Trade (Return to Boundary)</option>
        </select>
      </div>
      <div class="col-md-4">
        <label for="rebCashFlowInput" class="form-label fw-semibold small mb-1">
          Smart Cash Flow Adjustment (Optional)
          <HelpPopover title="Cash Flow Rebalancing" content="Enter an amount of new cash to deposit (+) or withdraw (-). The tool will prioritize deploying new cash to underweight asset classes first, helping you rebalance without selling existing assets." />
        </label>
        <div class="input-group input-group-sm">
          <span class="input-group-text">$</span>
          <MoneyInput id="rebCashFlowInput" class="form-control currency-input text-end" dollarSign
            bind:value={() => Number(reb.cash_flow) || 0, (v) => (reb.cash_flow = v ?? 0)} />
        </div>
      </div>
    </div>
  </div>

  <div class="table-responsive mb-3">
    <table class="table align-middle mb-0" id="rebAssetClassesTable">
      <thead class="table-light">
        <tr>
          <th style="width: 32px;"></th>
          <th>Asset Class Name</th>
          <th style="width: 160px;" class="text-end">Target %</th>
          <th style="width: 180px;" class="text-end">Target Amount ($)</th>
          <th style="width: 220px;" class="text-center">Allowed Corridor (Tolerance)</th>
          <th style="width: 80px;" class="text-center">Action</th>
        </tr>
      </thead>
      <tbody id="rebAssetClassesTableBody">
        {#each reb.asset_classes ?? [] as ac (ac.id)}
          {@const c = corridor(parseFloat(String(ac.target_percent)) || 0, tol, portfolio.target)}
          <tr class="reb-class-row">
            <td class="text-center"><span class="reb-color-dot" style="background-color: {ac.color || '#3b82f6'};"></span></td>
            <td>
              <input type="text" class="form-control form-control-sm fw-semibold" aria-label="Asset class name" value={ac.name}
                onchange={(e) => (ac.name = (e.currentTarget as HTMLInputElement).value.trim() || 'Asset Class')} />
            </td>
            <td class="text-end">
              <div class="input-group input-group-sm justify-content-end" style="max-width: 130px; margin-left: auto;">
                <DecimalInput id="rebTargetInput_{ac.id}" class="form-control text-end fw-bold reb-pct-input" label="Target %"
                  bind:value={() => parseFloat(String(ac.target_percent)) || 0, (v) => (ac.target_percent = v)} />
                <span class="input-group-text px-2 bg-white text-muted small fw-semibold">%</span>
              </div>
            </td>
            <td class="text-end fw-semibold text-primary">{money(c.targetDol)}</td>
            <td class="text-center">
              <span class="badge bg-light text-dark border px-2 py-1 small">{c.minPct.toFixed(1)}% – {c.maxPct.toFixed(1)}%
                <span class="text-secondary fw-normal">({money(c.minDol)} – {money(c.maxDol)})</span></span>
            </td>
            <td class="text-center">
              {#if (reb.asset_classes ?? []).length > 1}
                <button type="button" class="btn btn-link text-danger p-0 text-decoration-none reb-delete-class" title="Delete asset class" aria-label="Delete asset class"
                  onclick={() => deleteAssetClass(reb, ac.id)}><i class="fa fa-trash-can"></i></button>
              {:else}
                <span class="text-muted small">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="p-3 rounded bg-light border d-flex flex-wrap align-items-center justify-content-between gap-3">
    <div class="d-flex align-items-center gap-2 flex-grow-1" style="max-width: 600px;">
      <span class="small fw-bold text-secondary text-nowrap">Total Target Allocation:</span>
      <div class="progress flex-grow-1" style="height: 14px;">
        <div class={['progress-bar', sum.state === 'balanced' ? 'bg-success' : sum.state === 'under' ? 'bg-warning' : 'bg-danger']} role="progressbar"
          style="width: {Math.min(100, Math.max(0, sum.total))}%;"></div>
      </div>
    </div>
    <div id="rebTargetValidationBadge">
      {#if sum.state === 'balanced'}
        <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fs-6"><i class="fa fa-check-circle me-1"></i> Total: 100.0% (Balanced)</span>
      {:else if sum.state === 'under'}
        <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3 py-2 fs-6"><i class="fa fa-triangle-exclamation me-1"></i> Total: {sum.total.toFixed(1)}% (Remaining: {(100 - sum.total).toFixed(1)}%)</span>
      {:else}
        <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 fs-6"><i class="fa fa-circle-xmark me-1"></i> Total: {sum.total.toFixed(1)}% (Over by {(sum.total - 100).toFixed(1)}%)</span>
      {/if}
    </div>
  </div>
</div>

<!-- Step 3 -->
<div class="card p-4 mb-4 shadow-sm border">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    {@render step(3, 'Enter What You Currently Own in Each Included Account', 'Specify how the balance of each account is divided across your asset classes. For single-fund accounts, use the convenient 1-click preset.')}
  </div>
  <div id="rebAccountBreakdownsContainer">
    {#each results.included as acc (acc.id)}
      {@const a = accountAllocation(reb, acc)}
      <div class={['reb-acc-card p-3 mb-3', a.complete ? 'is-complete' : 'is-incomplete']} data-account-id={acc.id}>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <h5 class="mb-0 fw-bold text-dark">{acc.name || 'Account'}</h5>
            <span class={['badge', badge(acc)]}>{acc.category_title}</span>
            {#if acc.institution}<span class="small text-secondary fw-semibold">({acc.institution})</span>{/if}
          </div>
          <div class="d-flex flex-wrap align-items-center gap-3">
            <div class="text-end">
              <div class="small text-secondary fw-semibold">Total Account Balance</div>
              <div class="fw-bold text-dark fs-5">{money(acc.balance)}</div>
            </div>
            <div style="min-width: 220px;">
              <select class="form-select form-select-sm reb-preset" aria-label="Single asset preset" value={a.sole}
                onchange={(e) => applyPreset(reb, acc.id, (e.currentTarget as HTMLSelectElement).value)}>
                <option value="">⚡ 1-Click Single Asset Preset...</option>
                {#each reb.asset_classes ?? [] as ac (ac.id)}<option value={ac.id}>100% {ac.name}</option>{/each}
              </select>
            </div>
          </div>
        </div>
        <div class="row g-2 align-items-center mb-2">
          {#each a.rows as r (r.cls.id)}
            <div class="col-12 col-md-6 col-lg-4">
              <div class="p-2 rounded bg-light border d-flex align-items-center justify-content-between gap-2">
                <div class="d-flex align-items-center gap-2 text-truncate me-1">
                  <span class="reb-color-dot" style="background-color: {r.cls.color || '#3b82f6'};"></span>
                  <span class="small fw-semibold text-truncate" title={r.cls.name}>{r.cls.name}</span>
                </div>
                <div class="input-group input-group-sm" style="width: 115px;">
                  <DecimalInput class="form-control form-control-sm text-end fw-bold reb-pct-input reb-alloc-input" label="{r.cls.name} %"
                    bind:value={() => r.pct, (v) => setAllocation(reb, acc.id, r.cls.id, v)} />
                  <span class="input-group-text px-2 bg-white text-muted small fw-semibold">%</span>
                </div>
              </div>
              <div class="text-end text-muted small pe-1 mt-1" style="font-size: 0.75rem;">{money(r.dollars)}</div>
            </div>
          {/each}
        </div>
        <div class="d-flex flex-wrap justify-content-between align-items-center pt-2 border-top small reb-card-footer">
          {#if a.complete}
            <div class="text-success fw-bold"><i class="fa fa-check-circle me-1"></i> Allocated: {money(a.allocated)} of {money(acc.balance)} (100.0%)</div>
          {:else if a.total < 100}
            <div class="text-warning fw-bold"><i class="fa fa-triangle-exclamation me-1"></i> Allocated: {money(a.allocated)} of {money(acc.balance)} ({a.total.toFixed(1)}%) — <span class="text-secondary">Remaining: {a.remaining.toFixed(1)}%</span></div>
            <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2 reb-assign-remaining" onclick={() => assignRemaining(reb, acc.id, a.remaining)}>
              Assign Remaining {a.remaining.toFixed(1)}% to {reb.asset_classes?.[0]?.name ?? 'First Class'}</button>
          {:else}
            <div class="text-danger fw-bold"><i class="fa fa-circle-xmark me-1"></i> Allocated: {money(a.allocated)} of {money(acc.balance)} ({a.total.toFixed(1)}%) — <span class="text-danger">Exceeds 100% by {(a.total - 100).toFixed(1)}%</span></div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="alert alert-info text-center py-4"><i class="fa fa-info-circle me-2 fs-5"></i>No accounts are currently selected for rebalancing. Please select at least one account in Step 1 above.</div>
    {/each}
  </div>
</div>

<!-- Step 4 -->
<div class="card p-4 mb-4 shadow-sm border" id="rebResultsSection">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    {@render step(4, 'Rebalancing Diagnosis & Recommended Actions', 'Review your portfolio drift, comparison charts, and plain-English trading recommendations.')}
  </div>

  {#if results.outOfRange === 0}
    <div id="rebDiagnosisAlert" class="alert alert-success d-flex align-items-center mb-4 shadow-sm" role="alert">
      <i class="fa-solid fa-circle-check fs-3 me-3 text-success"></i>
      <div>
        <h5 class="alert-heading fw-bold mb-1">Your Portfolio is in Balance!</h5>
        <p class="mb-0 small">All asset classes are currently within your acceptable ±{tol.toFixed(1)}% tolerance corridor. No rebalancing trades are necessary at this time.</p>
      </div>
    </div>
  {:else}
    <div id="rebDiagnosisAlert" class="alert alert-warning d-flex align-items-center mb-4 shadow-sm" role="alert">
      <i class="fa-solid fa-triangle-exclamation fs-3 me-3 text-warning"></i>
      <div>
        <h5 class="alert-heading fw-bold mb-1">Rebalancing Recommended</h5>
        <p class="mb-0 small">{results.outOfRange} of your {results.classes.length} asset classes have drifted outside your ±{tol.toFixed(1)}% acceptable tolerance band. Review the recommended trade checklist below to bring your portfolio back into alignment.</p>
      </div>
    </div>
  {/if}

  <div class="card bg-light border-0 p-3 mb-4 rounded-3">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="fw-bold text-dark mb-0"><i class="fa-solid fa-chart-column me-2 text-primary"></i>Actual Allocation vs. Target Allocation</h6>
      <span class="small text-muted">Dashed lines indicate allowed tolerance corridor</span>
    </div>
    <RebChart classes={results.classes} />
  </div>

  <div class="table-responsive mb-4">
    <table class="table table-hover align-middle mb-0" id="rebDriftTable">
      <thead class="table-light">
        <tr>
          <th>Asset Class</th>
          <th class="text-end">Current Amount ($)</th>
          <th class="text-end">Current %</th>
          <th class="text-end">Target %</th>
          <th class="text-center">Allowed Corridor</th>
          <th class="text-end">Drift ($ / %)</th>
          <th class="text-center">Status</th>
        </tr>
      </thead>
      <tbody id="rebDriftTableBody">
        {#each results.classes as r (r.classId)}
          {@const sign = r.driftDol > 0 ? '+' : ''}
          <tr>
            <td><div class="d-flex align-items-center gap-2"><span class="reb-color-dot" style="background-color: {r.color};"></span><strong class="text-dark">{r.name}</strong></div></td>
            <td class="text-end fw-semibold">{money(r.actualDol)}</td>
            <td class="text-end fw-bold">{r.actualPct.toFixed(1)}%</td>
            <td class="text-end text-secondary">{r.targetPct.toFixed(1)}% <span class="small">({money(r.targetDol)})</span></td>
            <td class="text-center small"><span class="badge bg-light text-dark border">{r.minPct.toFixed(1)}% – {r.maxPct.toFixed(1)}%</span></td>
            <td class={['text-end', r.driftDol > 0 ? 'text-danger fw-semibold' : r.driftDol < 0 ? 'text-primary fw-semibold' : 'text-muted']}>
              {sign}{money(r.driftDol)} <span class="small">({sign}{r.driftPct.toFixed(1)}%)</span></td>
            <td class="text-center">
              {#if r.status === 'in_range'}<span class="badge bg-success-subtle text-success border border-success-subtle">Within Tolerance</span>
              {:else if r.status === 'over'}<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Overweight (Sell)</span>
              {:else}<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">Underweight (Buy)</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="card border rounded-3 p-3 bg-light mb-2">
    <h5 class="fw-bold text-dark mb-3"><i class="fa-solid fa-list-check me-2 text-primary"></i>Step-by-Step Action Plan (Recommended Trades)</h5>
    <div id="rebActionPlanContainer">
      {#if results.outOfRange === 0}
        <div class="alert alert-success d-flex align-items-center mb-0"><i class="fa fa-check-circle fs-4 me-3"></i><div><strong>No trades needed!</strong> Your portfolio is currently within your acceptable tolerance corridor. Keep up the good work!</div></div>
      {:else}
        <div class="alert alert-light border d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div>
            <div class="fw-bold text-dark">Trading Strategy: {reb.rebalance_mode === 'minimal' ? 'Minimal-Trade (Return to Boundary)' : 'Full Rebalance (Return to 100% Target)'}</div>
            <div class="small text-secondary">Execute the suggested trades below to bring your asset classes into alignment.</div>
          </div>
        </div>
        <div class="row g-3 mb-3">
          {#each [{ list: plan4.sells, title: 'Assets to Sell (Overweight)', tone: 'danger', icon: 'fa-circle-arrow-down', none: 'No sales required.', id: 'rebSells' },
                  { list: plan4.buys, title: 'Assets to Buy (Underweight)', tone: 'success', icon: 'fa-circle-arrow-up', none: 'No purchases required.', id: 'rebBuys' }] as side (side.id)}
            <div class="col-md-6">
              <div class="card p-3 border-{side.tone}-subtle bg-{side.tone}-subtle bg-opacity-10 h-100" id={side.id}>
                <h6 class="fw-bold text-{side.tone} mb-2"><i class="fa-solid {side.icon} me-1"></i> {side.title}</h6>
                {#each side.list as t (t.classId)}
                  <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-{side.tone}-subtle">
                    <div class="d-flex align-items-center gap-2"><span class="reb-color-dot" style="background-color: {t.color};"></span><span class="fw-bold text-dark">{t.name}</span></div>
                    <span class="badge bg-{side.tone} fs-6">{money(t.amount)}</span>
                  </div>
                {:else}
                  <div class="small text-muted">{side.none}</div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        {#if hasTaxable}
          <div class="alert alert-info py-2 px-3 small mb-2">
            <i class="fa-solid fa-lightbulb text-warning me-1"></i> <strong>Tax Efficiency Tip:</strong> When possible, execute your <strong>SELL</strong> orders inside tax-deferred (401k/Traditional IRA) or tax-free (Roth IRA) accounts first. Selling in taxable brokerage accounts can generate taxable capital gains.
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<TabFooter back={{ label: 'Back: Balance Sheet', to: 'balance-sheet' }} run {onSwitch} />

<AddAssetClassModal bind:open={addOpen} color={nextColor(reb)} onAdd={(n, t, c) => addAssetClass(reb, n, t, c)} />
