<!-- The balance-sheet spreadsheet (enter.js renderBalanceSheetTable): one column per
     visible date, collapsible sections, subtotals, goal targets and net-worth rows. -->
<script lang="ts">
  import { formatMoney } from '../../app/format';
  import {
    addCategoryAccount, addGoalAccount, addMortgage, calcDelta, categoryAccounts, categoryTitle, type CpiSeries, type Delta,
    effectiveTarget, emergencyStatus, emergencyTargetBase, goalGroups, goalGroupStatus, type GoalStatus, isCollapsed,
    isGoalCollapsed, periodLabel, periodTotals, properties, debts as debtList, toggleCategory, toggleGoalGroup,
  } from '../../plan/bsView';
  import type { Obj } from '../../plan/pyutil';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import type { CpiTarget } from './TargetCpiModal.svelte';

  interface Props {
    bs: Obj;
    periods: string[];
    taxRate: number;
    autoRate: number;
    hasOverride: boolean;
    cpi: CpiSeries;
    duplicateKeys: Set<string>;
    onRemovePeriod: (p: string) => void;
    onShowGoal: (s: GoalStatus) => void;
    onEditTarget: (t: CpiTarget) => void;
    onOverrideRate: (v: number | null) => void;
    /** These ask for a name first (the page's prompt() dialogs). */
    onAddGoal: () => void;
    onAddProperty: () => void;
    onAddDebt: () => void;
  }
  let {
    bs = $bindable(), periods, taxRate, autoRate, hasOverride, cpi, duplicateKeys, onRemovePeriod, onShowGoal, onEditTarget,
    onOverrideRate, onAddGoal, onAddProperty, onAddDebt,
  }: Props = $props();

  const span = $derived(periods.length + 5);
  const curr = $derived(periods[periods.length - 1]);
  const totals = $derived(periods.map((p) => periodTotals(bs, p, taxRate)));
  const last = $derived(totals[totals.length - 1]);
  const before = $derived(totals.length > 1 ? totals[totals.length - 2] : last);

  const money = (v: number) => formatMoney(v, true);
  const val = (o: Obj, key: string, p: string) => (o[key] && o[key][p] !== undefined ? o[key][p] : 0);
  const setVal = (o: Obj, key: string, p: string, v: number) => ((o[key] ??= {})[p] = v);
  const isDup = (name: unknown) => duplicateKeys.has(String(name ?? '').trim().toLowerCase());

  const SUBTOTAL_LABELS: Record<string, string> = {
    pretax: 'Subtotal Pretax Retirement Accounts', roth: 'Total Roth', taxable: 'Total Taxable', hsa: 'Total HSA',
    daily: 'Total Spending Accounts',
  };

  // The tax-rate box shows the effective rate, editable to override it.
  let rateFocused = $state(false);
  let rateText = $state('');
  $effect.pre(() => {
    const shown = taxRate.toFixed(1);
    if (!rateFocused) rateText = shown;
  });
  function onRateInput(e: Event) {
    rateText = (e.currentTarget as HTMLInputElement).value;
    const raw = rateText.trim();
    if (raw === '') return onOverrideRate(null);
    const v = parseFloat(raw);
    if (!Number.isNaN(v) && v >= 0 && v <= 100) onOverrideRate(v);
  }

  const emgStatus = $derived(emergencyStatus(bs, cpi, curr));
  const emgAccounts = $derived(categoryAccounts(bs, 'emergency'));
  const groups = $derived(goalGroups(bs));
  const propertyList = $derived(properties(bs));
  const debtRows = $derived(debtList(bs));

  function editEmergencyTarget() {
    const emg = (bs.categories.emergency ??= { title: 'Emergency Fund Accounts', target_amount: 0.0, accounts: [] });
    onEditTarget({
      title: 'Emergency Fund Target — CPI-U Inflation',
      target: emergencyTargetBase(bs),
      autoInflate: !!emg.target_auto_inflate,
      baseDate: emg.target_base_date || bs.current_period || curr,
      save: (target, auto, date) => {
        Object.assign(emg, { target_amount: target, target_auto_inflate: auto, target_base_date: date });
        bs.emergency_goal_amount = target;
      },
    });
  }

  function editGoalTarget(g: Obj) {
    onEditTarget({
      title: `${g.name || 'Goal'} Target — CPI-U Inflation`,
      target: parseFloat(g.target_amount || 0.0),
      autoInflate: !!g.target_auto_inflate,
      baseDate: g.target_base_date || bs.current_period || curr,
      save: (target, auto, date) => Object.assign(g, { target_amount: target, target_auto_inflate: auto, target_base_date: date }),
    });
  }

  const confirmed = (msg: string) => typeof window === 'undefined' || window.confirm(msg);
  const stop = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
