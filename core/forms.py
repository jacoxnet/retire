import json

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
        a_type = acc_types[i] if i < len(acc_types) else 'pretax'
        a_owner = acc_owners[i] if (i < len(acc_owners) and is_married) else 'user'
        a_name = acc_names[i].strip() if i < len(acc_names) and acc_names[i] else f"{a_owner.title()} {a_type.title()} Account"
        def_start = spouse_age if (a_owner == 'spouse' and is_married) else user_age
        def_ret = spouse_retirement_age if (a_owner == 'spouse' and is_married) else user_retirement_age

        accounts.append({
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
    for acc in accounts:
        a_name = acc.get('name', 'Account')
        if acc.get('balance', 0.0) < 0:
            errors.append(f"Account '{a_name}' Present Balance cannot be negative.")
        if acc.get('contrib_amount', 0.0) < 0:
            errors.append(f"Account '{a_name}' Future Contribution Amount cannot be negative.")
        a_owner = acc.get('owner', 'user')
        rel_age = spouse_age if (a_owner == 'spouse' and is_married) else user_age
        rel_death = spouse_age_death if (a_owner == 'spouse' and is_married) else user_age_death
        c_start = acc.get('contrib_start_age', rel_age)
        if c_start < rel_age or c_start > rel_death:
            errors.append(f"Account '{a_name}' Contribution Start Age ({c_start}) must be between Present Age ({rel_age}) and Age at Death ({rel_death}).")
        if acc.get('contrib_end_age_type') == 'age':
            c_end = acc.get('contrib_end_age_specified', rel_age)
            if c_end < c_start or c_end > 120:
                errors.append(f"Account '{a_name}' Specified Contribution End Age ({c_end}) must be greater than or equal to Contribution Start Age ({c_start}) up to 120.")
    return errors


def validate_additional_spending(items, user_age, user_age_death):
    errors = []
    for item in items:
        name = item.get('name')
        if item.get('amount', 0.0) < 0:
            errors.append(f"Additional Spending item '{name}' Amount cannot be negative.")
        s_start = item.get('start_age', user_age)
        if s_start < user_age or s_start > user_age_death:
            errors.append(f"Additional Spending item '{name}' Start Age ({s_start}) cannot be younger than Your Present Age ({user_age}) or after Age at Death ({user_age_death}).")
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
        if item.get('start_age_type') == 'specified':
            s_spec = item.get('start_age_specified', 65)
            if s_spec < 18 or s_spec > 120:
                errors.append(f"{label} '{name}' Specified Start Age must be between 18 and 120.")
        if item.get('frequency') not in ['one_time', 'one-time'] and item.get('end_age_type') == 'specified':
            min_end = item.get('start_age_specified', 18) if item.get('start_age_type') == 'specified' else 18
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
                if p.get('start_type') == 'specified':
                    ps = p.get('start_spec', 65)
                    if ps < 18 or ps > 120:
                        errors.append(f"{label} '{name}' Adjustment Period {idx} Start Age must be between 18 and 120.")
                if p.get('end_type') == 'specified':
                    pe = p.get('end_spec', 90)
                    if pe < 18 or pe > 120:
                        errors.append(f"{label} '{name}' Adjustment Period {idx} End Age must be between 18 and 120.")
        else:
            if item.get('adjust_type') in ['fixed_pct', 'inflation_less_pct']:
                a_val = item.get('adjust_val', 0.0)
                if a_val < 0.0 or a_val > 100.0:
                    errors.append(f"{label} '{name}' Percentage Rate must be between 0% and 100%.")
            if item.get('adjust_type') != 'none' and item.get('adjust_start_age_type') == 'specified':
                a_start = item.get('adjust_start_age_specified', 65)
                if a_start < 18 or a_start > 120:
                    errors.append(f"{label} '{name}' Adjustment Start Age must be between 18 and 120.")
    return errors
