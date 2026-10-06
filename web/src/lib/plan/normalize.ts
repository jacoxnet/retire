// Imported-plan normalization: normalize_imported_plan (core/forms.py) and the
// stage-1 migrations of import_plan_data (normalize_plan_fields in core/views.py).
// A loaded file bypasses the Enter form, so its fields are coerced to the types the
// form would produce, unknown keys are dropped and bad values are reported.
import { getBool, getFloat, getInt, pyStr } from './coerce';
import type { Plan } from './types';

type Kind = 'bool' | 'int' | 'float' | 'str';
type Kinds = Record<string, Kind>;
type Obj = Record<string, any>;

export const PLAN_SCALAR_KINDS: Kinds = {
  goal_seeking: 'bool',
  simulation_type: 'str',
  user_name: 'str',
  user_age: 'int',
  user_retirement_age: 'int',
  user_age_death: 'int',
  is_married: 'bool',
  spouse_name: 'str',
  spouse_age: 'int',
  spouse_retirement_age: 'int',
  spouse_age_death: 'int',
  filing_status: 'str',
  current_year: 'int',
  begin_spending_age_type: 'str',
  begin_spending_age_specified: 'int',
  desired_spending: 'float',
  survivor_spending: 'float',
  adjust_spending_inflation: 'bool',
  inflation_rate: 'float',
  runs: 'int',
  target_success_rate: 'float',
  state_tax_rate: 'float',
  state_ss_exempt: 'bool',
  user_life_insurance_amount: 'float',
  user_life_insurance_type: 'str',
  user_life_insurance_term_age: 'int',
  spouse_life_insurance_amount: 'float',
  spouse_life_insurance_type: 'str',
  spouse_life_insurance_term_age: 'int',
  marginal_tax_rate: 'float',
};

export const SOCIAL_SECURITY_KINDS: Kinds = {
  user_receiving: 'bool',
  user_future_entitled: 'bool',
  user_entitled: 'bool',
  user_amount: 'float',
  user_freq: 'str',
  user_start_age: 'int',
  spouse_receiving: 'bool',
  spouse_future_entitled: 'bool',
  spouse_entitled: 'bool',
  spouse_amount: 'float',
  spouse_freq: 'str',
  spouse_start_age: 'int',
};

export const FLAT_ASSET_KEYS = ['pretax_assets', 'spouse_pretax_assets', 'roth_assets',
  'taxable_assets', 'hsa_assets', 'spouse_hsa_assets'] as const;

export const FLAT_ASSET_KINDS: Kinds = {
  present_balance: 'float',
  contrib_amount: 'float',
  contrib_freq: 'str',
  contrib_start_age: 'int',
  contrib_end_age_type: 'str',
  contrib_end_age_specified: 'int',
  contrib_adjust_inflation: 'bool',
  return_mean: 'float',
  return_std: 'float',
  hsa_for_medical: 'bool',
};

export const ACCOUNT_KINDS: Kinds = {
  id: 'str',
  name: 'str',
  type: 'str',
  owner: 'str',
  balance: 'float',
  contrib_amount: 'float',
  contrib_freq: 'str',
  contrib_start_age: 'int',
  contrib_end_age_type: 'str',
  contrib_end_age_specified: 'int',
  contrib_adjust_inflation: 'bool',
  return_mean: 'float',
  return_std: 'float',
  hsa_for_medical: 'bool',
  dividend_yield: 'float',
  qualified_dividend_pct: 'float',
  interest_yield: 'float',
  capital_gains_dist_rate: 'float',
  cost_basis_ratio: 'float',
  is_community_property: 'bool',
};

export const ADJUSTMENT_KINDS: Kinds = {
  start_type: 'str',
  start_spec: 'int',
  end_type: 'str',
  end_spec: 'int',
  adjust_type: 'str',
  adjust_val: 'float',
};

