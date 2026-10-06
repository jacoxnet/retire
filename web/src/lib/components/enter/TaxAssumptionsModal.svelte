<!-- "Taxable Account Tax Treatment (Defaults)" explainer (enter.html #tier1TaxAssumptionsModal). -->
<script lang="ts">
  interface Props {
    open: boolean;
  }
  let { open = $bindable() }: Props = $props();
  const close = () => (open = false);
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal fade show" id="tier1TaxAssumptionsModal" tabindex="-1" role="dialog" aria-modal="true"
    aria-labelledby="tier1TaxAssumptionsModalLabel" style="display: block; z-index: 1065;"
    onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable tax-assumptions-dialog">
      <div class="modal-content shadow-lg border-0 rounded-4">
        <div class="modal-header border-0 pb-0">
          <div class="d-flex align-items-center">
            <div class="rounded-circle bg-primary-subtle text-primary p-2 me-2 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
              <i class="fa fa-university fs-5"></i>
            </div>
            <div>
              <h5 class="modal-title fw-bold text-dark mb-0" id="tier1TaxAssumptionsModalLabel">Taxable Account Tax Treatment (Defaults)</h5>
              <span class="small text-muted">How taxable brokerage and savings accounts generate annual taxes</span>
            </div>
          </div>
          <button type="button" class="btn-close" aria-label="Close" onclick={close}></button>
        </div>
        <div class="modal-body py-4">
            <div class="alert alert-info border-0 rounded-3 mb-4">
                <div class="d-flex">
                    <i class="fa fa-info-circle fs-5 me-2 mt-1 text-info-emphasis"></i>
                    <div>
                        <strong>Why does this matter?</strong> Unlike Pre-Tax (401k/IRA) or Roth accounts where earnings grow tax-deferred or tax-free, 
                        <strong>taxable accounts incur income taxes every single year</strong> on dividends, interest, and capital gains distributions—even when you do not withdraw any cash.
                    </div>
                </div>
            </div>

            <h6 class="fw-bold text-dark mb-3"><i class="fa fa-sliders text-primary me-2"></i>Default Assumptions--you can modify these</h6>
            <div class="table-responsive mb-4">
                <table class="table table-bordered align-middle small mb-0 tax-assumptions-table">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 18%;">Tax Event</th>
                            <th style="width: 16%;">Default</th>
                            <th style="width: 20%;">Tax Treatment</th>
                            <th style="width: 46%;">Rationale & Industry Benchmark</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="fw-bold">Dividend Yield</td>
                            <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle fs-6">2.0%</span> / yr</td>
                            <td>Split (Ord. & Qual.)</td>
                            <td>Reflects long-term historical yield on broad equities index funds (e.g., S&P 500 / Total Stock Market).</td>
                        </tr>
                        <tr>
                            <td class="fw-bold">Qualified Dividends</td>
                            <td><span class="badge bg-success-subtle text-success border border-success-subtle fs-6">85.0%</span></td>
                            <td>Preferential LTCG (0%, 15%, 20%)</td>
                            <td>Most domestic corporate dividends meet IRS holding period rules, qualifying for lower preferential capital gains rates rather than ordinary income rates.</td>
                        </tr>
                        <tr>
                            <td class="fw-bold">Capital Gains Distributions</td>
                            <td><span class="badge bg-warning-subtle text-warning border border-warning-subtle fs-6">0.5%</span> / yr</td>
                            <td>Preferential LTCG (0%, 15%, 20%)</td>
                            <td>Mutual funds and actively managed funds must pass net realized internal gains to shareholders annually (Form 1099-DIV Box 2a).</td>
                        </tr>
                        <tr>
                            <td class="fw-bold">Taxable Interest Yield</td>
                            <td><span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle fs-6">0.0%</span> / yr</td>
                            <td>Ordinary Income</td>
                            <td>Assumed 0.0% for equity brokerage portfolios. Cash/Emergency accounts default to 100% ordinary interest.</td>
                        </tr>
                        <tr>
                            <td class="fw-bold">Cost Basis Ratio</td>
                            <td><span class="badge bg-info-subtle text-info border border-info-subtle fs-6">70.0%</span> of balance</td>
                            <td>Non-taxable Return of Basis</td>
                            <td>Assumed ~70% is invested principal (basis) and ~30% is unrealized capital gain. Withdrawals only trigger capital gains tax on the gain portion.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="row g-3 mb-0">
                <div class="col-md-6">
                    <div class="card h-100 border rounded-3 p-3 bg-light">
                        <h6 class="fw-bold text-dark mb-2"><i class="fa fa-refresh text-success me-2"></i>Dynamic Basis Reinvestment</h6>
                        <p class="small text-muted mb-0">
                            In our simulation, annual dividends and capital gains distributions are assumed to be reinvested into the account. 
                            Reinvested distributions increase your account's cost basis dollar-for-dollar, automatically reducing the realized taxable gain when you liquidate assets in retirement.
                        </p>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100 border rounded-3 p-3 bg-light">
                        <h6 class="fw-bold text-dark mb-2"><i class="fa fa-heartbeat text-danger me-2"></i>Spousal Step-Up in Basis</h6>
                        <p class="small text-muted mb-1">
                            For married couples, federal tax rules (IRC § 1014) grant a step-up in cost basis upon the death of the first spouse, shielding future withdrawals from capital gains taxes:
                        </p>
                        <ul class="small text-muted ps-3 mb-0">
                            <li><strong>Common Law States (Default: "No"):</strong> The engine applies a <strong>50% basis step-up</strong>, reflecting the deceased spouse's half of jointly owned property.</li>
                            <li><strong>Community Property States ("Yes"):</strong> Married couples in community property states receive a <strong>100% full basis step-up</strong> to fair market value on both halves of community property (IRC § 1014(b)(6)), eliminating all prior unrealized capital gains at first death.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-primary btn-sm px-4" onclick={close}>Got It</button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade show"></div>
{/if}
