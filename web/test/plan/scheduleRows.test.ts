import { describe, expect, it } from 'vitest';
import { getDefaultData } from '../../src/lib/plan/defaults';
import {
  applyMarriageToSchedules, CHOICES, commitSchedules, editableSchedule, incomeSchedule, incomeView, newIncomeSource,
  newOtherTax, newPeriod, newSpendingItem, otherTaxView, pick, rowNameErrors, showsSurvivor, spendingItemView, ssView,
} from '../../src/lib/plan/scheduleRows';
import type { IncomeSource, Plan } from '../../src/lib/plan/types';

const plan = (o: Partial<Plan> = {}): Plan => Object.assign(getDefaultData('2026-01-15'), o);

describe('select coercion', () => {
  it('maps legacy values and unknown values like a select does', () => {
    expect(pick('specified', CHOICES.start)).toBe('user_specified');
    expect(pick('one-time', CHOICES.incomeFrequency)).toBe('one_time');
    expect(pick('bogus', CHOICES.periodEnd)).toBe('retirement');
    expect(pick(undefined, CHOICES.ssFrequency)).toBe('monthly');
    expect(pick('specified', CHOICES.taxAdjustStart)).toBe('user_specified');
  });
});

describe('row views', () => {
  it('fills spending item defaults', () => {
    expect(spendingItemView({})).toEqual({ name: '', amount: 0, start_age: 65, start_age_type: 'user', interval: 0, adjust_inflation: true });
    expect(spendingItemView({ adjust_inflation: false, start_age_type: 'spouse' })).toMatchObject({ adjust_inflation: false, start_age_type: 'spouse' });
    expect(newSpendingItem()).toEqual(spendingItemView({}));
  });

  it('builds income schedules', () => {
    expect(incomeSchedule({ adjustments: [{ start_type: 'start' }] })).toEqual([{ start_type: 'start' }]);
    expect(incomeSchedule({ adjust_type: 'fixed_pct', adjust_val: 2, end_age_type: 'spouse_death' })).toEqual([{
      start_type: 'start', start_spec: 65, end_type: 'spouse_death', end_spec: 90, adjust_type: 'fixed_pct', adjust_val: 2,
    }]);
    expect(incomeView({}).periods).toEqual([{
      start_type: 'current_age', start_spec: 65, end_type: 'retirement', end_spec: 90, adjust_type: 'inflation', adjust_val: 0,
    }]);
    expect(newPeriod(1)).toMatchObject({ start_type: 'retirement', end_type: 'death' });
  });

  it('materializes a schedule before editing it', () => {
    const item: IncomeSource = { adjust_type: 'none', adjust_start_age_type: 'specified', adjust_start_age_specified: 70 };
    const sched = editableSchedule(item);
    expect(item.adjustments).toBe(sched);
    expect(sched[0]).toMatchObject({ start_type: 'user_specified', start_spec: 70, adjust_type: 'none' });
    expect(editableSchedule(item)).toBe(sched);
  });

  it('shows the survivor box only for a married couple and a death end', () => {
    expect(showsSurvivor(incomeView({ end_age_type: 'death' }), true)).toBe(true);
    expect(showsSurvivor(incomeView({ end_age_type: 'spouse_death' }), true)).toBe(true);
    expect(showsSurvivor(incomeView({ end_age_type: 'user_specified' }), true)).toBe(false);
    expect(showsSurvivor(incomeView({ end_age_type: 'death' }), false)).toBe(false);
    expect(incomeView({ has_survivor_benefit: 'true' as unknown as boolean }).has_survivor_benefit).toBe(true);
  });

  it('fills other-tax and Social Security defaults', () => {
    expect(otherTaxView({ adjust_start_age_type: 'specified' })).toMatchObject({
      frequency: 'annual', start_age_type: 'retirement', end_age_type: 'death', adjust_type: 'inflation', adjust_start_age_type: 'user_specified',
    });
    expect(newOtherTax().name).toBe('');
    expect(newIncomeSource()).toMatchObject({ frequency: 'monthly', subject_to_tax: true, survivor_benefit_pct: 100, adjustments: [{ start_type: 'current_age' }] });
    expect(ssView(undefined, 'user')).toEqual({ receiving: false, future_entitled: false, amount: null, freq: 'monthly', start_age: null });
  });
});

