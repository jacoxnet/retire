// Lenient form-value helpers from core/forms.py (get_float / get_int / get_bool):
// never throw, fall back to a default. Strings may carry "$", "%" and "," as typed.
import { pyFloat } from '../engine/py';

function toNumber(val: unknown): number | null {
  try {
    const v = typeof val === 'string' ? val.replace(/[$%,]/g, '').trim() : val;
    return pyFloat(v);
  } catch {
    return null;
  }
}

/** get_float: a finite number, else `dflt`. */
export function getFloat<D = number>(val: unknown, dflt: D = 0.0 as D): number | D {
  const n = toNumber(val);
  return n !== null && Number.isFinite(n) ? n : dflt;
}

/** get_int: int(float(val)), else `dflt` (non-finite values included). */
export function getInt<D = number>(val: unknown, dflt: D = 0 as D): number | D {
  const n = toNumber(val);
  return n !== null && Number.isFinite(n) ? Math.trunc(n) : dflt;
}

/** get_bool: true only for 'on', 'true', 'True' or true (and 1, which Python treats as equal to True). */
export function getBool(val: unknown): boolean {
  return val === true || val === 1 || val === 'on' || val === 'true' || val === 'True';
}

/** Python str() of a JSON value, as used in messages and str-kind coercion. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  return String(v);
}
