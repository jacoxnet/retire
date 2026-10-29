// Per-account ledger for inherited IRAs. Each inherited account keeps its own balance and
// distribution schedule (computeInheritedFractions), so accounts inherited from different
// decedents, or under different rules, close on their own deadlines. The engine still
// taxes and withdraws by bucket; withdrawals beyond the required amounts are shared pro
// rata within a bucket.

/** Bucket codes: the order of the inherited buckets throughout the engine. */
export const INH_PRE_USER = 0;
export const INH_PRE_SPOUSE = 1;
export const INH_ROTH_USER = 2;
export const INH_ROTH_SPOUSE = 3;

/** Every inherited account in a plan, fixed for the plan. */
export interface InheritedAccounts {
  /** Bucket code of each account. */
  bucket: Float64Array;
  /** Starting balance of each account. */
  balance: Float64Array;
  /** accounts x years, row-major: required fraction of the prior year-end balance (>= 1 closes the account). */
  frac: Float64Array;
}

/** One path's working state over an InheritedAccounts. */
export interface InheritedLedger {
  acc: InheritedAccounts;
  years: number;
  bucket: Float64Array;
  bal: Float64Array;
  mid: Float64Array;
  req: Float64Array;
}

export function inheritedLedger(acc: InheritedAccounts, years: number): InheritedLedger {
  const n = acc.bucket.length;
  return {
    acc, years, bucket: Float64Array.from(acc.bucket), bal: Float64Array.from(acc.balance),
    mid: new Float64Array(n), req: new Float64Array(n),
  };
}

/** Back to the plan's starting balances and owners, for the next path. */
export function resetLedger(l: InheritedLedger): void {
  l.bucket.set(l.acc.bucket);
  l.bal.set(l.acc.balance);
}

/** Sum of balances per bucket into `out` (length 4). */
export function ledgerTotals(l: InheritedLedger, out: Float64Array): Float64Array {
  out.fill(0.0);
  for (let i = 0; i < l.bal.length; i++) out[l.bucket[i]] += l.bal[i];
  return out;
}

/**
 * After the first death the survivor becomes successor beneficiary of the deceased
 * spouse's inherited accounts. Each account keeps its own schedule, which already
 * applies the successor deadline.
 */
export function ledgerTransfer(l: InheritedLedger, userAlive: boolean, spouseAlive: boolean): void {
  if (userAlive === spouseAlive) return;
  for (let i = 0; i < l.bucket.length; i++) {
    const b = l.bucket[i];
    if (userAlive && b === INH_PRE_SPOUSE) l.bucket[i] = INH_PRE_USER;
    else if (userAlive && b === INH_ROTH_SPOUSE) l.bucket[i] = INH_ROTH_USER;
    else if (spouseAlive && b === INH_PRE_USER) l.bucket[i] = INH_PRE_SPOUSE;
    else if (spouseAlive && b === INH_ROTH_USER) l.bucket[i] = INH_ROTH_SPOUSE;
  }
}

/**
 * Year t's required distribution per bucket into `out` (length 4), given each bucket's
 * return in `ret` (length 4). An account in its closing year distributes its whole
 * balance including that year's growth.
 */
export function ledgerRequired(
  l: InheritedLedger, t: number, ret: ArrayLike<number>, userAlive: boolean, spouseAlive: boolean, out: Float64Array,
): Float64Array {
  out.fill(0.0);
  const { bal, bucket, mid, req } = l;
  for (let i = 0; i < bal.length; i++) {
    const b = bucket[i];
    const prior = Math.max(0.0, bal[i]);
    mid[i] = prior + prior * ret[b];
    const alive = b === INH_PRE_USER || b === INH_ROTH_USER ? userAlive : spouseAlive;
    const f = l.acc.frac[i * l.years + t];
    req[i] = !alive || prior <= 0.0 || f <= 0.0 ? 0.0 : f >= 1.0 ? mid[i] : Math.min(prior * f, mid[i]);
    out[b] += req[i];
  }
  return out;
}

/** Split each bucket's ending balance (`end`, length 4) back over its accounts after year t. */
export function ledgerSettle(l: InheritedLedger, end: ArrayLike<number>): void {
  const { bal, bucket, mid, req } = l;
  const post = [0.0, 0.0, 0.0, 0.0];
  for (let i = 0; i < bal.length; i++) post[bucket[i]] += mid[i] - req[i];
  for (let i = 0; i < bal.length; i++) {
    const b = bucket[i];
    bal[i] = post[b] > 0.0 ? (mid[i] - req[i]) * (end[b] / post[b]) : 0.0;
  }
}
