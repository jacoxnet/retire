// Plan data model. Keys match the Python/Django session plan (snake_case) so saved
// plans round-trip unchanged. Loose index signatures keep unknown-but-harmless keys
// (e.g. engine metadata) from failing type checks.

export type SimulationType = 'regular' | 'goal_seeking';
export type FilingStatus = 'single' | 'joint' | 'married_filing_jointly' | 'hoh' | 'head_of_household';
export type Frequency = 'monthly' | 'annual' | 'one_time' | 'one-time';
export type AdjustType = 'inflation' | 'fixed_pct' | 'inflation_less_pct' | 'none';
/** Age selectors resolved by resolveAge (engine/inputs.ts). */
export type AgeType =
  | 'specified' | 'age' | 'user_specified' | 'spouse_specified'
  | 'retirement' | 'spouse_retirement' | 'death' | 'spouse_death' | 'first_death'
  | 'start' | 'income_start' | 'at_start' | 'current_age' | 'current_year' | 'now';

export interface SocialSecurity {
  user_receiving?: boolean;
  user_future_entitled?: boolean;
  user_entitled?: boolean;
  user_amount?: number;
  user_freq?: string;
  user_start_age?: number;
  spouse_receiving?: boolean;
  spouse_future_entitled?: boolean;
  spouse_entitled?: boolean;
  spouse_amount?: number;
  spouse_freq?: string;
  spouse_start_age?: number;
}

/** Aggregated per-bucket assets (pretax_assets, roth_assets, ...), derived from accounts. */
export interface FlatAssets {
  present_balance?: number;
  contrib_amount?: number;
  contrib_freq?: string;
  contrib_start_age?: number;
  contrib_end_age_type?: string;
  contrib_end_age_specified?: number;
  contrib_adjust_inflation?: boolean;
  return_mean?: number;
  return_std?: number;
  hsa_for_medical?: boolean;
  accounts?: Account[];
  [key: string]: unknown;
}

export type AccountType = 'pretax' | 'roth' | 'taxable' | 'hsa';

export interface Account {
  id?: string;
  name?: string;
  type?: AccountType | string;
  owner?: 'user' | 'spouse' | string;
  balance?: number;
  contrib_amount?: number;
  contrib_freq?: string;
  contrib_start_age?: number;
  contrib_end_age_type?: string;
  contrib_end_age_specified?: number;
  contrib_adjust_inflation?: boolean;
  return_mean?: number;
  return_std?: number;
  hsa_for_medical?: boolean;
  dividend_yield?: number;
  qualified_dividend_pct?: number;
  interest_yield?: number;
  capital_gains_dist_rate?: number;
  cost_basis_ratio?: number;
  is_community_property?: boolean;
  [key: string]: unknown;
}

export interface AdditionalSpendingItem {
  name?: string;
  amount?: number;
  start_age?: number;
  start_age_type?: 'user' | 'spouse' | string;
  interval?: number;
  adjust_inflation?: boolean;
}

export interface Adjustment {
  start_type?: string;
  start_spec?: number;
  end_type?: string;
  end_spec?: number;
  adjust_type?: AdjustType | string;
  adjust_val?: number;
}

interface ScheduledItem {
  name?: string;
  amount?: number;
  frequency?: Frequency | string;
  start_age_type?: string;
  start_age_specified?: number;
  end_age_type?: string;
  end_age_specified?: number;
  adjust_type?: AdjustType | string;
  adjust_val?: number;
  adjust_start_age_type?: string;
  adjust_start_age_specified?: number;
}

export interface IncomeSource extends ScheduledItem {
  subject_to_tax?: boolean;
  is_social_security?: boolean;
  has_survivor_benefit?: boolean;
  survivor_benefit_pct?: number;
  adjustments?: Adjustment[];
}

export type OtherTax = ScheduledItem;

export interface AssetClass {
  id: string;
  name: string;
  target_percent: number;
  color: string;
}

export interface Rebalancing {
  included_account_ids: string[];
  tolerance_percent: number;
  rebalance_mode: string;
  cash_flow: number;
  asset_classes: AssetClass[];
  account_allocations: Record<string, unknown>;
  [key: string]: unknown;
}

/** Balance sheet: typed in phase 4b. */
export type BalanceSheet = Record<string, any>;

export interface Plan {
  goal_seeking?: boolean;
  simulation_type?: SimulationType | string;
  user_name?: string;
  user_age?: number;
  user_retirement_age?: number;
  user_age_death?: number;
  is_married?: boolean;
  spouse_name?: string;
  spouse_age?: number;
  spouse_retirement_age?: number;
  spouse_age_death?: number;
  filing_status?: FilingStatus | string;
  current_year?: number;
  begin_spending_age_type?: string;
  begin_spending_age_specified?: number;
  desired_spending?: number;
  survivor_spending?: number;
  adjust_spending_inflation?: boolean;
  inflation_rate?: number;
  runs?: number;
  target_success_rate?: number;
  state_tax_rate?: number;
  state_ss_exempt?: boolean;
  user_life_insurance_amount?: number;
  user_life_insurance_type?: 'permanent' | 'term' | string;
  user_life_insurance_term_age?: number;
  spouse_life_insurance_amount?: number;
  spouse_life_insurance_type?: 'permanent' | 'term' | string;
  spouse_life_insurance_term_age?: number;
  marginal_tax_rate?: number;
  social_security?: SocialSecurity;
  accounts?: Account[];
  pretax_assets?: FlatAssets;
  spouse_pretax_assets?: FlatAssets;
  roth_assets?: FlatAssets;
  taxable_assets?: FlatAssets;
  hsa_assets?: FlatAssets;
  spouse_hsa_assets?: FlatAssets;
  additional_spending?: AdditionalSpendingItem[];
  income_sources?: IncomeSource[];
  other_taxes?: OtherTax[];
  balance_sheet?: BalanceSheet;
  rebalancing?: Rebalancing;
  [key: string]: unknown;
}
