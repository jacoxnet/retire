<!-- The "?" explanations in the projection tables' headers (results.html
     #portfolioWithdrawalsModal and #taxesPenaltiesModal). -->
<script lang="ts">
  import Modal from '../shared/Modal.svelte';

  interface Props {
    taxesOpen: boolean;
    withdrawalsOpen: boolean;
    /** Start age for retirement spending, named in the taxes explanation. */
    startAge: number | null | undefined;
  }
  let { taxesOpen = $bindable(), withdrawalsOpen = $bindable(), startAge }: Props = $props();
</script>

<Modal bind:open={withdrawalsOpen} id="portfolioWithdrawalsModal" size="lg">
  {#snippet title()}<i class="fa-solid fa-circle-info me-2"></i>Understanding Portfolio Withdrawals{/snippet}
  <p class="mb-3 text-secondary">
    In standard retirement years, portfolio withdrawals are calculated on an <strong>as-needed basis</strong> to bridge the net cash deficit between your outflows and non-portfolio income:
  </p>
  <div class="p-3 bg-light rounded border text-center mb-4">
    <span class="fs-6 fw-semibold text-dark">Portfolio Withdrawals = Regular Spending + Additional Spending + Taxes & Penalties − Income Sources</span>
  </div>

  <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">Why Withdrawals May Differ in Later Years</h6>

  <div class="card mb-3 border-primary-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-primary">Alternative 1</span>
        <strong class="text-dark">Required Minimum Distributions (RMDs) Exceed Spending Needs</strong>
      </div>
      <p class="small text-secondary mb-2">
        Starting at RMD age (age 73 or 75 under SECURE 2.0 rules), the IRS mandates minimum annual distributions from Pre-Tax accounts (Traditional IRA / 401(k)).
      </p>
      <ul class="small text-secondary ps-3 mb-0">
        <li>When the mandatory RMD is <strong>greater</strong> than your net spending deficit, the full RMD must still be withdrawn to satisfy IRS rules.</li>
        <li><strong>Where the surplus goes:</strong> The excess cash is not lost or spent; it is automatically <strong>reinvested and deposited into your Taxable Assets</strong> (visible in Tab 2: <em>Deterministic Asset Projections</em>).</li>
        <li>In these years: <span class="fw-bold text-primary">Portfolio Withdrawals &gt; (Spending + Taxes − Income Sources)</span>.</li>
      </ul>
    </div>
  </div>

  <div class="card border-danger-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-danger">Alternative 2</span>
        <strong class="text-dark">Portfolio Depletion (Assets Exhausted)</strong>
      </div>
      <p class="small text-secondary mb-2">
        If portfolio assets across all accounts (Taxable, Pre-Tax, Roth, and HSA) reach $0 in later years, the portfolio can no longer provide funds to cover your target spending.
      </p>
      <ul class="small text-secondary ps-3 mb-0">
        <li>Withdrawals drop to $0 (or whatever partial balance remains), creating an unfulfilled cash flow shortfall.</li>
        <li>In these years: <span class="fw-bold text-danger">Portfolio Withdrawals &lt; (Spending + Taxes − Income Sources)</span>.</li>
      </ul>
    </div>
  </div>
  {#snippet footer()}<button type="button" class="btn btn-secondary btn-sm" onclick={() => (withdrawalsOpen = false)}>Close</button>{/snippet}
</Modal>

<Modal bind:open={taxesOpen} id="taxesPenaltiesModal" size="lg">
  {#snippet title()}<i class="fa-solid fa-circle-info me-2"></i>Taxes &amp; Penalties in Retirement Projections{/snippet}
  <p class="mb-3 text-secondary">
    In the projection tables, <strong>Taxes &amp; Penalties</strong> are calculated and displayed only for years <strong>on and after your Start Age for Retirement Spending</strong> (Age {startAge || 'Retirement'}):
  </p>

  <div class="card mb-3 border-secondary-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-secondary">Pre-Retirement Years</span>
        <strong class="text-dark">Prior to Retirement Spending Start Age: Displayed as "N/A"</strong>
      </div>
      <p class="small text-secondary mb-2">During your working and accumulation years before retirement spending begins:</p>
      <ul class="small text-secondary ps-3 mb-0">
        <li>Everyday living expenses and routine wage/payroll taxes (income tax withholding, FICA, Medicare) are funded directly from your ongoing employment earnings and routine household budget.</li>
        <li>Because the model's objective is to evaluate the <strong>sustainability and longevity of your investment portfolio</strong> across retirement, working-years wage taxes and household living expenses are outside the scope of retirement portfolio withdrawals.</li>
        <li>Consequently, Taxes &amp; Penalties are marked as <strong>N/A</strong> for these accumulation years.</li>
      </ul>
    </div>
  </div>

  <div class="card border-primary-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-primary">Retirement Years</span>
        <strong class="text-dark">On &amp; After Retirement Spending Start Age: Comprehensive Tax Modeling</strong>
      </div>
      <p class="small text-secondary mb-2">Beginning in the year you reach your Start Age for Retirement Spending, full federal and state tax liability is modeled dynamically each year:</p>
      <ul class="small text-secondary ps-3 mb-0">
        <li><strong>Federal &amp; State Ordinary Income Taxes:</strong> Computed on taxable retirement income, including pension payments, taxable Social Security benefits, pre-tax account withdrawals (RMDs and discretionary 401(k)/IRA draws), plus ordinary dividends and taxable interest.</li>
        <li><strong>Preferential Capital Gains Taxes:</strong> Computed on qualified dividends and capital gains distributions from taxable accounts using preferential long-term capital gains tax brackets.</li>
        <li><strong>Early Withdrawal Penalties:</strong> Includes the 10% IRS penalty on early non-exempt pre-tax distributions taken prior to age 59½.</li>
        <li><strong>Specified Additional Taxes:</strong> Any custom recurring or lump-sum taxes entered in your plan.</li>
      </ul>
    </div>
  </div>
  {#snippet footer()}<button type="button" class="btn btn-secondary btn-sm" onclick={() => (taxesOpen = false)}>Close</button>{/snippet}
</Modal>
