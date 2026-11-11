<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Account, Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import PercentInput from '../../shared/PercentInput.svelte';
  import { endAgeIsSpecified, newAccount, personLabels, setAccountOwner } from '../../../plan/accountCard';
  import { formatMoney } from '../../../app/format';

  interface Props {
    wizard: InterviewState;
    plan: Plan;
  }
  let { wizard, plan = $bindable() }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  // Filter accounts by interview category
  const workplaceAccounts = $derived(
    (plan.accounts ?? []).filter((a) => (a.type === 'pretax' || a.type === 'roth') && !a.name?.toLowerCase().includes('ira'))
  );
  const iraAccounts = $derived(
    (plan.accounts ?? []).filter((a) => (a.type === 'pretax' || a.type === 'roth') && a.name?.toLowerCase().includes('ira'))
  );
  const taxableAccounts = $derived((plan.accounts ?? []).filter((a) => a.type === 'taxable'));
  const hsaAccounts = $derived((plan.accounts ?? []).filter((a) => a.type === 'hsa'));
  const inheritedAccounts = $derived(
    (plan.accounts ?? []).filter((a) => a.type === 'inherited_pretax' || a.type === 'inherited_roth')
  );

  let addingAccount = $state(false);
  let editingAccountIndex = $state<number | null>(null);
  let draftAccount: Account | null = $state(null);

  const editingAccount = $derived(
    editingAccountIndex !== null ? plan.accounts?.[editingAccountIndex] ?? null : null
  );

  function startAdding(defaultType: 'pretax' | 'roth' | 'taxable' | 'hsa' | 'inherited_pretax', defaultName: string) {
    editingAccountIndex = null;
    const acc = newAccount(plan);
    acc.type = defaultType;
    acc.name = defaultName;
    acc.balance = 0;
    acc.contrib_amount = 0;
    acc.contrib_freq = 'annual';
    acc.contrib_end_age_type = 'retirement';
    acc.contrib_end_age_specified = people.userRetAge;
    acc.contrib_adjust_inflation = true;
    acc.return_mean = 6.0;
    acc.return_std = 9.5;
    if (defaultType === 'inherited_pretax') {
      acc.death_year = people.currentYear;
      acc.inherited_rule = 'ten_year';
      acc.distribution_strategy = 'equalized';
      acc.decedent_passed_rbd = false;
    }
    draftAccount = acc;
    addingAccount = true;
  }

  function startEditing(acc: Account) {
    const idx = (plan.accounts ?? []).indexOf(acc);
    if (idx < 0) return;
    addingAccount = false;
    editingAccountIndex = idx;
    draftAccount = { ...acc };
  }

  const ageOf = (spouse: boolean) => (spouse ? people.spouseAge : people.userAge);
  const retAgeOf = (spouse: boolean) => (spouse ? people.spouseRetAge : people.userRetAge);
  const nameOf = (spouse: boolean) => (spouse ? people.spouseName : people.userName);

  /**
   * Change the draft's owner. The end-age choice moves to the same choice for the new
   * owner (as on the main account card), and start / stop ages still at the old
   * owner's defaults follow to the new owner's.
   */
  function changeOwner(owner: string) {
    if (!draftAccount) return;
    const wasSpouse = draftAccount.owner === 'spouse';
    const isSpouse = owner === 'spouse';
    if (draftAccount.contrib_start_age === ageOf(wasSpouse)) draftAccount.contrib_start_age = ageOf(isSpouse);
    if (draftAccount.contrib_end_age_specified === retAgeOf(wasSpouse)) {
      draftAccount.contrib_end_age_specified = retAgeOf(isSpouse);
    }
    setAccountOwner(draftAccount, owner);
  }

  const isOneTime = (freq: string | undefined) => freq === 'one-time' || freq === 'one_time';

  /** One-time contributions happen at the start age, or at the first death when that end type is chosen. */
  function setOneTimeTiming(timing: string) {
    if (!draftAccount) return;
    draftAccount.contrib_end_age_type =
      timing === 'first_death' ? 'first_death' : draftAccount.owner === 'spouse' && married ? 'spouse_retirement' : 'retirement';
  }

  function contribSummary(acc: Account): string {
    const amt = formatMoney(Number(acc.contrib_amount));
    if (isOneTime(acc.contrib_freq)) {
      return acc.contrib_end_age_type === 'first_death'
        ? `${amt} one-time at first death`
        : `${amt} one-time at age ${acc.contrib_start_age}`;
    }
    return `${amt}/${acc.contrib_freq === 'monthly' ? 'mo' : 'yr'}`;
  }

  function cancelDraft() {
    addingAccount = false;
    editingAccountIndex = null;
    draftAccount = null;
  }

  function taxBucket(type: string | undefined) {
    if (type === 'roth') return { key: 'roth', label: 'Roth', icon: 'fa-gem' };
    if (type === 'pretax') return { key: 'pretax', label: 'Pre-Tax', icon: 'fa-hourglass-half' };
    if (type === 'taxable') return { key: 'taxable', label: 'Taxable', icon: 'fa-coins' };
    if (type === 'hsa') return { key: 'hsa', label: 'HSA', icon: 'fa-heart-pulse' };
    if (type === 'inherited_roth') return { key: 'inherited', label: 'Inherited Roth', icon: 'fa-clock-rotate-left' };
    return { key: 'inherited', label: 'Inherited Pre-Tax', icon: 'fa-clock-rotate-left' };
  }

  function ensureUniqueAccountName(baseName: string, accounts: Account[] | undefined, excludeIndex?: number | null): string {
    const existing = new Set(
      (accounts ?? [])
        .filter((_, i) => excludeIndex === undefined || excludeIndex === null || i !== excludeIndex)
        .map((a) => a.name?.toLowerCase().trim())
    );
    let trimmed = baseName.trim() || 'Retirement Account';
    if (!existing.has(trimmed.toLowerCase())) return trimmed;
    let counter = 2;
    while (existing.has(`${trimmed.toLowerCase()} (${counter})`)) {
      counter++;
    }
    return `${trimmed} (${counter})`;
  }

  function saveDraft() {
    if (editingAccountIndex !== null && draftAccount) {
      draftAccount.name = ensureUniqueAccountName(draftAccount.name || 'Retirement Account', plan.accounts, editingAccountIndex);
      Object.assign(plan.accounts![editingAccountIndex], draftAccount);
    } else if (draftAccount) {
      draftAccount.name = ensureUniqueAccountName(draftAccount.name || 'Retirement Account', plan.accounts);
      (plan.accounts ??= []).push(draftAccount);
    }
    addingAccount = false;
    editingAccountIndex = null;
    draftAccount = null;
  }

  function removeAccount(acc: Account) {
    const idx = (plan.accounts ?? []).indexOf(acc);
    if (idx >= 0) {
      if (editingAccountIndex === idx) {
        cancelDraft();
      } else if (editingAccountIndex !== null && editingAccountIndex > idx) {
        editingAccountIndex--;
      }
      plan.accounts?.splice(idx, 1);
    }
  }

  // Safety net: if the user jumps questions via navigation or skipped drawer, clean up draft state
  let lastQuestionId = $state<string | null>(null);
  $effect(() => {
    const current = wizard.currentQuestionId;
    if (lastQuestionId !== null && current !== lastQuestionId) {
      cancelDraft();
    }
    lastQuestionId = current;
  });

  function onNext() {
    if (editingAccountIndex !== null && draftAccount) {
      saveDraft();
    } else if (addingAccount && draftAccount) {
      const hasData = (Number(draftAccount.balance) || 0) > 0 || (Number(draftAccount.contrib_amount) || 0) > 0;
      if (hasData) {
        draftAccount.name = ensureUniqueAccountName(draftAccount.name || 'Retirement Account', plan.accounts);
        (plan.accounts ??= []).push(draftAccount);
      }
      addingAccount = false;
      draftAccount = null;
    }
    wizard.markAnswered(wizard.currentQuestionId);
    wizard.next(plan);
  }

  function onSkip() {
    cancelDraft();
    wizard.applyDefaultAndSkip(wizard.currentQuestionId, plan);
  }
