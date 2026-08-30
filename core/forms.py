import json
import datetime

"""
Parsing and validation helpers for the plan-entry form.

These functions replace the hand-duplicated per-field parsing/validation that used
to live directly in core.views.enter_view. Both supported POST shapes -- the
dynamic "account_name[]" rows and the older flat "pretax_present_balance" style
fields -- are normalized into a single `accounts` list, which is the only thing
validated and the only thing `aggregate_accounts` needs to consume.
"""

# Asset-type defaults shared by both account-parsing paths and by aggregate_accounts.
# (prefix, account_type, owner, default_return_mean, default_return_std, is_hsa)
ASSET_PREFIX_CONFIG = [
    ('pretax', 'pretax', 'user', 6.0, 10.0, False),
    ('spouse_pretax', 'pretax', 'spouse', 6.0, 10.0, False),
    ('roth', 'roth', 'user', 6.0, 10.0, False),
    ('taxable', 'taxable', 'user', 5.0, 8.0, False),
    ('hsa', 'hsa', 'user', 5.0, 8.0, True),
    ('spouse_hsa', 'hsa', 'spouse', 5.0, 8.0, True),
]


# ---------------------------------------------------------------------------
# Scalar coercion helpers (lenient: never raise, always fall back to a default)
# ---------------------------------------------------------------------------

def get_float(val, default=0.0):
    try:
        if isinstance(val, str):
            val = val.replace('$', '').replace('%', '').replace(',', '').strip()
        return float(val)
    except (TypeError, ValueError):
        return default


def get_int(val, default=0):
    try:
        if isinstance(val, str):
            val = val.replace('$', '').replace('%', '').replace(',', '').strip()
        return int(float(val))
    except (TypeError, ValueError):
        return default


def get_bool(val):
    if val in ['on', 'true', 'True', True]:
        return True
    return False


# ---------------------------------------------------------------------------
# Generic row-list parsing (additional_spending / income_sources / other_taxes)
# ---------------------------------------------------------------------------

def zip_row_lists(post, driver_key, spec):
    """Zip several POST.getlist(...) arrays into a list of row dicts.

    spec: list of (out_key, post_key, kind, default) where kind is one of
    'str' | 'float' | 'int' | 'bool'. Row count is taken from the driver
    list (post.getlist(driver_key)), matching each block's original loop.
    """
    lists = {out_key: post.getlist(post_key) for out_key, post_key, _kind, _default in spec}
    count = len(post.getlist(driver_key))
    rows = []
    for i in range(count):
        row = {}
        for out_key, _post_key, kind, default in spec:
            values = lists[out_key]
            raw = values[i] if i < len(values) else None
            if raw is None:
                row[out_key] = default
            elif kind == 'str':
                row[out_key] = raw.strip() if raw.strip() else default
            elif kind == 'float':
                row[out_key] = get_float(raw, default)
            elif kind == 'int':
                row[out_key] = get_int(raw, default)
            elif kind == 'bool':
                row[out_key] = raw == 'true'
        rows.append(row)
    return rows


ADDITIONAL_SPENDING_SPEC = [
    ('name', 'add_spending_name[]', 'str', 'Additional Expense'),
    ('amount', 'add_spending_amount[]', 'float', 0.0),
    ('start_age', 'add_spending_start_age[]', 'int', 65),
    ('start_age_type', 'add_spending_start_age_type[]', 'str', 'user'),
    ('interval', 'add_spending_interval[]', 'int', 0),
    ('adjust_inflation', 'add_spending_adjust_inflation[]', 'bool', True),
]

INCOME_SOURCE_SPEC = [
    ('name', 'income_name[]', 'str', 'Income Source'),
    ('amount', 'income_amount[]', 'float', 0.0),
    ('frequency', 'income_frequency[]', 'str', 'monthly'),
    ('start_age_type', 'income_start_age_type[]', 'str', 'retirement'),
    ('start_age_specified', 'income_start_age_specified[]', 'int', 65),
    ('end_age_type', 'income_end_age_type[]', 'str', 'death'),
    ('end_age_specified', 'income_end_age_specified[]', 'int', 90),
    ('subject_to_tax', 'income_subject_to_tax[]', 'bool', True),
    ('is_social_security', 'income_is_ss[]', 'bool', False),
    ('has_survivor_benefit', 'income_has_survivor_benefit[]', 'bool', False),
    ('survivor_benefit_pct', 'income_survivor_benefit_pct[]', 'float', 100.0),
    ('adjust_type', 'income_adjust_type[]', 'str', 'inflation'),
    ('adjust_val', 'income_adjust_val[]', 'float', 0.0),
    ('adjust_start_age_type', 'income_adjust_start_age_type[]', 'str', 'start'),
    ('adjust_start_age_specified', 'income_adjust_start_age_specified[]', 'int', 65),
]

OTHER_TAX_SPEC = [
    ('name', 'other_tax_name[]', 'str', 'Other Tax'),
    ('amount', 'other_tax_amount[]', 'float', 0.0),
    ('frequency', 'other_tax_frequency[]', 'str', 'annual'),
    ('start_age_type', 'other_tax_start_age_type[]', 'str', 'retirement'),
    ('start_age_specified', 'other_tax_start_age_specified[]', 'int', 65),
    ('end_age_type', 'other_tax_end_age_type[]', 'str', 'death'),
    ('end_age_specified', 'other_tax_end_age_specified[]', 'int', 90),
    ('adjust_type', 'other_tax_adjust_type[]', 'str', 'inflation'),
    ('adjust_val', 'other_tax_adjust_val[]', 'float', 0.0),
    ('adjust_start_age_type', 'other_tax_adjust_start_age_type[]', 'str', 'start'),
    ('adjust_start_age_specified', 'other_tax_adjust_start_age_specified[]', 'int', 65),
]


def parse_additional_spending(post):
    return zip_row_lists(post, 'add_spending_amount[]', ADDITIONAL_SPENDING_SPEC)


