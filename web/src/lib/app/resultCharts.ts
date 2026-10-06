// Chart.js configurations for the Results page's Charts tab (results.js), as pure
// functions of the results so they can be tested without a canvas.
import type { Dict } from '../engine/py';
import type { Results } from './results';
import { chartMoney } from './resultsFormat';

export type DollarMode = 'nominal' | 'real';
export type ChartKind = 'spaghetti' | 'trajectory' | 'assetBreakdown' | 'incomeSpending' | 'taxLiability';

export const CHART_TITLES: Record<ChartKind, { card: string; modal: string }> = {
  spaghetti: { card: '1. Spaghetti Chart of Monte Carlo Runs', modal: '1. Spaghetti Chart of Monte Carlo Runs' },
  trajectory: { card: '2. Monte Carlo Wealth Trajectory', modal: '2. Monte Carlo Wealth Trajectory' },
  assetBreakdown: { card: '3. Deterministic Asset Class Breakdown (Drawdown Sequence)', modal: '3. Deterministic Asset Class Breakdown' },
  incomeSpending: { card: '4. Deterministic Annual Income vs. Spending Sources', modal: '4. Deterministic Annual Income vs. Spending Sources' },
  taxLiability: { card: '5. Deterministic Lifetime Tax Liability & "The Tax Bomb"', modal: '5. Deterministic Lifetime Tax Liability & RMD Spikes' },
};

/** The values results.js read from #chart-config-json. */
function chartSettings(r: Results) {
  const first = r.det_rows[0];
  return {
    inflationRate: r.inflation_rate ?? 2.5,
    startYear: first?.year ?? 2026,
    userStartAge: first?.user_age ?? 60,
  };
}

/** Deflate a value t years into the plan when showing real dollars (scaleVal). */
function scaler(r: Results, mode: DollarMode) {
  const { inflationRate } = chartSettings(r);
  return (val: number, t: number) => (mode === 'real' ? val / Math.pow(1.0 + inflationRate / 100.0, t) : val);
}

const tooltipLabel = (context: any) => `${context.dataset.label}: ${chartMoney(context.raw)}`;

function lineOptions(yAxisTitle: string, showLegend = true, stacked = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 25, right: 12 } },
    events: ['click', 'touchstart'],
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: showLegend, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: tooltipLabel } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { stacked, grace: '8%', ticks: { callback: (value: number) => chartMoney(value) }, title: { display: true, text: yAxisTitle } },
    },
  };
}

export const SPAGHETTI_COUNTS = [10, 25, 50, 100, 250, 500];

export function spaghettiConfig(r: Results, mode: DollarMode, pathCount: number) {
  const { startYear, userStartAge } = chartSettings(r);
  const scale = scaler(r, mode);
  const paths = (r.mc_spaghetti_paths ?? []).slice(0, pathCount);
  const years = paths.length > 0 ? paths[0].length : 0;
  const labels = Array.from({ length: years }, (_, t) => `Age ${userStartAge + t} (${startYear + t})`);
  const datasets = paths.map((path, idx) => {
    const hue = (idx * 137.5) % 360;
    return {
      label: `Run ${idx + 1}`,
      data: path.map((val, t) => scale(val, t)),
      borderColor: `hsla(${hue}, 75%, 48%, 0.4)`,
      borderWidth: 1.2,
      pointRadius: 0,
      tension: 0.1,
      fill: false,
    };
  });
  return { type: 'line', data: { labels, datasets }, options: lineOptions('Portfolio Wealth ($)', false) };
}

export function trajectoryConfig(r: Results, mode: DollarMode) {
  const { startYear, userStartAge } = chartSettings(r);
  const scale = scaler(r, mode);
  const labels = Array.from({ length: (r.mc_p50 ?? []).length }, (_, t) => `Age ${userStartAge + t} (${startYear + t})`);
  const band = (label: string, data: number[], color: string, fill: string, width: number) => ({
    label, data: (data ?? []).map((v, t) => scale(v, t)), borderColor: color, backgroundColor: fill, borderWidth: width, pointRadius: 1, tension: 0.2,
  });
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        band('90th Percentile (Optimistic)', r.mc_p90, '#10b981', 'rgba(16, 185, 129, 0.1)', 2.5),
        band('50th Percentile (Median)', r.mc_p50, '#3b82f6', 'rgba(59, 130, 246, 0.1)', 3),
        band('10th Percentile (Pessimistic)', r.mc_p10, '#ef4444', 'rgba(239, 68, 68, 0.1)', 2.5),
      ],
    },
    options: lineOptions('Portfolio Wealth ($)', true),
  };
}

