<!-- A plain non-negative decimal (the rebalancing % fields): typing keeps only digits
     and dots; an empty or unreadable field counts as 0. -->
<script lang="ts">
  interface Props {
    value: number;
    id?: string;
    class?: string;
    label?: string;
  }
  let { value = $bindable(), id, class: cls = 'form-control', label }: Props = $props();
  let focused = $state(false);
  let text = $state('');
  let hasJustFocused = false;

  $effect.pre(() => {
    const v = value;
    if (!focused) text = String(v > 0 ? v : 0);
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
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    value = Number.isNaN(n) ? 0 : Math.max(0, n);
  }

  function handleBlur() {
    focused = false;
    hasJustFocused = false;
    text = String(value > 0 ? value : 0);
  }
</script>

<input
  type="text"
  inputmode="decimal"
  class={cls}
  {id}
  aria-label={label}
  value={text}
  onfocus={handleFocus}
  onmouseup={handleMouseUp}
  onclick={handleClick}
  {oninput}
  onblur={handleBlur}
/>
