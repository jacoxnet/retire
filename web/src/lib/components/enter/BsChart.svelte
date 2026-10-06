<!-- "Net Worth & Asset History" chart (enter.js renderBsHistoricalChart). Chart.js is
     loaded on first use; without a 2D canvas (tests) nothing is drawn. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatMoney } from '../../app/format';
  import type { ChartMetric, ChartSeries } from '../../plan/bsView';

  interface Props {
    series: ChartSeries;
    metric: ChartMetric;
  }
  let { series, metric }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let chart: { destroy(): void } | null = null;

  const line = (label: string, data: number[], color: string, fill: string) => ({
    type: 'line' as const,
    data: { labels: series.labels, datasets: [{ label, data, borderColor: color, backgroundColor: fill, fill: true, tension: 0.3, pointRadius: 5, pointHoverRadius: 7, borderWidth: 3 }] },
  });

  /** Axis labels: $1.2M / $350k, with more decimals when the ticks are close together. */
  function tick(v: number, ticks: { value: number }[]): string {
    const step = ticks.length > 1 ? Math.abs(ticks[1].value - ticks[0].value) : 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1000000) {
      const d = step > 0 && step < 10000 ? 3 : step > 0 && step < 100000 ? 2 : step >= 1000000 ? 0 : 1;
      return `${sign}$${(abs / 1000000).toFixed(d)}M`;
    }
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(step > 0 && step < 1000 ? 1 : 0)}k`;
    return `${sign}$${abs}`;
  }

  function config() {
    const base =
      metric === 'gross_net_worth' ? line('Gross Net Worth ($)', series.gross, '#3b82f6', 'rgba(59, 130, 246, 0.12)')
      : metric === 'liquid_net_worth' ? line('Liquid Net Worth ($)', series.liquid, '#10b981', 'rgba(16, 185, 129, 0.12)')
      : metric === 'net_retirement' ? line('Retirement Savings (Net of Income Tax) ($)', series.netRetirement, '#8b5cf6', 'rgba(139, 92, 246, 0.12)')
      : {
          type: 'bar' as const,
          data: {
            labels: series.labels,
            datasets: [
              { label: 'Pretax Retirement', data: series.pretax, backgroundColor: '#3b82f6', stack: 'assets' },
              { label: 'Roth Accounts', data: series.roth, backgroundColor: '#8b5cf6', stack: 'assets' },
              { label: 'Taxable & HSA', data: series.taxableHsa, backgroundColor: '#06b6d4', stack: 'assets' },
              { label: 'Cash, Goals & Emergency', data: series.cash, backgroundColor: '#10b981', stack: 'assets' },
              { label: 'Home Equity', data: series.homeEquity, backgroundColor: '#f59e0b', stack: 'assets' },
            ],
          },
        };
    return {
      ...base,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { family: 'Inter', weight: 600 } } },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label || ''}: ${formatMoney(ctx.parsed.y ?? ctx.parsed, true)}` } },
        },
        scales: { y: { ticks: { callback: (v: any, _i: number, ticks: any[]) => tick(Number(v), ticks) } } },
      },
    };
  }

  let token = 0;
  $effect(() => {
    const cfg = config(); // tracks series and metric
    const el = canvas;
    if (!el || !el.getContext?.('2d')) return;
    const mine = ++token;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (mine !== token) return;
      chart?.destroy();
      chart = new Chart(el, cfg as any);
    });
  });

  onDestroy(() => {
    token++;
    chart?.destroy();
  });
</script>

<div style="height: 320px; position: relative;">
  <canvas id="bsHistoricalChart" bind:this={canvas}></canvas>
</div>
