<!-- The Deterministic Projection and Deterministic Cash Flow tables (results.html tabs 2
     and 3): one row per year, with hover breakdowns. Amounts show in nominal dollars
     or, as results.js did, deflated to the plan's first year. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fixedTooltip } from '../../app/fixedTooltip';
  import type { DollarMode } from '../../app/resultCharts';
  import type { DetRow } from '../../app/results';
  import { milestoneBadge, realValue, usd } from '../../app/resultsFormat';

  interface Props {
    kind: 'projection' | 'cashflow';
    rows: DetRow[];
    inflationRate: number;
    mode: DollarMode;
    onModeChange: (mode: DollarMode) => void;
    onTaxesHelp: () => void;
    onWithdrawalsHelp?: () => void;
  }
  let { kind, rows, inflationRate, mode, onModeChange, onTaxesHelp, onWithdrawalsHelp }: Props = $props();

  // results.js took each row's year index from its Year cell.
  const startYear = $derived(rows[0]?.year ?? 2026);
  const yearIndex = (row: DetRow) => Math.max(0, (parseInt(String(row.year)) || 0) - startYear);
  const fmt = (v: number, t: number) => usd(mode === 'real' ? realValue(v, t, inflationRate) : v);
  const items = (o: Record<string, number> | null | undefined) => Object.entries(o ?? {});
  const signCls = (v: number) => (v < 0 ? 'text-danger' : 'text-success');
  const prefix = $derived(kind === 'projection' ? 'proj' : 'cf');
</script>

