<!-- One account card (enter.js addAccountCard). Fields the account doesn't have yet
     show the card's defaults; editing a field stores it on the account. -->
<script lang="ts">
  import { formatMoney } from '../../app/format';
  import {
    ACCOUNT_TYPE_OPTIONS, cardAccount, endAgeIsSpecified, type People, setAccountOwner, VOLATILITY_PRESETS,
    type Volatility, volatilityChoice, yearAtAge,
  } from '../../plan/accountCard';
  import type { Account } from '../../plan/types';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import PercentInput from '../shared/PercentInput.svelte';

  interface Props {
    account: Account;
    people: People;
    /** Names of the cards before this one, for numbering a default name. */
    priorNames: string[];
    /** Set when another card has the same name. */
    duplicateName?: string | null;
    onDelete: () => void;
    onShowAssumptions: () => void;
  }
  let { account = $bindable(), people, priorNames, duplicateName = null, onDelete, onShowAssumptions }: Props = $props();

  // What the card shows: the account's own values, with the card's defaults filled in.
  const view = $derived(cardAccount(account, people, priorNames, () => ''));
  const uid = $props.id();

  const married = $derived(people.isMarried);
  const isSpouse = $derived(view.owner === 'spouse');
  const ownerName = $derived(isSpouse ? (married ? `${people.spouseName}'s ` : "Spouse's ") : (married ? `${people.userName}'s ` : 'Your '));

  /** Bind a field: read the shown value, write to the account. */
  function field<K extends keyof Account>(key: K) {
    return [() => view[key], (v: Account[K]) => (account[key] = v)] as const;
  }

  let customStd = $state(false);
  const volatility: Volatility = $derived(customStd ? 'custom' : volatilityChoice(view.return_std));

  function onVolatility(e: Event) {
    const choice = (e.currentTarget as HTMLSelectElement).value as Volatility;
    customStd = choice === 'custom';
    if (choice !== 'custom') account.return_std = VOLATILITY_PRESETS[choice];
  }

  const startYear = $derived(yearAtAge(view.contrib_start_age, isSpouse, people));
  const endSpouse = $derived(view.contrib_end_age_type === 'spouse_specified');
  const endYear = $derived(yearAtAge(view.contrib_end_age_specified, endSpouse, people));
  const basis = $derived(Math.max(0, (Number(view.balance) || 0) * ((Number(view.cost_basis_ratio) || 0) / 100)));

  const [getName, setName] = field('name');
  const [getType, setType] = field('type');
  const [getBalance, setBalance] = field('balance');
  const [getContrib, setContrib] = field('contrib_amount');
  const [getFreq, setFreq] = field('contrib_freq');
  const [getStart, setStart] = field('contrib_start_age');
  const [getEndType, setEndType] = field('contrib_end_age_type');
  const [getEndSpec, setEndSpec] = field('contrib_end_age_specified');
  const [getAdjInf, setAdjInf] = field('contrib_adjust_inflation');
  const [getMean, setMean] = field('return_mean');
  const [getStd, setStd] = field('return_std');
  const [getDiv, setDiv] = field('dividend_yield');
  const [getQual, setQual] = field('qualified_dividend_pct');
  const [getInt, setInt] = field('interest_yield');
  const [getCg, setCg] = field('capital_gains_dist_rate');
  const [getBasis, setBasis] = field('cost_basis_ratio');
  const [getHsa, setHsa] = field('hsa_for_medical');
</script>

