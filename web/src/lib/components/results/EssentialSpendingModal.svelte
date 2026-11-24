<!-- Informational modal explaining what to include and exclude in Minimum Essential Annual Living Expenses. -->
<script lang="ts">
  import Modal from '../shared/Modal.svelte';

  interface Props {
    open: boolean;
  }
  let { open = $bindable() }: Props = $props();
</script>

<Modal bind:open id="essentialSpendingModal" size="lg">
  {#snippet title()}
    <i class="fa-solid fa-circle-info me-2"></i>What Counts as Minimum Essential Annual Living Expenses?
  {/snippet}

  <p class="text-secondary mb-3">
    This optional amount (in <strong>today's dollars</strong>) represents the bare-minimum annual budget your household needs to cover
    non-negotiable living costs—even in a severe market downturn. In <strong>Guardrails</strong> mode, it lets you see how often market-driven
    spending cuts and skipped inflation raises drop below your essential bills, or opt in to preventing cuts below this floor.
  </p>

  <div class="card mb-3 border-success-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-success">Include</span>
        <strong class="text-dark">Non-Negotiable Core Household Expenses</strong>
      </div>
      <ul class="small text-secondary ps-3 mb-0">
        <li><strong>Housing:</strong> Rent or mortgage principal &amp; interest, property taxes, homeowners/renters insurance, HOA/condo fees, and routine home maintenance.</li>
        <li><strong>Utilities:</strong> Electricity, gas/heating, water/sewer, trash, basic internet, and phone service.</li>
        <li><strong>Food &amp; Everyday Basics:</strong> Groceries, essential household supplies, toiletries, basic clothing, and pet food/routine veterinary care.</li>
        <li><strong>Transportation:</strong> Fuel, auto insurance, vehicle registration, routine auto maintenance, or public transit.</li>
        <li><strong>Healthcare &amp; Insurance:</strong> Pre-65 health insurance/COBRA or Medicare Part B/D and Medigap/Advantage premiums, prescriptions, dental/vision, and ongoing life or long-term care (LTC) insurance premiums.</li>
        <li><strong>Fixed Debt Obligations:</strong> Ongoing loan payments continuing into retirement (auto loans, student loans, HELOCs) or required family/support obligations.</li>
      </ul>
    </div>
  </div>

  <div class="card mb-3 border-warning-subtle bg-light">
    <div class="card-body py-3">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="badge bg-warning text-dark">Do Not Include</span>
        <strong class="text-dark">Expenses Already Modeled Separately (Avoid Double-Counting)</strong>
      </div>
      <ul class="small text-secondary ps-3 mb-0">
        <li><strong>Income Taxes:</strong> Federal and state income taxes are estimated automatically by the simulation engine each year.</li>
        <li><strong>IRMAA, NIIT &amp; Additional Taxes:</strong> Medicare IRMAA surcharges, Net Investment Income Tax (NIIT), or other taxes you entered under <strong>Other Taxes</strong> (<em>Additional Taxes</em>) on the Spending tab are modeled separately and are not cut by Guardrails.</li>
        <li><strong>Additional Spending Items:</strong> Irregular or milestone purchases entered under <strong>Additional Spending</strong> (such as periodic vehicle replacements or home renovations) are modeled separately and are not cut by Guardrails.</li>
      </ul>
    </div>
  </div>

  <p class="small text-muted mb-0">
    <strong>Tip:</strong> Leave out discretionary expenses such as travel, dining out, gifts, and hobbies—that flexible margin above your
    essentials is what Guardrails is designed to trim during market downturns. For married couples, essential household costs stay unscaled
    in today's dollars after a first death unless your plan's starting surviving-spouse spending is already lower.
  </p>

  {#snippet footer()}
    <button type="button" class="btn btn-secondary btn-sm" onclick={() => (open = false)}>Close</button>
  {/snippet}
</Modal>
