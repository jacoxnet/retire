<script lang="ts">
  import type { InterviewState } from './interviewState.svelte';
  import type { Account, Plan } from '../../../plan/types';
  import MoneyInput from '../../shared/MoneyInput.svelte';
  import PercentInput from '../../shared/PercentInput.svelte';
  import { newAccount, personLabels } from '../../../plan/accountCard';
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
  let draftAccount: Account | null = $state(null);

  function startAdding(defaultType: 'pretax' | 'roth' | 'taxable' | 'hsa' | 'inherited_pretax', defaultName: string) {
    const acc = newAccount(plan);
    acc.type = defaultType;
    acc.name = defaultName;
    acc.balance = 0;
    acc.contrib_amount = 0;
    acc.contrib_freq = 'annual';
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

  function saveDraft() {
    if (draftAccount) {
      if (!draftAccount.name?.trim()) {
        draftAccount.name = 'Retirement Account';
      }
      (plan.accounts ??= []).push(draftAccount);
    }
    addingAccount = false;
    draftAccount = null;
  }

  function removeAccount(acc: Account) {
    const idx = (plan.accounts ?? []).indexOf(acc);
    if (idx >= 0) {
      plan.accounts?.splice(idx, 1);
    }
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
  {#if wizard.currentQuestionId === 'accounts_workplace'}
    <div class="question-card">
      <h4 class="fw-bold text-primary mb-2">Do you or your spouse have retirement savings through work (like a 401(k), 403(b), or TSP)?</h4>
      <p class="text-secondary mb-3">
        Workplace plans allow you to contribute directly from your paycheck. You can add each plan you or your spouse currently have.
      </p>

      <!-- Account List -->
      {#if workplaceAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each workplaceAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{acc.name}</div>
                <div class="small text-muted">
                  Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; Type: {acc.type === 'roth' ? 'Roth' : 'Traditional'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount}
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
      <h4 class="fw-bold text-primary mb-2">Do you or your spouse have an Individual Retirement Account (Traditional IRA or Roth IRA)?</h4>
      <p class="text-secondary mb-3">
        IRAs are individual accounts you open yourself at a brokerage like Fidelity, Schwab, or Vanguard.
      </p>

      {#if iraAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each iraAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{acc.name}</div>
                <div class="small text-muted">
                  Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; Type: {acc.type === 'roth' ? 'Roth IRA' : 'Traditional IRA'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount}
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

      {#if taxableAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each taxableAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{acc.name}</div>
                <div class="small text-muted">
                  Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount}
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

      {#if hsaAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each hsaAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{acc.name}</div>
                <div class="small text-muted">
                  Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount}
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
      <h4 class="fw-bold text-primary mb-2">Have you or your spouse inherited an IRA or 401(k) from someone who passed away?</h4>
      <div class="alert alert-light border small text-secondary mb-3 p-3 rounded-3" style="max-width: 650px;">
        <i class="fa-solid fa-scale-balanced text-primary me-2"></i>
        Under IRS rules, you cannot make new contributions to an inherited account, and withdrawals are subject to specific deadlines (most commonly a 10-year rule). If you have one, we will guide you through setting up those distribution rules.
      </div>

      {#if inheritedAccounts.length > 0}
        <div class="d-flex flex-column gap-2 mb-3" style="max-width: 650px;">
          {#each inheritedAccounts as acc (acc.id ?? acc.name)}
            <div class="card p-3 border shadow-sm rounded-3 d-flex flex-row justify-content-between align-items-center">
              <div>
                <div class="fw-bold text-dark">{acc.name}</div>
                <div class="small text-muted">
                  Owner: {acc.owner === 'spouse' ? people.spouseName : people.userName} &bull; Type: {acc.type === 'inherited_roth' ? 'Inherited Roth' : 'Inherited Traditional'} &bull; Balance: {formatMoney(Number(acc.balance) || 0)}
                </div>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => removeAccount(acc)} aria-label="Delete">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if !addingAccount}
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
  {#if addingAccount && draftAccount}
    <div class="card p-4 border-primary shadow-sm bg-light mb-4 rounded-3" style="max-width: 650px;">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold text-primary mb-0">Configure Account</h5>
        <button type="button" class="btn-close" aria-label="Cancel" onclick={() => (addingAccount = false)}></button>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-sm-8">
          <label for="int_acc_name" class="form-label small fw-semibold">Account Nickname</label>
          <input type="text" class="form-control form-control-sm" id="int_acc_name" bind:value={draftAccount.name} />
        </div>
        {#if married}
          <div class="col-sm-4">
            <label for="int_acc_owner" class="form-label small fw-semibold">Whose Account?</label>
            <select class="form-select form-select-sm" id="int_acc_owner" bind:value={draftAccount.owner}>
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
            </select>
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
              <option value="spouse">Surviving Spouse Beneficiary</option>
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
          <div class="col-sm-6">
            <label for="int_gen_contrib" class="form-label small fw-semibold">Annual Contributions ($)</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">$</span>
              <MoneyInput id="int_gen_contrib" class="form-control" bind:value={draftAccount.contrib_amount} />
            </div>
          </div>
        </div>
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
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => (addingAccount = false)}>Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" onclick={saveDraft}>Save Account</button>
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