function rowLabels(r: Results) {
  const { startYear, userStartAge } = chartSettings(r);
  return r.det_rows.map((row, t) => `Age ${row.user_age || userStartAge + t} (${row.year || startYear + t})`);
}

export function assetBreakdownConfig(r: Results, mode: DollarMode) {
  const scale = scaler(r, mode);
  // Ending balances are end-of-year values, so they deflate one more year.
  const series = (key: string) => r.det_rows.map((row, t) => scale(row.ending_assets[key] || 0, t + 1));
  const area = (label: string, key: string, fill: string, color: string, first = false) => ({
    label, data: series(key), backgroundColor: fill, borderColor: color, borderWidth: 1.5, fill: first ? 'origin' : '-1', pointRadius: 0, tension: 0.2,
  });
  return {
    type: 'line',
    data: {
      labels: rowLabels(r),
      datasets: [
        area('Pretax Assets (IRA/401k)', 'pretax', 'rgba(230, 57, 70, 0.75)', '#e63946', true),
        area('Roth Assets (Roth IRA/401k)', 'roth', 'rgba(255, 183, 3, 0.75)', '#ffb703'),
        area('Taxable Assets (Brokerage/Cash)', 'taxable', 'rgba(33, 158, 188, 0.75)', '#219ebc'),
        area('HSA Assets (Health Savings)', 'hsa', 'rgba(42, 157, 143, 0.75)', '#2a9d8f'),
      ],
    },
    options: lineOptions('Total Assets ($)', true, true),
  };
}

/** Split a year's income into Social Security and everything else, as the chart does. */
export function splitIncome(row: Dict, plan: Dict): { ss: number; other: number } {
  const ssNames = ((plan.income_sources || []) as Dict[]).filter((s) => s.is_social_security).map((s) => String(s.name).trim().toLowerCase());
  let ss = 0;
  let other = 0;
  for (const [name, amt] of Object.entries((row.income_breakdown || {}) as Record<string, number>)) {
    const clean = name.trim().toLowerCase();
    // As results.js: any name containing "ss" counts as Social Security.
    if (ssNames.includes(clean) || clean.includes('social security') || clean.includes('ss')) ss += amt || 0;
    else other += amt || 0;
  }
  return { ss, other };
}

const barOptions = (yTitle: string, extra: Dict = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 25, right: 12 } },
  events: ['click', 'touchstart'],
  ...extra,
  plugins: {
    legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: { callbacks: { label: tooltipLabel } },
    ...(extra.plugins ?? {}),
  },
  scales: {
    x: { stacked: true, grid: { display: false } },
    y: { stacked: true, grace: '8%', ticks: { callback: (value: number) => chartMoney(value) }, title: { display: true, text: yTitle } },
  },
});

export function incomeSpendingConfig(r: Results, mode: DollarMode) {
  const scale = scaler(r, mode);
  const plan = r.plan_data_json ?? {};
  const ss: number[] = [];
  const pension: number[] = [];
  const withdrawals: number[] = [];
  const desired: number[] = [];
  const additional: number[] = [];
  const taxes: number[] = [];
  r.det_rows.forEach((row, t) => {
    const inc = splitIncome(row, plan);
    ss.push(scale(inc.ss, t));
    pension.push(scale(inc.other, t));
    withdrawals.push(scale(row.withdrawals.total || 0, t));
    desired.push(scale(row.desired_spending || 0, t));
    additional.push(scale(row.additional_spending || 0, t));
    taxes.push(scale(row.taxes || 0, t));
  });
  return {
    type: 'bar',
    data: {
      labels: rowLabels(r),
      datasets: [
        { label: 'Social Security', data: ss, backgroundColor: '#06d6a0', stack: 'Inflows' },
        { label: 'Pensions & Other Income', data: pension, backgroundColor: '#118ab2', stack: 'Inflows' },
        { label: 'Portfolio Withdrawals', data: withdrawals, backgroundColor: '#8338ec', stack: 'Inflows' },
        { label: 'Regular Spending', data: desired, backgroundColor: '#ff4d6d', stack: 'Outflows' },
        { label: 'Additional Spending', data: additional, backgroundColor: '#ffb703', stack: 'Outflows' },
        { label: 'Taxes & Penalties', data: taxes, backgroundColor: '#c1121f', stack: 'Outflows' },
      ],
    },
    options: barOptions('Annual Cash Flow ($)', { interaction: { mode: 'index', intersect: false } }),
  };
}