{#snippet amount(v: number, t: number, cls = '')}
  <span class={['dollar-amount', cls]}>{fmt(v ?? 0, t)}</span>
{/snippet}

{#snippet line(label: string, v: number, t: number, opts: { last?: boolean; cls?: string; amt?: string; sub?: boolean } = {})}
  <div class={['d-flex justify-content-between gap-3 small', !opts.last && 'mb-1', opts.cls]} style={opts.sub ? 'font-size: 0.75rem;' : undefined}>
    <span>{label}</span>
    {@render amount(v, t, opts.amt)}
  </div>
{/snippet}

{#snippet tip(title: string, total: Snippet, body: Snippet, right = false)}
  <div class={['tooltip-trigger', right && 'ending-assets-group']} use:fixedTooltip>
    {@render total()}
    <div class={['tooltip-content', right && 'tooltip-content-right-align']}>
      <h6 class="border-bottom pb-1 mb-2 font-weight-bold text-center">{title}</h6>
      {@render body()}
    </div>
  </div>
{/snippet}

{#snippet accounts(block: Record<string, number>, t: number, signed = false)}
  {@render line('Pretax:', block.pretax, t, { amt: signed ? signCls(block.pretax) : '' })}
  {@render line('Roth:', block.roth, t, { amt: signed ? signCls(block.roth) : '' })}
  {@render line('Taxable:', block.taxable, t, { amt: signed ? signCls(block.taxable) : '' })}
  {@render line('HSA:', block.hsa, t, { last: true, amt: signed ? signCls(block.hsa) : '' })}
{/snippet}

{#snippet breakdown(entries: [string, number][], t: number, empty: string)}
  {#if entries.length}
    {#each entries as [name, val] (name)}
      {@render line(`${name}:`, val, t)}
    {/each}
  {:else}
    <div class="text-muted text-center small">{empty}</div>
  {/if}
{/snippet}

{#snippet incomeCell(row: DetRow, t: number)}
  {#snippet incomeTotal()}{@render amount(row.income, t, 'text-success font-weight-bold')}{/snippet}
  {#snippet incomeBody()}{@render breakdown(items(row.income_breakdown), t, 'No income streams active')}{/snippet}
  {@render tip('Income Breakdown', incomeTotal, incomeBody)}
{/snippet}

{#snippet additionalCell(row: DetRow, t: number)}
  {#snippet additionalTotal()}{@render amount(row.additional_spending, t, kind === 'projection' ? 'font-weight-bold text-danger' : 'text-danger font-weight-bold')}{/snippet}
  {#snippet additionalBody()}{@render breakdown(items(row.additional_spending_breakdown), t, 'No additional spending this year')}{/snippet}
  {@render tip('Additional Spending', additionalTotal, additionalBody)}
{/snippet}

{#snippet taxesCell(row: DetRow, t: number)}
  {#if row.is_spending_active}
    {@const tb = row.tax_breakdown ?? {}}
    {@const inv = row.investment_income ?? {}}
    {#snippet taxesTotal()}{@render amount(row.taxes, t, 'text-danger font-weight-bold')}{/snippet}
    {#snippet taxesBody()}
      {@render line('Federal Income Tax:', tb.fed_tax || 0, t, { amt: 'text-danger font-weight-bold' })}
      {#if tb.fed_ltcg_tax > 0}
        {@render line('• Ordinary Tax:', tb.fed_ordinary_tax || 0, t, { cls: 'text-muted ps-2', sub: true })}
        {@render line('• Preferential LTCG Tax:', tb.fed_ltcg_tax || 0, t, { cls: 'text-muted ps-2', sub: true })}
      {/if}
      {@render line('State Income Tax:', tb.state_tax || 0, t, { amt: 'text-danger font-weight-bold' })}
      {#if tb.penalty > 0}
        {@render line('Early Withdrawal Penalty:', tb.penalty, t, { amt: 'text-danger font-weight-bold' })}
      {/if}
      {@render line('Other Specified Taxes:', tb.other_taxes || 0, t, { amt: 'text-danger font-weight-bold' })}
      {#if items(tb.other_taxes_breakdown).length}
        <div class="border-top pt-1 mt-1">
          {#each items(tb.other_taxes_breakdown) as [name, val] (name)}
            {@render line(`• ${name}:`, val, t, { cls: 'text-muted ps-2' })}
          {/each}
        </div>
      {/if}
      {#if inv.total > 0}
        <div class="border-top pt-2 mt-2">
          <div class="small fw-bold text-secondary mb-1">Taxable Investment Income:</div>
          {#if inv.qualified_dividends > 0}{@render line('• Qualified Dividends:', inv.qualified_dividends, t, { cls: 'text-muted ps-2', sub: true })}{/if}
          {#if inv.ordinary_dividends > 0}{@render line('• Ordinary Dividends:', inv.ordinary_dividends, t, { cls: 'text-muted ps-2', sub: true })}{/if}
          {#if inv.interest > 0}{@render line('• Taxable Interest:', inv.interest, t, { cls: 'text-muted ps-2', sub: true })}{/if}
          {#if inv.capital_gains_distributions > 0}{@render line('• Cap Gains Distributions:', inv.capital_gains_distributions, t, { cls: 'text-muted ps-2', sub: true })}{/if}
          {#if inv.realized_capital_gains > 0}{@render line('• Realized Cap Gains:', inv.realized_capital_gains, t, { cls: 'text-muted ps-2', sub: true })}{/if}
        </div>
      {/if}
      {#if row.ending_assets?.taxable_basis > 0}
        <!-- Deflated by the row's year, as results.js did (this cell isn't an ending-assets group). -->
        {@render line('Ending Taxable Basis:', row.ending_assets.taxable_basis, t, { last: true, cls: 'text-muted ps-2 border-top pt-1 mt-1', sub: true })}
      {/if}
    {/snippet}
    {@render tip('Tax Breakdown', taxesTotal, taxesBody)}
  {:else}
    <span class="text-muted small">N/A</span>
  {/if}
{/snippet}

{#snippet milestones(row: DetRow)}
  {#if row.milestones?.length}
    {#each row.milestones as m, i (i)}<span class={milestoneBadge(m)}>{m}</span>{/each}
  {:else}
    <span class="text-muted small">-</span>
  {/if}
{/snippet}

{#snippet helpButton(onclick: () => void, title: string, label: string)}
  <button type="button" class="btn btn-link p-0 text-primary ms-1 align-baseline text-decoration-none" {title} aria-label={label} {onclick}>
    <i class="fa-solid fa-circle-question fs-6"></i>
  </button>
{/snippet}

<div class="card p-4">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      {#if kind === 'projection'}
        <h3 class="text-primary mb-1">Deterministic Account Projections</h3>
        <p class="text-secondary small mb-0">Assuming average asset class returns, with inflation and tax brackets indexed.</p>
      {:else}
        <h3 class="text-primary mb-1">Deterministic Cash Flows</h3>
        <p class="text-secondary small mb-0">Shows the year-by-year cash inflow, outflow, and net withdrawals from the portfolio.</p>
      {/if}
    </div>
    <div class="btn-group" role="group" aria-label="Nominal/Real dollar toggle">
      <input type="radio" class="btn-check" name="{prefix}_dollar_mode" id="{prefix}_nominal" autocomplete="off" checked={mode === 'nominal'} onclick={() => onModeChange('nominal')}>
      <label class="btn btn-outline-secondary btn-sm" for="{prefix}_nominal">Nominal Dollars</label>
      <input type="radio" class="btn-check" name="{prefix}_dollar_mode" id="{prefix}_real" autocomplete="off" checked={mode === 'real'} onclick={() => onModeChange('real')}>
      <label class="btn btn-outline-secondary btn-sm" for="{prefix}_real">Real Dollars</label>
    </div>
  </div>

  <div class="table-container">
    <table class="table table-hover align-middle table-sticky-cols">
      <thead>
        <tr>
          <th>Year</th>
          <th>Age</th>
          <th>Spouse</th>
          {#if kind === 'projection'}
            <th>Beginning Assets <small class="text-muted">(Hover)</small></th>
            <th>Contributions <small class="text-muted">(Hover)</small></th>
            <th>Asset Growth <small class="text-muted">(Hover)</small></th>
            <th>Income Sources <small class="text-muted">(Hover)</small></th>
            <th>Taxes & Pen. {@render helpButton(onTaxesHelp, 'Click to understand why taxes and penalties are displayed only on and after retirement spending begins', 'Taxes & Penalties Information')}</th>
            <th>Regular Retirement Spending</th>
            <th>Additional Spending <small class="text-muted">(Hover)</small></th>
            <th>Ending Assets <small class="text-muted">(Hover)</small></th>
          {:else}
            <th>Regular Retirement Spending</th>
            <th>Additional Spending <small class="text-muted">(Hover)</small></th>
            <th>Taxes & Penalties {@render helpButton(onTaxesHelp, 'Click to understand why taxes and penalties are displayed only on and after retirement spending begins', 'Taxes & Penalties Information')}</th>
            <th>Income Sources <small class="text-muted">(Hover)</small></th>
            <th>
              Portfolio Withdrawals
              {@render helpButton(() => onWithdrawalsHelp?.(), 'Click to understand how portfolio withdrawals, RMDs, and spending interact', 'Portfolio Withdrawals Information')}
              <small class="text-muted d-block fw-normal">(Hover rows for breakdown)</small>
            </th>
          {/if}
          <th>Milestones</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i (i)}
          {@const t = yearIndex(row)}
          <tr>
            <td>{row.year}</td>
            <td>{row.user_age || '-'}</td>
            <td>{row.spouse_age || '-'}</td>
            {#if kind === 'projection'}
              <td>
                {#snippet begTotal()}{@render amount(row.beg_assets.total, t, 'text-primary font-weight-bold')}{/snippet}
                {#snippet begBody()}{@render accounts(row.beg_assets, t)}{/snippet}
                {@render tip('Asset Breakdown', begTotal, begBody)}
              </td>
              <td>
                {#snippet contribTotal()}{@render amount(row.contribs.total, t)}{/snippet}
                {#snippet contribBody()}{@render accounts(row.contribs, t)}{/snippet}
                {@render tip('Contributions Breakdown', contribTotal, contribBody)}
              </td>
              <td>
                {#snippet growthTotal()}{@render amount(row.growth.total, t, signCls(row.growth.total))}{/snippet}
                {#snippet growthBody()}{@render accounts(row.growth, t, true)}{/snippet}
                {@render tip('Asset Growth Breakdown', growthTotal, growthBody)}
              </td>
              <td>{@render incomeCell(row, t)}</td>
              <td>{@render taxesCell(row, t)}</td>
              <td>{@render amount(row.desired_spending, t)}</td>
              <td>{@render additionalCell(row, t)}</td>
              <td>
                <!-- End-of-year balances deflate one more year. -->
                {#snippet endingTotal()}{@render amount(row.ending_assets.total, t + 1, 'text-primary font-weight-bold')}{/snippet}
                {#snippet endingBody()}{@render accounts(row.ending_assets, t + 1)}{/snippet}
                {@render tip('Asset Breakdown', endingTotal, endingBody, true)}
              </td>
            {:else}
              <td>{@render amount(row.desired_spending, t, 'text-danger')}</td>
              <td>{@render additionalCell(row, t)}</td>
              <td>{@render taxesCell(row, t)}</td>
              <td>{@render incomeCell(row, t)}</td>
              <td>
                {#snippet withdrawalsTotal()}{@render amount(row.withdrawals.total, t, 'text-primary font-weight-bold')}{/snippet}
                {#snippet withdrawalsBody()}
                  {@render line('Taxable:', row.withdrawals.taxable, t)}
                  {#if row.withdrawals.user_pretax_rmd > 0 || row.withdrawals.spouse_pretax_rmd > 0}
                    {@render line('Your RMD:', row.withdrawals.user_pretax_rmd, t, { cls: 'text-muted ps-2' })}
                    {@render line('Spouse RMD:', row.withdrawals.spouse_pretax_rmd, t, { cls: 'text-muted ps-2' })}
                  {/if}
                  {@render line('Pretax (RMD Total):', row.withdrawals.pretax_rmd, t)}
                  {@render line('Pretax (Extra):', row.withdrawals.pretax_extra, t)}
                  {@render line('Roth:', row.withdrawals.roth, t)}
                  {@render line('HSA:', row.withdrawals.hsa, t, { last: true })}
                {/snippet}
                {@render tip('Withdrawal Sources', withdrawalsTotal, withdrawalsBody)}
              </td>
            {/if}
            <td>{@render milestones(row)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
