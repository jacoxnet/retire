// Spouse-based choices (an age type such as "spouse_retirement", or "spouse" as the
// person a spending item's age refers to) only make sense for a married couple.
// Unticking Married moves each one to its single-person equivalent; ticking it
// again restores the original unless the user has since picked something else
// (enter.js syncSpouseChoice). The set-aside values live here, not in the plan.

const setAside = new WeakMap<object, Map<string, { married: string; single: string }>>();

export const isSpouseChoice = (value: unknown): boolean => String(value ?? '').includes('spouse');

/** Apply the marital status to `obj[key]`; returns true if the value changed. */
export function syncSpouseChoice(obj: Record<string, any>, key: string, married: boolean, singleValue: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const value = obj[key];
  let memo = setAside.get(obj);
  if (!married && isSpouseChoice(value)) {
    if (!memo) setAside.set(obj, (memo = new Map()));
    memo.set(key, { married: String(value), single: singleValue });
    obj[key] = singleValue;
    return true;
  }
  const saved = memo?.get(key);
  if (married && saved) {
    memo!.delete(key);
    if (value === saved.single) {
      obj[key] = saved.married;
      return true;
    }
  }
  return false;
}

/** The value a single person's form would submit for a spouse-based choice. */
export const singleChoice = (value: string, married: boolean, singleValue: string): string =>
  !married && isSpouseChoice(value) ? singleValue : value;