def parse_income_sources(post):
    rows = zip_row_lists(post, 'income_name[]', INCOME_SOURCE_SPEC)
    adjustments_json_list = post.getlist('income_adjustments_json[]')
    for i, row in enumerate(rows):
        # 1. Parse JSON adjustments if provided
        if i < len(adjustments_json_list) and adjustments_json_list[i]:
            try:
                adjs = json.loads(adjustments_json_list[i])
                if isinstance(adjs, list) and len(adjs) > 0:
                    clean_adjs = []
                    for adj in adjs:
                        if isinstance(adj, dict):
                            clean_adjs.append({
                                'start_type': str(adj.get('start_type', 'current_age')),
                                'start_spec': get_int(adj.get('start_spec'), 65),
                                'end_type': str(adj.get('end_type', 'death')),
                                'end_spec': get_int(adj.get('end_spec'), 90),
                                'adjust_type': str(adj.get('adjust_type', 'inflation')),
                                'adjust_val': get_float(adj.get('adjust_val'), 0.0),
                            })
                    if clean_adjs:
                        row['adjustments'] = clean_adjs
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        
        # 2. If no adjustments schedule, normalize legacy single adjustment into adjustments array
        if 'adjustments' not in row or not row['adjustments']:
            row['adjustments'] = [{
                'start_type': row.get('adjust_start_age_type', 'start'),
                'start_spec': row.get('adjust_start_age_specified', 65),
                'end_type': row.get('end_age_type', 'death'),
                'end_spec': row.get('end_age_specified', 90),
                'adjust_type': row.get('adjust_type', 'inflation'),
                'adjust_val': row.get('adjust_val', 0.0)
            }]

        # 3. Clamp survivor_benefit_pct
        row['survivor_benefit_pct'] = min(100.0, max(0.0, float(row.get('survivor_benefit_pct', 100.0))))
        row['has_survivor_benefit'] = bool(row.get('has_survivor_benefit', False))
    return rows


def parse_other_taxes(post):
    return zip_row_lists(post, 'other_tax_name[]', OTHER_TAX_SPEC)


# ---------------------------------------------------------------------------
# Account parsing: dynamic account_name[] rows and legacy flat *_present_balance
# fields both normalize into the same `accounts` list shape.
# ---------------------------------------------------------------------------

def parse_account_rows(post, user_age, user_retirement_age, is_married, spouse_age,
                        spouse_retirement_age, min_start_age):
    acc_names = post.getlist('account_name[]')
    if not acc_names:
        return []

    acc_ids = post.getlist('account_id[]')
    acc_types = post.getlist('account_type[]')
    acc_owners = post.getlist('account_owner[]')
    acc_balances = post.getlist('account_balance[]')
    acc_contrib_amts = post.getlist('account_contrib_amount[]')
    acc_contrib_freqs = post.getlist('account_contrib_freq[]')
    acc_contrib_starts = post.getlist('account_contrib_start_age[]')
    acc_contrib_end_types = post.getlist('account_contrib_end_age_type[]')
    acc_contrib_end_specs = post.getlist('account_contrib_end_age_specified[]')
    acc_contrib_infs = post.getlist('account_contrib_adjust_inflation[]')
    acc_return_means = post.getlist('account_return_mean[]')
    acc_return_stds = post.getlist('account_return_std[]')
    acc_hsa_meds = post.getlist('account_hsa_for_medical[]')

    accounts = []
    for i in range(len(acc_names)):
        a_id = acc_ids[i].strip() if (i < len(acc_ids) and acc_ids[i]) else f"acc_row_{i+1}"
        a_type = acc_types[i] if i < len(acc_types) else 'pretax'
        a_owner = acc_owners[i] if (i < len(acc_owners) and is_married) else 'user'
        a_name = acc_names[i].strip() if i < len(acc_names) and acc_names[i] else f"{a_owner.title()} {a_type.title()} Account"
        def_start = spouse_age if (a_owner == 'spouse' and is_married) else user_age
        def_ret = spouse_retirement_age if (a_owner == 'spouse' and is_married) else user_retirement_age

        accounts.append({
            'id': a_id,
            'name': a_name,
            'type': a_type,
            'owner': a_owner,
            'balance': get_float(acc_balances[i]) if i < len(acc_balances) else 0.0,
            'contrib_amount': get_float(acc_contrib_amts[i]) if i < len(acc_contrib_amts) else 0.0,
            'contrib_freq': acc_contrib_freqs[i] if i < len(acc_contrib_freqs) else 'annual',
            'contrib_start_age': max(min_start_age, get_int(acc_contrib_starts[i], def_start) if i < len(acc_contrib_starts) else def_start),
            'contrib_end_age_type': acc_contrib_end_types[i] if i < len(acc_contrib_end_types) else ('spouse_retirement' if a_owner == 'spouse' else 'retirement'),
            'contrib_end_age_specified': get_int(acc_contrib_end_specs[i], def_ret) if i < len(acc_contrib_end_specs) else def_ret,
            'contrib_adjust_inflation': (acc_contrib_infs[i] == 'true') if i < len(acc_contrib_infs) else True,
            'return_mean': get_float(acc_return_means[i], 6.0) if i < len(acc_return_means) else 6.0,
            'return_std': get_float(acc_return_stds[i], 10.0) if i < len(acc_return_stds) else 10.0,
            'hsa_for_medical': (acc_hsa_meds[i] == 'true') if i < len(acc_hsa_meds) else True,
        })
    return accounts


def parse_legacy_accounts(post, user_age, user_retirement_age, is_married, spouse_age,
                           spouse_retirement_age, min_start_age):
    """Build an `accounts` list directly from the older flat per-category fields
    (pretax_present_balance, roth_contrib_amount, ...). One account is emitted
    per category that has a non-zero balance or contribution.
    """
    accounts = []
    for prefix, atype, owner, r_mean, r_std, is_hsa in ASSET_PREFIX_CONFIG:
        is_spouse = owner == 'spouse'
        if is_spouse and not is_married:
            continue

        def_age = spouse_age if is_spouse else user_age
        def_ret = spouse_retirement_age if is_spouse else user_retirement_age
        default_end_type = 'spouse_retirement' if is_spouse else 'retirement'

        balance = get_float(post.get(f'{prefix}_present_balance'), 0.0)
        contrib_amount = get_float(post.get(f'{prefix}_contrib_amount'), 0.0)
        if balance <= 0 and contrib_amount <= 0:
            continue

        account = {
            'name': f"{'Spouse ' if is_spouse else ''}{atype.upper()} Account",
            'type': atype,
            'owner': owner,
            'balance': balance,
            'contrib_amount': contrib_amount,
            'contrib_freq': post.get(f'{prefix}_contrib_freq', 'annual'),
            'contrib_start_age': max(min_start_age, get_int(post.get(f'{prefix}_contrib_start_age'), def_age)),
            'contrib_end_age_type': post.get(f'{prefix}_contrib_end_age_type', default_end_type),
            'contrib_end_age_specified': get_int(post.get(f'{prefix}_contrib_end_age_specified'), def_ret),
            'contrib_adjust_inflation': get_bool(post.get(f'{prefix}_contrib_adjust_inflation')),
            'return_mean': get_float(post.get(f'{prefix}_return_mean'), r_mean),
            'return_std': get_float(post.get(f'{prefix}_return_std'), r_std),
        }
        if is_hsa:
            account['hsa_for_medical'] = get_bool(post.get(f'{prefix}_for_medical'))
        accounts.append(account)
    return accounts


