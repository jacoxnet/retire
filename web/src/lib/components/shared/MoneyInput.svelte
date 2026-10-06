<!-- A whole-dollar amount shown with thousands separators. The bound value is a number;
     an empty field is 0 (as get_float defaults it). -->
<script lang="ts">
  import { formatMoney, parseNumberText } from '../../app/format';

  interface Props {
    value: number | null | undefined;
    id?: string;
    /** Show a "$" inside the field (enter.js .currency-input); otherwise use an input-group "$". */
    dollarSign?: boolean;
    class?: string;
    invalid?: boolean;
    onblur?: () => void;
  }
  let { value = $bindable(), id, dollarSign = false, class: cls = 'form-control', invalid = false, onblur }: Props = $props();

  let focused = $state(false);
  let text = $state('');

  // Re-format from the value unless the user is typing in the field.
  $effect.pre(() => {
    const v = value;
    if (!focused) text = formatMoney(v ?? 0, dollarSign);
  });

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    value = parseNumberText(text) ?? 0;
  }

  function handleBlur() {
    focused = false;
    text = formatMoney(value ?? 0, dollarSign);
    onblur?.();
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
  onblur={handleBlur}
/>
