<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import { todayIso } from '../../../plan/pyutil';
  import { addCategoryAccount, addDebt, addMortgage, addProperty } from '../../../plan/bsView';
  import { buildDefaultBalanceSheet } from '../../../plan/balanceSheet';
  import { formatMoney } from '../../../app/format';

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

  const bs = ensureBs();
  const currentPeriod = bs.current_period || today;

  // ---------------------------------------------------------------------------
  // Emergency Fund
  // ---------------------------------------------------------------------------
  const emgCat = bs.categories?.emergency;
  const emgAcc = emgCat?.accounts?.[0];
  let emergencyName = $state(
    emgAcc?.name && emgAcc.name !== 'High-Yield Emergency Savings'
      ? emgAcc.name
      : 'High-Yield Savings'
  );
  const initEmgBal = emgAcc?.values?.[today] ?? emgAcc?.values?.[currentPeriod];
  let emergencyBalance = $state<number | undefined>(
    initEmgBal !== undefined && Number(initEmgBal) > 0 ? Number(initEmgBal) : undefined
  );
  const initEmgTarget = parseFloat(emgCat?.target_amount ?? bs.emergency_goal_amount ?? 0);
  let emergencyTarget = $state<number | undefined>(initEmgTarget > 0 ? initEmgTarget : undefined);
  let emergencyAutoInflate = $state<boolean>(!!emgCat?.target_auto_inflate);
  let emergencySavedFeedback = $state(
    (initEmgBal !== undefined && Number(initEmgBal) > 0) || initEmgTarget > 0
  );

  function saveEmergency() {
    const b = ensureBs();
    const emg = (b.categories.emergency ??= { title: 'Emergency Fund Accounts', accounts: [] });
    emg.target_amount = Number(emergencyTarget) || 0;
    emg.target_auto_inflate = !!emergencyAutoInflate;
    emg.target_base_date ||= currentPeriod;
    b.emergency_goal_amount = Number(emergencyTarget) || 0;

    let acc: any;
    if (emg.accounts && emg.accounts.length > 0) {
      acc = emg.accounts[0];
    } else {
      acc = addCategoryAccount(b, 'emergency');
    }
    acc.name = emergencyName?.trim() || 'High-Yield Savings';
    acc.values = {
      ...(acc.values || {}),
      [currentPeriod]: Number(emergencyBalance) || 0,
      [today]: Number(emergencyBalance) || 0,
    };
    emergencySavedFeedback = true;
  }

  // ---------------------------------------------------------------------------
  // Savings Goals (Multiple Goals)
  // ---------------------------------------------------------------------------
  let addingGoal = $state(false);
  let editingGoalId = $state<string | null>(null);
  let goalDraftName = $state('');
  let goalDraftTarget = $state<number | undefined>(undefined);
  let goalDraftCurrent = $state<number | undefined>(undefined);
  let goalDraftAutoInflate = $state(false);
  let goalsVersion = $state(0);

  function goalAccountBalance(g: any): number {
    if (!g?.accounts || g.accounts.length === 0) return 0;
    const acc = g.accounts[0];
    const val = acc.values?.[today] ?? acc.values?.[currentPeriod];
    return Number(val) || 0;
  }

  const visibleGoals = $derived.by(() => {
    // track version for reactive array updates
    void goalsVersion;
    const groups = (plan.balance_sheet as any)?.categories?.goals?.goal_groups ?? [];
    return groups.filter(
      (g: any) =>
        g.is_configured === true ||
        (Number(g.target_amount) || 0) > 0 ||
        goalAccountBalance(g) > 0 ||
        g.target_auto_inflate === true
    );
  });

  function startAddingGoal(name = '', defaultTarget: number | undefined = undefined) {
    editingGoalId = null;
    goalDraftName = name;
    goalDraftTarget = defaultTarget;
    goalDraftCurrent = undefined;
    goalDraftAutoInflate = true; // default inflation adjustment on for best financial practice
    addingGoal = true;
  }

  function startEditingGoal(g: any) {
    addingGoal = false;
    editingGoalId = g.id;
    goalDraftName = g.name || 'Savings Goal';
    const tgt = Number(g.target_amount) || 0;
    goalDraftTarget = tgt > 0 ? tgt : undefined;
    const cur = goalAccountBalance(g);
    goalDraftCurrent = cur > 0 ? cur : undefined;
    goalDraftAutoInflate = !!g.target_auto_inflate;
  }

  function cancelGoal() {
    addingGoal = false;
    editingGoalId = null;
    goalDraftName = '';
    goalDraftTarget = undefined;
    goalDraftCurrent = undefined;
    goalDraftAutoInflate = false;
  }

  function saveGoalDraft() {
    const b = ensureBs();
    b.categories.goals ??= { title: 'Goal Savings (Sinking Funds)', is_pretax: false, goal_groups: [] };
    b.categories.goals.goal_groups ??= [];
    const groups = b.categories.goals.goal_groups;

    const name = goalDraftName?.trim() || 'Savings Goal';
    const target = Number(goalDraftTarget) || 0;
    const current = Number(goalDraftCurrent) || 0;
    const autoInflate = !!goalDraftAutoInflate;

    if (editingGoalId !== null) {
      const idx = groups.findIndex((item: any) => item.id === editingGoalId);
      if (idx >= 0) {
        const g = groups[idx];
        const updatedAccounts =
          !g.accounts || g.accounts.length === 0
            ? [
                {
                  id: `acc_g_${Date.now()}`,
                  name: `${name} Account`,
                  institution: 'Bank / Custodian',
                  owner: 'user',
                  type: 'cash',
                  include_in_retirement: false,
                  values: { [currentPeriod]: current, [today]: current },
                },
              ]
            : [
                {
                  ...g.accounts[0],
                  name: `${name} Account`,
                  values: {
                    ...(g.accounts[0].values || {}),
                    [currentPeriod]: current,
                    [today]: current,
                  },
                },
                ...g.accounts.slice(1),
              ];

        groups[idx] = {
          ...g,
          name,
          target_amount: target,
          target_auto_inflate: autoInflate,
          target_base_date: g.target_base_date || currentPeriod,
          is_configured: true,
          accounts: updatedAccounts,
        };
      }
    } else {
      // Check if there is an unconfigured placeholder goal with matching or similar name
      const idx = groups.findIndex(
        (item: any) =>
          !item.is_configured &&
          (Number(item.target_amount) || 0) === 0 &&
          goalAccountBalance(item) === 0 &&
          (item.name?.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(item.name?.toLowerCase()))
      );

      if (idx >= 0) {
        const placeholder = groups[idx];
        const updatedAccounts =
          !placeholder.accounts || placeholder.accounts.length === 0
            ? [
                {
                  id: `acc_g_${Date.now()}`,
                  name: `${name} Account`,
                  institution: 'Bank / Custodian',
                  owner: 'user',
                  type: 'cash',
                  include_in_retirement: false,
                  values: { [currentPeriod]: current, [today]: current },
                },
              ]
            : [
                {
                  ...placeholder.accounts[0],
                  name: `${name} Account`,
                  values: {
                    ...(placeholder.accounts[0].values || {}),
                    [currentPeriod]: current,
                    [today]: current,
                  },
                },
                ...placeholder.accounts.slice(1),
              ];

        groups[idx] = {
          ...placeholder,
          name,
          target_amount: target,
          target_auto_inflate: autoInflate,
          target_base_date: currentPeriod,
          is_configured: true,
          accounts: updatedAccounts,
        };
      } else {
        const id = `goal_${Date.now()}`;
        groups.push({
          id,
          name,
          target_amount: target,
          target_auto_inflate: autoInflate,
          target_base_date: currentPeriod,
          is_configured: true,
          accounts: [
            {
              id: `acc_g_${Date.now()}`,
              name: `${name} Account`,
              institution: 'Bank / Custodian',
              owner: 'user',
              type: 'cash',
              include_in_retirement: false,
              values: { [currentPeriod]: current, [today]: current },
            },
          ],
        });
      }
    }

    b.categories.goals.goal_groups = [...groups];
    goalsVersion++;
    cancelGoal();
  }

  function removeGoal(g: any) {
    const b = ensureBs();
    const groups = b.categories?.goals?.goal_groups;
    if (groups) {
      const idx = groups.indexOf(g);
      if (idx >= 0) {
        groups.splice(idx, 1);
        b.categories.goals.goal_groups = [...groups];
        goalsVersion++;
      }
    }
    if (editingGoalId === g.id) {
      cancelGoal();
    }
  }

  // ---------------------------------------------------------------------------
  // Checking Buffer
  // ---------------------------------------------------------------------------
  const dailyCat = bs.categories?.daily;
  const dailyAcc = dailyCat?.accounts?.[0];
  const initChecking = dailyAcc?.values?.[today] ?? dailyAcc?.values?.[currentPeriod];
  let checkingBalance = $state<number | undefined>(
    initChecking !== undefined && Number(initChecking) > 0 ? Number(initChecking) : undefined
  );
  let checkingSaved = $state(initChecking !== undefined && Number(initChecking) > 0);

  function saveChecking() {
    const b = ensureBs();
    let acc: any;
    const accounts = b.categories?.daily?.accounts;
    if (accounts && accounts.length > 0) {
      acc = accounts[0];
    } else {
      acc = addCategoryAccount(b, 'daily');
    }
    acc.name = 'Daily Checking';
    acc.values = {
      ...(acc.values || {}),
      [currentPeriod]: Number(checkingBalance) || 0,
      [today]: Number(checkingBalance) || 0,
    };
    checkingSaved = true;
  }

  // ---------------------------------------------------------------------------
  // Real Estate
  // ---------------------------------------------------------------------------
  const propCat = bs.categories?.real_estate;
  const prop0 = propCat?.properties?.[0];
  let propertyName = $state(prop0?.name || 'Primary Residence');
  const initPropVal = prop0?.market_values?.[today] ?? prop0?.market_values?.[currentPeriod];
  let propertyValue = $state<number | undefined>(
    initPropVal !== undefined && Number(initPropVal) > 0 ? Number(initPropVal) : undefined
  );
  const initMortBal = prop0?.mortgages?.[0]?.balances?.[today] ?? prop0?.mortgages?.[0]?.balances?.[currentPeriod];
  let hasMortgage = $state(initMortBal !== undefined && Number(initMortBal) > 0);
  let mortgageBalance = $state<number | undefined>(
    initMortBal !== undefined && Number(initMortBal) > 0 ? Number(initMortBal) : undefined
  );
  let propertySaved = $state(initPropVal !== undefined && Number(initPropVal) > 0);

  function saveProperty() {
    const b = ensureBs();
    const props = b.categories?.real_estate?.properties;
    let p: any;
    if (props && props.length > 0) {
      p = props[0];
    } else {
      addProperty(b, propertyName || 'Primary Residence');
      p = b.categories?.real_estate?.properties?.[0];
    }
    p.name = propertyName || 'Primary Residence';
    p.market_values = {
      ...(p.market_values || {}),
      [currentPeriod]: Number(propertyValue) || 0,
      [today]: Number(propertyValue) || 0,
    };
    if (hasMortgage && Number(mortgageBalance) > 0) {
      if (!p.mortgages || p.mortgages.length === 0) {
        addMortgage(b, p);
      }
      p.mortgages[0].balances = {
        ...(p.mortgages[0].balances || {}),
        [currentPeriod]: Number(mortgageBalance) || 0,
        [today]: Number(mortgageBalance) || 0,
      };
    }
    propertySaved = true;
  }

  // ---------------------------------------------------------------------------
  // Debts
  // ---------------------------------------------------------------------------
  const debt0 = bs.categories?.debts?.[0];
  let debtName = $state(debt0?.name || 'Auto Loan');
  const initDebtBal = debt0?.values?.[today] ?? debt0?.values?.[currentPeriod];
  let debtBalance = $state<number | undefined>(
    initDebtBal !== undefined && Number(initDebtBal) > 0 ? Number(initDebtBal) : undefined
  );
  let debtSaved = $state(initDebtBal !== undefined && Number(initDebtBal) > 0);

  function saveDebt() {
    const b = ensureBs();
    const debts = b.categories?.debts;
    let d: any;
    if (debts && debts.length > 0) {
      d = debts[0];
    } else {
      addDebt(b, debtName || 'Loan');
      d = b.categories?.debts?.[0];
    }
    d.name = debtName || 'Loan';
    d.values = {
      ...(d.values || {}),
      [currentPeriod]: Number(debtBalance) || 0,
      [today]: Number(debtBalance) || 0,
    };
    debtSaved = true;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function onNext() {
    if (wizard.currentQuestionId === 'nw_emergency') {
      if (
        (Number(emergencyBalance) || 0) > 0 ||
        (Number(emergencyTarget) || 0) > 0 ||
        emergencyAutoInflate
      ) {
        saveEmergency();
      }
    } else if (wizard.currentQuestionId === 'nw_goals') {
      if (addingGoal || editingGoalId !== null) {
        if (
          (goalDraftName && goalDraftName.trim().length > 0) ||
          (Number(goalDraftTarget) || 0) > 0 ||
          (Number(goalDraftCurrent) || 0) > 0
        ) {
          saveGoalDraft();
        } else {
          cancelGoal();
        }
      }
    } else if (wizard.currentQuestionId === 'nw_cash') {
      if ((Number(checkingBalance) || 0) > 0) saveChecking();
    } else if (wizard.currentQuestionId === 'nw_real_estate') {
      if ((Number(propertyValue) || 0) > 0) saveProperty();
    } else if (wizard.currentQuestionId === 'nw_debts') {
      if ((Number(debtBalance) || 0) > 0) saveDebt();
    }
    wizard.markAnswered(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onPrev() {
    if (wizard.currentQuestionId === 'nw_emergency') {
      if (
        (Number(emergencyBalance) || 0) > 0 ||
        (Number(emergencyTarget) || 0) > 0 ||
        emergencyAutoInflate
      ) {
        saveEmergency();
      }
    } else if (wizard.currentQuestionId === 'nw_goals') {
      if (addingGoal || editingGoalId !== null) {
        if (
          (goalDraftName && goalDraftName.trim().length > 0) ||
          (Number(goalDraftTarget) || 0) > 0 ||
          (Number(goalDraftCurrent) || 0) > 0
        ) {
          saveGoalDraft();
        } else {
          cancelGoal();
        }
      }
    }
    wizard.prev(plan);
  }

  function onSkip() {
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'gateway_advanced'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Beyond your accounts intended for your retirement, would you like to track other savings, financial goals, or your overall net worth?
      </h4>
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
            wizard.markAnswered('gateway_advanced');
            wizard.goTo('nw_emergency');
          }}
        >
          <div class="fw-bold fs-5 mb-1">
            <i class="fa-solid fa-list-check me-2"></i>Yes, include emergency fund, non-retirement savings goals, or net worth
          </div>
          <div class="small opacity-75">I want to track emergency savings, goals, home equity, and debts</div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!wizard.optedInStage5 ? 'btn-primary shadow-sm' : 'btn-outline-secondary'}"
          onclick={() => {
            wizard.optedInStage5 = false;
            wizard.markAnswered('gateway_advanced');
            wizard.goTo('review_skipped');
          }}
        >
          <div class="fw-bold fs-5 mb-1">
            <i class="fa-solid fa-bullseye me-2"></i>No, keep it simple and focus just on retirement readiness
          </div>
          <div class="small opacity-75">Skip directly to reviewing my retirement plan results</div>
        </button>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_emergency'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you have a dedicated emergency fund set aside for unexpected life events?
      </h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-shield-halved text-primary me-2"></i>
        Financial planners recommend keeping 3 to 6 months of living expenses in cash or high-yield savings so an unexpected expense (like a car repair or medical bill) never forces you to sell retirement investments at a loss.
      </div>

      <div class="card p-3 p-md-4 bg-light border rounded-3 mb-4" style="max-width: 650px;">
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_em_name" class="form-label small fw-semibold">Account or Bank Name</label>
            <input
              type="text"
              class="form-control"
              id="int_em_name"
              bind:value={emergencyName}
              placeholder="e.g. High-Yield Savings (Ally / Marcus)"
            />
          </div>
          <div class="col-sm-6">
            <label for="int_em_bal" class="form-label small fw-semibold">Current Balance Saved Today</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput
                id="int_em_bal"
                class="form-control"
                bind:value={emergencyBalance}
                placeholder="e.g. 25,000"
              />
            </div>
          </div>
        </div>

        <div class="mb-3">
          <label for="int_em_target" class="form-label small fw-semibold">Target Emergency Fund Goal</label>
          <div class="input-group" style="max-width: 320px;">
            <span class="input-group-text">$</span>
            <MoneyInput
              id="int_em_target"
              class="form-control"
              bind:value={emergencyTarget}
              placeholder="e.g. 30,000"
            />
          </div>
          <div class="form-text small text-muted">
            The target amount you would like to keep as a safety net (typically 3 to 6 months of basic living costs).
          </div>
        </div>

        <div class="p-3 bg-white border rounded-3 mb-3">
          <div class="form-check form-switch mb-1">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="int_em_auto_inflate"
              bind:checked={emergencyAutoInflate}
            />
            <label class="form-check-label fw-semibold text-dark" for="int_em_auto_inflate">
              Automatically adjust target for inflation
            </label>
          </div>
          <div class="small text-muted ps-1">
            Increases your target over time to match inflation (CPI-U) so your safety cushion maintains its real purchasing power.
          </div>
        </div>

        {#if (Number(emergencyTarget) || 0) > 0 && (Number(emergencyBalance) || 0) > 0}
          {@const pct = Math.min(100, Math.round(((Number(emergencyBalance) || 0) / (Number(emergencyTarget) || 1)) * 100))}
          <div class="alert alert-info py-2 px-3 mb-3 small d-flex align-items-center justify-content-between">
            <span>
              <i class="fa-solid fa-chart-pie me-2"></i>
              <strong>{pct}% of target funded</strong>
              {#if (Number(emergencyTarget) || 0) > (Number(emergencyBalance) || 0)}
                (${formatMoney((Number(emergencyTarget) || 0) - (Number(emergencyBalance) || 0))} remaining)
              {:else}
                (Goal fully funded!)
              {/if}
            </span>
          </div>
        {/if}

        <div class="d-flex justify-content-between align-items-center">
          {#if emergencySavedFeedback}
            <span class="text-success small fw-semibold">
              <i class="fa-solid fa-circle-check me-1"></i> Emergency fund saved
            </span>
          {:else}
            <span></span>
          {/if}
          <button type="button" class="btn btn-sm btn-primary" onclick={saveEmergency}>
            Save Emergency Fund
          </button>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_goals'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you have savings in separate accounts for specific upcoming goals or purchases?
      </h4>
      <p class="text-secondary mb-3">
        These are funds earmarked for specific future purchases (like a replacement vehicle, home repairs, or travel) rather than everyday spending or retirement.
      </p>

      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-piggy-bank text-primary me-2"></i>
        In the Balance Sheet, you can see at a glance whether each goal is on track, underfunded, or fully funded, separate from your retirement assets.
      </div>

      <!-- Configured Goals List -->
      {#if visibleGoals.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each visibleGoals as g, i (g.id || i)}
            {@const gBalance = goalAccountBalance(g)}
            <div class="p-3 bg-white border rounded-3 d-flex justify-content-between align-items-center shadow-xs">
              <div>
                <div class="fw-bold text-dark fs-6 d-flex align-items-center gap-2">
                  <span>{g.name || 'Savings Goal'}</span>
                  {#if editingGoalId === g.id}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-secondary mt-1">
                  Target: <strong>${formatMoney(Number(g.target_amount) || 0)}</strong> &bull;
                  Saved Today: <strong>${formatMoney(gBalance)}</strong>
                  {#if g.target_auto_inflate}
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-2">
                      <i class="fa-solid fa-arrow-trend-up me-1"></i>Inflation-Adjusted
                    </span>
                  {/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  onclick={() => startEditingGoal(g)}
                  aria-label="Edit {g.name}"
                  title="Edit"
                >
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  onclick={() => removeGoal(g)}
                  aria-label="Delete {g.name}"
                  title="Delete"
                >
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Preset shortcut buttons when not actively editing/adding -->
      {#if !addingGoal && editingGoalId === null}
        <div class="mb-4" style="max-width: 650px;">
          {#if visibleGoals.length === 0}
            <div class="text-secondary small mb-2 fw-semibold">
              Choose a goal below to get started, or add a custom goal:
            </div>
          {/if}
          <div class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-outline-primary btn-sm px-3"
              onclick={() => startAddingGoal('Vehicle Replacement', 25000)}
            >
              🚗 Vehicle Replacement
            </button>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm px-3"
              onclick={() => startAddingGoal('Home Renovation / Roof', 20000)}
            >
              🏡 Home Repair & Maintenance
            </button>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm px-3"
              onclick={() => startAddingGoal('Vacation & Travel Fund', 10000)}
            >
              ✈️ Vacation & Travel Fund
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm px-3"
              onclick={() => startAddingGoal('New Goal', 15000)}
            >
              ➕ Custom Savings Goal
            </button>
          </div>
        </div>
      {/if}

      <!-- Add / Edit Goal Card Form -->
      {#if addingGoal || editingGoalId !== null}
        <div class="card p-3 p-md-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary mb-0">
              {editingGoalId !== null ? 'Edit Savings Goal' : 'Add a Savings Goal'}
            </h5>
            <button type="button" class="btn-close" aria-label="Cancel" onclick={cancelGoal}></button>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_goal_name" class="form-label small fw-semibold">Goal Name</label>
              <input
                type="text"
                class="form-control"
                id="int_goal_name"
                bind:value={goalDraftName}
                placeholder="e.g. Vehicle Replacement, Vacation"
              />
            </div>
            <div class="col-sm-6">
              <label for="int_goal_target" class="form-label small fw-semibold">Target Goal Amount ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <MoneyInput
                  id="int_goal_target"
                  class="form-control"
                  bind:value={goalDraftTarget}
                  placeholder="e.g. 25,000"
                />
              </div>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_goal_cur" class="form-label small fw-semibold">Current Balance Saved Today ($)</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <MoneyInput
                  id="int_goal_cur"
                  class="form-control"
                  bind:value={goalDraftCurrent}
                  placeholder="e.g. 5,000"
                />
              </div>
              <div class="form-text small text-muted">Amount currently saved toward this goal.</div>
            </div>
          </div>

          <div class="p-3 bg-white border rounded-3 mb-3">
            <div class="form-check form-switch mb-1">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="int_goal_auto_inflate"
                bind:checked={goalDraftAutoInflate}
              />
              <label class="form-check-label fw-semibold text-dark" for="int_goal_auto_inflate">
                Automatically adjust target for inflation
              </label>
            </div>
            <div class="small text-muted ps-1">
              Protects your savings target against rising prices over time (CPI-U).
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick={cancelGoal}>Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" onclick={saveGoalDraft}>
              {editingGoalId !== null ? 'Save Changes' : 'Save Goal'}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'nw_cash'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Roughly how much do you keep in day-to-day checking accounts or cash for monthly living expenses?
      </h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 600px;">
        <i class="fa-solid fa-money-bill-wave text-primary me-2"></i>
        This represents your working cash buffer for regular monthly bills.
      </div>

      <div class="card p-3 p-md-4 bg-light border rounded-3 mb-4" style="max-width: 500px;">
        <label for="int_checking_amt" class="form-label small fw-semibold">Checking / Cash Buffer ($)</label>
        <div class="input-group input-group-lg mb-3">
          <span class="input-group-text">$</span>
          <MoneyInput
            id="int_checking_amt"
            class="form-control fw-bold"
            bind:value={checkingBalance}
            placeholder="e.g. 5,000"
          />
        </div>
        <div class="d-flex justify-content-between align-items-center">
          {#if checkingSaved}
            <span class="text-success small fw-semibold">
              <i class="fa-solid fa-circle-check me-1"></i> Cash buffer saved
            </span>
          {:else}
            <span></span>
          {/if}
          <button type="button" class="btn btn-sm btn-primary" onclick={saveChecking}>Save</button>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_real_estate'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you own your primary home or any other real estate?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-house text-primary me-2"></i>
        Your home equity (Market Value minus Mortgage) may be a major component of your total net worth, even if you never intend to sell.
      </div>

      <div class="card p-3 p-md-4 bg-light border rounded-3 mb-4" style="max-width: 600px;">
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_prop_name" class="form-label small fw-semibold">Property Description</label>
            <input type="text" class="form-control" id="int_prop_name" bind:value={propertyName} />
          </div>
          <div class="col-sm-6">
            <label for="int_prop_val" class="form-label small fw-semibold">Estimated Market Value</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput
                id="int_prop_val"
                class="form-control"
                bind:value={propertyValue}
                placeholder="e.g. 450,000"
              />
            </div>
          </div>
        </div>

        <div class="form-check form-switch mb-3">
          <input
            class="form-check-input"
            type="checkbox"
            role="switch"
            id="int_has_mortgage"
            bind:checked={hasMortgage}
          />
          <label class="form-check-label small fw-semibold" for="int_has_mortgage">
            I have a mortgage on this property
          </label>
        </div>

        {#if hasMortgage}
          <div class="mb-3" style="max-width: 300px;">
            <label for="int_mort_bal" class="form-label small fw-semibold">Mortgage Balance Owed</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput
                id="int_mort_bal"
                class="form-control"
                bind:value={mortgageBalance}
                placeholder="e.g. 180,000"
              />
            </div>
          </div>
        {/if}

        <div class="d-flex justify-content-between align-items-center">
          {#if propertySaved}
            <span class="text-success small fw-semibold">
              <i class="fa-solid fa-circle-check me-1"></i> Real estate saved
            </span>
          {:else}
            <span></span>
          {/if}
          <button type="button" class="btn btn-sm btn-primary" onclick={saveProperty}>Save Real Estate</button>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_debts'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have any other outstanding loans or debts?</h4>
      <div class="alert alert-light border small text-secondary mb-4 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-credit-card text-primary me-2"></i>
        The Personal Balance Sheet subtracts these debts from your assets to display a more true picture of your Gross and Liquid Net Worth over time.
      </div>

      <div class="card p-3 p-md-4 bg-light border rounded-3 mb-4" style="max-width: 550px;">
        <div class="row g-3 mb-3">
          <div class="col-sm-7">
            <label for="int_debt_name" class="form-label small fw-semibold">Debt / Loan Name</label>
            <input
              type="text"
              class="form-control"
              id="int_debt_name"
              bind:value={debtName}
              placeholder="e.g. Auto Loan, Student Loan"
            />
          </div>
          <div class="col-sm-5">
            <label for="int_debt_bal" class="form-label small fw-semibold">Balance Owed</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <MoneyInput
                id="int_debt_bal"
                class="form-control"
                bind:value={debtBalance}
                placeholder="e.g. 12,000"
              />
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center">
          {#if debtSaved}
            <span class="text-success small fw-semibold">
              <i class="fa-solid fa-circle-check me-1"></i> Debt recorded
            </span>
          {:else}
            <span></span>
          {/if}
          <button type="button" class="btn btn-sm btn-primary" onclick={saveDebt}>Save Debt</button>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === 'nw_rebalance'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Would you like to set a target investment mix (Stocks vs. Bonds vs. Cash) to keep your portfolio balanced?
      </h4>
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
    <button type="button" class="btn btn-outline-secondary px-3" onclick={onPrev}>
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
