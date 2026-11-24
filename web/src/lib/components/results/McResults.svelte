<!-- The Results card on the Monte Carlo tab: success rate and ending-wealth
     percentiles, the solved maximum spending for a goal-seeking run, the solved
     retirement age, or the spending statistics of a run under the guardrail rules. -->
<script lang="ts">
  import type { Results } from '../../app/results';
  import { djangoMoney, floatformat, realValue } from '../../app/resultsFormat';
  import { GK_SIMULATION_TYPE, GK_TARGET_SUCCESS_RATE, guardrailSolves, type GuardrailStats } from '../../engine/guardrails';
  import RetirementFrontierExplorer from './RetirementFrontierExplorer.svelte';

  interface Props {
    results: Results;
    onAdopt?: (type: 'spending' | 'retirement_age', value: any) => void;
  }
  let { results: r, onAdopt }: Props = $props();
  const sign = (v: number) => (v >= 0 ? 'text-success' : 'text-danger');
  const rows = $derived([
    { label: 'Mean Ending Wealth', value: r.run_mean, bold: false },
    { label: 'Median Ending Wealth', value: r.run_median, bold: true },
    { label: '25th Percentile Ending Wealth', value: r.run_25, bold: false },
    { label: '10th Percentile Ending Wealth', value: r.run_10, bold: true },
    { label: 'Maximum Wealth', value: r.run_max, bold: false },
    { label: 'Minimum Wealth', value: r.run_min, bold: false },
  ]);

  const successRate = $derived(Math.max(0, Math.min(100, Number(r.run_success) || 0)));
  const assessment = $derived.by(() => {
    if (successRate >= 85) {
      return {
        label: 'High Confidence Plan',
        badgeClass: 'bg-success-subtle text-success border-success-subtle',
        color: '#10b981',
        icon: 'fa-circle-check',
        summary: 'Your retirement portfolio is well-funded to sustain planned spending across diverse market conditions.'
      };
    }
    if (successRate >= 75) {
      return {
        label: 'Solid Foundation',
        badgeClass: 'bg-primary-subtle text-primary border-primary-subtle',
        color: '#3b82f6',
        icon: 'fa-shield-halved',
        summary: 'Your plan holds a reliable foundation, though modest cushion adjustments could further strengthen it.'
      };
    }
    if (successRate >= 60) {
      return {
        label: 'Moderate Risk',
        badgeClass: 'bg-warning-subtle text-warning-emphasis border-warning-subtle',
        color: '#f59e0b',
        icon: 'fa-triangle-exclamation',
        summary: 'Your portfolio experiences shortfalls in severe downturns. Consider minor spending or retirement timing adjustments.'
      };
    }
    return {
      label: 'Shortfall Risk',
      badgeClass: 'bg-danger-subtle text-danger border-danger-subtle',
      color: '#ef4444',
      icon: 'fa-circle-xmark',
      summary: 'High probability of outliving your assets under historical market scenarios. Revision of spending or timing recommended.'
    };
  });

  const solvedGuardrails = $derived(guardrailSolves(r.plan_data_json));

  interface GuardrailActivityRow {
    id: string;
    label: string;
    colorClass: string;
    pctId?: string;
    map: Record<number, number>;
    maxCount: number;
    maxText: string;
  }

  function guardrailActivityData(g: GuardrailStats) {
    const cuts = g.cuts_distribution ?? [{ count: 1, pct: g.pct_runs_cut }];
    const raises = g.raises_distribution ?? [{ count: 1, pct: g.pct_runs_raise }];
    const freezes = g.freezes_distribution ?? [{ count: 1, pct: g.pct_runs_freeze }];

    const cutsMap: Record<number, number> = Object.fromEntries(cuts.map((b) => [b.count, b.pct]));
    const raisesMap: Record<number, number> = Object.fromEntries(raises.map((b) => [b.count, b.pct]));
    const freezesMap: Record<number, number> = Object.fromEntries(freezes.map((b) => [b.count, b.pct]));

    const maxCut = cuts.filter((b) => b.pct > 0).pop()?.count ?? 0;
    const maxRaise = raises.filter((b) => b.pct > 0).pop()?.count ?? 0;
    const maxFreeze = freezes.filter((b) => b.pct > 0).pop()?.count ?? 0;

    const maxObserved = Math.max(maxCut, maxRaise, maxFreeze);
    const numCols = Math.min(4, Math.max(1, maxObserved));
    const colCounts = Array.from({ length: numCols }, (_, i) => i + 1);

    const rows: GuardrailActivityRow[] = [
      {
        id: 'gkActivityCuts',
        label: '10% Spending Cuts',
        colorClass: 'text-danger',
        pctId: 'gkPctCut',
        map: cutsMap,
        maxCount: maxCut,
        maxText: `${maxCut} ${maxCut === 1 ? 'cut' : 'cuts'}`,
      },
      {
        id: 'gkActivityRaises',
        label: '10% Spending Raises',
        colorClass: 'text-success',
        pctId: 'gkPctRaise',
        map: raisesMap,
        maxCount: maxRaise,
        maxText: `${maxRaise} ${maxRaise === 1 ? 'raise' : 'raises'}`,
      },
      {
        id: 'gkActivityFreezes',
        label: 'Inflation Skips',
        colorClass: 'text-secondary',
        pctId: 'gkPctFreeze',
        map: freezesMap,
        maxCount: maxFreeze,
        maxText: `${maxFreeze} ${maxFreeze === 1 ? 'skip' : 'skips'}`,
      },
    ];

    return { colCounts, rows };
  }
  /** The spending table: each amount's statistics across runs, nominal and real. */
  function withdrawalRows(g: GuardrailStats) {
    const row = (label: string, nominal: number, real: number, first = false, bold = false) => ({ label, nominal, real, first, bold });
    return [
      row('Final-Year Regular Retirement Spending: Mean', g.final_withdrawal.mean, g.final_withdrawal_real.mean, true, true),
      row('Final-Year Regular Retirement Spending: Maximum', g.final_withdrawal.max, g.final_withdrawal_real.max),
      row('Final-Year Regular Retirement Spending: Minimum', g.final_withdrawal.min, g.final_withdrawal_real.min),
      row('Peak-Year Regular Retirement Spending: Mean', g.peak_withdrawal.mean, g.peak_withdrawal_real.mean, true, true),
      row('Peak-Year Regular Retirement Spending: Maximum', g.peak_withdrawal.max, g.peak_withdrawal_real.max),
      row('Peak-Year Regular Retirement Spending: Minimum', g.peak_withdrawal.min, g.peak_withdrawal_real.min),
      row('Lowest-Year Regular Retirement Spending: Mean', g.lowest_withdrawal.mean, g.lowest_withdrawal_real.mean, true, true),
    ];
  }
  /** Guaranteed non-portfolio income in real (today's) dollars at retirement start and peak. */
  function essentialCoverage(g: GuardrailStats) {
    const inf = r.inflation_rate ?? 0;
    const retRows = (r.det_rows ?? []).slice(g.start_year_index);
    const realIncomes = retRows.map((row, idx) => realValue(Number(row.income) || 0, g.start_year_index + idx, inf));
    const startIncome = realIncomes[0] ?? 0;
    const peakIncome = realIncomes.length ? Math.max(...realIncomes) : 0;
    return {
      startIncome,
      peakIncome,
      startGap: Math.max(0, g.essential_floor - startIncome),
      peakGap: Math.max(0, g.essential_floor - peakIncome),
    };
  }