def flat_assets_to_accounts(data, is_married):
    """Convert a legacy saved-plan's flat `{prefix}_assets` dicts into an
    `accounts` list. Shared by the JSON plan-load migration path.
    """
    accounts = []
    for prefix, atype, owner, _r_mean, _r_std, _is_hsa in ASSET_PREFIX_CONFIG:
        if owner == 'spouse' and not is_married:
            continue
        ac_data = data.get(f'{prefix}_assets', {})
        if not ac_data:
            continue
        if ac_data.get('present_balance', 0) <= 0 and ac_data.get('contrib_amount', 0) <= 0:
            continue
        accounts.append({
            'name': f"{'Spouse ' if owner == 'spouse' else ''}{atype.upper()} Account",
            'type': atype,
            'owner': owner,
            'balance': ac_data.get('present_balance', 0.0),
            'contrib_amount': ac_data.get('contrib_amount', 0.0),
            'contrib_freq': ac_data.get('contrib_freq', 'annual'),
            'contrib_start_age': ac_data.get('contrib_start_age', 60),
            'contrib_end_age_type': ac_data.get('contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': ac_data.get('contrib_end_age_specified', 65),
            'contrib_adjust_inflation': ac_data.get('contrib_adjust_inflation', True),
            'return_mean': ac_data.get('return_mean', 6.0),
            'return_std': ac_data.get('return_std', 10.0),
            'hsa_for_medical': ac_data.get('hsa_for_medical', True),
        })
    return accounts


def aggregate_accounts(accounts, user_age, user_retirement_age, user_age_death, is_married,
                        spouse_age, spouse_retirement_age, spouse_age_death):
    asset_map = {
        'pretax': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': user_age, 'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': user_retirement_age, 'contrib_adjust_inflation': True,
            'return_mean': 6.0, 'return_std': 10.0, 'is_spouse': False
        },
        'spouse_pretax': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': spouse_age if is_married else user_age,
            'contrib_end_age_type': 'spouse_retirement' if is_married else 'retirement',
            'contrib_end_age_specified': spouse_retirement_age if is_married else user_retirement_age,
            'contrib_adjust_inflation': True, 'return_mean': 6.0, 'return_std': 10.0, 'is_spouse': True
        },
        'roth': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': user_age, 'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': user_retirement_age, 'contrib_adjust_inflation': True,
            'return_mean': 6.0, 'return_std': 10.0, 'is_spouse': False
        },
        'taxable': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': user_age, 'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': user_retirement_age, 'contrib_adjust_inflation': True,
            'return_mean': 5.0, 'return_std': 8.0, 'is_spouse': False
        },
        'hsa': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': user_age, 'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': user_retirement_age, 'contrib_adjust_inflation': True,
            'return_mean': 5.0, 'return_std': 8.0, 'hsa_for_medical': True, 'is_spouse': False
        },
        'spouse_hsa': {
            'present_balance': 0.0, 'contrib_amount': 0.0, 'contrib_freq': 'annual',
            'contrib_start_age': spouse_age if is_married else user_age,
            'contrib_end_age_type': 'spouse_retirement' if is_married else 'retirement',
            'contrib_end_age_specified': spouse_retirement_age if is_married else user_retirement_age,
            'contrib_adjust_inflation': True, 'return_mean': 5.0, 'return_std': 8.0, 'hsa_for_medical': True,
            'is_spouse': True
        }
    }

    grouped = {k: [] for k in asset_map}
    for acc in accounts:
        atype = acc.get('type', 'pretax')
        aowner = acc.get('owner', 'user')
        if not is_married:
            aowner = 'user'

        if atype == 'pretax':
            target_key = 'spouse_pretax' if aowner == 'spouse' else 'pretax'
        elif atype == 'hsa':
            target_key = 'spouse_hsa' if aowner == 'spouse' else 'hsa'
        elif atype == 'roth':
            target_key = 'roth'
        elif atype == 'taxable':
            target_key = 'taxable'
        else:
            target_key = 'taxable'
        grouped[target_key].append(acc)

    result = {}
    for key, acc_list in grouped.items():
        base = dict(asset_map[key])
        if acc_list:
            base['present_balance'] = sum(float(a.get('balance', 0.0)) for a in acc_list)
            annual_contribs = [
                (float(a.get('contrib_amount', 0.0)) * 12.0 if a.get('contrib_freq') == 'monthly' else float(a.get('contrib_amount', 0.0)))
                for a in acc_list
            ]
            base['contrib_amount'] = sum(annual_contribs)
            base['contrib_freq'] = 'annual'

            total_bal = sum(max(0.0, float(a.get('balance', 0.0))) for a in acc_list)
            if total_bal > 0:
                weights = [max(0.0, float(a.get('balance', 0.0))) for a in acc_list]
            else:
                weights = [max(0.0, c) for c in annual_contribs]
            total_w = sum(weights)
            if total_w > 0:
                base['return_mean'] = sum(float(a.get('return_mean', 6.0)) * w for a, w in zip(acc_list, weights)) / total_w
                base['return_std'] = sum(float(a.get('return_std', 10.0)) * w for a, w in zip(acc_list, weights)) / total_w
            else:
                base['return_mean'] = sum(float(a.get('return_mean', 6.0)) for a in acc_list) / len(acc_list)
                base['return_std'] = sum(float(a.get('return_std', 10.0)) for a in acc_list) / len(acc_list)

            primary = acc_list[0]
            base['contrib_start_age'] = primary.get('contrib_start_age', base['contrib_start_age'])
            base['contrib_end_age_type'] = primary.get('contrib_end_age_type', base['contrib_end_age_type'])
            base['contrib_end_age_specified'] = primary.get('contrib_end_age_specified', base['contrib_end_age_specified'])
            base['contrib_adjust_inflation'] = primary.get('contrib_adjust_inflation', True)
            if 'hsa_for_medical' in base:
                base['hsa_for_medical'] = any(a.get('hsa_for_medical', True) for a in acc_list)
        result[f'{key}_assets'] = base
    return result


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_accounts(accounts, user_age, user_age_death, is_married, spouse_age, spouse_age_death):
    errors = []
    seen_names = {}
    for acc in accounts:
        a_name = acc.get('name', '').strip()
        if a_name:
            key = a_name.lower()
            if key in seen_names:
                errors.append(f"Multiple accounts cannot have the same name: '{a_name}' is used more than once. Each account must have a unique name.")
            else:
                seen_names[key] = a_name
        else:
            errors.append("Account Name cannot be blank. Each account must have a unique name.")

        if acc.get('balance', 0.0) < 0:
            errors.append(f"Account '{a_name or 'Account'}' Present Balance cannot be negative.")
        if acc.get('contrib_amount', 0.0) < 0:
            errors.append(f"Account '{a_name or 'Account'}' Future Contribution Amount cannot be negative.")
        a_owner = acc.get('owner', 'user')
        rel_age = spouse_age if (a_owner == 'spouse' and is_married) else user_age
        rel_death = spouse_age_death if (a_owner == 'spouse' and is_married) else user_age_death
        c_start = acc.get('contrib_start_age', rel_age)
        if c_start < rel_age or c_start > rel_death:
            errors.append(f"Account '{a_name or 'Account'}' Contribution Start Age ({c_start}) must be between Present Age ({rel_age}) and Age at Death ({rel_death}).")
        if acc.get('contrib_end_age_type') in ['age', 'specified', 'user_specified', 'spouse_specified']:
            c_end = acc.get('contrib_end_age_specified', rel_age)
            if c_end < c_start or c_end > 120:
                errors.append(f"Account '{a_name or 'Account'}' Specified Contribution End Age ({c_end}) must be greater than or equal to Contribution Start Age ({c_start}) up to 120.")
    return errors