describe('Married toggle', () => {
  it('sets spouse choices aside and restores them', () => {
    const p = plan({
      begin_spending_age_type: 'spouse_specified',
      additional_spending: [{ start_age_type: 'spouse' }],
      income_sources: [{ start_age_type: 'spouse_retirement', end_age_type: 'spouse_death',
        adjustments: [{ start_type: 'spouse_retirement', end_type: 'spouse_specified' }] }],
      other_taxes: [{ start_age_type: 'spouse_specified', end_age_type: 'spouse_death', adjust_start_age_type: 'spouse_retirement' }],
    });
    const snapshot = structuredClone(p);
    applyMarriageToSchedules(p, false);
    expect(p.begin_spending_age_type).toBe('retirement');
    expect(p.additional_spending![0].start_age_type).toBe('user');
    expect(p.income_sources![0]).toMatchObject({ start_age_type: 'retirement', end_age_type: 'death' });
    expect(p.income_sources![0].adjustments![0]).toMatchObject({ start_type: 'current_age', end_type: 'death' });
    expect(p.other_taxes![0]).toMatchObject({ start_age_type: 'retirement', end_age_type: 'death', adjust_start_age_type: 'current_age' });
    applyMarriageToSchedules(p, true);
    expect(p).toEqual(snapshot);
  });
});

describe('commitSchedules (forms.py parsers)', () => {
  it('saves rows as the page submits them', () => {
    const p = plan({
      begin_spending_age_type: 'specified',
      begin_spending_age_specified: undefined,
      additional_spending: [{ name: '  Car ', amount: null as unknown as number, interval: undefined, start_age_type: 'spouse' }],
      income_sources: [{
        name: '', frequency: 'one-time', start_age_type: 'specified', end_age_type: 'spouse_death', is_social_security: true,
        survivor_benefit_pct: 140, has_survivor_benefit: 'true' as unknown as boolean, institution: 'x',
        adjustments: [{ start_type: 'specified', start_spec: null as unknown as number, adjust_type: 'fixed_pct', adjust_val: 2.5 }],
      } as IncomeSource],
      other_taxes: [{ frequency: 'one-time', adjust_val: undefined, adjust_start_age_type: 'spouse_specified' }],
    });
    commitSchedules(p, false);
    expect(p.begin_spending_age_type).toBe('user_specified');
    expect(p.begin_spending_age_specified).toBe(65);
    expect(p.additional_spending).toEqual([{ name: 'Car', amount: 0, start_age: 65, start_age_type: 'user', interval: 0, adjust_inflation: true }]);
    expect(p.income_sources![0]).toEqual({
      name: 'Income Source', amount: 0, frequency: 'one_time', start_age_type: 'user_specified', start_age_specified: 65,
      end_age_type: 'death', end_age_specified: 90, subject_to_tax: true, is_social_security: true,
      has_survivor_benefit: true, survivor_benefit_pct: 100, adjust_type: 'fixed_pct', adjust_val: 2.5,
      adjust_start_age_type: 'start', adjust_start_age_specified: 65, institution: 'x',
      adjustments: [{ start_type: 'user_specified', start_spec: 65, end_type: 'retirement', end_spec: 90, adjust_type: 'fixed_pct', adjust_val: 2.5 }],
    });
    expect(p.other_taxes![0]).toMatchObject({
      name: 'Other Tax', frequency: 'one_time', adjust_val: 0, adjust_start_age_type: 'current_age', start_age_type: 'retirement',
    });
  });

  it('saves Social Security as enter_view does', () => {
    const p = plan({ social_security: { user_receiving: true, user_future_entitled: true, user_amount: 2100, user_freq: 'weekly',
      spouse_receiving: false, spouse_future_entitled: true, spouse_start_age: undefined } });
    commitSchedules(p, true);
    expect(p.social_security).toMatchObject({
      user_receiving: true, user_future_entitled: false, user_entitled: true, user_amount: 2100, user_freq: 'monthly', user_start_age: 67,
      spouse_receiving: false, spouse_future_entitled: true, spouse_entitled: true, spouse_amount: 0, spouse_start_age: 67,
    });
    const q = plan({ social_security: undefined });
    commitSchedules(q, false);
    expect(q.social_security).toMatchObject({ user_receiving: false, user_future_entitled: false, user_entitled: false, user_amount: 0 });
  });

  it('requires row names', () => {
    expect(rowNameErrors(plan({
      additional_spending: [{ name: 'ok' }, {}],
      income_sources: [{ name: ' ' }],
      other_taxes: [{}],
    }))).toEqual([
      'Additional Spending item #2 Name is required.',
      'Income Source #1 Name is required.',
      'Other Tax #1 Description is required.',
    ]);
  });
});