</script>

{#snippet gauge()}
  <div class="card bg-light-subtle border text-center p-3 mb-4 shadow-sm rounded-3">
    <div class="radial-gauge-wrapper">
      <svg viewBox="0 10 200 105" class="radial-gauge-svg" role="meter" aria-valuenow={successRate} aria-valuemin="0" aria-valuemax="100" aria-label="Probability of Plan Success">
        <path class="radial-gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" />
        <path class="radial-gauge-fill" d="M 20 100 A 80 80 0 0 1 180 100"
          stroke={assessment.color}
          stroke-dasharray="251.33"
          stroke-dashoffset={251.33 * (1 - successRate / 100)} />
      </svg>
      <div class="radial-gauge-center">
        <span class="display-5 font-weight-bold {sign(r.run_success)}">{floatformat(r.run_success, 1)}%</span>
        <div class="text-secondary small fw-semibold">Probability of Plan Success</div>
      </div>
    </div>
    <div class="mt-1">
      <span class="badge {assessment.badgeClass} border px-3 py-2 fs-6 rounded-pill">
        <i class="fa-solid {assessment.icon} me-1"></i>{assessment.label}
      </span>
      <p class="small text-secondary mt-2 mb-0 px-2" style="max-width: 520px; margin-left: auto; margin-right: auto;">
        {assessment.summary}
      </p>
    </div>
  </div>
{/snippet}

{#snippet endingWealth(id: string)}
  <hr>
  <h5 class="text-secondary mt-3 border-bottom pb-2">Ending Wealth Percentiles</h5>
  {#if r.terminal_life_insurance > 0}
    <div class="alert alert-info py-1 px-2 small mb-2 d-flex align-items-center">
      <i class="fa-solid fa-shield-halved me-2 text-info"></i>
      <span>Includes <strong>${djangoMoney(r.terminal_life_insurance)}</strong> life insurance death benefit paid to estate/heirs.</span>
    </div>
  {/if}
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0" {id}>
      <thead class="table-light">
        <tr>
          <th>Metric</th>
          <th class="text-end">Nominal Dollars</th>
          <th class="text-end">Real Dollars</th>
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
{/snippet}

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
            <div class="display-6 font-weight-bold">
              <div>{r.user_name}: {r.achieved_user_ret_age}</div>
              <div>{r.spouse_name}: {r.achieved_spouse_ret_age}</div>
            </div>
            <p class="small text-muted mb-0 mt-1">
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

        <div class="col-7 mb-2"><strong>Desired Regular Retirement Spending:</strong></div>
        <div class="col-5 text-end">${djangoMoney(r.desired_spending)}/yr</div>
      </div>

      {#if !r.unreachable && r.achieved_user_ret_age}
        <div class="card bg-light border-primary-subtle p-3 mb-3 text-center shadow-sm">
          <div class="fw-semibold text-dark mb-1 fs-6">
            Adopt earliest retirement age ({#if r.is_married && r.achieved_spouse_ret_age !== undefined}{r.achieved_user_ret_age} / {r.achieved_spouse_ret_age}{:else}{r.achieved_user_ret_age}{/if}) into the Plan?
          </div>
          <p class="small text-secondary mb-3">
            Applies this retirement age to your plan and switches back to a regular simulation.
          </p>
          <div>
            <button
              type="button"
              class="btn btn-primary btn-sm px-4 shadow-sm"
              id="btnAdoptEarliestRet"
              onclick={() => onAdopt?.('retirement_age', { user: r.achieved_user_ret_age, spouse: r.achieved_spouse_ret_age })}
            >
              <i class="fa-solid fa-circle-check me-1"></i> Adopt into Plan
            </button>
          </div>
        </div>
      {/if}

      {@render endingWealth('mcEndingWealthTableEarliest')}

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
  {:else if r.simulation_type === GK_SIMULATION_TYPE && r.guardrails}
    {@const g = r.guardrails}
    {@const startYear = (r.current_year ?? 2026) + g.start_year_index}
    {@const act = guardrailActivityData(g)}
    <h3 class="border-bottom pb-2 text-success">Results</h3>
    <div class="mt-3">
      {@render gauge()}

      <div class="alert alert-primary border text-center py-3 mb-3" id="gkStartingWithdrawal">
        <h4 class="mb-1">Starting Regular Retirement Spending</h4>
        <span class="display-5 font-weight-bold">${djangoMoney(g.starting_withdrawal)}</span>
        <span class="fs-5 text-secondary">/yr</span>
        <p class="mb-0 mt-1">
          <strong id="gkStartingPct">{floatformat(g.starting_withdrawal_pct, 1)}%</strong> of the
          {#if g.start_year_index > 0}portfolio at retirement{:else}initial portfolio{/if}
          (${djangoMoney(g.starting_portfolio)}{g.start_year_index > 0 ? ', the average across runs' : ''})
        </p>
        <p class="small text-muted mb-0 mt-1">
          {#if g.start_year_index > 0}
            Retirement Year 0 is {startYear}; ${djangoMoney(g.starting_withdrawal_real)}/yr in today's dollars.
          {/if}
          {#if solvedGuardrails}
            Solved for a {floatformat(GK_TARGET_SUCCESS_RATE, 0)}% success rate under the guardrail rules.
          {:else}
            Your Desired Regular Retirement Spending, as entered.
          {/if}
        </p>
      </div>

      {#if g.essential_floor > 0}
        {@const cov = essentialCoverage(g)}
        {@const floorAlertClass = g.protect_floor
          ? (g.starting_withdrawal_real < g.essential_floor - 1 ? 'alert-danger' : r.run_success < 85 ? 'alert-warning' : 'alert-info')
          : (g.pct_runs_below_floor === 0 ? 'alert-success' : g.pct_runs_below_floor >= 25 ? 'alert-danger' : 'alert-warning')}
        <div class="alert {floorAlertClass} border mb-3" id="gkEssentialFloorCard">
          <div class="fw-bold mb-1">
            {#if g.protect_floor}
              {#if g.starting_withdrawal_real < g.essential_floor - 1}
                <i class="fa-solid fa-triangle-exclamation me-1"></i> Non-Discretionary Expenses Exceed Starting Spending
              {:else}
                <i class="fa-solid fa-shield-halved me-1"></i> Non-Discretionary Spending Protection Active
              {/if}
            {:else if g.pct_runs_below_floor > 0}
              <i class="fa-solid fa-triangle-exclamation me-1"></i> Non-Discretionary Spending Warning
            {:else}
              <i class="fa-solid fa-circle-check me-1"></i> Non-Discretionary Spending Check Passed
            {/if}
          </div>
          <p class="small mb-2">
            {#if g.protect_floor}
              {#if g.starting_withdrawal_real < g.essential_floor - 1}
                Your starting regular retirement spending (<strong>${djangoMoney(g.starting_withdrawal_real)}/yr</strong> in today's dollars) is below your
                <strong>${djangoMoney(g.essential_floor)}/yr</strong> (${djangoMoney(g.essential_floor / 12)}/mo) Annual Non-Discretionary Living Expenses
                (<strong>{floatformat(g.pct_runs_below_floor, 1)}%</strong> of runs fell below that level).
              {:else}
                Guardrails did not cut regular spending or skip inflation raises below your <strong>${djangoMoney(g.essential_floor)}/yr</strong>
                (${djangoMoney(g.essential_floor / 12)}/mo) non-discretionary living expenses (protection activated in <strong>{floatformat(g.pct_runs_floor_protected, 1)}%</strong> of runs).
                Because spending cannot drop below your non-discretionary expenses, severe downturn shortfalls appear directly in your Probability of Plan Success
                (<strong>{floatformat(r.run_success, 1)}%</strong>).
                {#if r.is_married && g.pct_runs_below_floor > 0}
                  In <strong>{floatformat(g.pct_runs_below_floor, 1)}%</strong> of runs, spending fell below your non-discretionary expenses after a first death because your plan's starting surviving-spouse spending was set lower than ${djangoMoney(g.essential_floor)}/yr.
                {/if}
              {/if}
            {:else if g.pct_runs_below_floor > 0}
              Although your portfolio survives <strong>{floatformat(r.run_success, 1)}%</strong> of simulations,
              <strong>{floatformat(g.pct_runs_below_floor, 1)}%</strong> of runs cut regular spending below your
              <strong>${djangoMoney(g.essential_floor)}/yr</strong> (${djangoMoney(g.essential_floor / 12)}/mo) Annual Non-Discretionary Living Expenses—for an average of
              <strong>{floatformat(g.mean_years_below_floor, 1)} {Math.abs(g.mean_years_below_floor - 1) < 0.05 ? 'year' : 'years'}</strong> in those runs,
              dropping as low as <strong>${djangoMoney(g.lowest_withdrawal_real.min)}/yr</strong> (${djangoMoney(g.lowest_withdrawal_real.min / 12)}/mo) in today's dollars.
              To prevent cuts below this baseline, enable <strong>Protect Non-Discretionary Spending</strong> in Simulation Mode or lower your starting spending.
            {:else}
              <strong>0.0%</strong> of simulation runs dropped below your <strong>${djangoMoney(g.essential_floor)}/yr</strong>
              (${djangoMoney(g.essential_floor / 12)}/mo) Annual Non-Discretionary Living Expenses
              (lowest simulated year: <strong>${djangoMoney(g.lowest_withdrawal_real.min)}/yr</strong> in today's dollars).
            {/if}
          </p>
          <div class="small border-top pt-2 mb-0" id="gkEssentialIncomeCoverage">
            <strong>Guaranteed Income vs. Non-Discretionary Expenses (today's dollars):</strong>
            Non-portfolio income (Social Security, pensions) provides <strong>${djangoMoney(cov.startIncome)}/yr</strong> at retirement start,
            leaving <strong>${djangoMoney(cov.startGap)}/yr</strong> of non-discretionary expenses to be covered by your portfolio.
            {#if cov.peakIncome > cov.startIncome + 100}
              Once later income/Social Security starts, guaranteed income reaches <strong>${djangoMoney(cov.peakIncome)}/yr</strong>
              (leaving <strong>${djangoMoney(cov.peakGap)}/yr</strong> from your portfolio).
            {/if}
            <span class="d-block text-muted mt-1">
              Note: Guardrail cuts and inflation skips adjust total Regular Retirement Spending rather than only the portfolio withdrawal portion.
            </span>
          </div>
        </div>
      {/if}

      <p class="mb-3 small text-secondary" id="gkInitialRate">
        <strong>Initial regular retirement spending rate the guardrails are measured against:</strong>
        {floatformat(g.initial_withdrawal_rate, 1)}%{g.start_year_index > 0 ? ' on average' : ''}
        <span class="text-muted">(which is the percentage determined by dividing the amount of the regular retirement spending in the first year of retirement by that year's amount in the Accounts for Retirement; other expenses and income count only through their effect on the portfolio).</span>
      </p>

      <h5 class="text-secondary mt-3 border-bottom pb-2">Guardrail Activity</h5>
      <p class="small text-muted mb-2">Percent of simulation runs where Regular Retirement Spending was adjusted by the guardrails:</p>
      <div id="gkActivity" class="table-responsive mb-3">
        <table class="table table-hover align-middle mb-0" id="gkActivityTable">
          <thead class="table-light">
            <tr>
              <th>Adjustment Type</th>
              {#each act.colCounts as k (k)}
                <th class="text-end">{k === 1 ? '≥ 1 time' : `≥ ${k} times`}</th>
              {/each}
              <th class="text-end">Max in a Run</th>
            </tr>
          </thead>
          <tbody>
            {#each act.rows as row (row.id)}
              <tr id={row.id}>
                <td><strong class={row.colorClass}>{row.label}</strong></td>
                {#each act.colCounts as k (k)}
                  <td class="text-end">
                    {#if row.map[k] !== undefined && (row.map[k] > 0 || (k === 1 && row.maxCount === 0))}
                      <span id={k === 1 ? row.pctId : undefined} class="fw-semibold {row.colorClass}">
                        {floatformat(row.map[k], 1)}%
                      </span>
                    {:else}
                      <span id={k === 1 ? row.pctId : undefined} class="text-muted">—</span>
                    {/if}
                  </td>
                {/each}
                <td class="text-end fw-semibold text-secondary">{row.maxText}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small text-muted mb-3" id="gkCutLimit">
        This simulation is limited to making at most {g.max_cuts} {g.max_cuts === 1 ? 'cut' : 'cuts'} (one for every 10 retirement years, rounded down);
        after that the upper guardrail no longer cuts spending.
        {#if g.pct_runs_cut_limited > 0}In {floatformat(g.pct_runs_cut_limited, 1)}% of runs the guardrail called for a further cut that wasn't made.{/if}
      </p>

      <h5 class="text-secondary mt-3 border-bottom pb-2">Regular Retirement Spending Across Runs</h5>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" id="gkWithdrawalTable">
          <thead class="table-light">
            <tr>
              <th>Metric</th>
              <th class="text-end">Nominal Dollars</th>
              <th class="text-end">Real Dollars</th>
            </tr>
          </thead>
          <tbody>
            {#each withdrawalRows(g) as row (row.label)}
              <tr class={[row.first && 'table-group-divider']}>
                <td><strong>{row.label}</strong></td>
                <td class={['text-end', row.bold && 'font-weight-bold']}>${djangoMoney(row.nominal)}</td>
                <td class={['text-end', row.bold && 'font-weight-bold']}>${djangoMoney(row.real)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small text-muted mt-2 mb-3">
        Regular retirement spending per year, from Retirement Year 0 to the plan's final year{r.is_married ? " (the surviving spouse's spending after a first death)" : ''}.
        Real amounts are in today's dollars.
      </p>

      {@render endingWealth('mcEndingWealthTableGuardrails')}
    </div>
  {:else if !r.goal_seeking}
    <h3 class="border-bottom pb-2 text-success">Results</h3>
    <div class="mt-3">
      {@render gauge()}

      <p class="mb-2"><strong>Desired Regular Retirement Spending:</strong> <span class="dollar-amount-static {sign(r.desired_spending)}">${djangoMoney(r.desired_spending)}</span> <span class="text-secondary">/yr</span></p>
      {@render endingWealth('mcEndingWealthTable')}
    </div>
  {:else}
    <h3 class="border-bottom pb-2 text-primary">Results</h3>
    <div class="mt-3">
      <div class="alert alert-primary border text-center py-3 mb-4">
        <h4 class="mb-1">Maximum Regular Retirement Spending</h4>
        <span class="display-5 font-weight-bold">${djangoMoney(r.achieved_spending)}</span>
        <span class="fs-5 text-secondary">/yr</span>
        <p class="small text-muted mb-0">Initial annual value</p>
      </div>

      <div class="row">
        <div class="col-7 mb-3"><strong>Target Success Rate:</strong></div>
        <div class="col-5 text-end">{floatformat(r.target_success_rate, 1)}%</div>

        <div class="col-7 mb-3"><strong>Achieved Success Rate:</strong></div>
        <div class="col-5 text-end text-success font-weight-bold">{floatformat(r.achieved_success_rate, 1)}%</div>
      </div>

      {#if r.achieved_spending}
        <div class="card bg-light border-success-subtle p-3 mb-3 text-center shadow-sm">
          <div class="fw-semibold text-dark mb-1 fs-6">
            Adopt Solved Spending (${djangoMoney(r.achieved_spending)}/yr) into the Plan?
          </div>
          <p class="small text-secondary mb-3">
            Applies this annual spending amount to your plan and switches back to a regular simulation.
          </p>
          <div>
            <button
              type="button"
              class="btn btn-success btn-sm px-4 shadow-sm"
              id="btnAdoptMaxSpending"
              onclick={() => onAdopt?.('spending', r.achieved_spending)}
            >
              <i class="fa-solid fa-circle-check me-1"></i> Adopt into Plan
            </button>
          </div>
        </div>
      {/if}
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
