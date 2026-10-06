// Small Python-semantics helpers shared by the plan modules.
import { pyBool } from '../engine/py';

export type Obj = Record<string, any>;

/** dict.get(key, default): a key present with null returns null. */
export const get = (o: Obj | null | undefined, k: string, d: any = null): any =>
  o !== null && typeof o === 'object' && k in o && o[k] !== undefined ? o[k] : d;

/** Python `a or b`. */
export const or = <A, B>(a: A, b: B): A | B => (pyBool(a) ? a : b);

export const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** str.title(): capitalize each run of letters, lowercase the rest. */
export const title = (s: string): string => s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

/** Python equality for JSON-like values (dict order ignored), as `in` / `list.remove` use. */
export function pyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return typeof a === 'number' && typeof b === 'boolean' ? a === Number(b)
      : typeof a === 'boolean' && typeof b === 'number' ? Number(a) === b : false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => pyEqual(x, bb[i]));
  }
  const ka = Object.keys(a as Obj).filter((k) => (a as Obj)[k] !== undefined);
  const kb = Object.keys(b as Obj).filter((k) => (b as Obj)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => k in (b as Obj) && pyEqual((a as Obj)[k], (b as Obj)[k]));
}

/** Today's date (local time) as YYYY-MM-DD, like datetime.date.today().isoformat(). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
