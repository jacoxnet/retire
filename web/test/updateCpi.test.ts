import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CPI_FILE, formatCpiJson, mergeCpi, parseFredCsv } from '../scripts/update-cpi';

const bundledText = readFileSync(CPI_FILE, 'utf8');
const bundled: Record<string, number> = JSON.parse(bundledText);

/** A FRED download: the bundled months (minus a contingency month FRED lacks) plus `extra`. */
function fredCsv(extra: Record<string, number | '.'> = {}) {
  const rows = Object.entries({ ...bundled, ...extra })
    .filter(([k]) => k !== '2025-10')
    .map(([k, v]) => `${k}-01,${v}`);
  return ['observation_date,CPIAUCNS', '2025-10-01,.', ...rows].join('\r\n') + '\r\n';
}

describe('update-cpi script', () => {
  it('writes the bundled file byte for byte as Python did', () => {
    expect(formatCpiJson(bundled)).toBe(bundledText);
  });

  it('parses FRED CSV, skipping missing values', () => {
    const parsed = parseFredCsv('observation_date,CPIAUCNS\n2026-08-01,334.9801\n2026-09-01,.\nbad\n');
    expect(parsed).toEqual({ '2026-08': 334.98 });
  });

  it('adds new months, keeps months FRED lacks, and reports revisions', () => {
    const { data, added, revised } = mergeCpi(bundled, parseFredCsv(fredCsv({ '2026-09': 335.5, '2026-07': 333.9 })));
    expect(added).toEqual(['2026-09']);
    expect(revised).toEqual(['2026-07']);
    expect(data['2025-10']).toBe(bundled['2025-10']);
    expect(Object.keys(data).at(-1)).toBe('2026-09');
    expect(formatCpiJson(data)).toContain('"2026-09": 335.5\n}');
  });

  it('an unchanged download leaves the file as it is', () => {
    const { data, added, revised } = mergeCpi(bundled, parseFredCsv(fredCsv()));
    expect([added, revised]).toEqual([[], []]);
    expect(formatCpiJson(data)).toBe(bundledText);
  });

  it('refuses a truncated or stale download', () => {
    expect(() => mergeCpi(bundled, { '2026-08': 1 })).toThrow(/only 1 months/);
    const stale: Record<string, number> = parseFredCsv(fredCsv());
    delete stale['2026-08'];
    expect(() => mergeCpi(bundled, stale)).toThrow(/older than the bundled 2026-08/);
  });
});
