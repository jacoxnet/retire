// The Enter page in a real browser (port of legacy/core/tests_browser.py): the page
// builds from saved data without errors, leaving it saves what the save rules give,
// and every control's edit survives leaving and coming back.
import { type Page } from '@playwright/test';
import { prepareEnterPlan } from '../src/lib/plan/commit';
import { expect, leaveViaManage, openEnter, openTab, richPlan, savedPlan, seed, test } from './helpers';

const TAB_IDS = ['demographics', 'assets', 'spending', 'income', 'balance-sheet', 'rebalance'];

// Controls whose change restructures the page get dedicated tests instead of the sweep.
const SWEEP_SKIP = new Set(['is_married', 'mode_advanced', 'mode_simple']);
// "For Retirement?" on the balance sheet adds or removes account cards, and a cash
// account marked for retirement moves to Taxable on save (sync_accounts_to_balance_sheet).
const SWEEP_SKIP_CLASS = ['acc-type-select', 'acc-owner-select', 'bs-retire-check'];
// Lowering present ages keeps every dependent age (retirement, start ages) valid.
const DECREMENT_FIELDS = new Set(['user_age', 'spouse_age']);

interface Control { i: number; key: string; value: string; visible: boolean }

/** Every user-facing control in the open tab, in document order. */
function snapshot(page: Page, tab: string): Promise<Control[]> {
  return page.$eval(`#${tab}`, (pane) =>
    Array.from(pane.querySelectorAll<HTMLInputElement>('input, select, textarea'))
      .filter((el) => !['hidden', 'button', 'submit'].includes(el.type))
      .map((el, i) => ({
        i,
        key: el.id || el.name || el.className,
        value: el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : String(el.value),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      })));
}

/** Compare formatted numbers ($1,234 / 6.00% / 6) numerically. */
function norm(value: string): number | string {
  const stripped = value.replace(/[$,%\s]/g, '');
  const n = Number(stripped);
  return stripped !== '' && Number.isFinite(n) ? Math.round(n * 100) / 100 : value.trim();
}

/** Give every visible, enabled control in the tab a new valid value. */
async function mutateVisibleControls(page: Page, tab: string): Promise<number> {
  let changed = 0;
  for (const selector of ['select, input[type=checkbox]', 'input:not([type=checkbox]), textarea']) {
    const handles = await page.$$(selector.split(',').map((s) => `#${tab} ${s.trim()}`).join(', '));
    for (const el of handles) {
      if (!(await el.isVisible()) || !(await el.isEnabled())) continue;
      const id = (await el.getAttribute('id')) ?? '';
      const cls = (await el.getAttribute('class')) ?? '';
      const type = ((await el.getAttribute('type')) ?? 'text').toLowerCase();
      if (SWEEP_SKIP.has(id) || SWEEP_SKIP_CLASS.some((c) => cls.includes(c))) continue;
      if (['hidden', 'radio', 'range', 'date', 'file', 'button', 'submit'].includes(type)) continue;
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tag === 'select') {
        const options = await el.evaluate((e: HTMLSelectElement) =>
          Array.from(e.options).filter((o) => !o.disabled && o.style.display !== 'none' && !o.hidden).map((o) => o.value));
        const current = await el.inputValue();
        const other = options.find((o) => o !== current);
        if (other === undefined) continue;
        await el.selectOption(other);
      } else if (type === 'checkbox') {
        await el.click();
      } else {
        const current = await el.inputValue();
        const num = current ? norm(current) : null;
        let next: string;
        if (typeof num === 'number') {
          const step = DECREMENT_FIELDS.has(id) ? -1 : id.includes('age') ? 2 : 1;
          next = Number.isInteger(num) ? String(num + step) : String(num + 0.5);
        } else if (current) {
          next = current + ' X';
        } else {
          continue;
        }
        await el.fill(next);
        await el.dispatchEvent('change');
        await el.evaluate((e: HTMLElement) => e.blur());
      }
      changed++;
    }
  }
  return changed;
}

function compareSnapshots(before: Control[], after: Control[]): string[] {
  const problems: string[] = [];
  if (before.length !== after.length) problems.push(`control count ${before.length} -> ${after.length}`);
  before.forEach((b, i) => {
    const a = after[i];
    if (!a || !b.visible) return; // hidden controls may be normalized on save
    if (b.key !== a.key) problems.push(`#${b.i}: control changed identity ${b.key} -> ${a.key}`);
    else if (norm(b.value) !== norm(a.value)) problems.push(`#${b.i} ${b.key}: ${b.value} -> ${a.value}`);
  });
  return problems;
}

const accountCard = (page: Page, id: string) => page.locator(`#accountsContainer .account-card-col[data-account-id="${id}"]`);