export function taxLiabilityConfig(r: Results, mode: DollarMode) {
  const scale = scaler(r, mode);
  const { userStartAge } = chartSettings(r);
  const rows = r.det_rows;
  const options = barOptions('Annual Tax Liability ($)', {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const row = rows[context.dataIndex];
            let label = `Taxes Paid: ${chartMoney(context.raw)}`;
            if (row && row.milestones && row.milestones.length > 0) label += ` (${row.milestones.join(', ')})`;
            return label;
          },
        },
      },
    },
  });
  options.scales.x.stacked = false;
  options.scales.y.stacked = false;
  return {
    type: 'bar',
    data: {
      labels: rows.map((row, t) => `Age ${row.user_age || userStartAge + t} (${row.year})`),
      datasets: [{
        label: 'Taxes Paid',
        data: rows.map((row, t) => scale(row.taxes || 0, t)),
        backgroundColor: rows.map((row) => ((row.milestones || []) as string[]).some((m) => m.toLowerCase().includes('rmd')) ? '#ffb703' : '#d90429'),
        borderColor: '#a0001c',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options,
  };
}

export function chartConfig(kind: ChartKind, r: Results, mode: DollarMode, pathCount = 100) {
  switch (kind) {
    case 'spaghetti': return spaghettiConfig(r, mode, pathCount);
    case 'trajectory': return trajectoryConfig(r, mode);
    case 'assetBreakdown': return assetBreakdownConfig(r, mode);
    case 'incomeSpending': return incomeSpendingConfig(r, mode);
    case 'taxLiability': return taxLiabilityConfig(r, mode);
  }
}

/** The enlarged chart's options (expandChart): bigger legend labels. */
export function modalConfig(source: ReturnType<typeof chartConfig>) {
  const opts = source.options as Dict;
  return {
    type: source.type,
    data: source.data,
    options: {
      ...opts,
      maintainAspectRatio: false,
      events: ['click', 'touchstart'],
      plugins: { ...opts.plugins, legend: { ...opts.plugins?.legend, labels: { boxWidth: 14, font: { size: 13 } } } },
    },
  };
}

// ---------------------------------------------------------------------------
// Milestone markers (drawn only on the enlarged chart)

export interface Milestone {
  t: number;
  age: number;
  label: string;
  color: string;
  priority: number;
}

/** getMilestonesList: life events from the rows' milestones, with plan-based fallbacks. */
export function milestonesList(r: Results): Milestone[] {
  const rows = r.det_rows;
  const list: Milestone[] = [];
  if (!rows || rows.length === 0) return list;
  const plan = r.plan_data_json ?? {};
  const isMarried = Boolean(plan.is_married ?? r.is_married);
  const int = (v: unknown) => parseInt(String(v));
  const userRetAge = int(plan.user_retirement_age ?? r.user_retirement_age);
  const spouseRetAge = isMarried ? int(plan.spouse_retirement_age ?? r.spouse_retirement_age) : null;
  const userDeathAge = int(plan.user_age_death ?? r.user_age_death);
  const spouseDeathAge = isMarried ? int(plan.spouse_age_death ?? r.spouse_age_death) : null;
  const ss = plan.social_security || {};
  const userSsAge = (ss.user_future_entitled ?? ss.user_entitled ?? true) && !ss.user_receiving
    ? int(ss.user_start_age || r.social_security?.user_start_age || 67) : null;
  const spouseSsAge = isMarried && (ss.spouse_future_entitled ?? ss.spouse_entitled ?? false) && !ss.spouse_receiving
    ? int(ss.spouse_start_age || r.social_security?.spouse_start_age || 67) : null;

  const registered = new Set<string>();
  const add = (key: string, t: number, age: number, label: string, color: string, priority: number) => {
    registered.add(key);
    list.push({ t, age, label, color, priority });
  };

  rows.forEach((row, t) => {
    const u = row.user_age;
    const sp = row.spouse_age;
    for (const m of (row.milestones || []) as string[]) {
      const l = m.toLowerCase();
      if (l.includes('you retire')) {
        if (!registered.has('retire')) add('retire', t, u, `🏁 Retire (${u})`, '#2563eb', 1);
      } else if (l.includes('spouse retires')) {
        if (!registered.has('sp_retire')) add('sp_retire', t, sp, `🏁 Spouse Retires (${sp})`, '#7c3aed', 2);
      } else if (l.includes('you claim ss')) {
        if (!registered.has('ss')) add('ss', t, u, `🏛️ SS (${u})`, '#059669', 3);
      } else if (l.includes('spouse claims ss')) {
        if (!registered.has('sp_ss')) add('sp_ss', t, sp, `🏛️ Spouse SS (${sp})`, '#0d9488', 4);
      } else if (l.includes('your rmds start') || (l.includes('rmd') && l.includes('your'))) {
        if (!registered.has('rmd')) add('rmd', t, u, `📜 RMDs (${u})`, '#d97706', 5);
      } else if (l.includes('spouse rmds start') || (l.includes('rmd') && l.includes('spouse'))) {
        if (!registered.has('sp_rmd')) add('sp_rmd', t, sp, `📜 Spouse RMDs (${sp})`, '#ea580c', 6);
      } else if (l.includes('spouse final year')) {
        if (!registered.has('sp_death')) add('sp_death', t, sp, `⌛ Spouse Final (${sp})`, '#64748b', 7);
      } else if (l.includes('your final year')) {
        if (!registered.has('death')) add('death', t, u, `⌛ Final Year (${u})`, '#475569', 8);
      }
    }
  });

  const fallback = (key: string, age: number | null, field: 'user_age' | 'spouse_age', label: (a: number) => string, color: string, priority: number) => {
    if (registered.has(key) || !age) return;
    const t = rows.findIndex((row) => row[field] === age);
    if (t !== -1) add(key, t, age, label(age), color, priority);
  };
  fallback('retire', userRetAge, 'user_age', (a) => `🏁 Retire (${a})`, '#2563eb', 1);
  if (isMarried) fallback('sp_retire', spouseRetAge, 'spouse_age', (a) => `🏁 Spouse Retires (${a})`, '#7c3aed', 2);
  fallback('ss', userSsAge, 'user_age', (a) => `🏛️ SS (${a})`, '#059669', 3);
  if (isMarried) fallback('sp_ss', spouseSsAge, 'spouse_age', (a) => `🏛️ Spouse SS (${a})`, '#0d9488', 4);
  if (isMarried) fallback('sp_death', spouseDeathAge, 'spouse_age', (a) => `⌛ Spouse Final (${a})`, '#64748b', 7);
  fallback('death', userDeathAge, 'user_age', (a) => `⌛ Final Year (${a})`, '#475569', 8);

  list.sort((a, b) => a.t - b.t || a.priority - b.priority);
  return list;
}

/** Chart.js plugin drawing the milestone lines and staggered label pills (milestonePlugin). */
export function milestonePlugin(milestones: Milestone[], isDark: () => boolean) {
  const font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  return {
    id: 'milestonePlugin',
    afterDraw(chart: any) {
      if (!chart.chartArea || milestones.length === 0) return;
      const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
      if (!x || !chart.data || !chart.data.labels) return;
      const dark = isDark();

      const rendered: Array<Milestone & { xPos: number; pillW: number; pillH: number; pillX: number; level: number }> = [];
      for (const m of milestones) {
        if (m.t < 0 || m.t >= chart.data.labels.length) continue;
        const xPos = x.getPixelForValue(m.t);
        if (xPos < left - 10 || xPos > right + 10) continue;
        ctx.save();
        ctx.font = font;
        const textWidth = ctx.measureText(m.label).width;
        ctx.restore();
        rendered.push({ ...m, xPos, pillW: textWidth + 12, pillH: 17, pillX: 0, level: 0 });
      }

      // Stagger the pills vertically so they don't overlap.
      const levels: Array<Array<[number, number]>> = [];
      for (const item of rendered) {
        let pillX = item.xPos - item.pillW / 2;
        if (pillX < left + 2) pillX = left + 2;
        if (pillX + item.pillW > right - 2) pillX = right - item.pillW - 2;
        item.pillX = pillX;
        let level = 0;
        for (;;) {
          const occupied = levels[level] || [];
          const collides = occupied.some(([a, b]) => !(pillX + item.pillW + 6 <= a || pillX >= b + 6));
          if (!collides) {
            occupied.push([pillX, pillX + item.pillW]);
            levels[level] = occupied;
            item.level = level;
            break;
          }
          level++;
        }
      }

      for (const item of rendered) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.moveTo(item.xPos, top);
        ctx.lineTo(item.xPos, bottom);
        ctx.stroke();
        ctx.restore();
      }

      for (const item of rendered) {
        ctx.save();
        const pillY = top + 2 + item.level * 19;
        if (item.level > 0) {
          ctx.beginPath();
          ctx.strokeStyle = item.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.moveTo(item.xPos, top);
          ctx.lineTo(item.xPos, pillY);
          ctx.stroke();
        }
        ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.shadowColor = dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(item.pillX, pillY, item.pillW, item.pillH, 4);
        else ctx.rect(item.pillX, pillY, item.pillW, item.pillH);
        ctx.fill();
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.font = font;
        ctx.fillStyle = item.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, item.pillX + item.pillW / 2, pillY + item.pillH / 2);
        ctx.restore();
      }
    },
  };
}