def validate_balance_sheet_accounts(balance_sheet):
    """Validate that accounts in the balance sheet have unique names across categories."""
    errors = []
    if not isinstance(balance_sheet, dict) or 'categories' not in balance_sheet:
        return errors
    seen_names = {}
    for cat_key in ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily']:
        cat = balance_sheet['categories'].get(cat_key, {})
        for acc in cat.get('accounts', []):
            name = acc.get('name', '').strip()
            if not name:
                continue
            k = name.lower()
            if k in seen_names:
                errors.append(f"Multiple accounts cannot have the same name: '{name}' is used more than once in the Balance Sheet. Each account must have a unique name.")
            else:
                seen_names[k] = name
    for group in balance_sheet['categories'].get('goals', {}).get('goal_groups', []):
        for acc in group.get('accounts', []):
            name = acc.get('name', '').strip()
            if not name:
                continue
            k = name.lower()
            if k in seen_names:
                errors.append(f"Multiple accounts cannot have the same name: '{name}' is used more than once in the Balance Sheet. Each account must have a unique name.")
            else:
                seen_names[k] = name
    return errors


def validate_additional_spending(items, user_age, user_age_death, is_married=False, spouse_age=60, spouse_age_death=90):
    errors = []
    for item in items:
        name = item.get('name')
        if item.get('amount', 0.0) < 0:
            errors.append(f"Additional Spending item '{name}' Amount cannot be negative.")
        stype = item.get('start_age_type', 'user')
        rel_age = spouse_age if (stype == 'spouse' and is_married) else user_age
        rel_death = spouse_age_death if (stype == 'spouse' and is_married) else user_age_death
        s_start = item.get('start_age', rel_age)
        person_label = "Spouse's Present Age" if (stype == 'spouse' and is_married) else "Your Present Age"
        if s_start < rel_age or s_start > rel_death:
            errors.append(f"Additional Spending item '{name}' Start Age ({s_start}) cannot be younger than {person_label} ({rel_age}) or after Age at Death ({rel_death}).")
        if item.get('interval', 0) < 0:
            errors.append(f"Additional Spending item '{name}' Interval must be 0 (for one-time) or a positive number of years.")
    return errors


def validate_scheduled_items(label, items):
    """Shared validation for income_sources and other_taxes rows, which have
    an identical field shape apart from income's tax/SS flags.
    """
    errors = []
    for item in items:
        name = item.get('name')
        if item.get('amount', 0.0) < 0:
            errors.append(f"{label} '{name}' Amount cannot be negative.")
        if item.get('start_age_type') in ['specified', 'user_specified', 'spouse_specified']:
            s_spec = item.get('start_age_specified', 65)
            if s_spec < 18 or s_spec > 120:
                errors.append(f"{label} '{name}' Specified Start Age must be between 18 and 120.")
        if item.get('frequency') not in ['one_time', 'one-time'] and item.get('end_age_type') in ['specified', 'user_specified', 'spouse_specified']:
            min_end = item.get('start_age_specified', 18) if item.get('start_age_type') in ['specified', 'user_specified', 'spouse_specified'] else 18
            e_spec = item.get('end_age_specified', 90)
            if e_spec < min_end or e_spec > 120:
                errors.append(f"{label} '{name}' Specified End Age ({e_spec}) must be greater than or equal to Start Age ({min_end}) up to 120.")
        if item.get('survivor_benefit_pct', 0.0) < 0.0 or item.get('survivor_benefit_pct', 100.0) > 100.0:
            errors.append(f"{label} '{name}' Survivor Benefit Percentage must be between 0% and 100%.")

        # Validate multi-period adjustments if present
        adjustments = item.get('adjustments')
        if adjustments and isinstance(adjustments, list):
            for idx, p in enumerate(adjustments, 1):
                if p.get('adjust_type') in ['fixed_pct', 'inflation_less_pct']:
                    pval = p.get('adjust_val', 0.0)
                    if pval < 0.0 or pval > 100.0:
                        errors.append(f"{label} '{name}' Adjustment Period {idx} Percentage Rate must be between 0% and 100%.")
                if p.get('start_type') in ['specified', 'user_specified', 'spouse_specified']:
                    ps = p.get('start_spec', 65)
                    if ps < 18 or ps > 120:
                        errors.append(f"{label} '{name}' Adjustment Period {idx} Start Age must be between 18 and 120.")
                if p.get('end_type') in ['specified', 'user_specified', 'spouse_specified']:
                    pe = p.get('end_spec', 90)
                    if pe < 18 or pe > 120:
                        errors.append(f"{label} '{name}' Adjustment Period {idx} End Age must be between 18 and 120.")
        else:
            if item.get('adjust_type') in ['fixed_pct', 'inflation_less_pct']:
                a_val = item.get('adjust_val', 0.0)
                if a_val < 0.0 or a_val > 100.0:
                    errors.append(f"{label} '{name}' Percentage Rate must be between 0% and 100%.")
            if item.get('adjust_type') != 'none' and item.get('adjust_start_age_type') in ['specified', 'user_specified', 'spouse_specified']:
                a_start = item.get('adjust_start_age_specified', 65)
                if a_start < 18 or a_start > 120:
                    errors.append(f"{label} '{name}' Adjustment Start Age must be between 18 and 120.")
    return errors


