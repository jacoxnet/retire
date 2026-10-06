<!-- A Chart.js chart, rebuilt whenever its configuration changes. Chart.js is loaded
     on first use; without a 2D canvas (tests) nothing is drawn. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { printRegistry } from '../../app/printCharts';

  interface Props {
    config: { type: string; data: unknown; options: unknown };
    plugins?: unknown[];
    canvasId?: string;
    /** Shows a static image of the chart when printing (style.css swaps it for the canvas). */
    printImgId?: string;
    alt?: string;
  }
  let { config, plugins = [], canvasId, printImgId, alt = '' }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let img: HTMLImageElement | undefined = $state();
  let chart: any = null;

  let token = 0;
  $effect(() => {
    const cfg = { ...config, plugins };
    const el = canvas;
    if (!el || !el.getContext?.('2d')) return;
    const mine = ++token;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (mine !== token) return;
      chart?.destroy();
      chart = new Chart(el, cfg as any);
    });
  });

  const registry = printRegistry();
  const printable = {
    prepare() {
      if (!chart || !canvas) return;
      chart.resize();
      chart.update('none');
      if (img) {
        try {
          img.src = canvas.toDataURL('image/png');
        } catch {
          // a tainted or unsupported canvas: the canvas prints as is
        }
      }
    },
    restore() {
      chart?.resize();
    },
  };
  registry?.add(printable);

  onDestroy(() => {
    token++;
    registry?.delete(printable);
    chart?.destroy();
    chart = null;
  });
</script>

<canvas id={canvasId} bind:this={canvas}></canvas>
{#if printImgId}<img id={printImgId} class="chart-print-img" {alt} bind:this={img}>{/if}
