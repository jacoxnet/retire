<script lang="ts">
  import type { InterviewState } from "./interviewState.svelte";
  import type { Plan } from "../../../plan/types";
  import MoneyInput from "../../shared/MoneyInput.svelte";
  import { todayIso } from "../../../plan/pyutil";
  import {
    addCategoryAccount,
    addDebt,
    addMortgage,
    addProperty,
  } from "../../../plan/bsView";
  import { buildDefaultBalanceSheet } from "../../../plan/balanceSheet";
  import { formatMoney } from "../../../app/format";

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const today = todayIso();

  function ensureBs() {
    plan.balance_sheet ??= buildDefaultBalanceSheet(
      null,
      plan.current_year ?? 2026,
      plan,
      today,
    );
    const bs = plan.balance_sheet as Record<string, any>;
    bs.periods ??= [today];
    bs.categories ??= {};
    return bs;
  }

  const bs = ensureBs();
  const currentPeriod = bs.current_period || today;

  // ---------------------------------------------------------------------------
  // Emergency Fund (Multiple Accounts Supported)
  // ---------------------------------------------------------------------------
  interface EmgAccountDraft {
    id?: string;
    name: string;
    balance: number | undefined;
    institution?: string;
    values?: Record<string, number>;
  }

  const emgCat = bs.categories?.emergency;
  const existingEmgAccounts: any[] = emgCat?.accounts ?? [];

  let emergencyAccounts = $state<EmgAccountDraft[]>(
    existingEmgAccounts.length > 0
      ? existingEmgAccounts.map((a: any, idx: number) => {
          const val = a.values?.[today] ?? a.values?.[currentPeriod];
          const defaultName =
            idx === 0 ? "High-Yield Savings" : `Emergency Account ${idx + 1}`;
          const rawName =
            a.name === "High-Yield Emergency Savings"
              ? "High-Yield Savings"
              : a.name;
          return {
            id: a.id,
            name: rawName || defaultName,
            balance:
              val !== undefined && Number(val) > 0 ? Number(val) : undefined,
            institution: a.institution || "Bank / Custodian",
            values: a.values ? { ...a.values } : undefined,
          };
        })
      : [
          {
            name: "High-Yield Savings",
            balance: undefined,
            institution: "Bank / Custodian",
          },
        ],
  );

  const initEmgTarget = parseFloat(
    emgCat?.target_amount ?? bs.emergency_goal_amount ?? 0,
  );
  let emergencyTarget = $state<number | undefined>(
    initEmgTarget > 0 ? initEmgTarget : undefined,
  );
  let emergencyAutoInflate = $state<boolean>(!!emgCat?.target_auto_inflate);

  const initTotalEmg = emergencyAccounts.reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0,
  );
  const totalEmergencyBalance = $derived(
    emergencyAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
  );

  let emergencySavedFeedback = $state(initTotalEmg > 0 || initEmgTarget > 0);

  function addEmergencyAccount() {
    emergencyAccounts.push({
      name: `Emergency Savings ${emergencyAccounts.length + 1}`,
      balance: undefined,
      institution: "Bank / Custodian",
    });
  }

  function removeEmergencyAccount(index: number) {
    if (emergencyAccounts.length > 1) {
      emergencyAccounts.splice(index, 1);
    } else {
      emergencyAccounts[0].name = "High-Yield Savings";
      emergencyAccounts[0].balance = undefined;
    }
  }

  function saveEmergency() {
    const b = ensureBs();
    const emg = (b.categories.emergency ??= {
      title: "Emergency Fund Accounts",
      accounts: [],
    });
    emg.target_amount = Number(emergencyTarget) || 0;
    emg.target_auto_inflate = !!emergencyAutoInflate;
    emg.target_base_date ||= currentPeriod;
    b.emergency_goal_amount = Number(emergencyTarget) || 0;

    const validAccounts = emergencyAccounts.filter(
      (a) =>
        (a.name && a.name.trim().length > 0) || (Number(a.balance) || 0) > 0,
    );

    if (validAccounts.length === 0) {
      validAccounts.push({
        name: "High-Yield Savings",
        balance: undefined,
        institution: "Bank / Custodian",
      });
    }

    emg.accounts = validAccounts.map((a, idx) => {
      const bal = Number(a.balance) || 0;
      return {
        id: a.id || `acc_emg_${Date.now()}_${idx}`,
        name: a.name?.trim() || `Emergency Savings ${idx + 1}`,
        institution: a.institution || "Bank / Custodian",
        owner: "user",
        type: "cash",
        include_in_retirement: false,
        values: {
          ...(a.values || {}),
          [currentPeriod]: bal,
          [today]: bal,
        },
      };
    });

    emergencySavedFeedback = true;
  }

  // ---------------------------------------------------------------------------
  // Savings Goals (Multiple Goals & Multiple Accounts Supported)
  // ---------------------------------------------------------------------------
  interface GoalAccountDraft {
    id?: string;
    name: string;
    balance: number | undefined;
    institution?: string;
    values?: Record<string, number>;
  }

  let addingGoal = $state(false);
  let editingGoalId = $state<string | null>(null);
  let goalDraftName = $state("");
  let goalDraftTarget = $state<number | undefined>(undefined);
  let goalDraftAccounts = $state<GoalAccountDraft[]>([]);
  let goalDraftAutoInflate = $state(false);
  let goalsVersion = $state(0);

  function goalAccountBalance(g: any): number {
    if (!g?.accounts || !Array.isArray(g.accounts)) return 0;
    return g.accounts.reduce((sum: number, acc: any) => {
      const val = acc.values?.[today] ?? acc.values?.[currentPeriod];
      return sum + (Number(val) || 0);
    }, 0);
  }

  const totalGoalDraftBalance = $derived(
    goalDraftAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
  );

  const visibleGoals = $derived.by(() => {
    // track version for reactive array updates
    void goalsVersion;
    const groups =
      (plan.balance_sheet as any)?.categories?.goals?.goal_groups ?? [];
    return groups.filter(
      (g: any) =>
        g.is_configured === true ||
        (Number(g.target_amount) || 0) > 0 ||
        goalAccountBalance(g) > 0 ||
        g.target_auto_inflate === true,
    );
  });

  function startAddingGoal(
    name = "",
    defaultTarget: number | undefined = undefined,
  ) {
    editingGoalId = null;
    goalDraftName = name;
    goalDraftTarget = defaultTarget;
    goalDraftAccounts = [
      {
        name: name ? `${name} Account` : "Savings Account",
        balance: undefined,
        institution: "Bank / Custodian",
      },
    ];
    goalDraftAutoInflate = true; // default inflation adjustment on for best financial practice
    addingGoal = true;
  }

  function startEditingGoal(g: any) {
    addingGoal = false;
    editingGoalId = g.id;
    goalDraftName = g.name || "Savings Goal";
    const tgt = Number(g.target_amount) || 0;
    goalDraftTarget = tgt > 0 ? tgt : undefined;
    if (g.accounts && g.accounts.length > 0) {
      goalDraftAccounts = g.accounts.map((a: any, idx: number) => {
        const val = a.values?.[today] ?? a.values?.[currentPeriod];
        return {
          id: a.id,
          name: a.name || `${goalDraftName} Account ${idx + 1}`,
          balance:
            val !== undefined && Number(val) > 0 ? Number(val) : undefined,
          institution: a.institution || "Bank / Custodian",
          values: a.values ? { ...a.values } : undefined,
        };
      });
    } else {
      goalDraftAccounts = [
        {
          name: `${goalDraftName} Account`,
          balance: undefined,
          institution: "Bank / Custodian",
        },
      ];
    }
    goalDraftAutoInflate = !!g.target_auto_inflate;
  }

  function cancelGoal() {
    addingGoal = false;
    editingGoalId = null;
    goalDraftName = "";
    goalDraftTarget = undefined;
    goalDraftAccounts = [];
    goalDraftAutoInflate = false;
  }

  function addGoalDraftAccount() {
    const defaultName = goalDraftName?.trim()
      ? `${goalDraftName.trim()} Account ${goalDraftAccounts.length + 1}`
      : `Savings Account ${goalDraftAccounts.length + 1}`;
    goalDraftAccounts.push({
      name: defaultName,
      balance: undefined,
      institution: "Bank / Custodian",
    });
  }

  function removeGoalDraftAccount(index: number) {
    if (goalDraftAccounts.length > 1) {
      goalDraftAccounts.splice(index, 1);
    } else {
      goalDraftAccounts[0].name = goalDraftName
        ? `${goalDraftName} Account`
        : "Savings Account";
      goalDraftAccounts[0].balance = undefined;
    }
  }

  function saveGoalDraft() {
    const b = ensureBs();
    b.categories.goals ??= {
      title: "Goal Savings (Sinking Funds)",
      is_pretax: false,
      goal_groups: [],
    };
    b.categories.goals.goal_groups ??= [];
    const groups = b.categories.goals.goal_groups;

    const name = goalDraftName?.trim() || "Savings Goal";
    const target = Number(goalDraftTarget) || 0;
    const autoInflate = !!goalDraftAutoInflate;

    const validDraftAccounts = goalDraftAccounts.filter(
      (a) =>
        (a.name && a.name.trim().length > 0) || (Number(a.balance) || 0) > 0,
    );
    if (validDraftAccounts.length === 0) {
      validDraftAccounts.push({
        name: `${name} Account`,
        balance: undefined,
        institution: "Bank / Custodian",
      });
    }

    const builtAccounts = validDraftAccounts.map((a, idx) => {
      const cur = Number(a.balance) || 0;
      return {
        id: a.id || `acc_g_${Date.now()}_${idx}`,
        name: a.name?.trim() || `${name} Account ${idx + 1}`,
        institution: a.institution || "Bank / Custodian",
        owner: "user",
        type: "cash",
        include_in_retirement: false,
        values: {
          ...(a.values || {}),
          [currentPeriod]: cur,
          [today]: cur,
        },
      };
    });

    if (editingGoalId !== null) {
      const idx = groups.findIndex((item: any) => item.id === editingGoalId);
      if (idx >= 0) {
        const g = groups[idx];
        groups[idx] = {
          ...g,
          name,
          target_amount: target,
          target_auto_inflate: autoInflate,
          target_base_date: g.target_base_date || currentPeriod,
          is_configured: true,
          accounts: builtAccounts,
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
            name.toLowerCase().includes(item.name?.toLowerCase())),
      );

      if (idx >= 0) {
        const placeholder = groups[idx];
        groups[idx] = {
          ...placeholder,
          name,
          target_amount: target,
          target_auto_inflate: autoInflate,
          target_base_date: currentPeriod,
          is_configured: true,
          accounts: builtAccounts,
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
          accounts: builtAccounts,
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
  const initChecking =
    dailyAcc?.values?.[today] ?? dailyAcc?.values?.[currentPeriod];
  let checkingBalance = $state<number | undefined>(
    initChecking !== undefined && Number(initChecking) > 0
      ? Number(initChecking)
      : undefined,
  );
  let checkingSaved = $state(
    initChecking !== undefined && Number(initChecking) > 0,
  );

  function saveChecking() {
    const b = ensureBs();
    let acc: any;
    const accounts = b.categories?.daily?.accounts;
    if (accounts && accounts.length > 0) {
      acc = accounts[0];
    } else {
      acc = addCategoryAccount(b, "daily");
    }
    acc.name = "Daily Checking";
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
  let propertyName = $state(prop0?.name || "Primary Residence");
  const initPropVal =
    prop0?.market_values?.[today] ?? prop0?.market_values?.[currentPeriod];
  let propertyValue = $state<number | undefined>(
    initPropVal !== undefined && Number(initPropVal) > 0
      ? Number(initPropVal)
      : undefined,
  );
  const initMortBal =
    prop0?.mortgages?.[0]?.balances?.[today] ??
    prop0?.mortgages?.[0]?.balances?.[currentPeriod];
  let hasMortgage = $state(
    initMortBal !== undefined && Number(initMortBal) > 0,
  );
  let mortgageBalance = $state<number | undefined>(
    initMortBal !== undefined && Number(initMortBal) > 0
      ? Number(initMortBal)
      : undefined,
  );
  let propertySaved = $state(
    initPropVal !== undefined && Number(initPropVal) > 0,
  );

  function saveProperty() {
    const b = ensureBs();
    const props = b.categories?.real_estate?.properties;
    let p: any;
    if (props && props.length > 0) {
      p = props[0];
    } else {
      addProperty(b, propertyName || "Primary Residence");
      p = b.categories?.real_estate?.properties?.[0];
    }
    p.name = propertyName || "Primary Residence";
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
  let debtName = $state(debt0?.name || "Auto Loan");
  const initDebtBal = debt0?.values?.[today] ?? debt0?.values?.[currentPeriod];
  let debtBalance = $state<number | undefined>(
    initDebtBal !== undefined && Number(initDebtBal) > 0
      ? Number(initDebtBal)
      : undefined,
  );
  let debtSaved = $state(initDebtBal !== undefined && Number(initDebtBal) > 0);

  function saveDebt() {
    const b = ensureBs();
    const debts = b.categories?.debts;
    let d: any;
    if (debts && debts.length > 0) {
      d = debts[0];
    } else {
      addDebt(b, debtName || "Loan");
      d = b.categories?.debts?.[0];
    }
    d.name = debtName || "Loan";
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
    if (wizard.currentQuestionId === "nw_emergency") {
      if (
        totalEmergencyBalance > 0 ||
        (Number(emergencyTarget) || 0) > 0 ||
        emergencyAutoInflate
      ) {
        saveEmergency();
      }
    } else if (wizard.currentQuestionId === "nw_goals") {
      if (addingGoal || editingGoalId !== null) {
        if (
          (goalDraftName && goalDraftName.trim().length > 0) ||
          (Number(goalDraftTarget) || 0) > 0 ||
          totalGoalDraftBalance > 0
        ) {
          saveGoalDraft();
        } else {
          cancelGoal();
        }
      }
    } else if (wizard.currentQuestionId === "nw_cash") {
      if ((Number(checkingBalance) || 0) > 0) saveChecking();
    } else if (wizard.currentQuestionId === "nw_real_estate") {
      if ((Number(propertyValue) || 0) > 0) saveProperty();
    } else if (wizard.currentQuestionId === "nw_debts") {
      if ((Number(debtBalance) || 0) > 0) saveDebt();
    }
    wizard.markAnswered(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onPrev() {
    if (wizard.currentQuestionId === "nw_emergency") {
      if (
        totalEmergencyBalance > 0 ||
        (Number(emergencyTarget) || 0) > 0 ||
        emergencyAutoInflate
      ) {
        saveEmergency();
      }
    } else if (wizard.currentQuestionId === "nw_goals") {
      if (addingGoal || editingGoalId !== null) {
        if (
          (goalDraftName && goalDraftName.trim().length > 0) ||
          (Number(goalDraftTarget) || 0) > 0 ||
          totalGoalDraftBalance > 0
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
  {#if wizard.currentQuestionId === "gateway_advanced"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Beyond your accounts intended for your retirement, would you like to
        track other savings, financial goals, or your overall net worth?
      </h4>
      <p class="text-secondary mb-3">
        This helps you organize savings separate from retirement and see your
        complete financial picture.
      </p>

      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-scale-balanced text-primary me-2"></i>
        Amounts held for retirement are meant for your long-term future. Emergency
        reserves and near-term savings goals are meant for today and the next few
        years. Tracking them together may give you a more comprehensive view of your
        balance sheet.
      </div>

      <div class="d-flex flex-column gap-3 mb-4" style="max-width: 550px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {wizard.optedInStage5
            ? 'btn-primary shadow-sm'
            : 'btn-outline-secondary'}"
          onclick={() => {
            wizard.optedInStage5 = true;
            wizard.markAnswered("gateway_advanced");
            wizard.goTo("nw_emergency");
          }}
        >
          <div class="fw-bold fs-5 mb-1">
            <i class="fa-solid fa-list-check me-2"></i>Yes, include emergency
            fund, non-retirement savings goals, or net worth
          </div>
          <div class="small opacity-75">
            I want to track emergency savings, goals, home equity, and debts
          </div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start {!wizard.optedInStage5
            ? 'btn-primary shadow-sm'
            : 'btn-outline-secondary'}"
          onclick={() => {
            wizard.optedInStage5 = false;
            wizard.markAnswered("gateway_advanced");
            wizard.goTo("review_skipped");
          }}
        >
          <div class="fw-bold fs-5 mb-1">
            <i class="fa-solid fa-bullseye me-2"></i>No, keep it simple and
            focus just on retirement readiness
          </div>
          <div class="small opacity-75">
            Skip directly to reviewing my retirement plan results
          </div>
        </button>
      </div>
    </div>
  {:else if wizard.currentQuestionId === "nw_emergency"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you have a dedicated emergency fund set aside for unexpected life
        events?
      </h4>
      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-shield-halved text-primary me-2"></i>
        Financial planners recommend keeping 3 to 6 months of living expenses in
        cash or high-yield savings so an unexpected expense (like a car repair or
        medical bill) never forces you to sell retirement investments at a loss.
      </div>

      <div
        class="card p-3 p-md-4 bg-light border rounded-3 mb-4"
        style="max-width: 650px;"
      >
        <!-- 1. Emergency Fund Target & Goal (displayed first, consistent with savings goals) -->
        <div class="mb-3">
          <label for="int_em_target" class="form-label small fw-semibold"
            >Target Emergency Fund Goal ($)</label
          >
          <div class="input-group" style="max-width: 320px;">
            <span class="input-group-text">$</span>
            <MoneyInput
              id="int_em_target"
              class="form-control"
              bind:value={emergencyTarget}
              placeholder="e.g. 50,000"
            />
          </div>
          <div class="form-text small text-muted">
            The target amount you would like to keep as a safety net (typically
            3 to 6 months of basic living costs).
          </div>
        </div>

        <div class="p-3 bg-white border rounded-3 mb-4">
          <div class="form-check form-switch mb-1">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="int_em_auto_inflate"
              bind:checked={emergencyAutoInflate}
            />
            <label
              class="form-check-label fw-semibold text-dark"
              for="int_em_auto_inflate"
            >
              Automatically adjust target for inflation
            </label>
          </div>
          <div class="small text-muted ps-1">
            Increases your target over time to match inflation (CPI-U) so your
            safety cushion maintains its real purchasing power.
          </div>
        </div>

        <!-- 2. Emergency Savings Accounts (Current Balances) -->
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <div class="form-label small fw-semibold mb-0">
                Emergency Savings Accounts & Current Balances
              </div>
              <div class="small text-muted">
                Where is your emergency fund money held? (You can add multiple
                accounts)
              </div>
            </div>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              onclick={addEmergencyAccount}
            >
              <i class="fa fa-plus me-1"></i>Add Another Account
            </button>
          </div>

          <div class="d-flex flex-column gap-2">
            {#each emergencyAccounts as acc, idx (acc.id || idx)}
              <div class="p-3 bg-white border rounded-3">
                <div class="row g-2 align-items-center">
                  <div class="col-sm-6">
                    <label
                      for={idx === 0 ? "int_em_name" : `int_em_name_${idx}`}
                      class="form-label small text-secondary mb-1"
                    >
                      Account / Bank Name {emergencyAccounts.length > 1
                        ? `#${idx + 1}`
                        : ""}
                    </label>
                    <input
                      type="text"
                      class="form-control form-control-sm"
                      id={idx === 0 ? "int_em_name" : `int_em_name_${idx}`}
                      bind:value={acc.name}
                      placeholder="e.g. High-Yield Savings (Ally / Marcus)"
                    />
                  </div>
                  <div class="col-sm-5">
                    <label
                      for={idx === 0 ? "int_em_bal" : `int_em_bal_${idx}`}
                      class="form-label small text-secondary mb-1"
                    >
                      Current Balance Saved Today
                    </label>
                    <div class="input-group input-group-sm">
                      <span class="input-group-text">$</span>
                      <MoneyInput
                        id={idx === 0 ? "int_em_bal" : `int_em_bal_${idx}`}
                        class="form-control form-control-sm"
                        bind:value={acc.balance}
                        placeholder="e.g. 25,000"
                      />
                    </div>
                  </div>
                  <div
                    class="col-sm-1 d-flex justify-content-end align-items-end pt-sm-4"
                  >
                    {#if emergencyAccounts.length > 1}
                      <button
                        type="button"
                        class="btn btn-outline-danger btn-sm"
                        title="Remove account"
                        aria-label="Remove emergency account {idx + 1}"
                        onclick={() => removeEmergencyAccount(idx)}
                      >
                        <i class="fa fa-trash"></i>
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>

          {#if emergencyAccounts.length > 1}
            <div
              class="d-flex justify-content-between align-items-center px-3 py-2 mt-2 bg-light-subtle border rounded-2 small"
            >
              <span class="text-secondary fw-semibold"
                >Total Saved Across All {emergencyAccounts.length} Accounts:</span
              >
              <span class="fw-bold fs-6 text-dark"
                >${formatMoney(totalEmergencyBalance)}</span
              >
            </div>
          {/if}
        </div>

        {#if (Number(emergencyTarget) || 0) > 0 && totalEmergencyBalance > 0}
          {@const pct = Math.min(
            100,
            Math.round(
              (totalEmergencyBalance / (Number(emergencyTarget) || 1)) * 100,
            ),
          )}
          <div
            class="alert alert-info py-2 px-3 mb-3 small d-flex align-items-center justify-content-between"
          >
            <span>
              <i class="fa-solid fa-chart-pie me-2"></i>
              <strong>{pct}% of target funded</strong> (${formatMoney(
                totalEmergencyBalance,
              )} of ${formatMoney(Number(emergencyTarget) || 0)})
              {#if (Number(emergencyTarget) || 0) > totalEmergencyBalance}
                &bull; (${formatMoney(
                  (Number(emergencyTarget) || 0) - totalEmergencyBalance,
                )} remaining)
              {:else}
                &bull; (Goal fully funded!)
              {/if}
            </span>
          </div>
        {/if}

        <div class="d-flex justify-content-between align-items-center pt-2">
          {#if emergencySavedFeedback}
            <span class="text-success small fw-semibold">
              <i class="fa-solid fa-circle-check me-1"></i> Emergency fund saved
            </span>
          {:else}
            <span></span>
          {/if}
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={saveEmergency}
          >
            Save Emergency Fund
          </button>
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === "nw_goals"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you have savings in separate accounts for specific upcoming goals or
        purchases?
      </h4>
      <p class="text-secondary mb-3">
        These are funds earmarked for specific future purchases (like a
        replacement vehicle, home repairs, or travel) rather than everyday
        spending or retirement.
      </p>

      <div
        class="alert alert-light border small text-secondary mb-3 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-piggy-bank text-primary me-2"></i>
        In the Balance Sheet, you can see at a glance whether each goal is on track,
        underfunded, or fully funded, separate from your retirement assets.
      </div>

      <!-- Configured Goals List -->
      {#if visibleGoals.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each visibleGoals as g, i (g.id || i)}
            {@const gBalance = goalAccountBalance(g)}
            <div
              class="p-3 bg-white border rounded-3 d-flex justify-content-between align-items-center shadow-xs"
            >
              <div>
                <div
                  class="fw-bold text-dark fs-6 d-flex align-items-center gap-2"
                >
                  <span>{g.name || "Savings Goal"}</span>
                  {#if editingGoalId === g.id}
                    <span class="badge bg-primary text-white small"
                      >Editing</span
                    >
                  {/if}
                </div>
                <div class="small text-secondary mt-1">
                  Target: <strong
                    >${formatMoney(Number(g.target_amount) || 0)}</strong
                  >
                  &bull; Saved Today: <strong>${formatMoney(gBalance)}</strong>
                  {#if (g.accounts?.length ?? 0) > 1}
                    <span class="text-muted ms-1"
                      >({g.accounts.length} accounts)</span
                    >
                  {/if}
                  {#if g.target_auto_inflate}
                    <span
                      class="badge bg-primary-subtle text-primary border border-primary-subtle ms-2"
                    >
                      <i class="fa-solid fa-arrow-trend-up me-1"
                      ></i>Inflation-Adjusted
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
              onclick={() => startAddingGoal("Vehicle Replacement", 25000)}
            >
              🚗 Vehicle Replacement
            </button>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm px-3"
              onclick={() => startAddingGoal("Home Renovation / Roof", 20000)}
            >
              🏡 Home Repair & Maintenance
            </button>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm px-3"
              onclick={() => startAddingGoal("Vacation & Travel Fund", 10000)}
            >
              ✈️ Vacation & Travel Fund
            </button>
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm px-3"
              onclick={() => startAddingGoal("New Goal", 15000)}
            >
              ➕ Custom Savings Goal
            </button>
          </div>
        </div>
      {/if}

      <!-- Add / Edit Goal Card Form -->
      {#if addingGoal || editingGoalId !== null}
        <div
          class="card p-3 p-md-4 border-primary shadow-sm bg-light mb-4 rounded-3"
          style="max-width: 650px;"
        >
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary mb-0">
              {editingGoalId !== null
                ? "Edit Savings Goal"
                : "Add a Savings Goal"}
            </h5>
            <button
              type="button"
              class="btn-close"
              aria-label="Cancel"
              onclick={cancelGoal}
            ></button>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label for="int_goal_name" class="form-label small fw-semibold"
                >Goal Name</label
              >
              <input
                type="text"
                class="form-control"
                id="int_goal_name"
                bind:value={goalDraftName}
                placeholder="e.g. Vehicle Replacement, Vacation"
              />
            </div>
            <div class="col-sm-6">
              <label for="int_goal_target" class="form-label small fw-semibold"
                >Target Goal Amount ($)</label
              >
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

          <div class="p-3 bg-white border rounded-3 mb-3">
            <div class="form-check form-switch mb-1">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="int_goal_auto_inflate"
                bind:checked={goalDraftAutoInflate}
              />
              <label
                class="form-check-label fw-semibold text-dark"
                for="int_goal_auto_inflate"
              >
                Automatically adjust target for inflation
              </label>
            </div>
            <div class="small text-muted ps-1">
              Protects your savings target against rising prices over time
              (CPI-U).
            </div>
          </div>

          <!-- Goal Accounts and Current Balances -->
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <div class="form-label small fw-semibold mb-0">
                  Current Balance Saved Today
                </div>
                <div class="small text-muted">
                  Account(s) dedicated to this goal:
                </div>
              </div>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                onclick={addGoalDraftAccount}
              >
                <i class="fa fa-plus me-1"></i>Add Another Account
              </button>
            </div>

            <div class="d-flex flex-column gap-2">
              {#each goalDraftAccounts as acc, idx (acc.id || idx)}
                <div class="p-3 bg-white border rounded-3">
                  <div class="row g-2 align-items-center">
                    <div class="col-sm-6">
                      <label
                        for={idx === 0
                          ? "int_goal_acc_name"
                          : `int_goal_acc_name_${idx}`}
                        class="form-label small text-secondary mb-1"
                      >
                        Account Name {goalDraftAccounts.length > 1
                          ? `#${idx + 1}`
                          : ""}
                      </label>
                      <input
                        type="text"
                        class="form-control form-control-sm"
                        id={idx === 0
                          ? "int_goal_acc_name"
                          : `int_goal_acc_name_${idx}`}
                        bind:value={acc.name}
                        placeholder="e.g. Ally Car Savings"
                      />
                    </div>
                    <div class="col-sm-5">
                      <label
                        for={idx === 0 ? "int_goal_cur" : `int_goal_cur_${idx}`}
                        class="form-label small text-secondary mb-1"
                      >
                        Current Balance ($)
                      </label>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text">$</span>
                        <MoneyInput
                          id={idx === 0
                            ? "int_goal_cur"
                            : `int_goal_cur_${idx}`}
                          class="form-control form-control-sm"
                          bind:value={acc.balance}
                          placeholder="e.g. 5,000"
                        />
                      </div>
                    </div>
                    <div
                      class="col-sm-1 d-flex justify-content-end align-items-end pt-sm-4"
                    >
                      {#if goalDraftAccounts.length > 1}
                        <button
                          type="button"
                          class="btn btn-outline-danger btn-sm"
                          title="Remove account"
                          aria-label="Remove goal account {idx + 1}"
                          onclick={() => removeGoalDraftAccount(idx)}
                        >
                          <i class="fa fa-trash"></i>
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            {#if goalDraftAccounts.length > 1}
              <div
                class="d-flex justify-content-between align-items-center px-3 py-2 mt-2 bg-light-subtle border rounded-2 small"
              >
                <span class="text-secondary fw-semibold"
                  >Total Saved Across All {goalDraftAccounts.length} Accounts:</span
                >
                <span class="fw-bold fs-6 text-dark"
                  >${formatMoney(totalGoalDraftBalance)}</span
                >
              </div>
            {/if}
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              onclick={cancelGoal}>Cancel</button
            >
            <button
              type="button"
              class="btn btn-sm btn-primary"
              onclick={saveGoalDraft}
            >
              {editingGoalId !== null ? "Save Changes" : "Save Goal"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === "nw_cash"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Roughly how much do you keep in day-to-day checking accounts or cash for
        monthly living expenses?
      </h4>
      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 600px;"
      >
        <i class="fa-solid fa-money-bill-wave text-primary me-2"></i>
        This represents your working cash buffer for regular monthly bills.
      </div>

      <div
        class="card p-3 p-md-4 bg-light border rounded-3 mb-4"
        style="max-width: 500px;"
      >
        <label for="int_checking_amt" class="form-label small fw-semibold"
          >Checking / Cash Buffer ($)</label
        >
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
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={saveChecking}>Save</button
          >
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === "nw_real_estate"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you own your primary home or any other real estate?
      </h4>
      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-house text-primary me-2"></i>
        Your home equity (Market Value minus Mortgage) may be a major component of
        your total net worth, even if you never intend to sell.
      </div>

      <div
        class="card p-3 p-md-4 bg-light border rounded-3 mb-4"
        style="max-width: 600px;"
      >
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_prop_name" class="form-label small fw-semibold"
              >Property Description</label
            >
            <input
              type="text"
              class="form-control"
              id="int_prop_name"
              bind:value={propertyName}
            />
          </div>
          <div class="col-sm-6">
            <label for="int_prop_val" class="form-label small fw-semibold"
              >Estimated Market Value</label
            >
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
          <label
            class="form-check-label small fw-semibold"
            for="int_has_mortgage"
          >
            I have a mortgage on this property
          </label>
        </div>

        {#if hasMortgage}
          <div class="mb-3" style="max-width: 300px;">
            <label for="int_mort_bal" class="form-label small fw-semibold"
              >Mortgage Balance Owed</label
            >
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
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={saveProperty}>Save Real Estate</button
          >
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === "nw_debts"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Do you have any other outstanding loans or debts?
      </h4>
      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-credit-card text-primary me-2"></i>
        The Personal Balance Sheet subtracts these debts from your assets to display
        a more true picture of your Gross and Liquid Net Worth over time.
      </div>

      <div
        class="card p-3 p-md-4 bg-light border rounded-3 mb-4"
        style="max-width: 550px;"
      >
        <div class="row g-3 mb-3">
          <div class="col-sm-7">
            <label for="int_debt_name" class="form-label small fw-semibold"
              >Debt / Loan Name</label
            >
            <input
              type="text"
              class="form-control"
              id="int_debt_name"
              bind:value={debtName}
              placeholder="e.g. Auto Loan, Student Loan"
            />
          </div>
          <div class="col-sm-5">
            <label for="int_debt_bal" class="form-label small fw-semibold"
              >Balance Owed</label
            >
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
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={saveDebt}>Save Debt</button
          >
        </div>
      </div>
    </div>
  {:else if wizard.currentQuestionId === "nw_rebalance"}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        Would you like to set a target investment mix (Stocks vs. Bonds vs.
        Cash) to keep your portfolio balanced?
      </h4>
      <div
        class="alert alert-light border small text-secondary mb-4 p-3 rounded-3"
        style="max-width: 650px;"
      >
        <i class="fa-solid fa-arrows-rotate text-primary me-2"></i>
        Over time, stock market gains can make your portfolio riskier than you intended.
        The Rebalance tool checks your current holdings against this target and shows
        you exactly what to buy or sell to restore balance.
      </div>

      <div class="d-flex flex-column gap-2 mb-4" style="max-width: 500px;">
        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">
            60% Stocks / 40% Bonds (Traditional Balanced - Recommended)
          </div>
          <div class="small opacity-75">
            Standard growth with bond stability for retirement
          </div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">80% Stocks / 20% Bonds (Growth Focus)</div>
          <div class="small opacity-75">
            Higher long-term growth with higher volatility
          </div>
        </button>

        <button
          type="button"
          class="btn p-3 border rounded-3 text-start btn-outline-secondary hover-primary"
          onclick={onNext}
        >
          <div class="fw-bold">40% Stocks / 60% Bonds (Conservative)</div>
          <div class="small opacity-75">
            Lower volatility focused on capital preservation
          </div>
        </button>
      </div>
    </div>
  {/if}

  <!-- Footer Actions -->
  <div
    class="d-flex justify-content-between align-items-center pt-4 border-top mt-4"
  >
    <button
      type="button"
      class="btn btn-outline-secondary px-3"
      onclick={onPrev}
    >
      <i class="fa-solid fa-arrow-left me-1"></i> Back
    </button>

    <div class="d-flex align-items-center gap-3">
      <button
        type="button"
        class="btn btn-link text-muted p-0 small"
        onclick={onSkip}
      >
        Skip for now
      </button>

      <button
        type="button"
        class="btn btn-primary px-4 fw-semibold"
        onclick={onNext}
      >
        Next <i class="fa-solid fa-arrow-right ms-1"></i>
      </button>
    </div>
  </div>
</div>