function sheetEntry(plan: any, id: string): [string | null, any] {
  for (const [cat, c] of Object.entries<any>(plan.balance_sheet.categories)) {
    const hit = c && typeof c === 'object' && Array.isArray(c.accounts) ? c.accounts.find((a: any) => a.id === id) : null;
    if (hit) return [cat, hit];
  }
  return [null, null];
}

test.describe('Enter page', () => {
  test('builds every tab from a saved plan', async ({ page }) => {
    const plan = richPlan();
    await seed(page, plan);
    for (const tab of TAB_IDS) await openTab(page, tab);
    await openTab(page, 'assets');
    await expect(page.locator('#accountsContainer .account-card-col')).toHaveCount(plan.accounts!.length);
    await openTab(page, 'income');
    await expect(page.locator('#incomeStreamsContainer .income-stream-card')).toHaveCount(plan.income_sources!.length);
  });

  test('leaving without edits saves exactly what the save rules give', async ({ page }) => {
    const plan = richPlan();
    const expected = structuredClone(plan);
    expect(prepareEnterPlan(expected)).toEqual([]);
    await seed(page, plan);
    await leaveViaManage(page);
    expect(await savedPlan(page)).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  for (const tab of TAB_IDS) {
    test(`edits on the ${tab} tab survive leaving and coming back`, async ({ page }) => {
      await seed(page, richPlan());
      await openTab(page, tab);
      expect(await mutateVisibleControls(page, tab), `no editable controls on ${tab}`).toBeGreaterThan(0);
      const before = await snapshot(page, tab);
      await leaveViaManage(page);
      await openEnter(page);
      await openTab(page, tab);
      expect(compareSnapshots(before, await snapshot(page, tab))).toEqual([]);
    });
  }

  test('the marginal tax rate override persists', async ({ page }) => {
    await seed(page, richPlan());
    await openTab(page, 'balance-sheet');
    const field = page.locator('#bsTaxRateOverrideInput');
    await field.fill('31.5');
    await field.press('Enter'); // commits the cell; it must not submit the page (run the simulation)
    await expect(field).not.toBeFocused();
    expect(new URL(page.url()).pathname).toBe('/');
    await leaveViaManage(page);
    expect((await savedPlan(page)).balance_sheet.marginal_tax_rate_override).toBe(31.5);
    await openEnter(page);
    await openTab(page, 'balance-sheet');
    await expect(page.locator('#bsTaxRateOverrideInput')).toHaveValue('31.5');
  });

  test('a balance-sheet column is added with the date picker', async ({ page }) => {
    const plan = richPlan();
    await seed(page, plan);
    await openTab(page, 'balance-sheet');
    const existing = plan.balance_sheet!.periods as string[];
    await page.click('#btnAddPeriodSnapshot');
    await expect(page.locator('#addPeriodModal')).toBeVisible();
    await expect(page.locator('#addPeriodDate')).toHaveAttribute('type', 'date');
    // A duplicate date is rejected inline and the modal stays open.
    await page.fill('#addPeriodDate', existing.at(-1)!);
    await page.click('#addPeriodModal .btn-primary');
    await expect(page.locator('#addPeriodError')).toContainText('already exists');
    await expect(page.locator('#addPeriodModal')).toBeVisible();
    await page.fill('#addPeriodDate', '2099-06-30');
    await page.press('#addPeriodDate', 'Enter');
    await expect(page.locator('#addPeriodModal')).toBeHidden();
    await leaveViaManage(page);
    expect((await savedPlan(page)).balance_sheet.periods).toEqual([...existing, '2099-06-30'].sort());
  });

  test('"For Retirement?" on the balance sheet adds and removes account cards', async ({ page }) => {
    const plan = richPlan();
    await seed(page, plan);
    await openTab(page, 'balance-sheet');
    // The row whose account-name field shows `name` (a property, not an attribute).
    const retireCheck = async (name: string) => {
      const i = await page.$$eval('#balanceSheetTable tr', (trs, n) =>
        trs.findIndex((tr) => tr.querySelector<HTMLInputElement>('.bs-acc-name-input')?.value === n), name);
      expect(i, name).toBeGreaterThanOrEqual(0);
      return page.locator('#balanceSheetTable tr').nth(i).locator('.bs-retire-check');
    };
    await (await retireCheck('High-Yield Cash Emergency Reserve')).check();
    await (await retireCheck('Joint Taxable Brokerage')).uncheck();
    await leaveViaManage(page);
    const saved = await savedPlan(page);
    const names = saved.accounts.map((a: any) => a.name);
    expect(names).toContain('High-Yield Cash Emergency Reserve');
    expect(names).not.toContain('Joint Taxable Brokerage');
    expect(saved.accounts.find((a: any) => a.name === 'High-Yield Cash Emergency Reserve').type).toBe('taxable');
    // Cash marked for retirement is filed under Taxable from then on.
    expect(saved.balance_sheet.categories.taxable.accounts.map((a: any) => a.name)).toContain('High-Yield Cash Emergency Reserve');
    expect(saved.balance_sheet.categories.emergency.accounts).toEqual([]);
    await openEnter(page);
    await openTab(page, 'assets');
    await expect(page.locator('#accountsContainer .account-card-col')).toHaveCount(plan.accounts!.length);
  });

  test('unmarrying does not drop an account end age', async ({ page }) => {
    const plan = richPlan();
    for (const acc of plan.accounts!) acc.owner = 'user';
    plan.accounts![0].contrib_end_age_type = 'first_death';
    await seed(page, plan);
    await page.uncheck('#is_married');
    await leaveViaManage(page);
    const ends = (await savedPlan(page)).accounts.map((a: any) => a.contrib_end_age_type);
    expect(ends).toHaveLength(plan.accounts!.length);
    expect(ends).not.toContain('first_death');
  });

  test('married users are not offered single filing', async ({ page }) => {
    const plan = richPlan();
    plan.filing_status = 'single'; // e.g. an older saved plan
    await seed(page, plan);
    const state = () => page.$eval('#filing_status', (sel: HTMLSelectElement) => {
      const single = sel.querySelector<HTMLOptionElement>('option[value="single"]');
      return { value: sel.value, singleOffered: !!single && !single.disabled && !single.hidden };
    });
    expect(await state()).toEqual({ value: 'joint', singleOffered: false });
    await page.uncheck('#is_married');
    expect(await state()).toEqual({ value: 'single', singleOffered: true });
    await page.check('#is_married');
    expect((await state()).value).toBe('joint');
    await leaveViaManage(page);
    expect((await savedPlan(page)).filing_status).toBe('joint');
  });

  for (const [id, newType] of [['acc_g_401k', 'roth'], ['acc_joint_taxable', 'pretax'], ['acc_g_roth', 'taxable']] as const) {
    test(`changing ${id} to ${newType} moves it everywhere`, async ({ page }) => {
      const plan = richPlan();
      const original = plan.accounts!.find((a) => a.id === id)!;
      await seed(page, plan);
      await openTab(page, 'assets');
      await accountCard(page, id).locator('.acc-type-select').selectOption(newType);
      await leaveViaManage(page);
      const saved = await savedPlan(page);
      const acc = saved.accounts.find((a: any) => a.id === id);
      expect(acc.type).toBe(newType);
      expect([acc.balance, acc.contrib_amount, acc.return_mean]).toEqual([original.balance, original.contrib_amount, original.return_mean]);
      expect(sheetEntry(saved, id)[0], 'balance sheet category').toBe(newType);
      expect(saved[`${newType}_assets`].accounts.map((a: any) => a.id), 'simulation totals').toContain(id);
      await openEnter(page);
      await openTab(page, 'assets');
      await expect(accountCard(page, id).locator('.acc-type-select')).toHaveValue(newType);
    });
  }

  test("changing an account's owner to the spouse", async ({ page }) => {
    const plan = richPlan();
    await seed(page, plan);
    await openTab(page, 'assets');
    const card = accountCard(page, 'acc_g_401k');
    await card.locator('.acc-owner-select').selectOption('spouse');
    await leaveViaManage(page);
    const saved = await savedPlan(page);
    const acc = saved.accounts.find((a: any) => a.id === 'acc_g_401k');
    expect([acc.owner, acc.contrib_end_age_type]).toEqual(['spouse', 'spouse_retirement']);
    expect(acc.contrib_start_age).toBeGreaterThanOrEqual(plan.spouse_age as number); // raised to the owner's present age
    expect(sheetEntry(saved, 'acc_g_401k')[1].owner).toBe('spouse');
    expect(saved.spouse_pretax_assets.accounts.map((a: any) => a.id)).toContain('acc_g_401k');
    expect((saved.pretax_assets.accounts ?? []).map((a: any) => a.id)).not.toContain('acc_g_401k');
    await openEnter(page);
    await openTab(page, 'assets');
    await expect(accountCard(page, 'acc_g_401k').locator('.acc-owner-select')).toHaveValue('spouse');
  });

  test('toggling married off and on before saving keeps the spouse data', async ({ page }) => {
    const plan = richPlan();
    await seed(page, plan);
    await page.uncheck('#is_married');
    await page.check('#is_married');
    await leaveViaManage(page);
    const saved = await savedPlan(page);
    for (const key of ['is_married', 'spouse_name', 'spouse_age', 'spouse_retirement_age', 'spouse_age_death', 'survivor_spending', 'begin_spending_age_type']) {
      expect(saved[key], key).toEqual((plan as any)[key]);
    }
    expect(saved.accounts.map((a: any) => [a.id, a.owner])).toEqual(plan.accounts!.map((a) => [a.id, a.owner]));
    expect(saved.income_sources.map((i: any) => [i.start_age_type, i.end_age_type]))
      .toEqual(plan.income_sources!.map((i: any) => [i.start_age_type, i.end_age_type]));
  });
});
