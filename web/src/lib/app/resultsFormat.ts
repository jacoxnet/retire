// Number formatting on the Results page. The template formats with Django's
// floatformat / intcomma filters; results.js reformats table cells and stress-test
// values in the browser. Each is reproduced here so the page reads the same.

/** Split a finite number's shortest decimal form into sign, digits and exponent (value = digits × 10^exp). */
function decimalParts(value: number): { neg: boolean; digits: string; exp: number } {
  const s = String(Math.abs(value)); // shortest round-trip form, same digits as Python's repr
  const [mant, e] = s.split('e');
  const [int, frac = ''] = mant.split('.');
  const digits = (int + frac).replace(/^0+(?=\d)/, '');
  return { neg: value < 0 || Object.is(value, -0), digits, exp: Number(e ?? 0) - frac.length };
}

/**
 * Django's floatformat filter: `places` decimals, rounding half up on the decimal
 * value Python prints. A negative `places` shows that many decimals only when the
 * value isn't whole ("-2": 3 → "3", 3.5 → "3.50").
 */
export function floatformat(value: number | null | undefined, places = -1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  const p = Math.abs(places);
  if (places <= 0 && Number.isInteger(value)) return BigInt(value).toString();

  let { neg, digits, exp } = decimalParts(value);
  // Quantize to 10^-p, half up.
  if (-exp > p) {
    const drop = -exp - p;
    const keep = digits.length - drop;
    const head = keep > 0 ? digits.slice(0, keep) : '0';
    const first = keep >= 0 ? digits[keep] ?? '0' : '0';
    let n = BigInt(head);
    if (first >= '5') n += 1n;
    digits = n.toString();
    exp = -p;
  }
  // Pad to exactly p decimals.
  if (-exp < p) {
    digits += '0'.repeat(p - -exp);
    exp = -p;
  }
  const decs = -exp;
  const padded = digits.padStart(decs + 1, '0');
  const int = padded.slice(0, padded.length - decs);
  const frac = padded.slice(padded.length - decs);
  const isZero = /^0*$/.test(digits);
  return (neg && !isZero ? '-' : '') + int + (decs ? '.' + frac : '');
}

/** Django's intcomma filter on an already formatted number: groups the integer digits. */
export function intcomma(text: string): string {
  return text.replace(/^(-?)(\d+)/, (_, sign: string, int: string) => sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

/** `{{ v|floatformat:"0"|intcomma }}`: whole dollars with commas (no "$"). */
export const djangoMoney = (v: number | null | undefined): string => intcomma(floatformat(v ?? 0, 0));

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** results.js setDollarMode: "$1,235" or "-$1,235". */
export function usd(v: number): string {
  return v < 0 ? '-' + currency.format(Math.abs(v)) : currency.format(v);
}

/**
 * A table value in real (start-of-plan) dollars, as results.js computes it: deflated
 * by `t` years of the plan's inflation (t + 1 for end-of-year balances) and rounded
 * to cents.
 */
export function realValue(nominal: number, t: number, inflationRate: number): number {
  return parseFloat((nominal / Math.pow(1.0 + inflationRate / 100.0, t)).toFixed(2));
}

/** Chart axis and tooltip labels (formatChartCurrency): $1.25M, $350K, $900. */
export function chartMoney(val: number): string {
  if (Number.isNaN(val)) return '$0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Stress-test values (formatStressCurrency). */
export function stressMoney(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '$0';
  const num = Math.round(Number(val));
  return (num < 0 ? '-' : '') + '$' + Math.abs(num).toLocaleString('en-US');
}

/** Stress-test differences (formatStressDeltaCurrency): "+$1,234", "-$56", "$0". */
export function stressDeltaMoney(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '$0';
  const num = Math.round(Number(val));
  return (num > 0 ? '+' : num < 0 ? '-' : '') + '$' + Math.abs(num).toLocaleString('en-US');
}

/** Stress-test success-rate difference (formatStressDeltaPercent): "+1.5%", "-3.0%". */
export function stressDeltaPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '0.0%';
  const num = Number(val);
  return (num > 0 ? '+' : '') + num.toFixed(1) + '%';
}

/** Badge colour for a milestone in the projection tables. */
export function milestoneBadge(m: string): string {
  if (m.includes('Final Year')) return 'badge bg-secondary text-light me-1';
  if (m.includes('Retires')) return 'badge bg-info text-dark me-1';
  if (m.includes('RMDs')) return 'badge bg-warning text-dark me-1';
  return 'badge bg-light text-dark border me-1';
}