// Field kinds of the Enter form's row lists (ADDITIONAL_SPENDING_SPEC etc.).
const ADDITIONAL_SPENDING_KINDS: Kinds = {
  name: 'str', amount: 'float', start_age: 'int', start_age_type: 'str', interval: 'int', adjust_inflation: 'bool',
};
const SCHEDULE_KINDS: Kinds = {
  name: 'str', amount: 'float', frequency: 'str', start_age_type: 'str', start_age_specified: 'int',
  end_age_type: 'str', end_age_specified: 'int',
};
const ADJUST_KINDS: Kinds = {
  adjust_type: 'str', adjust_val: 'float', adjust_start_age_type: 'str', adjust_start_age_specified: 'int',
};
const INCOME_SOURCE_KINDS: Kinds = {
  ...SCHEDULE_KINDS,
  subject_to_tax: 'bool', is_social_security: 'bool', has_survivor_benefit: 'bool', survivor_benefit_pct: 'float',
  ...ADJUST_KINDS,
};
const OTHER_TAX_KINDS: Kinds = { ...SCHEDULE_KINDS, ...ADJUST_KINDS };

export const PLAN_ROW_KINDS: Record<string, Kinds> = {
  accounts: ACCOUNT_KINDS,
  additional_spending: ADDITIONAL_SPENDING_KINDS,
  income_sources: INCOME_SOURCE_KINDS,
  other_taxes: OTHER_TAX_KINDS,
};

export const PLAN_KEYS = new Set<string>([
  ...Object.keys(PLAN_SCALAR_KINDS), ...FLAT_ASSET_KEYS, ...Object.keys(PLAN_ROW_KINDS),
  'social_security', 'balance_sheet', 'rebalancing',
]);

const KIND_NAMES: Record<Kind, string> = { int: 'a whole number', float: 'a number', str: 'text', bool: 'bool' };

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

class CoerceError extends Error {}

/** _coerce: convert value to kind, throwing when it can't be done cleanly. */
function coerce(value: unknown, kind: Kind): unknown {
  if (kind === 'bool') return getBool(value);
  if (value !== null && typeof value === 'object') throw new CoerceError();
  if (kind === 'str') return pyStr(value);
  if (typeof value === 'boolean') throw new CoerceError();
  const num = getFloat(value, null);
  if (num === null) throw new CoerceError();
  return kind === 'int' ? Math.trunc(num) : num;
}

/** Coerce obj's known fields in place: nulls are dropped silently, bad values reported and dropped. */
function coerceFields(obj: Obj, kinds: Kinds, label: string, errors: string[]): void {
  for (const [key, kind] of Object.entries(kinds)) {
    if (!(key in obj)) continue;
    if (obj[key] === null || obj[key] === undefined) {
      delete obj[key];
      continue;
    }
    try {
      obj[key] = coerce(obj[key], kind);
    } catch (e) {
      if (!(e instanceof CoerceError)) throw e;
      errors.push(`Imported plan: ${label} '${key}' must be ${KIND_NAMES[kind]}.`);
      delete obj[key];
    }
  }
}

/**
 * Coerce an imported plan in place to the shapes and types the Enter form produces,
 * dropping unknown keys. Returns messages for values that had to be discarded.
 */
export function normalizeImportedPlan(data: Obj): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(data)) if (!PLAN_KEYS.has(key)) delete data[key];

  coerceFields(data, PLAN_SCALAR_KINDS, 'field', errors);

  for (const key of ['social_security', 'balance_sheet', 'rebalancing', ...FLAT_ASSET_KEYS]) {
    if (key in data && !isObj(data[key])) {
      errors.push(`Imported plan: '${key}' must be an object.`);
      delete data[key];
    }
  }
  if ('social_security' in data) coerceFields(data.social_security, SOCIAL_SECURITY_KINDS, 'Social Security field', errors);
  for (const key of FLAT_ASSET_KEYS) {
    if (key in data) coerceFields(data[key], FLAT_ASSET_KINDS, `${key} field`, errors);
  }

  for (const [key, kinds] of Object.entries(PLAN_ROW_KINDS)) {
    if (!(key in data)) continue;
    if (!Array.isArray(data[key])) {
      errors.push(`Imported plan: '${key}' must be a list.`);
      delete data[key];
      continue;
    }
    const rows = (data[key] as unknown[]).filter(isObj);
    if (rows.length !== data[key].length) {
      errors.push(`Imported plan: entries in '${key}' that were not objects were skipped.`);
    }
    rows.forEach((row, i) => {
      const idx = i + 1;
      coerceFields(row, kinds, `${key} #${idx}`, errors);
      if ('adjustments' in row) {
        if (Array.isArray(row.adjustments)) {
          row.adjustments = row.adjustments.filter(isObj);
          for (const adj of row.adjustments) coerceFields(adj, ADJUSTMENT_KINDS, `${key} #${idx} adjustment`, errors);
        } else {
          delete row.adjustments;
        }
      }
    });
    data[key] = rows;
  }
  return errors;
}

