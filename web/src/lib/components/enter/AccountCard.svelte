<!-- One account card (enter.js addAccountCard). Fields the account doesn't have yet
     show the card's defaults; editing a field stores it on the account. -->
<script lang="ts">
  import { formatMoney } from '../../app/format';
  import {
    ACCOUNT_TYPE_OPTIONS, cardAccount, endAgeIsSpecified, isInheritedType, type People, setAccountOwner, VOLATILITY_PRESETS,
    type Volatility, volatilityChoice, yearAtAge,
  } from '../../plan/accountCard';
  import type { Account } from '../../plan/types';
  import HelpPopover from '../shared/HelpPopover.svelte';
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
  const [getDeathYear, setDeathYear] = field('death_year');
  const [getRule, setRule] = field('inherited_rule');
  const [getRbd, setRbd] = field('decedent_passed_rbd');
  const [getStrategy, setStrategy] = field('distribution_strategy');
  const [getBirthYear, setBirthYear] = field('decedent_birth_year');
  const [getSpouseTable, setSpouseTable] = field('spouse_table');

  const inherited = $derived(isInheritedType(view.type));
  const deathYearVal = $derived(Number(view.death_year) || people.currentYear);
  const yearsElapsed = $derived(Math.max(0, people.currentYear - deathYearVal));
  const remainingYearsText = $derived.by(() => {
    if (view.inherited_rule === 'ten_year') {
      const rem = Math.max(0, 10 - yearsElapsed);
      return rem === 0 ? '10-year window reached (fully distributed this year)' : `${rem} year${rem === 1 ? '' : 's'} remaining on 10-year clock`;
    }
    if (view.inherited_rule === 'five_year') {
      const rem = Math.max(0, 5 - yearsElapsed);
      return rem === 0 ? '5-year window reached' : `${rem} year${rem === 1 ? '' : 's'} remaining on 5-year clock`;
    }
    if (view.inherited_rule === 'minor_child') {
      const closeYear = Math.max(deathYearVal + 10, yearAtAge(31, isSpouse, people) ?? 0);
      return `Life expectancy distributions to age 21, then emptied by ${closeYear}`;
    }
    if (view.inherited_rule === 'spouse') {
      return view.spouse_table === 'uniform' && !passedRbd
        ? 'Annual Uniform Lifetime Table distributions'
        : 'Annual Single Life Table distributions, recalculated each year';
    }
    return 'Annual Single Life Table stretch distributions';
  });
  // A Roth owner has no lifetime RMDs, so never reaches the Required Beginning Date.
  const passedRbd = $derived(view.type === 'inherited_pretax' && !!view.decedent_passed_rbd);
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

    {#if !inherited}
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
    {:else}
      <div class="alert alert-secondary py-2 px-3 small mb-3 d-flex align-items-center">
        <i class="fa-solid fa-circle-info me-2 text-primary"></i>
        <span>Contributions are legally prohibited to inherited accounts.</span>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6">
          <label class="form-label small fw-bold mb-1" for="{uid}-death-year">Year of Death / Inherited</label>
          <input type="number" class="form-control form-control-sm" id="{uid}-death-year" min="1980" max="2100"
            bind:value={getDeathYear, setDeathYear} />
          <div class="small text-muted fst-italic mt-1">
            <i class="fa-regular fa-clock me-1"></i>{remainingYearsText}
          </div>
        </div>
        <div class="col-6">
          <label class="form-label small fw-bold mb-1 d-flex align-items-center" for="{uid}-rule">
            <span>Beneficiary's RMD Rule</span>
            <HelpPopover
              title="Beneficiary's RMD Rule"
              html
              content="<b>10-Year Rule (Standard post-2019):</b> Applies to most individual designated beneficiaries if the IRA owner died after Dec 31, 2019 (under the SECURE Act). The account must be fully emptied by the end of the 10th year following death.<br><br><b>Lifetime Stretch (Pre-2020 / EDB):</b> Select if the owner died before 2020, OR if the beneficiary is an Eligible Designated Beneficiary (EDB) who is a disabled or chronically ill individual, or an individual not more than 10 years younger than the decedent. Annual RMDs are taken over the beneficiary's single life expectancy.<br><br><b>Minor Child of Decedent (EDB):</b> Annual life-expectancy RMDs until the child turns 21; then the 10-year rule applies, with annual RMDs continuing, and the account must be emptied by the end of the year the child turns 31.<br><br><b>Surviving Spouse (EDB):</b> For a spouse who is the sole beneficiary and keeps the account as an inherited IRA. RMDs use the spouse's single life expectancy, recalculated each year. If the decedent died before their Required Beginning Date, RMDs need not start until the year the decedent would have reached RMD age, and the spouse may elect to use the Uniform Lifetime Table instead. A spouse can instead roll the account into their own IRA; in that case enter it as a regular Pre-Tax or Roth account, not an inherited one.<br><br><b>5-Year Rule (Estate / Non-Designated):</b> Applies to non-designated beneficiaries (such as an estate, charity, or non-qualifying trust) when the owner died before their Required Beginning Date, or when mandated by plan documents."
            />
          </label>
          <select class="form-select form-select-sm" id="{uid}-rule" bind:value={getRule, setRule}>
            <option value="ten_year">10-Year Rule (Standard post-2019)</option>
            <option value="stretch">Lifetime Stretch (Pre-2020 / EDB)</option>
            <option value="minor_child">Minor Child of Decedent (EDB)</option>
            <option value="spouse">Surviving Spouse (EDB)</option>
            <option value="five_year">5-Year Rule (Estate / Non-Designated)</option>
          </select>
        </div>
      </div>

      {#if view.type === 'inherited_pretax'}
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1 d-flex align-items-center" for="{uid}-rbd">
            <span>Did the Decedent Reach their Required Beginning Date (RBD)?</span>
            <HelpPopover
              title="Required Beginning Date (RBD)"
              content="The Required Beginning Date (RBD) is April 1 of the calendar year following the year in which the IRA owner reached their applicable RMD age: age 70½ if born before July 1, 1949; age 72 if born between July 1, 1949 and Dec 31, 1950; age 73 if born 1951–1959; or age 75 if born 1960 or later (SECURE Act & SECURE 2.0). Under IRS regulations, if the decedent reached their RBD prior to death, annual RMDs are required during years 1–9 of the 10-year rule based on the beneficiary's single life expectancy. If the decedent died before reaching their RBD, annual RMDs are not required in years 1–9 (the entire account balance must simply be distributed by the end of the 10th year)."
            />
          </label>
          <select class="form-select form-select-sm" id="{uid}-rbd" value={view.decedent_passed_rbd ? 'yes' : 'no'}
            onchange={(e) => setRbd((e.currentTarget as HTMLSelectElement).value === 'yes')}>
            <option value="no">No (Died Before RBD — No annual RMDs in years 1–9)</option>
            <option value="yes">Yes (Reached RBD Prior to Death — Annual Single Life RMDs in years 1–9)</option>
          </select>
        </div>
      {/if}

      {#if view.inherited_rule === 'spouse' && !passedRbd}
        <div class="row g-2 mb-3">
          <div class="col-6">
            <label class="form-label small fw-bold mb-1 d-flex align-items-center" for="{uid}-birth-year">
              <span>Decedent's Birth Year</span>
              <HelpPopover
                title="Decedent's Birth Year"
                content="When the decedent died before their Required Beginning Date, a surviving spouse need not begin RMDs until the year the decedent would have reached RMD age (73 if born 1951–1959, 75 if born 1960 or later). Leave blank to start RMDs the year after death."
              />
            </label>
            <input type="number" class="form-control form-control-sm" id="{uid}-birth-year" min="1900" max="2100"
              bind:value={getBirthYear, setBirthYear} />
          </div>
          <div class="col-6">
            <label class="form-label small fw-bold mb-1 d-flex align-items-center" for="{uid}-spouse-table">
              <span>RMD Table</span>
              <HelpPopover
                title="Surviving Spouse RMD Table"
                content="By default a spouse beneficiary's RMDs use the Single Life Table at the spouse's age each year. When the decedent died before their RBD, the spouse may elect (IRC § 401(a)(9)(B)(iv)) to use the Uniform Lifetime Table, which gives smaller RMDs. That table starts at age 72; below 72 the Single Life Table is used."
              />
            </label>
            <select class="form-select form-select-sm" id="{uid}-spouse-table" bind:value={getSpouseTable, setSpouseTable}>
              <option value="single">Single Life (recalculated)</option>
              <option value="uniform">Uniform Lifetime (election)</option>
            </select>
          </div>
        </div>
      {/if}

      {#if view.inherited_rule === 'ten_year'}
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1 d-flex align-items-center" for="{uid}-strategy">
            <span>10-Year Distribution Strategy</span>
            <HelpPopover
              title="10-Year Distribution Strategy"
              content="Choose how to draw from this account within the 10-year window: 'Minimum Required Only' takes only required annual RMDs (if any) and liquidates 100% in Year 10 (which may cause a large tax spike). 'Equalized / Ratable (1/Nth)' smooths distributions across the remaining years to avoid jumping into higher tax brackets."
            />
          </label>
          <select class="form-select form-select-sm" id="{uid}-strategy" bind:value={getStrategy, setStrategy}>
            <option value="rmd_only">Minimum Required Only (Balloon remaining balance in Year 10)</option>
            <option value="equalized">Equalized / Ratable (Distribute 1/Nth each year to smooth taxes)</option>
          </select>
        </div>
      {/if}
    {/if}

    <div class="row g-2 mb-3">
      <div class="col-6">
        <label class="form-label small fw-bold mb-1" for="{uid}-mean">Average Return %</label>
        <PercentInput id="{uid}-mean" class="form-control form-control-sm percent-input" bind:value={getMean, setMean} />
      </div>
      <div class="col-6 advanced-only-field">
        <label class="form-label small fw-bold mb-1" for="{uid}-vol">
          Volatility (Std Dev)
          <HelpPopover
            title="Volatility (Standard Deviation)"
            content="Historical market analysis supports an annualized standard deviation of 15%–20% for U.S. equities, 5%–8% for U.S. Treasuries, and 1%–3% for cash equivalents, depending on the time period measured."
          />
        </label>
        <select
          class="form-select form-select-sm acc-volatility-select"
          id="{uid}-vol"
          value={volatility}
          onchange={onVolatility}
          title="Historical market analysis supports an annualized standard deviation of 15%–20% for U.S. equities, 5%–8% for U.S. Treasuries, and 1%–3% for cash equivalents, depending on the time period measured."
        >
          <option value="low">Low (4.5%)</option>
          <option value="moderate">Moderate (9.5%)</option>
          <option value="high">High (16.0%)</option>
          <option value="custom">User Specified</option>
        </select>
        {#if volatility === 'custom'}
          <PercentInput
            id="{uid}-std"
            class="form-control form-control-sm percent-input mt-1 acc-return-std"
            bind:value={getStd, setStd}
            title="Historical market analysis supports an annualized standard deviation of 15%–20% for U.S. equities, 5%–8% for U.S. Treasuries, and 1%–3% for cash equivalents, depending on the time period measured."
          />
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
