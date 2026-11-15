<!-- An institution / notes text input with click and focus auto-selection.
     Clicking anywhere selects "[To be added]" so typing immediately replaces it.
     Subsequent clicks on custom values allow normal text caret positioning. -->
<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    class?: string;
    id?: string;
    ariaLabel?: string;
    disabled?: boolean;
  }
  let {
    value = $bindable(''),
    placeholder = '[To be added]',
    class: cls = 'form-control',
    id,
    ariaLabel,
    disabled = false,
  }: Props = $props();

  let focused = $state(false);
  let text = $state('');
  let hasJustFocused = false;

  $effect.pre(() => {
    const v = value ?? '';
    if (!focused) text = v;
  });

  function isToBeAdded(val: string): boolean {
    return val.trim().toLowerCase() === '[to be added]';
  }

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
    const target = e.currentTarget as HTMLInputElement;
    if (hasJustFocused || isToBeAdded(target.value)) {
      hasJustFocused = false;
      e.preventDefault();
      target.select?.();
    }
  }

  function handleClick(e: MouseEvent) {
    const target = e.currentTarget as HTMLInputElement;
    if (hasJustFocused || isToBeAdded(target.value)) {
      hasJustFocused = false;
      target.select?.();
    }
  }

  function oninput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    text = input.value;
    value = input.value;
  }

  function handleBlur() {
    focused = false;
    hasJustFocused = false;
    text = value ?? '';
  }
</script>

<input
  type="text"
  class={cls}
  {id}
  aria-label={ariaLabel}
  {placeholder}
  {disabled}
  value={text}
  onfocus={handleFocus}
  onmouseup={handleMouseUp}
  onclick={handleClick}
  {oninput}
  onblur={handleBlur}
/>
