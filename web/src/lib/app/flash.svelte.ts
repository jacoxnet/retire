// One-time messages carried to the next page, like Django's messages framework
// (e.g. "Plan loaded successfully!" shown on the Enter page after an import).
export type FlashLevel = 'success' | 'warning' | 'error' | 'info';

export interface FlashMessage {
  level: FlashLevel;
  text: string;
}

let pending: FlashMessage[] = $state([]);

export function flash(level: FlashLevel, text: string): void {
  pending.push({ level, text });
}

/** The waiting messages, removed from the queue. */
export function takeFlash(): FlashMessage[] {
  const out = [...pending];
  pending = [];
  return out;
}

/** Bootstrap alert class for a level (Django's message tags; error is danger). */
export const alertClass = (level: FlashLevel): string => (level === 'error' ? 'danger' : level);
