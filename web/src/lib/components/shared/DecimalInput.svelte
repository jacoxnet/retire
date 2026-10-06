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

  $effect.pre(() => {
    const v = value;
    if (!focused) text = String(v > 0 ? v : 0);
  });

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    value = Number.isNaN(n) ? 0 : Math.max(0, n);
  }
</script>

<input type="text" inputmode="decimal" class={cls} {id} aria-label={label} value={text}
  onfocus={() => (focused = true)} {oninput} onblur={() => { focused = false; text = String(value > 0 ? value : 0); }} />
