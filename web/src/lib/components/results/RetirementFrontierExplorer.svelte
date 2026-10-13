<!-- Trade-Off Frontier Explorer for married couples in Earliest Retirement Age mode -->
<script lang="ts">
  import type { FrontierPoint } from '../../engine/earliestRetirement';
  import { floatformat } from '../../app/resultsFormat';

  interface Props {
    frontier: FrontierPoint[];
    userName?: string;
    spouseName?: string;
    userAge: number;
    spouseAge: number;
    currentYear: number;
  }

  let {
    frontier = [],
    userName = 'You',
    spouseName = 'Spouse',
    userAge,
    spouseAge,
    currentYear,
  }: Props = $props();

  const minUserAge = $derived(frontier.length ? Math.min(...frontier.map((p) => p.user_ret_age)) : userAge);
  const maxUserAge = $derived(frontier.length ? Math.max(...frontier.map((p) => p.user_ret_age)) : userAge);

  const initialSelected = $derived(
    frontier.find((p) => p.is_selected)?.user_ret_age ??
      frontier[Math.floor(frontier.length / 2)]?.user_ret_age ??
      minUserAge,
  );

  let chosenAge = $state<number | null>(null);
  const selectedUserAge = $derived(chosenAge ?? initialSelected);

  const selectedPoint = $derived(
    frontier.find((p) => p.user_ret_age === selectedUserAge) ??
      frontier.reduce((prev, curr) =>
        Math.abs(curr.user_ret_age - selectedUserAge) < Math.abs(prev.user_ret_age - selectedUserAge) ? curr : prev,
      ),
  );

  function noteForPoint(p: FrontierPoint): string {
    if (p.is_selected) return 'Selected Strategy';
    if (p.user_year === p.spouse_year) return 'Retire Together';
    if (p.user_ret_age === p.spouse_ret_age) return 'Retire at Same Age';
    if (p.user_ret_age < (frontier.find((x) => x.is_selected)?.user_ret_age ?? 999)) {
      return `${userName} works less / ${spouseName} works longer`;
    }
    return `${userName} works longer / ${spouseName} works less`;
  }
</script>

{#if frontier.length > 0}
  <div class="card p-4 mt-4 shadow-sm border-info" id="frontierExplorerCard">
    <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
      <h4 class="text-primary mb-0">
        <i class="fa-solid fa-scale-unbalanced-flip me-2 text-info"></i>
        Couple's Retirement Trade-Off Explorer
      </h4>
      <span class="badge bg-info text-dark">Alternative Combinations</span>
    </div>

    <p class="text-secondary small mb-3">
      Because household income, savings and living expenses change depending on who remains in the workforce,
      there are multiple combinations of retirement ages that achieve your target success rate.
      Use the slider below or click any row in the comparison table to explore alternative retirement scenarios.
    </p>

    <!-- Interactive Slider -->
    <div class="p-3 bg-light rounded border mb-4">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <label for="frontierUserSlider" class="form-label fw-bold mb-0">
          If {userName} Retires at Age:
        </label>
        <span class="badge bg-primary fs-6 px-3 py-1">
          Age {selectedPoint.user_ret_age} ({selectedPoint.user_year})
        </span>
      </div>

      <input
        type="range"
        class="form-range"
        id="frontierUserSlider"
        min={minUserAge}
        max={maxUserAge}
        step={1}
        value={selectedUserAge}
        oninput={(e) => (chosenAge = parseInt(e.currentTarget.value, 10))}
      />

      <div class="alert alert-primary py-2 px-3 mt-3 mb-0 d-flex justify-content-between align-items-center">
        <div>
          <i class="fa-solid fa-arrow-right-arrow-left me-2 text-primary"></i>
          Then <strong>{spouseName}</strong> can retire at Age <strong>{selectedPoint.spouse_ret_age}</strong>
          ({selectedPoint.spouse_year}).
        </div>
        <span class="badge bg-success">
          {floatformat(selectedPoint.success_rate, 1)}% Success Rate
        </span>
      </div>
    </div>

    <!-- Comparison Table -->
    <h5 class="text-secondary border-bottom pb-2 mb-3">Retirement Combinations Table</h5>
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0" id="frontierComparisonTable">
        <thead class="table-light">
          <tr>
            <th>{userName}'s Retirement Age</th>
            <th>{spouseName}'s Retirement Age</th>
            <th class="text-end">Success Rate</th>
            <th>Scenario Note</th>
          </tr>
        </thead>
        <tbody>
          {#each frontier as p (p.user_ret_age)}
            {@const isCurrent = p.user_ret_age === selectedPoint.user_ret_age}
            <tr
              class={[isCurrent && 'table-primary fw-semibold']}
              style="cursor: pointer;"
              onclick={() => (chosenAge = p.user_ret_age)}
            >
              <td>
                Age {p.user_ret_age} <span class="text-muted small">({p.user_year})</span>
              </td>
              <td>
                Age {p.spouse_ret_age} <span class="text-muted small">({p.spouse_year})</span>
              </td>
              <td class="text-end text-success font-weight-bold">
                {floatformat(p.success_rate, 1)}%
              </td>
              <td>
                {#if p.is_selected}
                  <span class="badge bg-primary">Selected Strategy</span>
                {:else if p.user_year === p.spouse_year}
                  <span class="badge bg-info text-dark">Retire Together</span>
                {:else}
                  <span class="text-muted small">{noteForPoint(p)}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
