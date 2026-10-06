// Accounts <-> per-bucket aggregates (flat_assets_to_accounts / aggregate_accounts
// in core/forms.py). The engine reads the aggregates (pretax_assets, roth_assets, ...);
// the UI edits the account list.
import { pyBool, pyFloat } from '../engine/py';
import { getBool } from './coerce';
import { get, type Obj } from './pyutil';
import type { Account, FlatAssets } from './types';

/** (prefix, account type, owner) for each aggregate bucket. */
export const ASSET_PREFIX_CONFIG: Array<[string, string, 'user' | 'spouse']> = [
  ['pretax', 'pretax', 'user'],
  ['spouse_pretax', 'pretax', 'spouse'],
  ['roth', 'roth', 'user'],
  ['taxable', 'taxable', 'user'],
  ['hsa', 'hsa', 'user'],
  ['spouse_hsa', 'hsa', 'spouse'],
];

/** Accounts list from a legacy plan's flat `{prefix}_assets` dicts. */
export function flatAssetsToAccounts(data: Obj, isMarried: boolean): Account[] {
  const accounts: Account[] = [];
  for (const [prefix, atype, owner] of ASSET_PREFIX_CONFIG) {
    if (owner === 'spouse' && !isMarried) continue;
    const ac: Obj = get(data, `${prefix}_assets`, {});
    if (!pyBool(ac)) continue;
    if (get(ac, 'present_balance', 0) <= 0 && get(ac, 'contrib_amount', 0) <= 0) continue;
    accounts.push({
      name: `${owner === 'spouse' ? 'Spouse ' : ''}${atype.toUpperCase()} Account`,
      type: atype,
      owner,
      balance: get(ac, 'present_balance', 0.0),
      contrib_amount: get(ac, 'contrib_amount', 0.0),
      contrib_freq: get(ac, 'contrib_freq', 'annual'),
      contrib_start_age: get(ac, 'contrib_start_age', 60),
      contrib_end_age_type: get(ac, 'contrib_end_age_type', 'retirement'),
      contrib_end_age_specified: get(ac, 'contrib_end_age_specified', 65),
      contrib_adjust_inflation: get(ac, 'contrib_adjust_inflation', true),
      return_mean: get(ac, 'return_mean', 6.0),
      return_std: get(ac, 'return_std', 10.0),
      hsa_for_medical: get(ac, 'hsa_for_medical', true),
    });
  }
  return accounts;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Per-bucket aggregates from the account list: summed balances and annualized
 * contributions, balance-weighted returns (contribution-weighted when every balance
 * is zero, plain averages when both are), and the first account's contribution
 * schedule. Each aggregate keeps its accounts under `accounts`.
 */
export function aggregateAccounts(
  accounts: Account[], userAge: number, userRetirementAge: number, _userAgeDeath: number, isMarried: boolean,
  spouseAge: number, spouseRetirementAge: number, _spouseAgeDeath: number,
): Record<string, FlatAssets> {
  const common = (start: number, endType: string, endSpec: number, mean: number, std: number, isSpouse: boolean): Obj => ({
    present_balance: 0.0, contrib_amount: 0.0, contrib_freq: 'annual',
    contrib_start_age: start, contrib_end_age_type: endType, contrib_end_age_specified: endSpec,
    contrib_adjust_inflation: true, return_mean: mean, return_std: std, is_spouse: isSpouse,
  });
  const spStart = isMarried ? spouseAge : userAge;
  const spEndType = isMarried ? 'spouse_retirement' : 'retirement';
  const spEnd = isMarried ? spouseRetirementAge : userRetirementAge;
  const assetMap: Record<string, Obj> = {
    pretax: common(userAge, 'retirement', userRetirementAge, 6.0, 10.0, false),
    spouse_pretax: common(spStart, spEndType, spEnd, 6.0, 10.0, true),
    roth: common(userAge, 'retirement', userRetirementAge, 6.0, 10.0, false),
    taxable: {
      ...common(userAge, 'retirement', userRetirementAge, 5.0, 8.0, false),
      dividend_yield: 2.0, qualified_dividend_pct: 85.0, interest_yield: 0.0, capital_gains_dist_rate: 0.5,
      cost_basis_ratio: 70.0, initial_cost_basis: 0.0, is_community_property: false,
    },
    hsa: { ...common(userAge, 'retirement', userRetirementAge, 5.0, 8.0, false), hsa_for_medical: true },
    spouse_hsa: { ...common(spStart, spEndType, spEnd, 5.0, 8.0, true), hsa_for_medical: true },
  };
  const grouped: Record<string, Account[]> = Object.fromEntries(Object.keys(assetMap).map((k) => [k, []]));
  for (const acc of accounts) {
    const atype = get(acc, 'type', 'pretax');
    const owner = isMarried ? get(acc, 'owner', 'user') : 'user';
    let key: string;
    if (atype === 'pretax') key = owner === 'spouse' ? 'spouse_pretax' : 'pretax';
    else if (atype === 'hsa') key = owner === 'spouse' ? 'spouse_hsa' : 'hsa';
    else if (atype === 'roth') key = 'roth';
    else key = 'taxable';
    grouped[key].push(acc);
  }

  const f = (a: Obj, k: string, d: number) => pyFloat(get(a, k, d));
  const result: Record<string, FlatAssets> = {};
  for (const [key, list] of Object.entries(grouped)) {
    const base: Obj = { ...assetMap[key] };
    if (list.length) {
      base.present_balance = sum(list.map((a) => f(a, 'balance', 0.0)));
      const annual = list.map((a) => (get(a, 'contrib_freq') === 'monthly' ? f(a, 'contrib_amount', 0.0) * 12.0 : f(a, 'contrib_amount', 0.0)));
      base.contrib_amount = sum(annual);
      base.contrib_freq = 'annual';

      const totalBal = sum(list.map((a) => Math.max(0.0, f(a, 'balance', 0.0))));
      const weights = totalBal > 0 ? list.map((a) => Math.max(0.0, f(a, 'balance', 0.0))) : annual.map((c) => Math.max(0.0, c));
      const totalW = sum(weights);
      const avg = (k: string, d: number) => (totalW > 0
        ? sum(list.map((a, i) => f(a, k, d) * weights[i])) / totalW
        : sum(list.map((a) => f(a, k, d))) / list.length);
      base.return_mean = avg('return_mean', 6.0);
      base.return_std = avg('return_std', 10.0);

      if (key === 'taxable') {
        base.dividend_yield = avg('dividend_yield', 2.0);
        base.qualified_dividend_pct = avg('qualified_dividend_pct', 85.0);
        base.interest_yield = avg('interest_yield', 0.0);
        base.capital_gains_dist_rate = avg('capital_gains_dist_rate', 0.5);
        base.cost_basis_ratio = avg('cost_basis_ratio', 70.0);
        base.initial_cost_basis = sum(list.map((a) => f(a, 'balance', 0.0) * (f(a, 'cost_basis_ratio', 70.0) / 100.0)));
        base.is_community_property = list.some((a) => pyBool(get(a, 'is_community_property', false)));
      }

      const primary = list[0];
      base.contrib_start_age = get(primary, 'contrib_start_age', base.contrib_start_age);
      base.contrib_end_age_type = get(primary, 'contrib_end_age_type', base.contrib_end_age_type);
      base.contrib_end_age_specified = get(primary, 'contrib_end_age_specified', base.contrib_end_age_specified);
      base.contrib_adjust_inflation = getBool(get(primary, 'contrib_adjust_inflation', true));
      if ('hsa_for_medical' in base) base.hsa_for_medical = list.some((a) => pyBool(get(a, 'hsa_for_medical', true)));
      base.accounts = list;
    }
    result[`${key}_assets`] = base;
  }
  return result;
}