# ---------------------------------------------------------------------------
# Balance Sheet & Marginal Tax Rate Helpers
# ---------------------------------------------------------------------------

FEDERAL_TAX_THRESHOLDS_2026 = {
    'single': [12400, 50400, 105700, 201775, 256225, 640600],
    'joint': [24800, 100800, 211400, 403550, 512450, 768700],
    'hoh': [17700, 67450, 105700, 201775, 256225, 640600],
}

STANDARD_DEDUCTION_2026 = {
    'single': 16100,
    'joint': 32200,
    'hoh': 24150,
}

FEDERAL_TAX_BRACKET_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]


def calculate_taxable_ss_forms(agi_ex_ss, ss_benefits, filing_status):
    """Estimate taxable portion of Social Security benefits based on IRS provisional income thresholds."""
    if ss_benefits <= 0:
        return 0.0
    if filing_status == 'joint':
        base_limit = 32000
        step_limit = 12000
    else:  # single or hoh
        base_limit = 25000
        step_limit = 9000

    line_2 = 0.5 * ss_benefits
    line_5 = agi_ex_ss + line_2
    line_7 = line_5

    if line_7 <= base_limit:
        return 0.0

    line_9 = line_7 - base_limit
    line_10 = step_limit
    line_11 = max(0.0, line_9 - line_10)
    line_12 = min(line_9, line_10)
    line_13 = 0.5 * line_12
    line_14 = min(line_2, line_13)
    line_15 = 0.85 * line_11
    line_16 = line_14 + line_15
    line_17 = 0.85 * ss_benefits

    return min(line_16, line_17)


def calculate_marginal_tax_rate(data):
    """Calculate the combined Federal + State marginal tax rate for the user
    based on current filing status, all taxable income streams, social security,
    desired spending, standard deduction, state tax rate, and optional manual override.
    Returns rate as a percentage, e.g. 27.0 for 27%.
    """
    if not isinstance(data, dict):
        return 24.0

    # 1. Check for manual override
    override = data.get('marginal_tax_rate_override')
    if override is None and isinstance(data.get('balance_sheet'), dict):
        override = data['balance_sheet'].get('marginal_tax_rate_override')
    if override is not None:
        try:
            override_val = float(override)
            if 0.0 <= override_val <= 100.0:
                return round(override_val, 2)
        except (ValueError, TypeError):
            pass

    # 2. Filing status
    is_married = get_bool(data.get('is_married'))
    filing_status = data.get('filing_status', 'joint' if is_married else 'single')
    if filing_status not in FEDERAL_TAX_THRESHOLDS_2026:
        filing_status = 'joint' if is_married else 'single'

    # 3. Sum all taxable income streams
    total_taxable_streams = 0.0
    income_sources = data.get('income_sources', [])
    if isinstance(income_sources, list):
        for inc in income_sources:
            if not isinstance(inc, dict):
                continue
            if inc.get('subject_to_tax') is False or str(inc.get('subject_to_tax')).lower() == 'false':
                continue
            amt = float(inc.get('amount', 0.0) or 0.0)
            freq = inc.get('frequency', 'monthly')
            if freq == 'monthly':
                amt *= 12.0
            elif freq in ['one_time', 'one-time']:
                amt = 0.0
            total_taxable_streams += amt

    # 4. Social Security benefits
    ss_data = data.get('social_security', {})
    total_ss = 0.0
    if isinstance(ss_data, dict):
        if get_bool(ss_data.get('user_entitled', True)):
            u_amt = float(ss_data.get('user_amount', 0.0) or 0.0)
            if ss_data.get('user_freq', 'monthly') == 'monthly':
                u_amt *= 12.0
            total_ss += u_amt
        if is_married and get_bool(ss_data.get('spouse_entitled', False)):
            sp_amt = float(ss_data.get('spouse_amount', 0.0) or 0.0)
            if ss_data.get('spouse_freq', 'monthly') == 'monthly':
                sp_amt *= 12.0
            total_ss += sp_amt

    taxable_ss = calculate_taxable_ss_forms(total_taxable_streams, total_ss, filing_status)
    guaranteed_taxable_income = total_taxable_streams + taxable_ss

    # 5. Desired spending comparison
    desired_spending = float(data.get('desired_spending', 60000.0) or 0.0)
    effective_income_base = max(desired_spending, guaranteed_taxable_income)

    # 6. Apply standard deduction
    std_ded = STANDARD_DEDUCTION_2026.get(filing_status, 16100)
    taxable_base = max(0.0, effective_income_base - std_ded)

    # 7. Match against federal brackets
    thresholds = FEDERAL_TAX_THRESHOLDS_2026.get(filing_status, FEDERAL_TAX_THRESHOLDS_2026['single'])
    fed_rate = FEDERAL_TAX_BRACKET_RATES[0]
    for i, threshold in enumerate(thresholds):
        if taxable_base > threshold:
            if i + 1 < len(FEDERAL_TAX_BRACKET_RATES):
                fed_rate = FEDERAL_TAX_BRACKET_RATES[i + 1]
            else:
                fed_rate = FEDERAL_TAX_BRACKET_RATES[-1]
        else:
            break

    state_rate = float(data.get('state_tax_rate', 0.0) or 0.0) / 100.0
    combined_rate = (fed_rate + state_rate) * 100.0
    return round(combined_rate, 2)


