<!-- "Actual Allocation vs. Target Allocation" bars (enter.js renderRebComparisonChart). -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatMoney } from '../../app/format';
  import type { ClassResult } from '../../plan/rebalance';

  let { classes }: { classes: ClassResult[] } = $props();
  let canvas: HTMLCanvasElement | undefined = $state();
  let chart: { destroy(): void } | null = null;
  let token = 0;

  $effect(() => {
    const rows = classes.map((r) => ({ ...r }));
    const el = canvas;
    if (!el || !el.getContext?.('2d')) return;
    const mine = ++token;
    const money = (v: number) => formatMoney(v, true);
    import('chart.js/auto').then(({ default: Chart }) => {
      if (mine !== token) return;
      chart?.destroy();
      chart = new Chart(el, {
        type: 'bar',
        data: {
          labels: rows.map((r) => r.name),
          datasets: [
            { label: 'Actual Allocation %', data: rows.map((r) => parseFloat(r.actualPct.toFixed(1))), backgroundColor: rows.map((r) => `${r.color}cc`),
              borderColor: rows.map((r) => r.color), borderWidth: 1.5, borderRadius: 4 },
            { label: 'Target Allocation %', data: rows.map((r) => parseFloat(r.targetPct.toFixed(1))), backgroundColor: '#94a3b8',
              borderColor: '#64748b', borderWidth: 1, borderRadius: 4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 12, weight: 'bold' } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const r = rows[ctx.dataIndex];
                  return ctx.datasetIndex === 0
                    ? `Actual: ${r.actualPct.toFixed(1)}% (${money(r.actualDol)})`
                    : `Target: ${r.targetPct.toFixed(1)}% (${money(r.targetDol)}) [Allowed: ${r.minPct.toFixed(1)}%–${r.maxPct.toFixed(1)}%]`;
                },
              },
            },
          },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}%` } } },
        },
      });
    });
  });

  onDestroy(() => {
    token++;
    chart?.destroy();
  });
</script>

<div style="height: 300px; position: relative;">
  <canvas id="rebComparisonChart" bind:this={canvas}></canvas>
</div>
