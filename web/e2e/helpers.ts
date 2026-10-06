// Shared setup for the browser smoke tests: plans seeded straight into localStorage
// (as the Manage page's import leaves them), the saved plan read back, and a guard
// against JavaScript errors.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test as base } from '@playwright/test';
import { importPlanData } from '../src/lib/plan/importPlan';
import type { Plan } from '../src/lib/plan/types';

// PlanStore's storage keys (store.svelte.ts uses runes, so it isn't imported here).
const PLAN_KEY = 'retire.plan.v1';
const RESULTS_KEY = 'retire.results.v1';

export const SAVED_DIR = join(import.meta.dirname, '..', 'fixtures', 'saved-plans');

/** A saved plan file after the Manage page's import (today's date, as in the browser). */
export function importedPlan(file: string, edit?: (plan: any) => void): Plan {
  const plan = JSON.parse(readFileSync(join(SAVED_DIR, file), 'utf8'));
  edit?.(plan);
  const errors = importPlanData(plan);
  expect(errors, `import errors for ${file}`).toEqual([]);
  return plan;
}

/**
 * The browser tests' plan (core/tests_navigation.py _rich_plan): sept23 with
 * non-default values and mixed booleans across rows, and a second income stream.
 */
export function richPlan(): Plan {
  return importedPlan('sept23.json', (data) => {
    Object.assign(data, {
      adjust_spending_inflation: false, state_ss_exempt: false, state_tax_rate: 4.25, inflation_rate: 3.1,
      survivor_spending: 77000.0, user_life_insurance_amount: 250000.0, user_life_insurance_type: 'term',
      user_life_insurance_term_age: 72, spouse_life_insurance_amount: 150000.0, spouse_life_insurance_type: 'permanent',
      runs: 100,
    });
    Object.assign(data.social_security, {
      user_receiving: false, user_future_entitled: true, user_entitled: true, user_amount: 2345.0, user_freq: 'monthly', user_start_age: 68,
      spouse_receiving: false, spouse_future_entitled: true, spouse_entitled: true, spouse_amount: 1234.0, spouse_freq: 'monthly', spouse_start_age: 66,
    });
    data.accounts.forEach((acc: any, i: number) => {
      acc.contrib_adjust_inflation = i % 2 === 0;
      if (acc.type === 'hsa') acc.hsa_for_medical = false;
      acc.is_community_property = acc.type === 'taxable';
    });
    // The account cards' edits are mirrored into the balance sheet, as the page does.
    const byId = new Map(data.accounts.map((a: any) => [a.id, a]));
    const cats = data.balance_sheet.categories;
    const sheetAccounts = [
      ...Object.values(cats).flatMap((c: any) => (c && typeof c === 'object' && Array.isArray(c.accounts) ? c.accounts : [])),
      ...(cats.goals?.goal_groups ?? []).flatMap((g: any) => g.accounts ?? []),
    ];
    for (const b of sheetAccounts) {
      const src: any = byId.get(b.id);
      if (src) for (const k of ['contrib_adjust_inflation', 'hsa_for_medical', 'is_community_property']) if (k in src) b[k] = src[k];
    }
    data.additional_spending.forEach((item: any, i: number) => (item.adjust_inflation = i % 2 === 1));
    const base = data.income_sources[0];
    base.adjust_type = base.adjustments[0].adjust_type;
    base.adjust_val = base.adjustments[0].adjust_val;
    const second = structuredClone(base);
    Object.assign(second, {
      name: 'Annuity', amount: 750.0, subject_to_tax: false, has_survivor_benefit: true, survivor_benefit_pct: 60.0,
      is_social_security: false, adjust_type: 'none', adjust_val: 0.0,
      adjustments: [{ start_type: 'current_age', start_spec: 65, end_type: 'death', end_spec: 90, adjust_type: 'none', adjust_val: 0.0 }],
    });
    data.income_sources.push(second);
  });
}

/** Put a plan in the browser's storage (no cached results) and open the Enter page. */
export async function seed(page: Page, plan: Plan): Promise<void> {
  await page.goto('/manage/');
  await page.evaluate(([key, resultsKey, value]) => {
    localStorage.setItem(key, value);
    localStorage.removeItem(resultsKey);
  }, [PLAN_KEY, RESULTS_KEY, JSON.stringify({ plan, dataVersion: 1 })] as const);
  await openEnter(page);
}

export async function openEnter(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#enterDataForm');
}

export async function openTab(page: Page, tab: string): Promise<void> {
  await page.click(`#${tab}-tab`);
  await page.waitForSelector(`#${tab}.tab-pane.active`);
}

/** Leave the Enter page the way a user does (the Save/Load nav link), which saves the plan. */
export async function leaveViaManage(page: Page): Promise<void> {
  await page.click('#manageDataNav');
  await page.waitForURL('**/manage/');
}

export async function savedPlan(page: Page): Promise<any> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).plan, PLAN_KEY);
}

/** A test whose page fails on any uncaught exception or console error. */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`Uncaught: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
    });
    await use(errors);
    expect(errors, 'JavaScript errors').toEqual([]);
  }, { auto: true }],
});
export { expect };