def build_default_balance_sheet(accounts=None, current_year=2026, data=None):
    """Build a comprehensive default balance sheet structure pre-populated with
    any existing accounts and sensible defaults.
    """
    if accounts is None:
        accounts = []

    today_str = datetime.date.today().isoformat()
    periods = [today_str]
    curr_period = today_str

    # Group existing accounts by type
    pretax_accs = []
    roth_accs = []
    taxable_accs = []
    hsa_accs = []

    for acc in accounts:
        atype = acc.get('type', 'pretax')
        bal = float(acc.get('balance', 0.0))
        acc_dict = {
            'id': f"acc_{len(pretax_accs) + len(roth_accs) + len(taxable_accs) + len(hsa_accs) + 1}",
            'name': acc.get('name', 'Account'),
            'institution': acc.get('institution', 'Investment Custodian'),
            'owner': acc.get('owner', 'user'),
            'type': atype,
            'include_in_retirement': True,
            'values': {
                curr_period: bal,
            },
            'contrib_amount': float(acc.get('contrib_amount', 0.0)),
            'contrib_freq': acc.get('contrib_freq', 'annual'),
            'contrib_start_age': acc.get('contrib_start_age', 60),
            'contrib_end_age_type': acc.get('contrib_end_age_type', 'retirement'),
            'contrib_end_age_specified': acc.get('contrib_end_age_specified', 65),
            'contrib_adjust_inflation': acc.get('contrib_adjust_inflation', True),
            'return_mean': float(acc.get('return_mean', 6.0)),
            'return_std': float(acc.get('return_std', 10.0)),
            'hsa_for_medical': acc.get('hsa_for_medical', True),
        }
        if atype == 'pretax':
            pretax_accs.append(acc_dict)
        elif atype == 'roth':
            roth_accs.append(acc_dict)
        elif atype == 'taxable':
            taxable_accs.append(acc_dict)
        elif atype == 'hsa':
            hsa_accs.append(acc_dict)

    if not pretax_accs:
        pretax_accs.append({
            'id': 'acc_pretax_1',
            'name': 'Primary 401(k) / Traditional IRA',
            'institution': 'Fidelity',
            'owner': 'user',
            'type': 'pretax',
            'include_in_retirement': True,
            'values': {curr_period: 0.0},
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0,
        })

    if not roth_accs:
        roth_accs.append({
            'id': 'acc_roth_1',
            'name': 'Roth IRA',
            'institution': 'Vanguard',
            'owner': 'user',
            'type': 'roth',
            'include_in_retirement': True,
            'values': {curr_period: 0.0},
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 6.0,
            'return_std': 10.0,
        })

    if not taxable_accs:
        taxable_accs.append({
            'id': 'acc_taxable_1',
            'name': 'Taxable Brokerage Account',
            'institution': 'Charles Schwab',
            'owner': 'user',
            'type': 'taxable',
            'include_in_retirement': True,
            'values': {curr_period: 0.0},
            'contrib_amount': 0.0,
            'contrib_freq': 'annual',
            'contrib_start_age': 60,
            'contrib_end_age_type': 'retirement',
            'contrib_end_age_specified': 65,
            'contrib_adjust_inflation': True,
            'return_mean': 5.0,
            'return_std': 8.0,
        })

    # Emergency Fund accounts
    emergency_accs = [
        {
            'id': 'acc_emg_1',
            'name': 'High-Yield Emergency Savings',
            'institution': 'Marcus / Ally',
            'owner': 'user',
            'type': 'cash',
            'include_in_retirement': False,
            'values': {curr_period: 0.0},
        }
    ]

    # Goal Savings / Sinking Funds (with target goal amount & multi-account support)
    goal_groups = [
        {
            'id': 'goal_car',
            'name': 'Next Vehicle Replacement',
            'target_amount': 0.0,
            'accounts': [
                {
                    'id': 'acc_g_car_1',
                    'name': 'Car Fund Savings (HYSA)',
                    'institution': 'Ally Bank',
                    'owner': 'user',
                    'type': 'cash',
                    'include_in_retirement': False,
                    'values': {curr_period: 0.0},
                },
                {
                    'id': 'acc_g_car_2',
                    'name': 'Short-Term Bond Reserve (Brokerage)',
                    'institution': 'Vanguard (BSV)',
                    'owner': 'user',
                    'type': 'taxable',
                    'include_in_retirement': False,
                    'values': {curr_period: 0.0},
                }
            ]
        },
        {
            'id': 'goal_hvac',
            'name': 'Home Maintenance & HVAC Reserve',
            'target_amount': 0.0,
            'accounts': [
                {
                    'id': 'acc_g_hvac_1',
                    'name': 'Home Repair Sinking Fund',
                    'institution': 'Capital One 360',
                    'owner': 'user',
                    'type': 'cash',
                    'include_in_retirement': False,
                    'values': {curr_period: 0.0},
                }
            ]
        },
        {
            'id': 'goal_travel',
            'name': 'Vacation & Travel Fund',
            'target_amount': 0.0,
            'accounts': [
                {
                    'id': 'acc_g_trv_1',
                    'name': 'Travel Savings Account',
                    'institution': 'Discover Bank',
                    'owner': 'user',
                    'type': 'cash',
                    'include_in_retirement': False,
                    'values': {curr_period: 0.0},
                }
            ]
        },
        {
            'id': 'goal_tech',
            'name': 'Tech & Electronics Sinking Fund',
            'target_amount': 0.0,
            'accounts': [
                {
                    'id': 'acc_g_tech_1',
                    'name': 'Technology Reserve',
                    'institution': 'Ally Bank',
                    'owner': 'user',
                    'type': 'cash',
                    'include_in_retirement': False,
                    'values': {curr_period: 0.0},
                }
            ]
        }
    ]

    # Daily Spending / Checking Accounts
    daily_accs = [
        {
            'id': 'acc_daily_1',
            'name': 'Primary Checking',
            'institution': 'Chase Bank',
            'owner': 'user',
            'type': 'cash',
            'include_in_retirement': False,
            'values': {curr_period: 0.0},
        }
    ]

    # Real Estate & Home Equity
    real_estate = {
        'properties': [
            {
                'id': 'prop_primary',
                'name': 'Primary Residence',
                'market_values': {curr_period: 0.0},
                'mortgages': [
                    {
                        'id': 'mort_primary',
                        'name': 'Primary 30-Yr Mortgage',
                        'balances': {curr_period: 0.0}
                    }
                ]
            }
        ]
    }

    # Debts & Liabilities
    debts = [
        {
            'id': 'debt_auto',
            'name': 'Auto Loan',
            'institution': 'Toyota Financial Services',
            'values': {curr_period: 0.0},
        },
        {
            'id': 'debt_cc',
            'name': 'Credit Cards (Monthly Statement Balance)',
            'institution': 'Chase / Amex',
            'values': {curr_period: 0.0},
        }
    ]

    calc_tax_rate = calculate_marginal_tax_rate(data) if data else 24.0

    return {
        'periods': periods,
        'current_period': curr_period,
        'marginal_tax_rate': calc_tax_rate,
        'marginal_tax_rate_override': None,
        'emergency_goal_amount': 0.0,
        'categories': {
            'pretax': {
                'title': 'Pretax Retirement Accounts',
                'is_pretax': True,
                'accounts': pretax_accs,
            },
            'roth': {
                'title': 'Post-Tax (Roth) Retirement Accounts',
                'is_pretax': False,
                'accounts': roth_accs,
            },
            'taxable': {
                'title': 'Investment / Taxable Brokerage Accounts',
                'is_pretax': False,
                'accounts': taxable_accs,
            },
            'hsa': {
                'title': 'Health Savings Accounts (HSA)',
                'is_pretax': False,
                'accounts': hsa_accs,
            },
            'emergency': {
                'title': 'Emergency Fund Accounts',
                'is_pretax': False,
                'target_amount': 0.0,
                'accounts': emergency_accs,
            },
            'goals': {
                'title': 'Goal Savings (Sinking Funds)',
                'is_pretax': False,
                'goal_groups': goal_groups,
            },
            'daily': {
                'title': 'Daily Spending Accounts (Checking & Cash)',
                'is_pretax': False,
                'accounts': daily_accs,
            },
            'real_estate': real_estate,
            'debts': debts,
        }
    }


