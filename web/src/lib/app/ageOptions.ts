// Option labels for the age-type selects, as updateSpouseDropdownOptions writes
// them (names and ages filled in; spouse choices only for a married couple).
import type { People } from '../plan/accountCard';

export interface AgeOption {
  value: string;
  label: string;
}

export type AgeOptionKind = 'beginSpending' | 'start' | 'end' | 'periodStart' | 'periodEnd' | 'taxAdjustStart';

export function ageOptions(kind: AgeOptionKind, p: People): AgeOption[] {
  const you = p.isMarried ? `${p.userName}'s ` : 'Your ';
  const sp = `${p.spouseName}'s `;
  const all: Record<string, { label: string; spouse?: boolean }> = {
    retirement: { label: `${you}Retirement Age (${p.userRetAge})` },
    spouse_retirement: { label: `${sp}Retirement Age (${p.spouseRetAge})`, spouse: true },
    user_specified: { label: p.isMarried ? `Specify ${p.userName}'s Age` : 'Specify Your Age' },
    spouse_specified: { label: `Specify ${sp}Age`, spouse: true },
    death: { label: p.isMarried ? `At ${p.userName}'s Death (${p.userDeathAge})` : `At Your Death (${p.userDeathAge})` },
    spouse_death: { label: `At ${sp}Death (${p.spouseDeathAge})`, spouse: true },
    current_age: { label: `At Current Age (${p.userAge})` },
    start: { label: kind === 'taxAdjustStart' ? 'When Tax Starts' : 'When Income Starts' },
  };
  const order: Record<AgeOptionKind, string[]> = {
    beginSpending: ['retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'],
    start: ['retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'],
    end: ['death', 'spouse_death', 'user_specified', 'spouse_specified'],
    periodStart: ['current_age', 'start', 'retirement', 'spouse_retirement', 'user_specified', 'spouse_specified'],
    periodEnd: ['retirement', 'spouse_retirement', 'start', 'death', 'spouse_death', 'user_specified', 'spouse_specified'],
    taxAdjustStart: ['start', 'retirement', 'spouse_retirement', 'current_age', 'user_specified', 'spouse_specified'],
  };
  return order[kind]
    .filter((v) => p.isMarried || !all[v].spouse)
    .map((v) => ({ value: v, label: all[v].label }));
}