<div class="col-md-6 mb-4 account-card-col" data-account-id={view.id}>
  <div class="card p-4 h-100 shadow-sm border account-card">
    <div class="d-flex justify-content-between align-items-start mb-3 pb-2 border-bottom">
      <div class="flex-grow-1 me-2 position-relative">
        <label class="form-label small fw-bold mb-1" for="{uid}-name">Account Name</label>
        <input type="text" id="{uid}-name" class={['form-control form-control-sm fw-bold text-primary account-name-input', duplicateName && 'is-invalid']}
          bind:value={getName, setName} placeholder="e.g. Primary 401(k), Roth IRA" required />
        {#if duplicateName}
          <div class="invalid-feedback small fw-semibold d-block">Account name "{duplicateName}" is used by multiple accounts. Each account must have a unique name.</div>
        {/if}
      </div>
      <div class="pt-4">
        <button type="button" class="btn btn-outline-danger btn-sm btnDeleteAccount" title="Delete Account" aria-label="Delete" onclick={onDelete}>
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>

    <div class="row g-2 mb-3">
      <div class={married ? 'col-7' : 'col-12'}>
        <label class="form-label small fw-bold mb-1" for="{uid}-type">Account Type</label>
        <select class="form-select form-select-sm acc-type-select" id="{uid}-type" bind:value={getType, setType}>
          {#each ACCOUNT_TYPE_OPTIONS as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
        </select>
      </div>
      {#if married}
        <div class="col-5 acc-owner-group">
          <label class="form-label small fw-bold mb-1" for="{uid}-owner">Owner</label>
          <select class="form-select form-select-sm acc-owner-select" id="{uid}-owner" value={view.owner}
            onchange={(e) => setAccountOwner(account, (e.currentTarget as HTMLSelectElement).value)}>
            <option value="user">You ({people.userName}){view.type === 'taxable' ? ' or Joint' : ''}</option>
            <option value="spouse">Spouse ({people.spouseName})</option>
          </select>
        </div>
      {/if}
    </div>

    <div class="mb-3">
      <label class="form-label small fw-bold mb-1" for="{uid}-balance">Present Balance</label>
      <MoneyInput id="{uid}-balance" class="form-control currency-input" dollarSign bind:value={getBalance, setBalance} />
    </div>

    <div class="row g-2 mb-3">
      <div class="col-7">
        <label class="form-label small fw-bold mb-1" for="{uid}-contrib">Future Contributions</label>
        <MoneyInput id="{uid}-contrib" class="form-control currency-input" dollarSign bind:value={getContrib, setContrib} />
      </div>
      <div class="col-5">
        <label class="form-label small fw-bold mb-1" for="{uid}-freq">Frequency</label>
        <select class="form-select form-select-sm" id="{uid}-freq" bind:value={getFreq, setFreq}>
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
          <option value="one-time">One-Time</option>
        </select>
      </div>
    </div>

    <div class="row g-2 mb-3 align-items-start">
      <div class="col-6">
        <label class="form-label small fw-bold mb-1 acc-start-age-label" for="{uid}-start">{ownerName}Contribution Start Age</label>
        <input type="number" class="form-control form-control-sm acc-start-age-input" id="{uid}-start" min="18" max="120"
          bind:value={getStart, setStart} />
        <div class="age-helper-badge small text-muted fst-italic mt-1">
          {#if startYear !== null}<i class="fa-regular fa-calendar me-1"></i>Year {startYear}{/if}
        </div>
      </div>
      <div class="col-6">
        <label class="form-label small fw-bold mb-1" for="{uid}-endtype">Contribution End Age</label>
        <select class="form-select form-select-sm acc-end-age-type" id="{uid}-endtype" bind:value={getEndType, setEndType}>
          <option value="retirement">{married ? `${people.userName}'s` : 'Your'} Retirement ({people.userRetAge})</option>
          {#if married}<option value="spouse_retirement">{people.spouseName}'s Retirement ({people.spouseRetAge})</option>{/if}
          {#if married}<option value="first_death">First Death</option>{/if}
          <option value="user_specified">Specify {married ? `${people.userName}'s` : 'Your'} Age</option>
          {#if married}<option value="spouse_specified">Specify {people.spouseName}'s Age</option>{/if}
        </select>
        {#if endAgeIsSpecified(view.contrib_end_age_type)}
          <input type="number" class="form-control form-control-sm mt-1 acc-end-age-spec" id="{uid}-endspec" min="18" max="120"
            aria-label="Contribution end age" bind:value={getEndSpec, setEndSpec}
            placeholder="{endSpouse ? people.spouseName : people.userName}'s End Age" />
          <div class="age-helper-badge small text-muted fst-italic mt-1">
            {#if endYear !== null}<i class="fa-regular fa-calendar me-1"></i>Year {endYear}{/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="form-check form-switch mb-3 ps-5">
      <input class="form-check-input acc-contrib-adjust-inf-check" type="checkbox" id="{uid}-inf" bind:checked={getAdjInf, setAdjInf} />
      <label class="form-check-label small font-weight-bold" for="{uid}-inf">Adjust Contributions for Inflation</label>
    </div>

    <div class="row g-2 mb-3">
      <div class="col-6">
        <label class="form-label small fw-bold mb-1" for="{uid}-mean">Average Return %</label>
        <PercentInput id="{uid}-mean" class="form-control form-control-sm percent-input" bind:value={getMean, setMean} />
      </div>
      <div class="col-6 advanced-only-field">
        <label class="form-label small fw-bold mb-1" for="{uid}-vol">Volatility (Std Dev)</label>
        <select class="form-select form-select-sm acc-volatility-select" id="{uid}-vol" value={volatility} onchange={onVolatility}>
          <option value="low">Low (4.5%)</option>
          <option value="moderate">Moderate (9.5%)</option>
          <option value="high">High (16.0%)</option>
          <option value="custom">User Specified</option>
        </select>
        {#if volatility === 'custom'}
          <PercentInput id="{uid}-std" class="form-control form-control-sm percent-input mt-1 acc-return-std" bind:value={getStd, setStd} />
        {/if}
      </div>
    </div>

    {#if view.type === 'taxable'}
      <div class="acc-taxable-treatment-group border rounded-3 p-3 bg-light mb-3 advanced-only-field">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="small fw-bold text-dark"><i class="fa fa-sliders me-1 text-primary"></i> Tax Treatment & Cost Basis</span>
          <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-muted" title="Explain Tax Assumptions"
            onclick={onShowAssumptions}>
            <i class="fa fa-info-circle text-primary me-1"></i><span class="small fw-semibold">Assumptions</span>
          </button>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small text-muted mb-0" style="font-size: 0.75rem;" for="{uid}-div">Dividend Yield %</label>
            <PercentInput id="{uid}-div" class="form-control form-control-sm percent-input acc-div-yield" bind:value={getDiv, setDiv} />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted mb-0" style="font-size: 0.75rem;" for="{uid}-qual">Qualified Div %</label>
            <PercentInput id="{uid}-qual" class="form-control form-control-sm percent-input acc-qual-div" bind:value={getQual, setQual} />
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-6">
            <label class="form-label small text-muted mb-0" style="font-size: 0.75rem;" for="{uid}-int">Interest Yield %</label>
            <PercentInput id="{uid}-int" class="form-control form-control-sm percent-input acc-int-yield" bind:value={getInt, setInt} />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted mb-0" style="font-size: 0.75rem;" for="{uid}-cg">Cap Gains Dist %</label>
            <PercentInput id="{uid}-cg" class="form-control form-control-sm percent-input acc-cg-dist" bind:value={getCg, setCg} />
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <label class="form-label small text-muted mb-0" style="font-size: 0.75rem;" for="{uid}-basis">Cost Basis (% of balance)</label>
              <span class="small text-muted cost-basis-dollar-preview" style="font-size: 0.75rem;">Est. Basis: {formatMoney(basis, true)}</span>
            </div>
            <PercentInput id="{uid}-basis" class="form-control form-control-sm percent-input acc-cost-basis-ratio" bind:value={getBasis, setBasis} />
          </div>
        </div>
        <div class="row g-2">
          <div class="col-12">
            <label class="form-label small text-muted mb-1" style="font-size: 0.75rem;" for="{uid}-cp">Resident in Community Property State?</label>
            <select class="form-select form-select-sm acc-community-property" id="{uid}-cp" value={view.is_community_property ? 'true' : 'false'}
              onchange={(e) => (account.is_community_property = (e.currentTarget as HTMLSelectElement).value === 'true')}>
              <option value="false">No (Common Law: 50% Spousal Step-Up)</option>
              <option value="true">Yes (Community Property: 100% Full Step-Up)</option>
            </select>
          </div>
        </div>
      </div>
    {/if}

    {#if view.type === 'hsa'}
      <div class="form-check form-switch ps-5 acc-hsa-medical-group">
        <input class="form-check-input acc-hsa-med-check" type="checkbox" id="{uid}-hsa" bind:checked={getHsa, setHsa} />
        <label class="form-check-label small font-weight-bold" for="{uid}-hsa">Used for Qualified Medical Expenses (Tax-Free)</label>
      </div>
    {/if}
  </div>
</div>
