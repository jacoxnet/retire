<!-- The Results card on the Monte Carlo tab: success rate and ending-wealth
     percentiles, or the solved maximum spending for a goal-seeking run. -->
<script lang="ts">
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat, realValue } from '../../app/resultsFormat';
  import RetirementFrontierExplorer from './RetirementFrontierExplorer.svelte';

  let { results: r }: { results: Results } = $props();
  const sign = (v: number) => (v >= 0 ? 'text-success' : 'text-danger');
  const rows = $derived([
    { label: 'Mean Ending Wealth', value: r.run_mean, bold: false },
    { label: 'Median Ending Wealth', value: r.run_median, bold: true },
    { label: '25th Percentile Ending Wealth', value: r.run_25, bold: false },
    { label: '10th Percentile Ending Wealth', value: r.run_10, bold: true },
    { label: 'Maximum Wealth', value: r.run_max, bold: false },
    { label: 'Minimum Wealth', value: r.run_min, bold: false },
  ]);
</script>

<div class="card p-4 h-100" id="mcResultsCard">
  {#if r.simulation_type === 'earliest_retirement'}
    <h3 class="border-bottom pb-2 text-primary">Results</h3>
    <div class="mt-3">
      {#if r.unreachable}
        <div class="alert alert-warning border text-center py-3 mb-4">
          <h4 class="mb-1 text-danger"><i class="fa-solid fa-triangle-exclamation me-2"></i>Target Rate Unreachable</h4>
          <p class="mb-0">
            Even working until age {r.achieved_user_ret_age}{#if r.is_married} (and spouse age {r.achieved_spouse_ret_age}){/if},
            the success rate ({floatformat(r.achieved_success_rate, 1)}%) remains below your target of {floatformat(r.target_success_rate, 1)}%.
            Consider lowering desired spending or switching to <strong>Maximum Spending</strong> mode.
          </p>
        </div>
      {:else if r.immediate}
        <div class="alert alert-success border text-center py-3 mb-4">
          <h4 class="mb-1">Retire Immediately!</h4>
          <span class="display-6 font-weight-bold text-success">Age {r.achieved_user_ret_age}{#if r.is_married} / {r.achieved_spouse_ret_age}{/if}</span>
          <p class="small text-muted mb-0 mt-1">Your portfolio already satisfies your target success rate today.</p>
        </div>
      {:else}
        <div class="alert alert-primary border text-center py-3 mb-4">
          <h4 class="mb-1">Earliest Retirement Age</h4>
          {#if !r.is_married}
            <span class="display-5 font-weight-bold">Age {r.achieved_user_ret_age}</span>
            <p class="small text-muted mb-0">Year {(r.current_year ?? 2026) + ((r.achieved_user_ret_age ?? 65) - (r.user_age ?? 60))}</p>
          {:else if r.strategy === 'same_age'}
            <span class="display-5 font-weight-bold">Age {r.achieved_user_ret_age}</span>
            <p class="small text-muted mb-0">
              Both retire at age {r.achieved_user_ret_age} ({r.user_name}: {(r.current_year ?? 2026) + ((r.achieved_user_ret_age ?? 65) - (r.user_age ?? 60))}, {r.spouse_name}: {(r.current_year ?? 2026) + ((r.achieved_spouse_ret_age ?? 65) - (r.spouse_age ?? 60))})
            </p>
          {:else if r.strategy === 'simultaneous'}
            <span class="display-6 font-weight-bold">
              {r.user_name}: {r.achieved_user_ret_age} | {r.spouse_name}: {r.achieved_spouse_ret_age}
            </span>
            <p class="small text-muted mb-0">
              Both retire in Year {(r.current_year ?? 2026) + ((r.achieved_user_ret_age ?? 65) - (r.user_age ?? 60))}
            </p>
          {:else if r.strategy === 'solve_user'}
            <span class="display-6 font-weight-bold">
              {r.user_name}: Age {r.achieved_user_ret_age}
            </span>
            <p class="small text-muted mb-0">
              Year {(r.current_year ?? 2026) + ((r.achieved_user_ret_age ?? 65) - (r.user_age ?? 60))} ({r.spouse_name} fixed at age {r.achieved_spouse_ret_age})
            </p>
          {:else}
            <span class="display-6 font-weight-bold">
              {r.spouse_name}: Age {r.achieved_spouse_ret_age}
            </span>
            <p class="small text-muted mb-0">
              Year {(r.current_year ?? 2026) + ((r.achieved_spouse_ret_age ?? 65) - (r.spouse_age ?? 60))} ({r.user_name} fixed at age {r.achieved_user_ret_age})
            </p>
          {/if}
        </div>
      {/if}

      <div class="row mb-3">
        <div class="col-7 mb-2"><strong>Target Success Rate:</strong></div>
        <div class="col-5 text-end">{floatformat(r.target_success_rate, 1)}%</div>

        <div class="col-7 mb-2"><strong>Achieved Success Rate:</strong></div>
        <div class="col-5 text-end text-success font-weight-bold">{floatformat(r.achieved_success_rate, 1)}%</div>

        <div class="col-7 mb-2"><strong>Desired Recurring Spending:</strong></div>
        <div class="col-5 text-end">${djangoMoney(r.desired_spending)}/yr</div>
      </div>

      <hr>
      <h5 class="text-secondary mt-3 border-bottom pb-2">Ending Wealth Percentiles</h5>
      {#if r.terminal_life_insurance > 0}
        <div class="alert alert-info py-1 px-2 small mb-2 d-flex align-items-center">
          <i class="fa-solid fa-shield-halved me-2 text-info"></i>
          <span>Includes <strong>${djangoMoney(r.terminal_life_insurance)}</strong> life insurance death benefit paid to estate/heirs.</span>
        </div>
      {/if}
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="mcEndingWealthTableEarliest">
          <thead class="table-light">
            <tr>
              <th>Metric</th>
              <th class="text-end">Nominal</th>
              <th class="text-end">Real</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.label)}
              {@const real = realValue(row.value, r.years ?? 0, r.inflation_rate ?? 0)}
              <tr>
                <td><strong>{row.label}</strong></td>
                <td class={['text-end', row.bold && 'font-weight-bold', sign(row.value)]}>${djangoMoney(row.value)}</td>
                <td class={['text-end', row.bold && 'font-weight-bold', sign(real)]}>${djangoMoney(real)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if r.is_married && r.frontier && r.frontier.length > 0}
        <RetirementFrontierExplorer
          frontier={r.frontier}
          userName={r.user_name}
          spouseName={r.spouse_name}
          userAge={r.user_age}
          spouseAge={r.spouse_age}
          currentYear={r.current_year}
        />
      {/if}
    </div>
  {:else if !r.goal_seeking}
    <h3 class="border-bottom pb-2 text-success">Results</h3>
    <div class="mt-3">
      <div class="alert alert-success border text-center py-3 mb-4">
        <h4 class="mb-1">Success Rate</h4>
        <span class="display-5 font-weight-bold {sign(r.run_success)}">{floatformat(r.run_success, 1)}%</span>
      </div>

      <p class="mb-2"><strong>Desired Recurring Annual Spending:</strong> <span class="dollar-amount-static {sign(r.desired_spending)}">${djangoMoney(r.desired_spending)}</span></p>
      <hr>
      <h5 class="text-secondary mt-3 border-bottom pb-2">Ending Wealth Percentiles</h5>
      {#if r.terminal_life_insurance > 0}
        <div class="alert alert-info py-1 px-2 small mb-2 d-flex align-items-center">
          <i class="fa-solid fa-shield-halved me-2 text-info"></i>
          <span>Includes <strong>${djangoMoney(r.terminal_life_insurance)}</strong> life insurance death benefit paid to estate/heirs.</span>
        </div>
      {/if}
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="mcEndingWealthTable">
          <thead class="table-light">
            <tr>
              <th>Metric</th>
              <th class="text-end">Nominal</th>
              <th class="text-end">Real</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.label)}
              {@const real = realValue(row.value, r.years ?? 0, r.inflation_rate ?? 0)}
              <tr>
                <td><strong>{row.label}</strong></td>
                <td class={['text-end', row.bold && 'font-weight-bold', sign(row.value)]}>${djangoMoney(row.value)}</td>
                <td class={['text-end', row.bold && 'font-weight-bold', sign(real)]}>${djangoMoney(real)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
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
      1) Non-portfolio income, regular RMDs, and mandatory Inherited IRA distributions (inherited pre-tax RMDs and inherited Roth scheduled distributions);
      2) Taxable accounts (with capital gains tax gross-up);
      3) Inherited Pre-tax IRAs (penalty-free ordinary income gross-up);
      4) Own Pre-tax accounts (for owner age 59&frac12; or older, penalty-free);
      5) Inherited Roth IRAs (tax-free);
      6) Own Roth accounts (tax-free);
      7) Health Savings Accounts (HSA).
      <strong>Early-withdrawal and inherited IRA exceptions:</strong> Inherited Pre-tax IRAs are exempt from the 10% early withdrawal penalty regardless of age (IRC § 72(t)(2)(A)(ii)) and are drawn before own pre-tax accounts to satisfy their 10-year expiration clock. If an account owner is under age 59&frac12;, discretionary withdrawals from that owner's own Pretax accounts would incur a 10% penalty and are deferred until after Roth accounts and penalty-free HSAs, but ahead of penalized non-medical HSA withdrawals (20% penalty under age 65).
      Pretax accounts of an owner age 59&frac12; or older remain at step 4.
    </p>
  </div>
</div>
