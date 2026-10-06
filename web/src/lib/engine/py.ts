// Python-semantics helpers. The engine reads loosely-typed plan JSON the same way
// core/runs.py does (dict.get with defaults, int()/float()/bool() coercion), so these
// reproduce Python's behaviour, including its exceptions, rather than JS coercion.

export type Dict = Record<string, any>;

/** dict.get(key, dflt): a key that is present (even with null) returns its value. */
export function get(obj: Dict | null | undefined, key: string, dflt: any = null): any {
  if (obj == null || typeof obj !== 'object') throw new TypeError(`'${obj}' object has no attribute 'get'`);
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined ? obj[key] : dflt;
}

/** Python truthiness (bool(x)). */
export function pyBool(x: any): boolean {
  if (x == null) return false;
  if (typeof x === 'number') return x !== 0; // bool(nan) is True, and NaN !== 0
  if (typeof x === 'string') return x.length > 0;
  if (typeof x === 'boolean') return x;
  if (Array.isArray(x)) return x.length > 0;
  if (ArrayBuffer.isView(x)) return (x as unknown as ArrayLike<number>).length > 0;
  if (typeof x === 'object') return Object.keys(x).length > 0;
  return true;
}

/** int(x): truncates numbers, parses integer strings, raises like Python otherwise. */
export function pyInt(x: any): number {
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new RangeError(`cannot convert float ${x} to integer`);
    return Math.trunc(x);
  }
  if (typeof x === 'string') {
    const s = x.trim().replace(/_/g, '');
    if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
    throw new RangeError(`invalid literal for int() with base 10: '${x}'`);
  }
  throw new TypeError(`int() argument must be a string or a number, not '${x === null ? 'NoneType' : typeof x}'`);
}

/** float(x). */
export function pyFloat(x: any): number {
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const s = x.trim().toLowerCase().replace(/_/g, '');
    if (/^[+-]?(inf|infinity)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(s)) return NaN;
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s)) return parseFloat(s);
    throw new RangeError(`could not convert string to float: '${x}'`);
  }
  throw new TypeError(`float() argument must be a string or a real number, not '${x === null ? 'NoneType' : typeof x}'`);
}

/** Python's % (result takes the sign of the divisor). */
export function pyMod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}

/**
 * Python 3 round(x, ndigits). Like toFixed it rounds the exact binary value, but an
 * exact tie goes to the even digit instead of away from zero.
 */
export function pyRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x)) return x;
  const a = Math.abs(x);
  let r = Number(a.toFixed(ndigits));
  const [ip, fp = ''] = a.toFixed(Math.min(100, ndigits + 60)).split('.');
  const keep = fp.slice(0, ndigits);
  if (/^50*$/.test(fp.slice(ndigits))) {
    const last = Number(ndigits > 0 ? keep[ndigits - 1] : ip[ip.length - 1]);
    if (last % 2 === 0) r = Number(ndigits > 0 ? `${ip}.${keep}` : ip);
  }
  return x < 0 ? -r : r;
}
