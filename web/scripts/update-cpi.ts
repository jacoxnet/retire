#!/usr/bin/env node
// Refresh the bundled CPI-U series (src/lib/data/cpi_u_historical.json) from FRED
// (series CPIAUCNS), the job core/cpi_service.py did on the server. The browser can't
// fetch FRED itself (no CORS headers), so the update-cpi workflow runs this on a
// schedule and redeploys when the file changes.
//
//   node scripts/update-cpi.ts            fetch, merge, write if changed (Node 22.18+ runs .ts)
//   node scripts/update-cpi.ts --check    fetch and report, write nothing
//
// Exit code 0 in both cases; a failed or implausible download exits 1 without writing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FRED_CSV_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS';
export const CPI_FILE = fileURLToPath(new URL('../src/lib/data/cpi_u_historical.json', import.meta.url));

/** FRED's CSV ("observation_date,CPIAUCNS" then "YYYY-MM-DD,value") as {YYYY-MM: index}; "." marks a missing value. */
export type CpiData = Record<string, number>;

export function parseFredCsv(text: string): CpiData {
  const data: CpiData = {};
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [date, value] = line.trim().split(',').map((s: string) => s.trim());
    if (!date || date.length < 7 || !value || value === '.') continue;
    const v = Number(value);
    if (Number.isFinite(v)) data[date.slice(0, 7)] = Math.round(v * 1000) / 1000;
  }
  return data;
}

/**
 * Merge a download into the bundled series. FRED's values win; months FRED lacks
 * (such as the Treasury's contingency value for October 2025) are kept. Throws if the
 * download looks wrong rather than shrinking the series.
 */
export function mergeCpi(existing: CpiData, fred: CpiData): { data: CpiData; added: string[]; revised: string[] } {
  const fredKeys = Object.keys(fred).sort();
  if (fredKeys.length < 500) throw new Error(`FRED returned only ${fredKeys.length} months`);
  const oldKeys = Object.keys(existing).sort();
  const fredLatest = fredKeys[fredKeys.length - 1];
  const oldLatest = oldKeys[oldKeys.length - 1];
  if (oldLatest && fredLatest < oldLatest) {
    throw new Error(`FRED's latest month ${fredLatest} is older than the bundled ${oldLatest}`);
  }
  const merged = { ...existing, ...fred };
  const out: CpiData = {};
  for (const k of Object.keys(merged).sort()) out[k] = merged[k];
  const added = Object.keys(out).filter((k) => !(k in existing));
  const revised = Object.keys(existing).filter((k) => k in fred && fred[k] !== existing[k]);
  return { data: out, added, revised };
}

/** The file as Python's json.dump(indent=2) wrote it (whole numbers keep their ".0"). */
export function formatCpiJson(data: CpiData): string {
  const lines = Object.entries(data).map(([k, v]) => `  ${JSON.stringify(k)}: ${Number.isInteger(v) ? v.toFixed(1) : String(v)}`);
  return `{\n${lines.join(',\n')}\n}`;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const res = await fetch(FRED_CSV_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (RetireApp/1.0)' } });
  if (!res.ok) throw new Error(`FRED responded ${res.status}`);
  const existing: CpiData = JSON.parse(readFileSync(CPI_FILE, 'utf8'));
  const { data, added, revised } = mergeCpi(existing, parseFredCsv(await res.text()));
  const keys = Object.keys(data);
  console.log(`CPI-U: ${keys.length} months, ${keys[0]} to ${keys[keys.length - 1]}; ${added.length} new (${added.join(', ') || 'none'}), ${revised.length} revised (${revised.join(', ') || 'none'})`);
  const text = formatCpiJson(data);
  if (check || text === readFileSync(CPI_FILE, 'utf8')) return;
  writeFileSync(CPI_FILE, text);
  console.log(`wrote ${CPI_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(`CPI update failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
