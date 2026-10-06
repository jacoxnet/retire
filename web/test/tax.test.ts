import { describe, expect, it } from 'vitest';
import { LTCG_RATES_ARR, TAX_RATES_ARR, THRESHOLDS_BY_STATUS } from '../src/lib/engine/constants';
import {
  calculatePreferentialTax,
  calculateTax,
  calculateTaxableSs,
  njitCalcFedTaxDual,
  njitCalculateTaxableSs,
  njitRmdTaxWithdraw,
  njitSpousalRollover,
  RTW_LEN,
} from '../src/lib/engine/tax';
import { deepClose, loadFixture } from './fixtures';

describe('tax helper grid', () => {
  const cases = loadFixture<any[]>('functions', 'tax.json');
  it(`matches ${cases.length} cases`, () => {
    for (const c of cases) {
      const [ord, ltcg] = THRESHOLDS_BY_STATUS[c.status];
      let got: unknown;
      switch (c.fn) {
        case 'calculate_tax': got = calculateTax(c.args[0], ord, TAX_RATES_ARR); break;
        case 'calculate_preferential_tax': got = calculatePreferentialTax(c.args[0], c.args[1], ltcg, LTCG_RATES_ARR); break;
        case 'njit_calc_fed_tax_dual':
          got = njitCalcFedTaxDual(c.args[0], c.args[1], c.args[2], ord, TAX_RATES_ARR, ltcg, LTCG_RATES_ARR);
          break;
        case 'calculate_taxable_ss': got = calculateTaxableSs(c.args[0], c.args[1], c.status); break;
        case 'njit_calculate_taxable_ss': got = njitCalculateTaxableSs(c.args[0], c.args[1], c.args[2]); break;
        default: throw new Error(`unknown fn ${c.fn}`);
      }
      expect(deepClose(got, c.out), `${c.fn} ${c.status} ${JSON.stringify(c.args)}`).toBeNull();
    }
  });
});

describe('njit_rmd_tax_withdraw', () => {
  const cases = loadFixture<any[]>('functions', 'rmd_tax_withdraw.json');
  it(`matches ${cases.length} random cases`, () => {
    const out = new Float64Array(RTW_LEN);
    cases.forEach((c, i) => {
      const a = c.args;
      const got = njitRmdTaxWithdraw(
        a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15],
        a[16], a[17], a[18], a[19], a[20], a[21], a[22], a[23], a[24], a[25], a[26], a[27], a[28], a[29], a[30], out,
      );
      expect(deepClose(got, c.out), `case ${i}`).toBeNull();
    });
  });
});

describe('njit_spousal_rollover', () => {
  const cases = loadFixture<any[]>('functions', 'spousal_rollover.json');
  it(`matches ${cases.length} random cases`, () => {
    for (const c of cases) {
      const a = c.args;
      const got = njitSpousalRollover(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13]);
      expect(deepClose(got, c.out)).toBeNull();
    }
  });
});
