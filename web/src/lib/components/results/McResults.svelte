<!-- The Results card on the Monte Carlo tab: success rate and ending-wealth
     percentiles, or the solved maximum spending for a goal-seeking run. -->
<script lang="ts">
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat } from '../../app/resultsFormat';

  let { results: r }: { results: Results } = $props();
  const sign = (v: number) => (v >= 0 ? 'text-success' : 'text-danger');
  const rows = $derived([
    { label: 'Mean Ending Wealth:', value: r.run_mean, bold: false },
    { label: 'Median Ending Wealth:', value: r.run_median, bold: true },
    { label: '25th Percentile Ending Wealth:', value: r.run_25, bold: false },
    { label: '10th Percentile Ending Wealth:', value: r.run_10, bold: true },
    { label: 'Maximum Wealth:', value: r.run_max, bold: false },
    { label: 'Minimum Wealth:', value: r.run_min, bold: false },
  ]);
</script>

<div class="card p-4 h-100" id="mcResultsCard">
  {#if !r.goal_seeking}
    <h3 class="border-bottom pb-2 text-success">Results</h3>
    <div class="mt-3">
      <div class="alert alert-success border text-center py-3 mb-4">
        <h4 class="mb-1">Success Rate</h4>
        <span class="display-5 font-weight-bold {sign(r.run_success)}">{floatformat(r.run_success, 1)}%</span>
      </div>

      <p class="mb-2"><strong>Desired Recurring Annual Spending:</strong> <span class="dollar-amount-static {sign(r.desired_spending)}">${djangoMoney(r.desired_spending)}</span></p>
      <hr>
      <h5 class="text-secondary mt-3">Ending Wealth Percentiles (Nominal)</h5>
      {#if r.terminal_life_insurance > 0}
        <div class="alert alert-info py-1 px-2 small mb-2 d-flex align-items-center">
          <i class="fa-solid fa-shield-halved me-2 text-info"></i>
          <span>Includes <strong>${djangoMoney(r.terminal_life_insurance)}</strong> life insurance death benefit paid to estate/heirs.</span>
        </div>
      {/if}
      <div class="row">
        {#each rows as row (row.label)}
          <div class="col-6 mb-2"><strong>{row.label}</strong></div>
          <div class={['col-6 text-end', row.bold && 'font-weight-bold', sign(row.value)]}>${djangoMoney(row.value)}</div>
        {/each}
      </div>
    </div>
  {:else}
    <h3 class="border-bottom pb-2 text-primary">Results</h3>
    <div class="mt-3">
      <div class="alert alert-primary border text-center py-3 mb-4">
        <h4 class="mb-1">Max Achieved Desired Spending</h4>
        <span class="display-5 font-weight-bold">${djangoMoney(r.achieved_spending)}</span>
        <p class="small text-muted mb-0">Initial annual value</p>
      </div>

      <div class="row">
        <div class="col-7 mb-3"><strong>Target Success Rate:</strong></div>
        <div class="col-5 text-end">{floatformat(r.target_success_rate, 1)}%</div>

        <div class="col-7 mb-3"><strong>Achieved Success Rate:</strong></div>
        <div class="col-5 text-end text-success font-weight-bold">{floatformat(r.achieved_success_rate, 1)}%</div>
      </div>
    </div>
  {/if}

  <div class="alert alert-light border p-3 mt-4 mb-0">
    <p class="mb-0 text-secondary small">
      <strong>Portfolio Withdrawal Ordering Note:</strong> Annual cash deficit is withdrawn in the following sequence:
      1) Required Minimum Distributions (RMDs) from Pretax accounts;
      2) Taxable accounts;
      3) Pretax accounts (with tax gross-up);
      4) Roth accounts;
      5) Health Savings Accounts (HSA).
      <strong>Early-withdrawal exception:</strong> If an account owner is under age 59&frac12;, withdrawals from that owner's Pretax accounts would incur a 10% penalty.
      Those withdrawals are deferred until after Roth accounts and any penalty-free HSAs (medical use, or owner age 65 or older),
      but are taken before HSAs whose non-medical withdrawals would incur the 20% under-65 penalty.
      Pretax accounts of an owner age 59&frac12; or older remain at step 3.
    </p>
  </div>
</div>
