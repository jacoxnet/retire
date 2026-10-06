<!-- A percentage shown with a "%" sign (enter.js .percent-input). The bound value is
     the number of percent; an empty field is `emptyValue`. -->
<script lang="ts">
  import { formatPercent, parseNumberText } from '../../app/format';

  interface Props {
    value: number | null | undefined;
    id?: string;
    emptyValue?: number;
    class?: string;
    invalid?: boolean;
  }
  let { value = $bindable(), id, emptyValue = 0, class: cls = 'form-control', invalid = false }: Props = $props();

  let focused = $state(false);
  let text = $state('');

  $effect.pre(() => {
    const v = value;
    if (!focused) text = formatPercent(v ?? emptyValue);
  });

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    value = parseNumberText(text) ?? emptyValue;
  }

  function onblur() {
    focused = false;
    text = formatPercent(value ?? emptyValue);
  }
</script>

<input
  type="text"
  inputmode="decimal"
  class={[cls, invalid && 'is-invalid']}
  {id}
  value={text}
  onfocus={() => (focused = true)}
  {oninput}
  {onblur}
/>