const get = (o: Obj, k: string, d: unknown = null) => (k in o && o[k] !== undefined ? o[k] : d);

/**
 * Stage 1 of importing a plan (normalize_plan_fields): coerce types, then migrate
 * older shapes of the simulation type, Social Security flags and income adjustment
 * schedules. Modifies `data` in place; returns the import errors.
 */
export function normalizePlanFields(data: Obj): string[] {
  const errors = normalizeImportedPlan(data);

  if (!('goal_seeking' in data) && 'simulation_type' in data) {
    data.goal_seeking = data.simulation_type === 'goal_seeking';
  } else if (!('simulation_type' in data) && 'goal_seeking' in data) {
    data.simulation_type = data.goal_seeking ? 'goal_seeking' : 'regular';
  }

  if (isObj(data.social_security)) {
    const ss = data.social_security;
    if (!('user_receiving' in ss)) {
      const ent = getBool(get(ss, 'user_entitled', true));
      const age = getInt(data.user_age, 60);
      const start = getInt(ss.user_start_age, 67);
      ss.user_receiving = ent && age >= start;
      ss.user_future_entitled = ent && age < start;
    } else {
      ss.user_receiving = getBool(ss.user_receiving);
      ss.user_future_entitled = getBool(ss.user_future_entitled);
    }
    ss.user_entitled = ss.user_receiving || ss.user_future_entitled;

    if (!('spouse_receiving' in ss)) {
      const ent = getBool(get(ss, 'spouse_entitled', false));
      const age = getInt(data.spouse_age, 60);
      const start = getInt(ss.spouse_start_age, 67);
      ss.spouse_receiving = ent && age >= start;
      ss.spouse_future_entitled = ent && age < start;
    } else {
      ss.spouse_receiving = getBool(ss.spouse_receiving);
      ss.spouse_future_entitled = getBool(ss.spouse_future_entitled);
    }
    ss.spouse_entitled = ss.spouse_receiving || ss.spouse_future_entitled;
  }

  if (Array.isArray(data.income_sources) && data.income_sources.length) {
    for (const inc of data.income_sources) {
      if (!isObj(inc)) continue;
      if (!Array.isArray(inc.adjustments) || inc.adjustments.length === 0) {
        inc.adjustments = [{
          start_type: get(inc, 'adjust_start_age_type', 'start'),
          start_spec: get(inc, 'adjust_start_age_specified', 65),
          end_type: get(inc, 'end_age_type', 'death'),
          end_spec: get(inc, 'end_age_specified', 90),
          adjust_type: get(inc, 'adjust_type', 'inflation'),
          adjust_val: get(inc, 'adjust_val', 0.0),
        }];
      }
      inc.has_survivor_benefit = Boolean(get(inc, 'has_survivor_benefit', false));
      inc.survivor_benefit_pct = Math.min(100.0, Math.max(0.0, Number(get(inc, 'survivor_benefit_pct', 100.0))));
    }
  }
  return errors;
}

/**
 * Parse a plan file. Like the Django loader it rejects NaN/Infinity and non-object
 * JSON. Unlike it, a file holding a JSON-encoded string of a plan (as some older
 * exports are) is unwrapped once. Throws Error with the loader's message.
 */
export function parsePlanJson(text: string): Plan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const constant = /(?:^|[\s:,[])(-?Infinity|NaN)(?=[\s,\]}]|$)/.exec(text);
    if (constant) throw new Error(`Invalid number in plan file: ${constant[1]}`);
    throw e;
  }
  if (typeof data === 'string') data = parsePlanJson(data);
  if (!isObj(data)) throw new Error('Invalid JSON format');
  return data as Plan;
}
