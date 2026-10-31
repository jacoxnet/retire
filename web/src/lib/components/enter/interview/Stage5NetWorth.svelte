<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import { todayIso } from '../../../plan/pyutil';
  import { addCategoryAccount, addDebt, addGoalGroup, addMortgage, addProperty } from '../../../plan/bsView';
  import { buildDefaultBalanceSheet } from '../../../plan/balanceSheet';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const today = todayIso();

  function ensureBs() {
    plan.balance_sheet ??= buildDefaultBalanceSheet(null, plan.current_year ?? 2026, plan, today);
    const bs = plan.balance_sheet as Record<string, any>;
    bs.periods ??= [today];
    bs.categories ??= {};
    return bs;
  }

  // Local state for stage 5 items
  let emergencyName = $state('High-Yield Savings');
  let emergencyBalance = $state(25000);
  let emergencyAdded = $state(false);

  let checkingBalance = $state(5000);
  let checkingAdded = $state(false);

  let propertyName = $state('Primary Residence');
  let propertyValue = $state(450000);
  let hasMortgage = $state(true);
  let mortgageBalance = $state(180000);
  let propertyAdded = $state(false);

  let debtName = $state('Auto Loan');
  let debtBalance = $state(12000);
  let debtAdded = $state(false);

  let goalName = $state('New Car Fund');
  let goalTarget = $state(30000);
  let goalCurrent = $state(10000);
  let goalAdded = $state(false);

  function saveEmergency() {
    const bs = ensureBs();
    const acc = addCategoryAccount(bs, 'emergency');
    acc.name = emergencyName || 'Emergency Fund';
    acc.values = { [today]: Number(emergencyBalance) || 0 };
    emergencyAdded = true;
  }

  function saveChecking() {
    const bs = ensureBs();
    const acc = addCategoryAccount(bs, 'daily');
    acc.name = 'Daily Checking';
    acc.values = { [today]: Number(checkingBalance) || 0 };
    checkingAdded = true;
  }

  function saveProperty() {
    const bs = ensureBs();
    addProperty(bs, propertyName || 'Primary Residence');
    const props = bs.categories?.real_estate?.properties;
    if (props && props.length > 0) {
      const p = props[props.length - 1];
      p.market_values = { [today]: Number(propertyValue) || 0 };
      if (hasMortgage && Number(mortgageBalance) > 0) {
        addMortgage(bs, p);
        if (p.mortgages && p.mortgages.length > 0) {
          p.mortgages[0].balances = { [today]: Number(mortgageBalance) || 0 };
        }
      }
    }
    propertyAdded = true;
  }

  function saveDebt() {
    const bs = ensureBs();
    addDebt(bs, debtName || 'Loan');
    const debts = bs.categories?.debts;
    if (debts && debts.length > 0) {
      debts[debts.length - 1].values = { [today]: Number(debtBalance) || 0 };
    }
    debtAdded = true;
  }

  function saveGoal() {
    const bs = ensureBs();
    addGoalGroup(bs, goalName || 'Goal Fund', Number(goalTarget) || 0);
    const groups = bs.categories?.goals?.goal_groups;
    if (groups && groups.length > 0) {
      const g = groups[groups.length - 1];
      if (g.accounts && g.accounts.length > 0) {
        g.accounts[0].values = { [today]: Number(goalCurrent) || 0 };
      }
    }
    goalAdded = true;
  }

  function onNext() {
    wizard.clearSkipped(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'gateway_advanced'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Beyond your accounts intended for your retirement, would you like to track other savings, financial goals, or your overall net worth?</h4>
      <p class="text-secondary mb-3">
        This helps you organize savings separate from retirement and see your complete financial picture.
      </p>

      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-scale-balanced text-primary me-2"></i>
        Amounts held for retirement are meant for your long-term future. Emergency reserves and near-term savings goals are meant for today and the next few years. Tracking them together may give you a more comprehensive view of your balance sheet.
      </div>

      <div class="d-flex flex-column gap-3 mb-4" style="max-width: 550px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {wizard.optedInStage5 ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            wizard.optedInStage5 = true;
            wizard.goTo('nw_emergency');
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-list-check me-2"></i>Yes, include emergency fund, non-retirement savings goals, or net worth</div>
          <div class="small opacity-75">I want to track emergency savings, goals, home equity, and debts</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!wizard.optedInStage5 ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            wizard.optedInStage5 = false;
            wizard.goTo('review_skipped');
          }}
        >
          <div class="fw-bold fs-5 mb-1"><i class="fa-solid fa-bullseye me-2"></i>No, keep it simple and focus just on retirement readiness</div>
          <div class="small opacity-75">Skip directly to reviewing my retirement plan results</div>
        </button>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_emergency'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have a dedicated emergency fund set aside for unexpected life events?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-shield-halved text-primary me-2"></i>
        Financial planners recommend keeping 3 to 6 months of living expenses in cash or high-yield savings so an unexpected expense (like a car repair or medical bill) never forces you to sell retirement investments at a loss.
      </div>

      {#if emergencyAdded}
        <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-3 small" style="max-width: 500px;">
          <i class="fa-solid fa-circle-check me-2"></i>
          <span>Emergency fund saved: <strong>{emergencyName}</strong> (${Number(emergencyBalance).toLocaleString()})</span>
        </div>
      {:else}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 550px;">
          <div class="row g-3 mb-3">
            <div class="col-sm-7">
              <label for="int_em_name" class="form-label small fw-semibold">Account / Institution Name</label>
              <input type="text" class="form-control form-control-sm" id="int_em_name" bind:value={emergencyName} />
            </div>
            <div class="col-sm-5">
              <label for="int_em_bal" class="form-label small fw-semibold">Current Balance ($)</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_em_bal" class="form-control" bind:value={emergencyBalance} />
              </div>
            </div>
          </div>
          <div class="text-end">
            <button type="button" class="btn btn-sm btn-primary" onclick={saveEmergency}>Save Emergency Fund</button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_goals'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have savings in separate accounts for specific upcoming goals or purchases?</h4>
      <p class="text-secondary mb-3">
        These are funds earmarked for a specific purpose rather than everyday spending or retirement.
      </p>

      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-piggy-bank text-primary me-2"></i>
        In the app's Balance Sheet, you can see at a glance whether each goal is on track, underfunded, or fully funded.
      </div>

      {#if goalAdded}
        <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-3 small" style="max-width: 500px;">
          <i class="fa-solid fa-circle-check me-2"></i>
          <span>Goal fund saved: <strong>{goalName}</strong> (Target: ${Number(goalTarget).toLocaleString()})</span>
        </div>
      {:else}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 600px;">
          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_goal_name" class="form-label small fw-semibold">Goal Name</label>
              <input type="text" class="form-control form-control-sm" id="int_goal_name" bind:value={goalName} placeholder="e.g. Vacation Fund, New Car" />
            </div>
            <div class="col-sm-6">
              <label for="int_goal_target" class="form-label small fw-semibold">Target Goal Amount</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_goal_target" class="form-control" bind:value={goalTarget} />
              </div>
            </div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_goal_cur" class="form-label small fw-semibold">Current Balance Saved Today</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_goal_cur" class="form-control" bind:value={goalCurrent} />
              </div>
            </div>
          </div>
          <div class="text-end">
            <button type="button" class="btn btn-sm btn-primary" onclick={saveGoal}>Save Goal Fund</button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_cash'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Roughly how much do you keep in day-to-day checking accounts or cash for monthly living expenses?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-money-bill-wave text-primary me-2"></i>
        This represents your working cash buffer for regular monthly bills.
      </div>

      {#if checkingAdded}
        <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-3 small" style="max-width: 450px;">
          <i class="fa-solid fa-circle-check me-2"></i>
          <span>Checking cash buffer saved (${Number(checkingBalance).toLocaleString()})</span>
        </div>
      {:else}
        <div class="d-flex align-items-center gap-3 mb-4" style="max-width: 450px;">
          <div class="input-group input-group-lg">
            <span class="input-group-text">$</span>
            <MoneyInput id="int_checking_amt" class="form-control fw-bold" bind:value={checkingBalance} />
          </div>
          <button type="button" class="btn btn-primary" onclick={saveChecking}>Save</button>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_real_estate'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you own your primary home or any other real estate?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-house text-primary me-2"></i>
        Your home equity (Market Value minus Mortgage) may be a major component of your total net worth, even if you never intend to sell.
      </div>

      {#if propertyAdded}
        <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-3 small" style="max-width: 500px;">
          <i class="fa-solid fa-circle-check me-2"></i>
          <span>Real estate saved: <strong>{propertyName}</strong> (${Number(propertyValue).toLocaleString()})</span>
        </div>
      {:else}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 600px;">
          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_prop_name" class="form-label small fw-semibold">Property Description</label>
              <input type="text" class="form-control form-control-sm" id="int_prop_name" bind:value={propertyName} />
            </div>
            <div class="col-sm-6">
              <label for="int_prop_val" class="form-label small fw-semibold">Estimated Market Value</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_prop_val" class="form-control" bind:value={propertyValue} />
              </div>
            </div>
          </div>

          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="int_has_mortgage" bind:checked={hasMortgage} />
            <label class="form-check-label small fw-semibold" for="int_has_mortgage">
              I have a mortgage on this property
            </label>
          </div>

          {#if hasMortgage}
            <div class="mb-3" style="max-width: 250px;">
              <label for="int_mort_bal" class="form-label small fw-semibold">Mortgage Balance Owed</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_mort_bal" class="form-control" bind:value={mortgageBalance} />
              </div>
            </div>
          {/if}

          <div class="text-end">
            <button type="button" class="btn btn-sm btn-primary" onclick={saveProperty}>Save Real Estate</button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_debts'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have any other outstanding loans or debts?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-credit-card text-primary me-2"></i>
        The Personal Balance Sheet subtracts these debts from your assets to display a more true picture of your Gross and Liquid Net Worth over time.
      </div>

      {#if debtAdded}
        <div class="alert alert-success d-flex align-items-center py-2 px-3 mb-3 small" style="max-width: 500px;">
          <i class="fa-solid fa-circle-check me-2"></i>
          <span>Debt recorded: <strong>{debtName}</strong> (${Number(debtBalance).toLocaleString()})</span>
        </div>
      {:else}
        <div class="card p-3 bg-light border rounded-3 mb-4" style="max-width: 550px;">
          <div class="row g-3 mb-3">
            <div class="col-sm-7">
              <label for="int_debt_name" class="form-label small fw-semibold">Debt / Loan Name</label>
              <input type="text" class="form-control form-control-sm" id="int_debt_name" bind:value={debtName} placeholder="e.g. Auto Loan, Student Loan" />
            </div>
            <div class="col-sm-5">
              <label for="int_debt_bal" class="form-label small fw-semibold">Balance Owed</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <MoneyInput id="int_debt_bal" class="form-control" bind:value={debtBalance} />
              </div>
            </div>
          </div>
          <div class="text-end">
            <button type="button" class="btn btn-sm btn-primary" onclick={saveDebt}>Save Debt</button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_rebalance'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Would you like to set a target investment mix (Stocks vs. Bonds vs. Cash) to keep your portfolio balanced?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-arrows-rotate text-primary me-2"></i>
        Over time, stock market gains can make your portfolio riskier than you intended. The Rebalance tool checks your current holdings against this target and shows you exactly what to buy or sell to restore balance.
      </div>

      <div class="d-flex flex-column gap-2 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">60% Stocks / 40% Bonds (Traditional Balanced - Recommended)</div>
          <div class="small opacity-75">Standard growth with bond stability for retirement</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">80% Stocks / 20% Bonds (Growth Focus)</div>
          <div class="small opacity-75">Higher long-term growth with higher volatility</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">40% Stocks / 60% Bonds (Conservative)</div>
          <div class="small opacity-75">Lower volatility focused on capital preservation</div>
        </button>
      </div>
    </div>
  {/if}

  <!-- Footer Actions -->
  <div class="d-flex justify-content-between align-items-center pt-4 border-top mt-4">
    <button type="button" class="btn btn-outline-secondary px-3" onclick={() => wizard.prev(plan)}>
      <i class="fa-solid fa-arrow-left me-1"></i> Back
    </button>

    <div class="d-flex align-items-center gap-3">
      <button type="button" class="btn btn-link text-muted p-0 small" onclick={onSkip}>
        Skip for now
      </button>

      <button type="button" class="btn btn-primary px-4 fw-semibold" onclick={onNext}>
        Next <i class="fa-solid fa-arrow-right ms-1"></i>
      </button>
    </div>
  </div>
</div>
