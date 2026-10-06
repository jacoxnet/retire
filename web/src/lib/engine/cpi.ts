// CPI-U calculations from core/cpi_service.py, minus the HTTP fetch and Django cache.
// The monthly dataset ({"YYYY-MM": index}) is passed in; the bundled copy lives in
// static/data/cpi_u_historical.json and is refreshed by a scheduled CI job.
import { pyInt, pyRound } from './py';

export type CpiData = Record<string, number | null>;

// U.S. Treasury contingency index values (31 CFR Part 356) used when official BLS
// figures are suspended.
export const TREASURY_CONTINGENCY_OVERRIDES: Record<string, number> = {
  '2025-10': 325.604, // Federal government shutdown Oct 1 - Nov 12, 2025
};

const ym = (y: number, m: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;

/**
 * YYYY-MM of the month before dateStr (YYYY-MM-DD, YYYY-MM or YYYY/MM/DD).
 * An empty or unparseable date means "now".
 */
export function getPriorMonthStr(dateStr: string | null | undefined, now: Date = new Date()): string {
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (dateStr) {
    const parts = String(dateStr).trim().replace(/\//g, '-').split('-');
    try {
      const py = pyInt(parts[0]);
      const pm = parts.length > 1 ? pyInt(parts[1]) : 1;
      y = py;
      m = pm;
    } catch {
      // keep "now"
    }
  }
  if (m === 1) {
    y -= 1;
    m = 12;
  } else {
    m -= 1;
  }
  return ym(y, m);
}

/** Apply Treasury overrides and forward-fill missing or blank interior months. Returns a new, key-sorted dataset. */
export function interpolateMissingMonths(input: CpiData): Record<string, number> {
  if (!input || Object.keys(input).length === 0) return input as Record<string, number>;
  const data: CpiData = { ...input };
  for (const [k, v] of Object.entries(TREASURY_CONTINGENCY_OVERRIDES)) {
    if (!(k in data) || data[k] == null) data[k] = v;
  }
  const keys = Object.keys(data).sort();
  const [minY, minM] = keys[0].split('-').map(Number);
  const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number);
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    const k = ym(y, m);
    if (!(k in data) || data[k] == null) {
      const prev = getPriorMonthStr(k);
      data[k] = prev in data ? data[prev] : 100.0;
    }
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(data).sort()) out[k] = data[k] as number;
  return out;
}

/** [latest YYYY-MM, index]. */
export function getLatestCpiMonth(data: Record<string, number>): [string, number] {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return ['2026-08', 334.98];
  const k = keys[keys.length - 1];
  return [k, data[k]];
}

/** [month, index] for the month before dateStr, clamped to the dataset's range. */
export function getCpiIndexForDate(dateStr: string, data: Record<string, number>): [string, number] {
  const prior = getPriorMonthStr(dateStr);
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return [prior, 100.0];
  if (prior in data) return [prior, data[prior]];
  if (prior < keys[0]) return [keys[0], data[keys[0]]];
  const last = keys[keys.length - 1];
  return [last, data[last]];
}

export interface CpiInflation {
  base_date: string;
  base_month: string;
  base_index: number;
  eval_month: string;
  eval_index: number;
  inflation_ratio: number;
  inflation_pct: number;
}

/**
 * Cumulative CPI-U inflation from the month before baseDateStr to the month before
 * evalDateStr (or the latest available month).
 */
export function calculateCpiInflation(
  baseDateStr: string,
  evalDateStr: string | null | undefined,
  data: Record<string, number>,
): CpiInflation {
  const [baseMonth, baseIndex] = getCpiIndexForDate(baseDateStr, data);
  const [evalMonth, evalIndex] = evalDateStr ? getCpiIndexForDate(evalDateStr, data) : getLatestCpiMonth(data);
  let ratio = 1.0;
  let pct = 0.0;
  if (baseIndex > 0) {
    ratio = evalIndex / baseIndex;
    pct = (ratio - 1.0) * 100.0;
  }
  return {
    base_date: baseDateStr,
    base_month: baseMonth,
    base_index: baseIndex,
    eval_month: evalMonth,
    eval_index: evalIndex,
    inflation_ratio: pyRound(ratio, 6),
    inflation_pct: pyRound(pct, 2),
  };
}