</script>

{#snippet delta(d: Delta, debt = false)}
  {#if d.diff === 0}
    <span class="bs-delta-text bs-delta-text-zero">—</span>
  {:else}
    {@const good = debt ? d.diff < 0 : d.diff > 0}
    <span class={['bs-delta-text', good ? 'bs-delta-text-pos' : 'bs-delta-text-neg']}>{d.diff > 0 ? '+' : '-'}{money(Math.abs(d.diff))}
      <small class="text-muted">({d.pct > 0 ? '+' : ''}{d.pct.toFixed(1)}%)</small></span>
  {/if}
{/snippet}

{#snippet spacer()}
  <tr class="bs-category-spacer" aria-hidden="true"><td colspan={span}></td></tr>
{/snippet}

{#snippet sectionHeader(key: string, label: string, count: string, addLabel: string, addClass: string, onAdd: () => void)}
  <tr class={['bs-category-header clickable', isCollapsed(bs, key) && 'collapsed']} data-section={key} onclick={() => toggleCategory(bs, key)}>
    <td colspan={span}>
      <div class="d-flex justify-content-between align-items-center">
        <span><i class="fa fa-chevron-down bs-chevron-icon"></i>{label}<span class="bs-count-badge">{count}</span></span>
        <button type="button" class={['btn btn-sm py-0 px-2', addClass]} onclick={stop(onAdd)}><i class="fa fa-plus me-1"></i>{addLabel}</button>
      </div>
    </td>
  </tr>
{/snippet}

{#snippet accountRow(acc: Obj, list: Obj[], i: number, indent: string, namePlaceholder: string, instPlaceholder: string)}
  <tr class="bs-account-row">
    <td class={['bs-sticky-col', indent]}>
      <input type="text" class={['form-control form-control-sm bs-seamless-input bs-acc-name-input', isDup(acc.name) && 'is-invalid border border-danger bg-danger-subtle text-danger']}
        title={isDup(acc.name) ? `Account name "${String(acc.name).trim()}" is used by multiple accounts. Each account must have a unique name.` : undefined}
        aria-label="Account name" placeholder={namePlaceholder} bind:value={() => acc.name ?? '', (v) => (acc.name = v)} />
    </td>
    <td class="bs-inst-col">
      <input type="text" class="form-control form-control-sm bs-seamless-input text-secondary" aria-label="Institution" placeholder={instPlaceholder}
        bind:value={() => acc.institution ?? '', (v) => (acc.institution = v)} />
    </td>
    {#each periods as p (p)}
      <td class="text-end">
        <MoneyInput class="form-control form-control-sm bs-input-val bs-seamless-input currency-input text-end" dollarSign
          bind:value={() => val(acc, 'values', p), (v) => setVal(acc, 'values', p, v ?? 0)} />
      </td>
    {/each}
    <td class="text-center"></td>
    <td class="text-center">
      <input type="checkbox" class="form-check-input bs-retire-check" aria-label="For retirement"
        bind:checked={() => !!acc.include_in_retirement, (v) => (acc.include_in_retirement = v)} />
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm p-1 bs-remove" title="Delete account" aria-label="Delete account" onclick={() => list.splice(i, 1)}>
        <i class="fa fa-trash-can"></i></button>
    </td>
  </tr>
{/snippet}

{#snippet subtotalRow(id: string, label: string, values: number[], cls = 'text-dark', labelCls = '', note = '', paren = false)}
  <tr class="bs-subtotal-row" {id}>
    <td class={['bs-sticky-col fw-bold ps-3', labelCls]}>{label}</td>
    <td class="small text-muted">{note}</td>
    {#each values as v, i (i)}<td class={['text-end fw-bold', cls]}>{paren ? `(${money(v)})` : money(v)}</td>{/each}
    <td class="text-center"></td>
    <td colspan="2"></td>
  </tr>
{/snippet}

{#snippet goalBadge(s: GoalStatus)}
  {#if s.shortage > 0}
    <button type="button" class="bs-shortage-btn shadow-sm" onclick={stop(() => onShowGoal(s))}>
      <i class="fa fa-triangle-exclamation me-1"></i>Remaining to reach goal: {money(s.shortage)}</button>
  {:else if s.target > 0}
    <button type="button" class="bs-shortage-btn shadow-sm bg-success-subtle text-success border border-success-subtle" onclick={stop(() => onShowGoal(s))}>
      <i class="fa fa-circle-check me-1"></i>Goal Reached!{s.surplus > 0 ? ` (Surplus: ${money(s.surplus)})` : ''}</button>
  {/if}
{/snippet}

{#snippet cpiBadge(c: ReturnType<typeof effectiveTarget>, onClick: () => void)}
  {#if c.autoInflate}
    {@const pct = `${c.inflationPct >= 0 ? '+' : ''}${c.inflationPct}%`}
    <button type="button" class="badge bg-primary-subtle text-primary border border-primary-subtle clickable py-1 px-2"
      title="Base Target {money(c.baseTarget)} (Ref Month: {c.baseMonth}) adjusted by {pct} CPI-U to {c.evalMonth}" onclick={stop(onClick)}>
      <i class="fa-solid fa-arrow-trend-up me-1"></i>CPI: {money(c.effectiveTarget)} ({pct})</button>
  {/if}
{/snippet}

{#snippet category(key: string, addLabel: string)}
  {@const accounts = categoryAccounts(bs, key)}
  {@render sectionHeader(key, categoryTitle(bs, key), `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`, addLabel,
    'btn-outline-primary', () => addCategoryAccount(bs, key))}
  {#if !isCollapsed(bs, key)}
    {#each accounts as acc, i (acc)}
      {@render accountRow(acc, accounts, i, 'ps-4', 'Account Name', 'Inst / Notes')}
    {:else}
      <tr><td colspan={span} class="text-muted small ps-4 py-2">No accounts in this category. Click "+ {addLabel}" to add one.</td></tr>
    {/each}
  {/if}
  {@render subtotalRow(`subtotal_row_${key}`, SUBTOTAL_LABELS[key] ?? `Subtotal ${categoryTitle(bs, key)}`, totals.map((t) => t.byCategory[key]))}
  {#if key === 'pretax'}
    <tr class="bs-deferred-tax-row" id="deferred_tax_row">
      <td class="bs-sticky-col ps-4 small">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-1">
          <span>Est Deferred Income Tax</span>
          <div class="d-inline-flex align-items-center" title="Combined Federal + State marginal tax rate. Edit to override, or clear to reset to automatic calculation.">
            <span class="text-muted small me-1">(</span>
            <input type="number" step="0.1" min="0" max="99.9" class={['form-control form-control-sm text-end px-1 py-0 fw-bold bs-tax-override-input', hasOverride && 'is-overridden']}
              id="bsTaxRateOverrideInput" aria-label="Marginal tax rate" value={rateText}
              onfocus={() => (rateFocused = true)} onblur={() => (rateFocused = false)} oninput={onRateInput}
              onchange={(e) => (e.currentTarget as HTMLInputElement).value.trim() === '' && onOverrideRate(null)} />
            <span class="text-muted small ms-1">%)</span>
            {#if hasOverride}
              <button type="button" class="btn btn-link btn-sm text-secondary p-0 ms-1 bs-tax-reset-btn" id="bsTaxRateResetBtn" style="text-decoration: none;"
                title="Reset to auto-calculated rate ({autoRate.toFixed(1)}%)" aria-label="Reset tax rate" onclick={() => onOverrideRate(null)}>
                <i class="fa-solid fa-arrow-rotate-left"></i></button>
            {/if}
          </div>
        </div>
      </td>
      <td class="bs-inst-col small text-muted">Fed + State</td>
      {#each totals as t, i (i)}<td class="text-end text-danger small">({money(t.deferredTax)})</td>{/each}
      <td class="text-center"></td>
      <td colspan="2"></td>
    </tr>
    <tr class="bs-subtotal-row bg-white" id="net_pretax_row">
      <td class="bs-sticky-col ps-4 fw-bold text-success small">Total Pretax, Net of Deferred Income Tax</td>
      <td class="small text-muted">Purchasing power</td>
      {#each totals as t, i (i)}<td class="text-end fw-bold text-success">{money(t.netPretax)}</td>{/each}
      <td class="text-center"></td>
      <td colspan="2"></td>
    </tr>
  {/if}
{/snippet}

{#snippet netRow(id: string, label: string, note: string, values: number[], d: Delta, cls: string)}
  <tr class={['fw-bold', cls]} {id} style="font-size: 0.95rem;">
    <td class="bs-sticky-col ps-3 text-primary">{label}</td>
    <td class="small text-muted">{note}</td>
    {#each values as v, i (i)}<td class="text-end text-primary fw-bold">{money(v)}</td>{/each}
    <td class="text-center">{@render delta(d)}</td>
    <td colspan="2"></td>
  </tr>
{/snippet}

<table class="bs-table align-middle" id="balanceSheetTable">
  <thead id="bsTableHead">
    <tr>
      <th class="bs-sticky-col">Account / Category Name</th>
      <th class="bs-inst-col text-center">Institution / Notes</th>
      {#each periods as p, i (p)}
        <th class="text-end" style="min-width: 104px;">
          <div>{periodLabel(p)}{#if (bs.periods?.length ?? 0) > 1 && i < periods.length - 1}
            <button type="button" class="btn btn-link btn-sm text-danger p-0 ms-1 text-decoration-none bs-remove-period" title="Remove snapshot"
              aria-label="Remove column {p}" onclick={() => onRemovePeriod(p)}><i class="fa fa-times-circle"></i></button>{/if}</div>
          {#if p === bs.current_period}
            <div class="mt-1"><span class="badge bg-primary-subtle text-primary border border-primary-subtle" style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">Current</span></div>
          {/if}
        </th>
      {/each}
      <th class="text-center" style="min-width: 120px;">Change ($ / %)</th>
      <th class="text-center" style="min-width: 96px;" title="Include account assets in Monte Carlo & Deterministic retirement simulation">For Retirement?</th>
      <th class="text-center" style="min-width: 52px;">Action</th>
    </tr>
  </thead>
  <tbody id="bsTableBody">
    {@render category('pretax', 'Add Pretax Account')}
    {@render spacer()}
    {@render category('roth', 'Add Roth Account')}
    {@render spacer()}
    {@render category('taxable', 'Add Brokerage Account')}
    {@render spacer()}
    {@render category('hsa', 'Add HSA Account')}
    {@render spacer()}

    <!-- Emergency fund with its target -->
    <tr class={['bs-category-header clickable', isCollapsed(bs, 'emergency') && 'collapsed']} data-section="emergency" onclick={() => toggleCategory(bs, 'emergency')}>
      <td colspan={span}>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <span><i class="fa fa-chevron-down bs-chevron-icon"></i>{categoryTitle(bs, 'emergency')}<span class="bs-count-badge">{emgAccounts.length} {emgAccounts.length === 1 ? 'account' : 'accounts'}</span></span>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="d-inline-flex align-items-center gap-1 bg-white px-2 py-1 rounded border small" onclick={(e) => e.stopPropagation()}>
              <span class="text-muted">Target Goal:</span>
              <MoneyInput id="bsEmergencyTarget" class="form-control form-control-sm bs-seamless-input currency-input text-end py-0 fw-semibold" dollarSign
                bind:value={() => emergencyTargetBase(bs), (v) => {
                  const emg = (bs.categories.emergency ??= { title: 'Emergency Fund Accounts', accounts: [] });
                  emg.target_amount = v ?? 0;
                  bs.emergency_goal_amount = v ?? 0;
                  emg.target_base_date ||= bs.current_period;
                }} />
              <button type="button" class={['btn btn-sm py-0 px-1 border-0', emgStatus.calc.autoInflate ? 'text-primary fw-bold' : 'text-secondary']}
                title="Configure CPI-U Inflation Adjustment" aria-label="Configure CPI-U inflation adjustment" onclick={editEmergencyTarget}>
                <i class="fa-solid fa-arrow-trend-up"></i></button>
            </div>
            {@render cpiBadge(emgStatus.calc, editEmergencyTarget)}
          </div>
          <button type="button" class="btn btn-outline-success btn-sm py-0 px-2" onclick={stop(() => addCategoryAccount(bs, 'emergency'))}>
            <i class="fa fa-plus me-1"></i>Add Emergency Account</button>
        </div>
      </td>
    </tr>
    {#if !isCollapsed(bs, 'emergency')}
      {#each emgAccounts as acc, i (acc)}{@render accountRow(acc, emgAccounts, i, 'ps-4', 'Emergency Account Name', 'HYSA / Bank')}{/each}
    {/if}
    <tr class="bs-subtotal-row" id="subtotal_row_emergency">
      <td class="bs-sticky-col fw-bold ps-3">Total Emergency Funds</td>
      <td id="emg_badge_container">{@render goalBadge(emgStatus)}</td>
      {#each totals as t, i (i)}<td class="text-end fw-bold text-dark">{money(t.byCategory.emergency)}</td>{/each}
      <td class="text-center"></td>
      <td colspan="2"></td>
    </tr>
    {@render spacer()}

    <!-- Sinking funds -->
    <tr class={['bs-category-header clickable', isCollapsed(bs, 'goals') && 'collapsed']} data-section="goals" onclick={() => toggleCategory(bs, 'goals')}>
      <td colspan={span}>
        <div class="d-flex justify-content-between align-items-center">
          <span><i class="fa fa-chevron-down bs-chevron-icon"></i>{categoryTitle(bs, 'goals')}<span class="bs-count-badge">{groups.length} {groups.length === 1 ? 'fund' : 'funds'}</span></span>
          <button type="button" class="btn btn-outline-warning text-dark btn-sm py-0 px-2" id="bsAddGoalGroup" onclick={stop(() => onAddGoal())}>
            <i class="fa fa-plus me-1"></i>Add Sinking Fund / Goal</button>
        </div>
      </td>
    </tr>
    {#if !isCollapsed(bs, 'goals')}
      {#each groups as g, gi (g)}
        {@const st = goalGroupStatus(bs, cpi, g, curr)}
        <tr class={['table-light clickable bs-goal-row', isGoalCollapsed(bs, gi) && 'collapsed']} onclick={() => toggleGoalGroup(bs, gi)}>
          <td class="bs-sticky-col ps-4 fw-semibold text-primary">
            <div class="d-flex align-items-center gap-1">
              <i class="fa fa-chevron-down bs-chevron-icon"></i>
              <input type="text" class="form-control form-control-sm bs-seamless-input py-0 fw-semibold" style="height: 26px;" aria-label="Goal name"
                onclick={(e) => e.stopPropagation()} bind:value={() => g.name ?? '', (v) => (g.name = v)} />
            </div>
          </td>
          <td colspan={periods.length + 2} class="py-2">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="d-flex align-items-center flex-wrap gap-2" onclick={(e) => e.stopPropagation()}>
              <div class="d-inline-flex align-items-center gap-1 bg-white px-2 py-1 rounded border small">
                <span class="small text-muted fw-medium">Target:</span>
                <MoneyInput class="form-control form-control-sm bs-seamless-input currency-input text-end py-0 fw-semibold bs-goal-target" dollarSign
                  bind:value={() => parseFloat(g.target_amount || 0), (v) => {
                    g.target_amount = v ?? 0;
                    g.target_base_date ||= bs.current_period;
                  }} />
                <button type="button" class={['btn btn-sm py-0 px-1 border-0', st.calc.autoInflate ? 'text-primary fw-bold' : 'text-secondary']}
                  title="Configure CPI-U Inflation Adjustment" aria-label="Configure CPI-U inflation adjustment" onclick={() => editGoalTarget(g)}>
                  <i class="fa-solid fa-arrow-trend-up"></i></button>
              </div>
              {@render cpiBadge(st.calc, () => editGoalTarget(g))}
              <div class="d-inline-flex align-items-center">{@render goalBadge(st)}</div>
            </div>
          </td>
          <td class="text-center"><button type="button" class="btn btn-outline-primary btn-sm py-0 px-2" title="Add account to this goal"
            aria-label="Add account to this goal" onclick={stop(() => addGoalAccount(bs, g))}><i class="fa fa-plus"></i></button></td>
          <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm p-1" title="Delete goal group" aria-label="Delete goal group"
            onclick={stop(() => confirmed('Are you sure you want to delete this goal and all its accounts?') && groups.splice(gi, 1))}>
            <i class="fa fa-trash-can"></i></button></td>
        </tr>
        {#if !isGoalCollapsed(bs, gi)}
          {#each g.accounts ?? [] as acc, i (acc)}
            {@render accountRow(acc, g.accounts, i, 'ps-5 text-muted', 'Account Name (e.g. HYSA / Bond)', 'Institution')}
          {/each}
        {/if}
      {/each}
    {/if}
    {@render subtotalRow('subtotal_row_goals', 'Total Sinking Fund Savings', totals.map((t) => t.goals))}
    {@render spacer()}

    {@render category('daily', 'Add Checking Account')}
    {@render spacer()}

    {@render netRow('liquid_net_tax_and_goals_row', 'Liquid Net Worth (net of estimated deferred income tax and savings goal savings)',
      'Excl. def. tax & sinking funds', totals.map((t) => t.liquidNetTaxAndGoals),
      calcDelta(last.liquidNetTaxAndGoals, before.liquidNetTaxAndGoals), 'table-primary border-top border-primary')}
    {@render netRow('liquid_net_tax_row', 'Liquid Net Worth (net of estimated deferred income tax)', 'Excl. deferred tax',
      totals.map((t) => t.liquidNetTax), calcDelta(last.liquidNetTax, before.liquidNetTax), 'table-primary')}
    {@render netRow('gross_liquid_row', 'GROSS LIQUID NET WORTH', 'Total liquid assets', totals.map((t) => t.liquid),
      calcDelta(last.liquid, before.liquid), 'table-primary border-top border-bottom border-primary')}
    {@render spacer()}

    <!-- Real estate -->
    {@render sectionHeader('real_estate', 'Real Estate & Home Equity', `${propertyList.length} ${propertyList.length === 1 ? 'property' : 'properties'}`,
      'Add Property', 'btn-outline-info text-dark', () => onAddProperty())}
    {#if !isCollapsed(bs, 'real_estate')}
      {#each propertyList as prop, pi (prop)}
        <tr class="bs-property-row">
          <td class="bs-sticky-col ps-4">
            <input type="text" class="form-control form-control-sm bs-seamless-input" aria-label="Property name"
              bind:value={() => prop.name ?? 'Primary Residence', (v) => (prop.name = v)} />
          </td>
          <td class="bs-inst-col small text-muted">Est. Market Value</td>
          {#each periods as p (p)}
            <td class="text-end">
              <MoneyInput class="form-control form-control-sm bs-input-val bs-seamless-input currency-input text-end" dollarSign
                bind:value={() => val(prop, 'market_values', p), (v) => setVal(prop, 'market_values', p, v ?? 0)} />
            </td>
          {/each}
          <td class="text-center"></td>
          <td class="text-center"><button type="button" class="btn btn-outline-primary btn-sm py-0 px-2" title="Add mortgage"
            onclick={() => addMortgage(bs, prop)}><i class="fa fa-plus me-1"></i>Mortgage</button></td>
          <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm p-1" title="Delete property" aria-label="Delete property"
            onclick={() => confirmed('Are you sure you want to remove this property and its mortgages?') && propertyList.splice(pi, 1)}>
            <i class="fa fa-trash-can"></i></button></td>
        </tr>
        {#each prop.mortgages ?? [] as m, mi (m)}
          <tr class="bs-mortgage-row">
            <td class="bs-sticky-col ps-5 text-muted small">
              <input type="text" class="form-control form-control-sm bs-seamless-input py-0" style="height: 24px;" aria-label="Mortgage name"
                bind:value={() => m.name ?? 'Mortgage', (v) => (m.name = v)} />
            </td>
            <td class="bs-inst-col small text-danger">Less: Mortgage</td>
            {#each periods as p (p)}
              <td class="text-end text-danger">
                <MoneyInput class="form-control form-control-sm bs-input-val bs-seamless-input currency-input text-end text-danger" dollarSign
                  bind:value={() => val(m, 'balances', p), (v) => setVal(m, 'balances', p, v ?? 0)} />
              </td>
            {/each}
            <td class="text-center"></td>
            <td></td>
            <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm p-1" title="Delete mortgage" aria-label="Delete mortgage"
              onclick={() => prop.mortgages.splice(mi, 1)}><i class="fa fa-trash-can"></i></button></td>
          </tr>
        {/each}
      {/each}
    {/if}
    {@render subtotalRow('net_home_equity_row', 'NET HOME EQUITY', totals.map((t) => t.netEquity), 'text-info', 'text-info', 'Market Value − Mortgages')}
    {@render spacer()}

    <!-- Debts -->
    {@render sectionHeader('debts', 'Debts & Liabilities (Non-Mortgage)', `${debtRows.length} ${debtRows.length === 1 ? 'account' : 'accounts'}`,
      'Add Debt Account', 'btn-outline-danger', () => onAddDebt())}
    {#if !isCollapsed(bs, 'debts')}
      {#each debtRows as d, di (d)}
        <tr class="bs-debt-row">
          <td class="bs-sticky-col ps-4">
            <input type="text" class="form-control form-control-sm bs-seamless-input" aria-label="Debt name" placeholder="Debt Name (e.g. Auto Loan)"
              bind:value={() => d.name ?? '', (v) => (d.name = v)} />
          </td>
          <td class="bs-inst-col">
            <input type="text" class="form-control form-control-sm bs-seamless-input text-secondary" aria-label="Lender" placeholder="Lender / Card"
              bind:value={() => d.institution ?? '', (v) => (d.institution = v)} />
          </td>
          {#each periods as p (p)}
            <td class="text-end text-danger">
              <MoneyInput class="form-control form-control-sm bs-input-val bs-seamless-input currency-input text-end text-danger" dollarSign
                bind:value={() => val(d, 'values', p), (v) => setVal(d, 'values', p, v ?? 0)} />
            </td>
          {/each}
          <td class="text-center"></td>
          <td></td>
          <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm p-1" title="Delete debt" aria-label="Delete debt"
            onclick={() => debtRows.splice(di, 1)}><i class="fa fa-trash-can"></i></button></td>
        </tr>
      {/each}
    {/if}
    {@render subtotalRow('subtotal_debts_row', 'Subtotal Non-Mortgage Debts', totals.map((t) => t.debts), 'text-danger', 'text-danger', '', true)}
    <tr class="table-danger border-top border-bottom border-danger fw-bold" id="total_debts_row">
      <td class="bs-sticky-col ps-3 text-danger">TOTAL DEBTS (Including Mortgages)</td>
      <td class="small text-muted">All liabilities</td>
      {#each totals as t, i (i)}<td class="text-end text-danger fw-bold">({money(t.totalDebts)})</td>{/each}
      <td class="text-center">{@render delta(calcDelta(last.totalDebts, before.totalDebts), true)}</td>
      <td colspan="2"></td>
    </tr>
    {@render spacer()}

    {@render netRow('grand_net_worth_row', 'GROSS NET WORTH', 'Total Assets − Total Debts', totals.map((t) => t.grossNetWorth),
      calcDelta(last.grossNetWorth, before.grossNetWorth), 'table-primary border-top border-bottom border-primary')}
  </tbody>
</table>
