// Summary badges on the Enter page's section tabs (enter.js updateTabBadges).
import { getFloat, getInt } from '../plan/coerce';
import type { Plan } from '../plan/types';
import { formatBadgeMoney } from './format';

export type TabId = 'demographics' | 'assets' | 'spending' | 'income' | 'balance-sheet' | 'rebalance';

export interface Badge {
  text: string;
  /** done: green check; warn: warning icon; muted: plain grey text. */
  tone: 'done' | 'warn' | 'muted';
}

export function tabBadges(plan: Plan): Record<TabId, Badge | null> {
  const uAge = getInt(plan.user_age, 0);
  const uRet = getInt(plan.user_retirement_age, 0);

  const accounts = Array.isArray(plan.accounts) ? plan.accounts : [];
  const total = accounts.reduce((s, a) => s + getFloat(a?.balance, 0), 0);

  const spend = getFloat(plan.desired_spending, NaN);

  const ssAmount = getFloat(plan.social_security?.user_amount, 0);
  const streams = (ssAmount > 0 ? 1 : 0) + (Array.isArray(plan.income_sources) ? plan.income_sources.length : 0);

  return {
    demographics: uAge > 0 && uRet > 0 ? { text: `Age ${uAge}→${uRet}`, tone: 'done' } : null,
    assets: accounts.length > 0
      ? { text: `${accounts.length} accts • $${formatBadgeMoney(total)}`, tone: 'done' }
      : { text: '0 accounts', tone: 'warn' },
    spending: spend > 0 ? { text: `$${formatBadgeMoney(spend)}/yr`, tone: 'done' } : { text: 'Baseline', tone: 'muted' },
    income: streams > 0 ? { text: `${streams} stream${streams > 1 ? 's' : ''}`, tone: 'done' } : { text: 'None', tone: 'muted' },
    'balance-sheet': { text: 'Optional', tone: 'muted' },
    rebalance: { text: 'Optional', tone: 'muted' },
  };
}
