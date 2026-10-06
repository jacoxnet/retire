// Display formatting for form inputs (enter.js formatMoney / formatPercent).

/** Parse a typed amount ("$1,234.5", "1234") to a number; null if there are no digits. */
export function parseNumberText(text: string): number | null {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Whole dollars with thousands separators ("1,235"), optionally with a "$" sign. */
export function formatMoney(value: number | null | undefined, dollarSign = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const rounded = Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (value < 0 ? '-' : '') + (dollarSign ? '$' : '') + rounded;
}

/** A percentage with up to two decimals and a "%" sign ("3.5%"). */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `${Math.round(value * 100) / 100}%`;
}

/** Compact money for tab badges: "850", "12K", "1.5M" (enter.js formatBadgeMoney). */
export function formatBadgeMoney(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0';
  if (val >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1e3) return Math.round(val / 1e3) + 'K';
  return Math.round(val).toLocaleString('en-US');
}
