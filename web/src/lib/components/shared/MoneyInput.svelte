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
    placeholder?: string;
    onblur?: () => void;
  }
  let { value = $bindable(), id, dollarSign = false, class: cls = 'form-control', invalid = false, placeholder, onblur }: Props = $props();

  let focused = $state(false);
  let text = $state('');
  let hasJustFocused = false;

  // Re-format from the value unless the user is typing in the field.
  $effect.pre(() => {
    const v = value;
    if (!focused) text = (v === null || v === undefined) && placeholder ? '' : formatMoney(v ?? 0, dollarSign);
  });

  function handleFocus(e: FocusEvent) {
    focused = true;
    hasJustFocused = true;
    const target = e.currentTarget as HTMLInputElement;
    target.select?.();
    setTimeout(() => {
      if (document.activeElement === target) {
        target.select?.();
      }
    }, 0);
  }

  function handleMouseUp(e: MouseEvent) {
    if (hasJustFocused) {
      hasJustFocused = false;
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).select?.();
    }
  }

  function handleClick(e: MouseEvent) {
    if (hasJustFocused) {
      hasJustFocused = false;
      (e.currentTarget as HTMLInputElement).select?.();
    }
  }

  function oninput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const sanitized = input.value.replace(/^(-?\$?)0+(\d)/, '$1$2');
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    text = sanitized;
    const parsed = parseNumberText(text);
    value = parsed ?? (placeholder ? undefined : 0);
  }

  function handleBlur() {
    focused = false;
    hasJustFocused = false;
    text = (value === null || value === undefined) && placeholder ? '' : formatMoney(value ?? 0, dollarSign);
    onblur?.();
  }
</script>

<input
  type="text"
  inputmode="decimal"
  class={[cls, invalid && 'is-invalid']}
  {id}
  value={text}
  {placeholder}
  onfocus={handleFocus}
  onmouseup={handleMouseUp}
  onclick={handleClick}
  {oninput}
  onblur={handleBlur}
/>