def parse_balance_sheet(raw_json_or_post, default_data=None):
    """Parse and normalize the balance sheet data structure from POST input or JSON."""
    if isinstance(raw_json_or_post, str):
        try:
            bs = json.loads(raw_json_or_post)
            if isinstance(bs, dict) and 'categories' in bs:
                return bs
        except Exception:
            pass

    if isinstance(raw_json_or_post, dict):
        if 'categories' in raw_json_or_post:
            return raw_json_or_post
        if 'balance_sheet_json' in raw_json_or_post:
            try:
                bs = json.loads(raw_json_or_post['balance_sheet_json'])
                if isinstance(bs, dict) and 'categories' in bs:
                    return bs
            except Exception:
                pass

    return build_default_balance_sheet(data=default_data)


def sync_balance_sheet_to_accounts(balance_sheet, existing_accounts=None, user_age=60,
                                   user_retirement_age=65, is_married=False,
                                   spouse_age=60, spouse_retirement_age=65, min_start_age=60):
    """Extract all accounts from the balance sheet where include_in_retirement is True,
    and format them for the standard `accounts` list consumed by simulation runs.
    """
    if not isinstance(balance_sheet, dict) or 'categories' not in balance_sheet:
        return existing_accounts or []

    categories = balance_sheet.get('categories', {})
    curr_period = balance_sheet.get('current_period')
    periods = balance_sheet.get('periods', [])
    if not curr_period and periods:
        curr_period = periods[-1]

    existing_by_id = {}
    existing_by_name = {}
    if existing_accounts and isinstance(existing_accounts, list):
        for acc in existing_accounts:
            if isinstance(acc, dict):
                if acc.get('id'):
                    existing_by_id[acc.get('id')] = acc
                if acc.get('name'):
                    existing_by_name[acc.get('name')] = acc

    synced_accounts = []

    def process_account(acc, default_type):
        if not acc.get('include_in_retirement', False):
            return
        
        atype = acc.get('type', default_type)
        if atype == 'cash':
            atype = 'taxable'
        aowner = acc.get('owner', 'user')
        if not is_married:
            aowner = 'user'

        # Get latest balance from values dict
        vals = acc.get('values', {})
        bal = 0.0
        if isinstance(vals, dict):
            if curr_period and curr_period in vals:
                bal = get_float(vals[curr_period])
            elif vals:
                bal = get_float(list(vals.values())[-1])
            else:
                bal = get_float(acc.get('balance', 0.0))
        else:
            bal = get_float(acc.get('balance', 0.0))

        def_start = spouse_age if (aowner == 'spouse' and is_married) else user_age
        def_ret = spouse_retirement_age if (aowner == 'spouse' and is_married) else user_retirement_age

        match = None
        if acc.get('id') and acc.get('id') in existing_by_id:
            match = existing_by_id[acc.get('id')]
        elif acc.get('name') and acc.get('name') in existing_by_name:
            match = existing_by_name[acc.get('name')]

        c_amt = get_float(acc.get('contrib_amount', match.get('contrib_amount', 0.0) if match else 0.0))
        c_freq = acc.get('contrib_freq', match.get('contrib_freq', 'annual') if match else 'annual')
        c_start = get_int(acc.get('contrib_start_age', match.get('contrib_start_age', def_start) if match else def_start))
        c_end_type = acc.get('contrib_end_age_type', match.get('contrib_end_age_type', 'spouse_retirement' if aowner == 'spouse' else 'retirement') if match else ('spouse_retirement' if aowner == 'spouse' else 'retirement'))
        c_end_spec = get_int(acc.get('contrib_end_age_specified', match.get('contrib_end_age_specified', def_ret) if match else def_ret))
        c_inf = get_bool(acc.get('contrib_adjust_inflation', match.get('contrib_adjust_inflation', True) if match else True))
        r_mean = get_float(acc.get('return_mean', match.get('return_mean', 6.0) if match else 6.0))
        r_std = get_float(acc.get('return_std', match.get('return_std', 10.0) if match else 10.0))
        hsa_med = get_bool(acc.get('hsa_for_medical', match.get('hsa_for_medical', True) if match else True))

        acc_id = acc.get('id') or (match.get('id') if match else f"acc_{default_type}_{len(synced_accounts)+1}")

        synced_accounts.append({
            'id': acc_id,
            'name': acc.get('name', f"{aowner.title()} {atype.title()} Account"),
            'institution': acc.get('institution', ''),
            'type': atype,
            'owner': aowner,
            'balance': bal,
            'contrib_amount': c_amt,
            'contrib_freq': c_freq,
            'contrib_start_age': max(min_start_age, c_start),
            'contrib_end_age_type': c_end_type,
            'contrib_end_age_specified': c_end_spec,
            'contrib_adjust_inflation': c_inf,
            'return_mean': r_mean,
            'return_std': r_std,
            'hsa_for_medical': hsa_med,
        })

    # 1. Standard categories
    for cat_key in ['pretax', 'roth', 'taxable', 'hsa', 'emergency', 'daily']:
        cat = categories.get(cat_key, {})
        for acc in cat.get('accounts', []):
            process_account(acc, cat_key if cat_key in ['pretax', 'roth', 'taxable', 'hsa'] else 'taxable')

    # 2. Goal groups
    goals_cat = categories.get('goals', {})
    for g_group in goals_cat.get('goal_groups', []):
        for acc in g_group.get('accounts', []):
            process_account(acc, 'taxable')

    return synced_accounts if synced_accounts else (existing_accounts or [])


