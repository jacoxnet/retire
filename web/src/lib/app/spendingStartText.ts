// The "received after …" phrase in the Other Income Streams intro
// (enter.js updateOtherIncomeSpendingAgeText).
import { type People, personLabels } from '../plan/accountCard';
import type { Plan } from '../plan/types';

export function spendingStartText(plan: Plan, p: People = personLabels(plan)): string {
  const type = plan.begin_spending_age_type ?? 'retirement';
  const named = (name: string, anon: string) => p.isMarried && name && name !== anon;
  const userRef = named(p.userName, 'You') ? `${p.userName}'s ` : 'your ';
  const userAgeRef = named(p.userName, 'You') ? `${p.userName}'s age ` : 'your age ';
  const spouseRef = named(p.spouseName, 'Spouse') ? `${p.spouseName}'s ` : "your spouse's ";
  const spouseAgeRef = named(p.spouseName, 'Spouse') ? `${p.spouseName}'s age ` : "spouse's age ";
  const spec = parseInt(String(plan.begin_spending_age_specified ?? ''), 10);
  const specOk = !Number.isNaN(spec) && spec >= 18 && spec <= 120;

  if (type === 'retirement' || (type === 'spouse_retirement' && !p.isMarried)) {
    return `${userRef}retirement age (${userAgeRef}${p.userRetAge})`;
  }
  if (type === 'spouse_retirement') return `${spouseRef}retirement age (${spouseAgeRef}${p.spouseRetAge})`;
  if ((type === 'user_specified' || type === 'specified') && specOk) return `${userAgeRef}${spec}`;
  if (type === 'spouse_specified' && specOk) return `${spouseAgeRef}${spec}`;
  return 'the Start Age for Retirement Spending';
}
