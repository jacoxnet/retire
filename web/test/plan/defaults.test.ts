import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDefaultRebalancing, getDefaultData, parseRebalancing } from '../../src/lib/plan/defaults';
import { deepClose, FIXTURES_DIR, loadFixture, stringifyFixture, UPDATING } from '../fixtures';

describe('defaults', () => {
  const f = loadFixture('functions', 'plan_defaults.json');
  it('getDefaultData matches get_default_data, balance sheet included', () => {
    if (UPDATING) {
      f.default_data_full = getDefaultData('2026-01-15');
      writeFileSync(join(FIXTURES_DIR, 'functions', 'plan_defaults.json'), stringifyFixture(f));
    }
    expect(deepClose(getDefaultData('2026-01-15'), f.default_data_full, 0)).toBeNull();
  });
  it('rebalancing defaults and parsing', () => {
    expect(deepClose(buildDefaultRebalancing(), f.rebalancing, 0)).toBeNull();
    const custom = { asset_classes: [], tolerance_percent: 5 };
    expect(parseRebalancing(custom)).toBe(custom);
    expect(parseRebalancing(JSON.stringify(custom))).toEqual(custom);
    expect(parseRebalancing({ rebalancing_json: JSON.stringify(custom) })).toEqual(custom);
    expect(parseRebalancing('not json')).toEqual(buildDefaultRebalancing());
    expect(parseRebalancing({ other: 1 })).toEqual(buildDefaultRebalancing());
  });
  it('returns independent copies', () => {
    const a = getDefaultData();
    expect(a.runs).toBe(50000);
    a.pretax_assets!.return_mean = 9;
    expect(getDefaultData().pretax_assets!.return_mean).toBe(6.0);
  });
});