def sync_accounts_to_balance_sheet(balance_sheet, accounts, current_year=2026):
    """Synchronize standard account card changes (balance, name, contribs, etc.) into the balance sheet structure."""
    if not isinstance(balance_sheet, dict) or 'categories' not in balance_sheet:
        return build_default_balance_sheet(accounts, current_year=current_year)

    curr_period = balance_sheet.get('current_period')
    periods = balance_sheet.get('periods', [])
    if not curr_period and periods:
        curr_period = periods[-1]
    if not curr_period:
        curr_period = datetime.date.today().isoformat()

    categories = balance_sheet.setdefault('categories', {})
    for cat_key in ['pretax', 'roth', 'taxable', 'hsa']:
        if cat_key not in categories:
            categories[cat_key] = {'title': f"{cat_key.title()} Accounts", 'accounts': []}

    # Index existing balance sheet accounts across categories
    bs_accs_by_id = {}
    bs_accs_by_name = {}
    for cat_key, cat_data in categories.items():
        if isinstance(cat_data, dict) and 'accounts' in cat_data:
            for b_acc in cat_data.get('accounts', []):
                if isinstance(b_acc, dict):
                    if b_acc.get('id'):
                        bs_accs_by_id[b_acc['id']] = (cat_key, b_acc)
                    if b_acc.get('name'):
                        bs_accs_by_name[b_acc['name']] = (cat_key, b_acc)
        elif cat_key == 'goals' and isinstance(cat_data, dict):
            for g in cat_data.get('goal_groups', []):
                for b_acc in g.get('accounts', []):
                    if isinstance(b_acc, dict):
                        if b_acc.get('id'):
                            bs_accs_by_id[b_acc['id']] = ('goals', b_acc)
                        if b_acc.get('name'):
                            bs_accs_by_name[b_acc['name']] = ('goals', b_acc)

    for acc in (accounts or []):
        atype = acc.get('type', 'pretax')
        cat_key = atype if atype in ['pretax', 'roth', 'taxable', 'hsa'] else 'taxable'
        cat_accs = categories[cat_key].setdefault('accounts', [])

        matched = None
        if acc.get('id') and acc.get('id') in bs_accs_by_id:
            old_cat, matched = bs_accs_by_id[acc.get('id')]
            if old_cat != cat_key and old_cat in categories and 'accounts' in categories[old_cat]:
                if matched in categories[old_cat]['accounts']:
                    categories[old_cat]['accounts'].remove(matched)
                if matched not in cat_accs:
                    cat_accs.append(matched)
        elif acc.get('name') and acc.get('name') in bs_accs_by_name:
            old_cat, matched = bs_accs_by_name[acc.get('name')]
            if old_cat != cat_key and old_cat in categories and 'accounts' in categories[old_cat]:
                if matched in categories[old_cat]['accounts']:
                    categories[old_cat]['accounts'].remove(matched)
                if matched not in cat_accs:
                    cat_accs.append(matched)

        bal = get_float(acc.get('balance', 0.0))
        if matched:
            matched['name'] = acc.get('name', matched.get('name'))
            matched['owner'] = acc.get('owner', matched.get('owner', 'user'))
            matched['type'] = atype
            matched['include_in_retirement'] = True
            matched['contrib_amount'] = get_float(acc.get('contrib_amount', matched.get('contrib_amount', 0.0)))
            matched['return_mean'] = get_float(acc.get('return_mean', matched.get('return_mean', 6.0)))
            matched['return_std'] = get_float(acc.get('return_std', matched.get('return_std', 10.0)))
            if 'values' not in matched or not isinstance(matched['values'], dict):
                matched['values'] = {}
            matched['values'][curr_period] = bal
        else:
            vals = {}
            for p in periods:
                vals[p] = bal
            vals[curr_period] = bal
            cat_accs.append({
                'id': acc.get('id') or f"acc_{cat_key}_{len(cat_accs)+1}",
                'name': acc.get('name', f"{acc.get('owner', 'User').title()} {atype.title()} Account"),
                'institution': acc.get('institution', 'Investment Custodian'),
                'owner': acc.get('owner', 'user'),
                'type': atype,
                'include_in_retirement': True,
                'values': vals,
                'contrib_amount': get_float(acc.get('contrib_amount', 0.0)),
                'return_mean': get_float(acc.get('return_mean', 6.0)),
                'return_std': get_float(acc.get('return_std', 10.0)),
            })

    return balance_sheet

