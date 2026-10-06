// Default plan and rebalancing settings (get_default_data in core/views.py,
// build_default_rebalancing / parse_rebalancing in core/forms.py).
import { buildDefaultBalanceSheet } from './balanceSheet';
import { todayIso } from './pyutil';
import type { FlatAssets, Plan, Rebalancing } from './types';

export function buildDefaultRebalancing(): Rebalancing {
  return {
    included_account_ids: [],
    tolerance_percent: 10.0,
    rebalance_mode: 'target',
    cash_flow: 0.0,
    asset_classes: [
      { id: 'ac_us_stocks', name: 'US Stocks', target_percent: 40.0, color: '#3b82f6' },
      { id: 'ac_intl_stocks', name: 'International Stocks', target_percent: 20.0, color: '#10b981' },
      { id: 'ac_bonds', name: 'Bonds', target_percent: 30.0, color: '#8b5cf6' },
      { id: 'ac_cash', name: 'Cash / Short-Term', target_percent: 10.0, color: '#f59e0b' },
    ],
    account_allocations: {},
  };
}

/** A rebalancing object (or its JSON) if it has asset classes, else the defaults. */
export function parseRebalancing(raw: unknown): Rebalancing {
  const tryJson = (s: unknown) => {
    try {
      const r = JSON.parse(String(s));
      return r && typeof r === 'object' && !Array.isArray(r) && 'asset_classes' in r ? (r as Rebalancing) : null;
    } catch {
      return null;
    }
  };
  if (typeof raw === 'string') return tryJson(raw) ?? buildDefaultRebalancing();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ('asset_classes' in o) return o as unknown as Rebalancing;
    if ('rebalancing_json' in o) return tryJson(o.rebalancing_json) ?? buildDefaultRebalancing();
  }
  return buildDefaultRebalancing();
}

const assets = (over: Partial<FlatAssets> = {}): FlatAssets => ({
  present_balance: 0.0,
  contrib_amount: 0.0,
  contrib_freq: 'annual',
  contrib_start_age: 60,
  contrib_end_age_type: 'retirement',
  contrib_end_age_specified: 65,
  contrib_adjust_inflation: true,
  return_mean: 6.0,
  return_std: 10.0,
  ...over,
});

/** The plan a new user starts with; its balance sheet's single column is `today`. */
export function getDefaultData(today = todayIso()): Plan {
  const plan: Plan = {
    goal_seeking: false,
    user_name: 'John Doe',
    user_age: 60,
    user_retirement_age: 65,
    user_age_death: 90,
    is_married: false,
    spouse_name: 'Jane Doe',
    spouse_age: 60,
    spouse_retirement_age: 65,
    spouse_age_death: 90,
    filing_status: 'single',
    current_year: 2026,
    begin_spending_age_type: 'retirement',
    begin_spending_age_specified: 65,
    desired_spending: 0.0,
    survivor_spending: 0.0,
    adjust_spending_inflation: true,
    inflation_rate: 3.5,
    runs: 10000,
    target_success_rate: 80.0,
    user_life_insurance_amount: 0.0,
    user_life_insurance_type: 'permanent',
    user_life_insurance_term_age: 70,
    spouse_life_insurance_amount: 0.0,
    spouse_life_insurance_type: 'permanent',
    spouse_life_insurance_term_age: 70,
    social_security: {
      user_receiving: false,
      user_future_entitled: true,
      user_entitled: true,
      user_amount: 0.0,
      user_freq: 'monthly',
      user_start_age: 67,
      spouse_receiving: false,
      spouse_future_entitled: false,
      spouse_entitled: false,
      spouse_amount: 0.0,
      spouse_freq: 'monthly',
      spouse_start_age: 67,
    },
    accounts: [],
    pretax_assets: assets(),
    spouse_pretax_assets: assets({ contrib_end_age_type: 'spouse_retirement' }),
    roth_assets: assets(),
    taxable_assets: assets({ return_mean: 5.0, return_std: 8.0 }),
    hsa_assets: assets({ return_mean: 5.0, return_std: 8.0, hsa_for_medical: true }),
    spouse_hsa_assets: assets({ return_mean: 5.0, return_std: 8.0, hsa_for_medical: true }),
    additional_spending: [],
    income_sources: [],
    other_taxes: [],
    state_tax_rate: 0.0,
    state_ss_exempt: true,
  };
  plan.balance_sheet = buildDefaultBalanceSheet(null, 2026, plan, today);
  plan.rebalancing = buildDefaultRebalancing();
  return plan;
}
