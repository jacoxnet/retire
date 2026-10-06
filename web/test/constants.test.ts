import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSET_CLASS_CHOLESKY,
  ASSET_CLASS_CORRELATION,
  getRmdStartAge,
  inferAssetAllocation,
  RMD_TABLE_ARR,
} from '../src/lib/engine/constants';
import { calculateCpiInflation, getPriorMonthStr, interpolateMissingMonths } from '../src/lib/engine/cpi';
import { CRISIS_SCENARIOS, getHistoricalSequence, HISTORICAL_RETURNS } from '../src/lib/engine/historicalData';
import { resolveAge } from '../src/lib/engine/inputs';
import { pyRound } from '../src/lib/engine/py';
import { deepClose, FIXTURES_DIR, loadFixture } from './fixtures';

describe('constants', () => {
  const c = loadFixture('functions', 'constants.json');
  it('RMD table', () => expect(deepClose(RMD_TABLE_ARR, c.RMD_TABLE_ARR, 0)).toBeNull());
  it('correlation and Cholesky', () => {
    expect(deepClose(ASSET_CLASS_CORRELATION, c.ASSET_CLASS_CORRELATION, 0)).toBeNull();
    expect(deepClose(ASSET_CLASS_CHOLESKY, c.ASSET_CLASS_CHOLESKY, 1e-15)).toBeNull();
  });
  it('historical tables', () => {
    expect(deepClose(HISTORICAL_RETURNS, c.HISTORICAL_RETURNS, 0)).toBeNull();
    expect(deepClose(CRISIS_SCENARIOS, c.CRISIS_SCENARIOS, 0)).toBeNull();
  });
});

describe('misc helper grid', () => {
  const cases = loadFixture<any[]>('functions', 'misc.json');
  it(`matches ${cases.length} cases`, () => {
    for (const c of cases) {
      let got: unknown;
      switch (c.fn) {
        case 'get_rmd_start_age': got = getRmdStartAge(c.args[0]); break;
        case 'infer_asset_allocation': got = inferAssetAllocation(c.args[0]); break;
        case 'get_historical_sequence': got = getHistoricalSequence(c.args[0], c.args[1]); break;
        case 'resolve_age': {
          const k = c.kwargs;
          got = resolveAge(c.args[0], c.args[1], k.user_age, k.user_ret_age, k.is_married, k.spouse_age,
            k.spouse_ret_age, k.user_age_death, k.spouse_age_death, k.default_val);
          break;
        }
        default: throw new Error(`unknown fn ${c.fn}`);
      }
      expect(deepClose(got, c.out, 0), `${c.fn} ${JSON.stringify(c.args)}`).toBeNull();
    }
  });
});

describe('cpi', () => {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, '..', 'src', 'lib', 'data', 'cpi_u_historical.json'), 'utf8'));
  const data = interpolateMissingMonths(raw);
  const cases = loadFixture<any[]>('functions', 'cpi.json');
  it(`matches ${cases.length} cases`, () => {
    for (const c of cases) {
      let got: unknown;
      switch (c.fn) {
        case 'calculate_cpi_inflation': got = calculateCpiInflation(c.args[0], c.args[1], data); break;
        case 'get_prior_month_str': got = getPriorMonthStr(c.args[0]); break;
        case '_interpolate_missing_months': got = interpolateMissingMonths(c.args[0]); break;
        default: throw new Error(`unknown fn ${c.fn}`);
      }
      expect(deepClose(got, c.out, 0), `${c.fn} ${JSON.stringify(c.args)}`).toBeNull();
    }
  });

  it('pyRound rounds exact ties to even', () => {
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(-0.125, 2)).toBe(-0.12);
    expect(pyRound(2.675, 2)).toBe(2.67); // binary value is below the tie
    expect(pyRound(1.0000005, 6)).toBe(1.000001);
  });
});
