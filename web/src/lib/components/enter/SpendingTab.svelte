<!-- Tab 3: Spending (enter.html #spending): regular spending, additional spending
     items and other taxes. -->
<script lang="ts">
  import { ageOptions } from '../../app/ageOptions';
  import type { TabId } from '../../app/badges';
  import { personLabels, yearAtAge } from '../../plan/accountCard';
  import { CHOICES, isSpecified, newOtherTax, newSpendingItem, pick, spendingItemView } from '../../plan/scheduleRows';
  import type { AdditionalSpendingItem, Plan } from '../../plan/types';
  import MoneyInput from '../shared/MoneyInput.svelte';
  import OtherTaxCard from './OtherTaxCard.svelte';
  import TabFooter from './TabFooter.svelte';

  interface Props {
    plan: Plan;
    onSwitch: (to: TabId) => void;
  }
  let { plan = $bindable(), onSwitch }: Props = $props();

  const people = $derived(personLabels(plan));
  const married = $derived(people.isMarried);

  const beginType = $derived(pick(plan.begin_spending_age_type, CHOICES.beginSpending));
  const beginSpouse = $derived(beginType === 'spouse_specified');
  const beginWho = $derived(beginSpouse ? (married ? `${people.spouseName}'s ` : "Spouse's ") : (married ? `${people.userName}'s ` : 'Your '));
  const beginYear = $derived(yearAtAge(plan.begin_spending_age_specified, beginSpouse, people));

  function spendingField<K extends keyof AdditionalSpendingItem>(item: AdditionalSpendingItem, key: K) {
    return [
      () => spendingItemView(item)[key] as NonNullable<AdditionalSpendingItem[K]>,
      (v: AdditionalSpendingItem[K]) => (item[key] = v),
    ] as const;
  }
</script>

<div class="card p-4 mb-4">
  <h3 class="mb-3">Regular Retirement Spending</h3>
  <div class="row">
    <div class="col-md-4 mb-3">
      <label for="begin_spending_age_type" class="form-label">Start Age for Retirement Spending</label>
      <select class="form-select" id="begin_spending_age_type"
        bind:value={() => beginType, (v) => (plan.begin_spending_age_type = v)}>
        {#each ageOptions('beginSpending', people) as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
      </select>
    </div>
    {#if isSpecified(beginType)}
      <div class="col-md-4 mb-3" id="begin_spending_specified_group">
        <label for="begin_spending_age_specified" class="form-label">{beginWho}Specified Spending Start Age</label>
        <input type="number" class="form-control" id="begin_spending_age_specified" min="18" max="120" placeholder="{beginWho}Age"
          bind:value={plan.begin_spending_age_specified} />
        <div class="age-helper-badge small text-muted fst-italic mt-1">
          {#if beginYear !== null}<i class="fa-regular fa-calendar me-1"></i>Year {beginYear}{/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="row align-items-center">
    <div class="col-md-4 mb-3">
      <label for="desired_spending" class="form-label">Desired Recurring Annual Spending in Today’s Dollars</label>
      <MoneyInput id="desired_spending" class="form-control currency-input" dollarSign bind:value={plan.desired_spending} />
    </div>
    {#if married}
      <div class="col-md-4 mb-3" id="survivor_spending_group">
        <label for="survivor_spending" class="form-label">Amount of Regular Retirement Spending After First Death</label>
        <MoneyInput id="survivor_spending" class="form-control currency-input" dollarSign bind:value={plan.survivor_spending} />
      </div>
    {/if}
    <div class="col-md-4 mb-3 d-flex align-items-center">
      <div class="form-check form-switch ps-5 pt-3">
        <input class="form-check-input" type="checkbox" id="adjust_spending_inflation" bind:checked={() => !!plan.adjust_spending_inflation, (v) => (plan.adjust_spending_inflation = v)} />
        <label class="form-check-label font-weight-bold" for="adjust_spending_inflation">Adjust Desired Spending for Inflation</label>
      </div>
    </div>
  </div>
</div>

<div class="card p-4 mb-4">
  <h3 class="mb-3">Additional Spending</h3>
  <p class="text-secondary small mb-3">Enter (1) post-retirement spending items that do not occur every year (e.g. car purchase every 10 years, college, weddings) and (2) such pre-retirement spending items to the extent they are expected to be paid with funds from your Accounts for Retirement.</p>

  <div class="table-container mb-3" style="overflow-x: auto;">
    <table class="table align-middle" id="additionalSpendingTable" style="min-width: 800px;">
      <thead>
        <tr>
          <th style="width: 22%; min-width: 130px;">Spending Item Name</th>
          <th style="width: 18%; min-width: 110px;">Amount in Today's Dollars</th>
          <th style="width: 28%; min-width: 200px;">Start Age</th>
          <th style="width: 16%; min-width: 100px;" title="Enter how many years between each occurrence (e.g., 7 for a new car every 7 years). Enter 0 for a one-time expense.">Repeats Every (Years) <small class="text-muted">(0 = one-time)</small></th>
          <th style="width: 13%; min-width: 95px;">Adjust for Inflation?</th>
          <th style="width: 5%; min-width: 50px;">Action</th>
        </tr>
      </thead>
      <tbody>
        {#each plan.additional_spending ?? [] as item, i (item)}
          {@const view = spendingItemView(item)}
          {@const year = yearAtAge(view.start_age, view.start_age_type === 'spouse', people)}
          {@const [getName, setName] = spendingField(item, 'name')}
          {@const [getAmount, setAmount] = spendingField(item, 'amount')}
          {@const [getStart, setStart] = spendingField(item, 'start_age')}
          {@const [getWho, setWho] = spendingField(item, 'start_age_type')}
          {@const [getInterval, setInterval] = spendingField(item, 'interval')}
          <tr class="spending-row">
            <td>
              <input type="text" class="form-control add-spending-name" aria-label="Spending item name" placeholder="e.g. Car, World Cruise"
                required style="min-width: 120px;" bind:value={getName, setName} />
            </td>
            <td>
              <MoneyInput class="form-control currency-input add-spending-amount" dollarSign bind:value={getAmount, setAmount} />
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <div class="d-flex gap-1 align-items-center">
                  <input type="number" class="form-control add-spending-start-age" aria-label="Start age" min="18" max="120" required
                    style="min-width: 75px; max-width: 85px;" bind:value={getStart, setStart} />
                  {#if married}
                    <select class="form-select form-select-sm add-spending-start-type" aria-label="Whose age" style="min-width: 110px;"
                      bind:value={getWho, setWho}>
                      <option value="user">{people.userName}'s Age</option>
                      <option value="spouse">{people.spouseName}'s Age</option>
                    </select>
                  {/if}
                </div>
                <div class="age-helper-badge small text-muted fst-italic">
                  {#if year !== null}<i class="fa-regular fa-calendar me-1"></i>Year {year}{/if}
                </div>
              </div>
            </td>
            <td>
              <input type="number" class="form-control add-spending-interval" aria-label="Repeats every (years)" min="0" max="50"
                placeholder="0 (one-time)" required style="min-width: 75px;" bind:value={getInterval, setInterval} />
            </td>
            <td>
              <select class="form-select add-spending-inflation" aria-label="Adjust for inflation"
                value={view.adjust_inflation ? 'true' : 'false'}
                onchange={(e) => (item.adjust_inflation = (e.currentTarget as HTMLSelectElement).value === 'true')}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </td>
            <td>
              <button type="button" class="btn btn-outline-danger btn-sm btnDeleteRow" title="Delete" aria-label="Delete"
                onclick={() => plan.additional_spending?.splice(i, 1)}>
                <i class="fa fa-trash"></i>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="text-center">
    <button type="button" class="btn btn-secondary btn-sm" id="btnAddSpendingRow"
      onclick={() => (plan.additional_spending ??= []).push(newSpendingItem())}>
      <i class="fa fa-plus me-1"></i> Add Spending Item
    </button>
  </div>
</div>

<div class="card p-4 mb-4 advanced-only-card" id="otherTaxesCard">
  <h3 class="mb-2">Other Taxes</h3>
  <div class="alert alert-info border-0 shadow-sm mb-3">
    <i class="fa-solid fa-circle-info me-2"></i>
    This calculator factors in a rough estimate of federal and state income taxes on Income Streams and Social Security. This includes a rough approximation of taxes on estimated capital gains and dividends in your taxable accounts. There are other taxes, such as the Net Investment Income Tax (NIIT), and income-based governmental surcharges, such as the surcharges for Medicare (IRMAA), that this calculator does not automatically include. If you expect to incur any of these taxes or surcharges or you are subject to any other types of taxes, enter them below.
  </div>

  <div id="otherTaxesContainer">
    {#each plan.other_taxes ?? [] as _, i (plan.other_taxes![i])}
      <OtherTaxCard bind:item={plan.other_taxes![i]} {people} onDelete={() => plan.other_taxes?.splice(i, 1)} />
    {/each}
  </div>

  <div class="text-center mt-2">
    <button type="button" class="btn btn-secondary btn-sm" id="btnAddOtherTaxRow"
      onclick={() => (plan.other_taxes ??= []).push(newOtherTax())}>
      <i class="fa fa-plus me-1"></i> Add Tax Item
    </button>
  </div>
</div>

<TabFooter back={{ label: 'Back', to: 'assets' }} next={{ label: 'Next: Social Security & Income Streams', to: 'income' }} {onSwitch} />
