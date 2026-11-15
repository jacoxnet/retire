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
    title?: string;
  }
  let { value = $bindable(), id, emptyValue = 0, class: cls = 'form-control', invalid = false, title }: Props = $props();

  let focused = $state(false);
  let text = $state('');
  let hasJustFocused = false;

  $effect.pre(() => {
    const v = value;
    if (!focused) text = formatPercent(v ?? emptyValue);
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
    const sanitized = input.value.replace(/^(-?)0+(\d)/, '$1$2');
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    text = sanitized;
    value = parseNumberText(text) ?? emptyValue;
  }

  function onblur() {
    focused = false;
    hasJustFocused = false;
    text = formatPercent(value ?? emptyValue);
  }
</script>

<input
  type="text"
  inputmode="decimal"
  class={[cls, invalid && 'is-invalid']}
  {id}
  {title}
  value={text}
  onfocus={handleFocus}
  onmouseup={handleMouseUp}
  onclick={handleClick}
  {oninput}
  {onblur}
/>
