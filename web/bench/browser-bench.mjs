// Runs bench/index.html in headless Chromium against the Vite dev server and writes
// bench/results-browser.json.  Usage: node bench/browser-bench.mjs [chromiumPath]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const executablePath = process.argv[2] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname, server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e));
  await page.goto('http://localhost:5199/bench/index.html');
  await page.waitForFunction(() => window.__bench !== undefined, null, { timeout: 900_000 });
  const rows = await page.evaluate(() => window.__bench);
  writeFileSync(new URL('./results-browser.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await browser.close();
  await server.close();
}
