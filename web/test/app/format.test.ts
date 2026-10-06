import { describe, expect, it } from 'vitest';
import { tabBadges } from '../../src/lib/app/badges';
import { formatBadgeMoney, formatMoney, formatPercent, parseNumberText } from '../../src/lib/app/format';
import { getDefaultData } from '../../src/lib/plan/defaults';

describe('input formatting', () => {
  it('parses typed amounts', () => {
    expect(parseNumberText('$1,234.50')).toBe(1234.5);
    expect(parseNumberText('3.5%')).toBe(3.5);
    expect(parseNumberText('-12')).toBe(-12);
    expect(parseNumberText('')).toBeNull();
    expect(parseNumberText('$')).toBeNull();
    expect(parseNumberText('abc')).toBeNull();
  });

  it('formats money like enter.js', () => {
    expect(formatMoney(1234567.6)).toBe('1,234,568');
    expect(formatMoney(1234567.6, true)).toBe('$1,234,568');
    expect(formatMoney(-2500, true)).toBe('-$2,500');
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(null)).toBe('');
  });

  it('formats percentages', () => {
    expect(formatPercent(3.5)).toBe('3.5%');
    expect(formatPercent(2.345)).toBe('2.35%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(undefined)).toBe('');
  });

  it('formats badge money', () => {
    expect(formatBadgeMoney(0)).toBe('0');
    expect(formatBadgeMoney(850)).toBe('850');
    expect(formatBadgeMoney(12_400)).toBe('12K');
    expect(formatBadgeMoney(1_000_000)).toBe('1M');
    expect(formatBadgeMoney(1_540_000)).toBe('1.5M');
  });
});

describe('tab badges', () => {
  it('summarizes the plan', () => {
    const plan = getDefaultData('2026-01-15');
    plan.user_age = 55;
    plan.user_retirement_age = 62;
    plan.accounts = [{ balance: 400_000 }, { balance: 100_000 }];
    plan.desired_spending = 80_000;
    plan.social_security = { user_amount: 2500 };
    plan.income_sources = [{ name: 'Pension' }];
    const b = tabBadges(plan);
    expect(b.demographics).toEqual({ text: 'Age 55→62', tone: 'done' });
    expect(b.assets).toEqual({ text: '2 accts • $500K', tone: 'done' });
    expect(b.spending).toEqual({ text: '$80K/yr', tone: 'done' });
    expect(b.income).toEqual({ text: '2 streams', tone: 'done' });
    expect(b['balance-sheet']).toEqual({ text: 'Optional', tone: 'muted' });
  });

  it('flags empty sections', () => {
    const plan = getDefaultData('2026-01-15');
    plan.user_age = undefined;
    plan.accounts = [];
    plan.desired_spending = 0;
    plan.social_security = {};
    plan.income_sources = [];
    const b = tabBadges(plan);
    expect(b.demographics).toBeNull();
    expect(b.assets).toEqual({ text: '0 accounts', tone: 'warn' });
    expect(b.spending).toEqual({ text: 'Baseline', tone: 'muted' });
    expect(b.income).toEqual({ text: 'None', tone: 'muted' });
  });
});
