<!-- An age-type select with the "specified age" input it reveals and that input's
     calendar-year hint (the page's age selects plus updateAgeHelperBadge). -->
<script lang="ts">
  import type { AgeOption } from '../../app/ageOptions';
  import { type People, yearAtAge } from '../../plan/accountCard';
  import { isSpecified } from '../../plan/scheduleRows';

  interface Props {
    id: string;
    options: AgeOption[];
    value: string;
    spec: number | null | undefined;
    people: People;
    small?: boolean;
    /** Width cap for the age input (the page uses 80px in periods, 110px elsewhere). */
    specWidth?: string;
    specClass?: string;
    selectClass?: string;
  }
  let {
    id, options, value = $bindable(), spec = $bindable(), people, small = false, specWidth = '110px',
    specClass = '', selectClass = '',
  }: Props = $props();

  const year = $derived(yearAtAge(spec, value === 'spouse_specified', people));
</script>

<div class="d-flex flex-column gap-1">
  <div class={['d-flex', small ? 'gap-1' : 'gap-2']}>
    <select class={[small ? 'form-select form-select-sm' : 'form-select', selectClass]} {id} bind:value>
      {#each options as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
    </select>
    {#if isSpecified(value)}
      <input type="number" class={[small ? 'form-control form-control-sm' : 'form-control', specClass]} id="{id}-spec"
        aria-label="Age" min="18" max="120" placeholder="Age" style="max-width: {specWidth};" bind:value={spec} />
    {/if}
  </div>
  <div class="age-helper-badge small text-muted fst-italic">
    {#if isSpecified(value) && year !== null}<i class="fa-regular fa-calendar me-1"></i>Year {year}{/if}
  </div>
</div>
