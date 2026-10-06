// Charts register here so the Results page can render them to images before printing
// (results.js prepareForPrint): a canvas inside a hidden tab doesn't print reliably.
import { getContext, setContext } from 'svelte';

export interface PrintableChart {
  /** Resize to the now-visible container, redraw without animation, and refresh the print image. */
  prepare(): void;
  /** Resize after the page returns to normal. */
  restore(): void;
}

const KEY = Symbol('print-charts');

export function providePrintRegistry(): Set<PrintableChart> {
  const set = new Set<PrintableChart>();
  setContext(KEY, set);
  return set;
}

export const printRegistry = (): Set<PrintableChart> | undefined => getContext(KEY);
