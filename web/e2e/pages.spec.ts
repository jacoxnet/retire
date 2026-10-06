// One smoke test per page against the production build: navigation and theme, the
// how-to guide, Save/Load/Clear, and the full Enter -> Results flow on the worker pool.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, openEnter, richPlan, SAVED_DIR, savedPlan, seed, test } from './helpers';

test('every page loads, and the theme choice persists across pages', async ({ page }) => {
  for (const path of ['/', '/results/', '/manage/']) {
    await page.goto(path);
    await expect(page.locator('#mainNav')).toBeVisible();
  }
  await page.evaluate(() => localStorage.setItem('retire_theme', 'dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#themeToggleBtn');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/manage/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Bootstrap and Font Awesome are bundled, not fetched from a CDN.
  const styles = await page.evaluate(() => {
    const probe = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'd-none' }));
    const display = getComputedStyle(probe).display;
    probe.remove();
    return { display, icon: getComputedStyle(document.querySelector('#themeToggleIcon')!, '::before').fontFamily };
  });
  expect(styles.display).toBe('none');
  expect(styles.icon).toContain('Font Awesome');
});

test('the how-to guide opens from the footer', async ({ page }) => {
  await page.goto('/');
  await page.click('#howToLink');
  await expect(page.locator('.modal').first()).toContainText('Simulation Results Page');
});

test('simple mode hides the advanced tabs', async ({ page }) => {
  await openEnter(page);
  await page.click('label[for="mode_simple"]');
  await expect(page.locator('#balance-sheet-tab')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#balance-sheet-tab')).toHaveCount(0);
  await page.click('label[for="mode_advanced"]');
  await expect(page.locator('#balance-sheet-tab')).toBeVisible();
});

test('Save / Load / Clear', async ({ page }) => {
  await page.goto('/manage/');
  await page.setInputFiles('#jsonFileInput', join(SAVED_DIR, 'sept27.json'));
  await page.waitForURL((u) => u.pathname === '/');
  await expect(page.locator('.flash-message')).toContainText('Plan loaded successfully!');
  expect((await savedPlan(page)).user_name).toBe('Jack');

  await page.goto('/manage/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save Plan (.json)' }).click()]);
  expect(download.suggestedFilename()).toBe('jack_plan.json');
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported).toEqual(await savedPlan(page));

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Clear Data' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await expect(page.locator('.flash-message')).toContainText('All simulation data has been cleared.');
  expect((await savedPlan(page)).user_name).toBe('John Doe');
});

test('Enter -> Results: runs on the workers, re-runs, and caches', async ({ page }) => {
  await page.goto('/manage/');
  await page.setInputFiles('#jsonFileInput', join(SAVED_DIR, 'sept27.json'));
  await page.waitForURL((u) => u.pathname === '/');
  await page.click('#viewResultsNav');
  await page.waitForURL('**/results/');
  await expect(page.locator('#mcResultsCard')).toBeVisible({ timeout: 60_000 });
  // Python's seeded run of this plan gives 79.96%; 20,000 paths put us within ~1 point.
  const rate = parseFloat((await page.locator('#mcResultsCard .display-5').textContent())!);
  expect(Math.abs(rate - 79.96)).toBeLessThan(1.5);
  await expect(page.locator('#projection tbody tr')).toHaveCount(51);

  await page.click('#charts-tab');
  for (const id of ['spaghettiChartCanvas', 'trajectoryChartCanvas', 'assetBreakdownChartCanvas', 'incomeSpendingChartCanvas', 'taxLiabilityChartCanvas']) {
    await expect.poll(() => page.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().height, id)).toBeGreaterThan(100);
  }

  await page.click('#stress-tab');
  const regular = await page.textContent('#cmpRegularSuccess');
  await page.selectOption('#stressScenarioSelect', '1929_depression');
  await expect(page.locator('#stressScenarioTitle')).toContainText('Great Depression', { timeout: 60_000 });
  expect(await page.textContent('#cmpRegularSuccess')).toBe(regular);

  await page.click('#stats-tab');
  await page.fill('#input_desired_spending', '120000');
  await expect(page.locator('#staleResultsBanner')).toBeVisible();
  await page.click('#btnStaleReRun');
  await expect(page.locator('#validationAlertContainer')).toContainText('Simulation inputs updated and simulation re-run.', { timeout: 60_000 });
  const higher = parseFloat((await page.locator('#mcResultsCard .display-5').textContent())!);
  expect(higher).toBeGreaterThan(rate);
  expect((await savedPlan(page)).desired_spending).toBe(120000);

  // A reload shows the cached results without running again.
  await page.reload();
  await expect(page.locator('#mcResultsCard')).toBeVisible();
  await expect(page.locator('#runProgressCard')).toHaveCount(0);
  await expect(page.locator('#input_desired_spending')).toHaveValue('120000');
});

test('Results lists the errors of an invalid plan instead of running', async ({ page }) => {
  const plan = richPlan();
  plan.user_age = 10;
  await seed(page, plan);
  await page.goto('/results/');
  await expect(page.locator('#resultsPlanErrors')).toContainText('Your Present Age must be an integer between 18 and 120.');
});