</script>

{#snippet ownerBadge(acc: Account)}
  {#if married}
    <span class="badge badge-person badge-person-{acc.owner === 'spouse' ? 'spouse' : (acc.type === 'taxable' ? 'joint' : 'user')}">
      <i class="fa-solid {acc.owner === 'spouse' ? 'fa-user-group' : (acc.type === 'taxable' ? 'fa-users' : 'fa-user')} me-1"></i>
      {acc.owner === 'spouse' ? people.spouseName : (acc.type === 'taxable' ? `${people.userName} / Joint` : people.userName)}
    </span>
  {/if}
{/snippet}

{#snippet retirementAccountsNote()}
  <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
    <i class="fa-solid fa-circle-info text-primary me-2"></i>
    <strong>Note:</strong> Enter only accounts intended to be used in retirement. Do not include accounts you plan to spend before retirement. Accounts intended to be spent before retirement can be tracked on the optional <strong>Balance Sheet</strong> page.
  </div>
{/snippet}

<div class="stage-container py-2">
  {#if wizard.currentQuestionId === 'accounts_workplace'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        {married ? 'Do you or your spouse have retirement savings through work (like a 401(k), 403(b), or TSP)?' : 'Do you have retirement savings through work (like a 401(k), 403(b), or TSP)?'}
      </h4>
      <p class="text-secondary mb-3">
        {married
          ? 'Workplace plans allow you to contribute directly from your paycheck. You can add each plan you or your spouse currently have.'
          : 'Workplace plans allow you to contribute directly from your paycheck. You can add each plan you currently have.'}
      </p>

      {@render retirementAccountsNote()}

      <!-- Account List -->
      {#if workplaceAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each workplaceAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center account-card-{taxBucket(acc.type).key} {editingAccount === acc ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                  <span>{acc.name}</span>
                  {@render ownerBadge(acc)}
                  <span class="badge badge-tax badge-tax-{taxBucket(acc.type).key}"><i class="fa-solid {taxBucket(acc.type).icon} me-1"></i>{taxBucket(acc.type).label}</span>
                  {#if editingAccount === acc}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  {#if married}Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; {/if}Type: {acc.type === 'roth' ? 'Roth' : 'Traditional'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                  {#if (Number(acc.contrib_amount) || 0) > 0}
                    &bull; Contributing: {contribSummary(acc)}
                  {/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditing(acc)} aria-label="Edit {acc.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete {acc.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount && !editingAccount}
        <button
          type="button"
          class="btn btn-outline-primary btn-sm px-3 mb-4"
          onclick={() => startAdding('pretax', `${people.userName}'s 401(k)`)}
        >
          <i class="fa-solid fa-plus me-1"></i> Add a Workplace Account
        </button>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'accounts_ira'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        {married ? 'Do you or your spouse have an Individual Retirement Account (Traditional IRA or Roth IRA)?' : 'Do you have an Individual Retirement Account (Traditional IRA or Roth IRA)?'}
      </h4>
      <p class="text-secondary mb-3">
        IRAs are individual accounts you open yourself at a brokerage like Fidelity, Schwab, or Vanguard.
      </p>

      {@render retirementAccountsNote()}

      {#if iraAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each iraAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center account-card-{taxBucket(acc.type).key} {editingAccount === acc ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                  <span>{acc.name}</span>
                  {@render ownerBadge(acc)}
                  <span class="badge badge-tax badge-tax-{taxBucket(acc.type).key}"><i class="fa-solid {taxBucket(acc.type).icon} me-1"></i>{taxBucket(acc.type).label}</span>
                  {#if editingAccount === acc}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  {#if married}Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; {/if}Type: {acc.type === 'roth' ? 'Roth IRA' : 'Traditional IRA'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                  {#if (Number(acc.contrib_amount) || 0) > 0}
                    &bull; Contributing: {contribSummary(acc)}
                  {/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditing(acc)} aria-label="Edit {acc.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete {acc.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount && !editingAccount}
        <button
          type="button"
          class="btn btn-outline-primary btn-sm px-3 mb-4"
          onclick={() => startAdding('pretax', `${people.userName}'s Traditional IRA`)}
        >
          <i class="fa-solid fa-plus me-1"></i> Add an IRA
        </button>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'accounts_taxable'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have any taxable investment accounts (like a brokerage account at Vanguard, Schwab, or Fidelity) designated for retirement?</h4>
      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-circle-info text-primary me-2"></i>
        These are non-retirement accounts. You pay taxes on dividends and realized capital gains each year, but you can withdraw money anytime without age penalties.
      </div>

      {@render retirementAccountsNote()}

      {#if taxableAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each taxableAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center account-card-taxable {editingAccount === acc ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                  <span>{acc.name}</span>
                  {@render ownerBadge(acc)}
                  <span class="badge badge-tax badge-tax-taxable"><i class="fa-solid fa-coins me-1"></i>Taxable</span>
                  {#if editingAccount === acc}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  {#if married}Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; {/if}Balance: {formatMoney(Number(acc.balance) || 0)}
                  {#if (Number(acc.contrib_amount) || 0) > 0}
                    &bull; Contributing: {contribSummary(acc)}
                  {/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditing(acc)} aria-label="Edit {acc.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete {acc.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount && !editingAccount}
        <button
          type="button"
          class="btn btn-outline-primary btn-sm px-3 mb-4"
          onclick={() => startAdding('taxable', `${people.userName}'s Taxable Brokerage`)}
        >
          <i class="fa-solid fa-plus me-1"></i> Add a Taxable Account
        </button>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'accounts_hsa'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you have a Health Savings Account (HSA) that is or was paired with a high-deductible health plan?</h4>
      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-heart-pulse text-primary me-2"></i>
        HSAs offer a triple tax advantage: money goes in tax-free, grows tax-free, and comes out 100% tax-free when used for eligible medical expenses.
      </div>

      {@render retirementAccountsNote()}

      {#if hsaAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each hsaAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center account-card-hsa {editingAccount === acc ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                  <span>{acc.name}</span>
                  {@render ownerBadge(acc)}
                  <span class="badge badge-tax badge-tax-hsa"><i class="fa-solid fa-heart-pulse me-1"></i>HSA</span>
                  {#if editingAccount === acc}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  {#if married}Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; {/if}Balance: {formatMoney(Number(acc.balance) || 0)}
                  {#if (Number(acc.contrib_amount) || 0) > 0}
                    &bull; Contributing: {contribSummary(acc)}
                  {/if}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditing(acc)} aria-label="Edit {acc.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete {acc.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount && !editingAccount}
        <button
          type="button"
          class="btn btn-outline-primary btn-sm px-3 mb-4"
          onclick={() => startAdding('hsa', `${people.userName}'s HSA`)}
        >
          <i class="fa-solid fa-plus me-1"></i> Add an HSA
        </button>
      {/if}
    </div>
  {:else if wizard.currentQuestionId === 'accounts_inherited'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">
        {married ? 'Have you or your spouse inherited an IRA or 401(k) from someone who passed away?' : 'Have you inherited an IRA or 401(k) from someone who passed away?'}
      </h4>
      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-scale-balanced text-primary me-2"></i>
        Under IRS rules, you cannot make new contributions to an inherited account, and withdrawals are subject to specific deadlines (most commonly a 10-year rule). If you have one, we will guide you through setting up those distribution rules.
      </div>

      {@render retirementAccountsNote()}

      {#if inheritedAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each inheritedAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center account-card-{taxBucket(acc.type).key} {editingAccount === acc ? 'border-primary bg-primary-subtle' : ''}">
              <div>
                <div class="fw-bold text-dark d-flex align-items-center flex-wrap gap-1">
                  <span>{acc.name}</span>
                  {@render ownerBadge(acc)}
                  <span class="badge badge-tax badge-tax-{taxBucket(acc.type).key}"><i class="fa-solid {taxBucket(acc.type).icon} me-1"></i>{taxBucket(acc.type).label}</span>
                  {#if editingAccount === acc}
                    <span class="badge bg-primary text-white small">Editing</span>
                  {/if}
                </div>
                <div class="small text-muted">
                  {#if married}Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; {/if}Type: {acc.type === 'inherited_roth' ? 'Inherited Roth' : 'Inherited Traditional'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => startEditing(acc)} aria-label="Edit {acc.name}" title="Edit">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete {acc.name}" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount && !editingAccount}
        <button
          type="button"
          class="btn btn-outline-primary btn-sm px-3 mb-4"
          onclick={() => startAdding('inherited_pretax', `${people.userName}'s Inherited IRA`)}
        >
          <i class="fa-solid fa-plus me-1"></i> Add an Inherited Account
        </button>
      {/if}
    </div>
  {/if}

  <!-- Add / Edit Account Drawer or Sub-form -->
  {#if (addingAccount || editingAccount) && draftAccount}
    <div class="card p-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold text-primary mb-0">{editingAccount ? `Edit Account: ${draftAccount.name || 'Retirement Account'}` : 'Configure Account'}</h5>
        <button type="button" class="btn-close" aria-label="Cancel" onclick={cancelDraft}></button>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-sm-8">
          <label for="int_acc_name" class="form-label small fw-semibold">Account Nickname</label>
          <input type="text" class="form-control form-control-sm" id="int_acc_name" bind:value={draftAccount.name} />
        </div>
        {#if married}
          <div class="col-sm-4">
            <label for="int_acc_owner" class="form-label small fw-semibold">Whose Account?</label>
            <select class="form-select form-select-sm" id="int_acc_owner" value={draftAccount.owner}
              onchange={(e) => changeOwner((e.currentTarget as HTMLSelectElement).value)}>
              <option value="user">{people.userName}</option>
              <option value="spouse">{people.spouseName}</option>
            </select>
          </div>
        {/if}
      </div>

      {#if draftAccount.type === 'pretax' || draftAccount.type === 'roth'}
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_acc_type" class="form-label small fw-semibold">Tax Treatment</label>
            <select class="form-select form-select-sm" id="int_acc_type" bind:value={draftAccount.type}>
              <option value="pretax">Traditional Pre-Tax (Taxed on withdrawal)</option>
              <option value="roth">Roth (Tax-free growth & withdrawals)</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="int_acc_balance" class="form-label small fw-semibold">Current Balance Today</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_acc_balance" class="form-control" bind:value={draftAccount.balance} />
            </div>
          </div>
        </div>

      {:else if draftAccount.type === 'inherited_pretax' || draftAccount.type === 'inherited_roth'}
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_inh_type" class="form-label small fw-semibold">Inherited Account Type</label>
            <select class="form-select form-select-sm" id="int_inh_type" bind:value={draftAccount.type}>
              <option value="inherited_pretax">Inherited Pre-Tax / Traditional</option>
              <option value="inherited_roth">Inherited Roth</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="int_inh_balance" class="form-label small fw-semibold">Current Balance Today</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_inh_balance" class="form-control" bind:value={draftAccount.balance} />
            </div>
          </div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_inh_death_year" class="form-label small fw-semibold">Year Inherited (Year of Death)</label>
            <input type="number" class="form-control form-control-sm" id="int_inh_death_year" min="1980" max="2100" bind:value={draftAccount.death_year} />
          </div>
          <div class="col-sm-6">
            <label for="int_inh_rule" class="form-label small fw-semibold">IRS Distribution Rule</label>
            <select class="form-select form-select-sm" id="int_inh_rule" bind:value={draftAccount.inherited_rule}>
              <option value="ten_year">10-Year Rule (Standard post-2019)</option>
              <option value="stretch">Lifetime Stretch (Pre-2020 / EDB)</option>
              {#if married}
                <option value="spouse">Surviving Spouse Beneficiary</option>
              {/if}
              <option value="five_year">5-Year Rule</option>
            </select>
          </div>
        </div>

        {#if draftAccount.inherited_rule === 'ten_year'}
          <div class="mb-3">
            <label for="int_inh_strat" class="form-label small fw-semibold">10-Year Distribution Strategy</label>
            <select class="form-select form-select-sm" id="int_inh_strat" bind:value={draftAccount.distribution_strategy}>
              <option value="equalized">Smooth Annual Withdrawals (1/Nth each year to smooth taxes - Recommended)</option>
              <option value="rmd_only">Minimum Required Only (Balloon payout in Year 10)</option>
            </select>
          </div>
        {/if}
      {:else}
        <!-- Taxable or HSA -->
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_gen_balance" class="form-label small fw-semibold">Current Balance Today</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_gen_balance" class="form-control" bind:value={draftAccount.balance} />
            </div>
          </div>
        </div>
      {/if}

      <!-- Contributions (every type except inherited), matching the main account card -->
      {#if draftAccount.type !== 'inherited_pretax' && draftAccount.type !== 'inherited_roth'}
        {@const ownerIsSpouse = married && draftAccount.owner === 'spouse'}
        {@const oneTime = isOneTime(draftAccount.contrib_freq)}
        {@const atFirstDeath = oneTime && draftAccount.contrib_end_age_type === 'first_death'}
        <div class="row g-3 mb-3">
          <div class="col-sm-6">
            <label for="int_acc_contrib" class="form-label small fw-semibold">Future Contributions ($)</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_acc_contrib" class="form-control" bind:value={draftAccount.contrib_amount} />
            </div>
          </div>
          <div class="col-sm-6">
            <label for="int_acc_freq" class="form-label small fw-semibold">Contribution Frequency</label>
            <select class="form-select form-select-sm" id="int_acc_freq" bind:value={draftAccount.contrib_freq}>
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="one-time">One-Time</option>
            </select>
          </div>
        </div>

        {#if (Number(draftAccount.contrib_amount) || 0) > 0}
          <div class="row g-3 mb-3 align-items-end">
            {#if oneTime && married}
              <div class="col-sm-7">
                <label for="int_acc_onetime_when" class="form-label small fw-semibold">When is the contribution made?</label>
                <select class="form-select form-select-sm" id="int_acc_onetime_when" value={atFirstDeath ? 'first_death' : 'age'}
                  onchange={(e) => setOneTimeTiming((e.currentTarget as HTMLSelectElement).value)}>
                  <option value="age">At a specific age</option>
                  <option value="first_death">At the first death (e.g. life insurance proceeds)</option>
                </select>
              </div>
            {/if}
            {#if !atFirstDeath}
              <div class="col-sm-5">
                <label for="int_acc_start" class="form-label small fw-semibold">
                  {oneTime ? 'Contribution made at' : 'Contributions start at'} {married ? `${nameOf(ownerIsSpouse)}'s` : 'your'} age
                </label>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  id="int_acc_start"
                  min="18"
                  max="120"
                  placeholder="e.g. {ageOf(ownerIsSpouse)}"
                  bind:value={draftAccount.contrib_start_age}
                />
              </div>
            {/if}
          </div>

          {#if !oneTime}
            <div class="row g-3 mb-3 align-items-end">
              <div class="col-sm-7">
                <label for="int_acc_endtype" class="form-label small fw-semibold">When will contributions stop?</label>
                <select class="form-select form-select-sm" id="int_acc_endtype" bind:value={draftAccount.contrib_end_age_type}>
                  {#if married}
                    <option value="retirement">When {people.userName} retires (Age {people.userRetAge}){ownerIsSpouse ? '' : ' - Recommended'}</option>
                    <option value="spouse_retirement">When {people.spouseName} retires (Age {people.spouseRetAge}){ownerIsSpouse ? ' - Recommended' : ''}</option>
                    <option value="first_death">At the first death</option>
                    <option value="user_specified">At a specific age for {people.userName}...</option>
                    <option value="spouse_specified">At a specific age for {people.spouseName}...</option>
                  {:else}
                    <option value="retirement">At my retirement (Age {people.userRetAge}) - Recommended</option>
                    <option value="user_specified">At a specific age...</option>
                  {/if}
                </select>
              </div>
              {#if endAgeIsSpecified(draftAccount.contrib_end_age_type)}
                <div class="col-sm-5">
                  <label for="int_acc_endspec" class="form-label small fw-semibold">Contribution Stop Age</label>
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    id="int_acc_endspec"
                    min="18"
                    max="120"
                    placeholder="e.g. 65"
                    bind:value={draftAccount.contrib_end_age_specified}
                  />
                </div>
              {/if}
            </div>
          {/if}

          <div class="form-check form-switch ps-5 mb-3">
            <input
              class="form-check-input"
              type="checkbox"
              id="int_acc_adj_inf"
              bind:checked={draftAccount.contrib_adjust_inflation}
            />
            <label class="form-check-label small fw-semibold" for="int_acc_adj_inf">
              {oneTime ? 'Express the contribution in today\'s dollars (adjust for inflation)' : 'Adjust contributions annually for inflation (Recommended)'}
            </label>
          </div>
        {/if}
      {/if}

      <!-- Investment Style -->
      <div class="mb-3">
        <label for="int_acc_mean" class="form-label small fw-semibold">Expected Annual Growth Rate %</label>
        <div class="d-flex align-items-center gap-2">
          <div style="max-width: 120px;">
            <PercentInput id="int_acc_mean" class="form-control form-control-sm percent-input" bind:value={draftAccount.return_mean} emptyValue={6.0} />
          </div>
          <span class="small text-muted">(e.g. 4.5% conservative, 6.0% moderate, 7.5% growth)</span>
        </div>
      </div>

      <div class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick={cancelDraft}>Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" onclick={saveDraft}>{editingAccount ? 'Save Changes' : 'Save Account'}</button>
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
