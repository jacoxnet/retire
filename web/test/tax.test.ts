import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { deepClose, FIXTURES_DIR, loadFixture, UPDATING } from './fixtures';

describe('tax helper grid', () => {
  const cases = loadFixture<any[]>('functions', 'tax.json');
  it(`matches ${cases.length} cases`, () => {
    let changed = false;
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
      if (UPDATING) {
        c.out = got;
        changed = true;
      } else {
        expect(deepClose(got, c.out), `${c.fn} ${c.status} ${JSON.stringify(c.args)}`).toBeNull();
      }
    }
    if (UPDATING && changed) {
      writeFileSync(join(FIXTURES_DIR, 'functions', 'tax.json'), JSON.stringify(cases) + '\n');
    }
  });
});

describe('njit_rmd_tax_withdraw', () => {
  const cases = loadFixture<any[]>('functions', 'rmd_tax_withdraw.json');
  it(`matches ${cases.length} random cases`, () => {
    const out = new Float64Array(RTW_LEN);
    let changed = false;
    cases.forEach((c, i) => {
      const a = c.args;
      const got = njitRmdTaxWithdraw(
        a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15],
        a[16], a[17], a[18], a[19], a[20], a[21], a[22], a[23], a[24], a[25], a[26], a[27], a[28], a[29], a[30], out,
      );
      if (UPDATING) {
        c.out = Array.from(got.subarray(0, c.out.length));
        changed = true;
      } else {
        expect(deepClose(got.subarray(0, c.out.length), c.out), `case ${i}`).toBeNull();
      }
    });
    if (UPDATING && changed) {
      writeFileSync(join(FIXTURES_DIR, 'functions', 'rmd_tax_withdraw.json'), JSON.stringify(cases) + '\n');
    }
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

describe('taxable deficit liquidation recalculates taxable Social Security (Item 1A)', () => {
  it('captures additional ordinary tax from Social Security pushed into taxable income by capital gains', () => {
    // Single retiree, age 68, receiving $30k SS and $15k taxable pension
    const userAge = 68;
    const ssBenefits = 30000;
    const taxableIncome = 15000;
    const spendingTarget = 55000; // triggers deficit funded by taxable account
    const taxableMid = 100000;
    const taxableBasisMid = 0; // 100% gain ratio
    const filingStatusSingle = 0;
    const infFactor = 1.0;

    const r = njitRmdTaxWithdraw(
      userAge, userAge, true, false, false,
      0, 0, 0, 0, // pretax
      0, taxableMid, 0, 0, // roth, taxable, hsa
      75, 75,
      filingStatusSingle, infFactor,
      spendingTarget, taxableIncome, ssBenefits, 0,
      0, 0, 1, // no other taxes, 0% state tax, state exempt
      1, 1, // hsa medical
      taxableBasisMid, 0, 0, 0, 0,
    );

    // Initial base taxable SS was $2,500 ($17,500 ord income, $1,400 taxable ord -> $140 ord tax).
    // The deficit liquidation realizes >$10k capital gains, pushing provisional income higher.
    // At maximum 85% taxable SS, taxable SS is $25,500.
    // Federal ordinary tax must reflect the increased taxable SS, not the base ordinary tax ($140).
    expect(r[20]).toBeGreaterThan(10000); // realized capital gains
    expect(r[21]).toBeGreaterThan(140); // finalFedOrdTax reflects higher taxable SS
  });
});
