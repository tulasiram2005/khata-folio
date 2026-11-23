import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
const origin = process.env.TEST_URL || 'http://127.0.0.1:4173';
const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync(mac) ? mac : '/usr/bin/google-chrome'),
  headless: true,
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Journal entries' }).waitFor({ timeout: 90000 });
  const report = async (name) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(
      r.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
      [],
      name,
    );
  };
  await report('Journal');
  await page.getByLabel('Describe a transaction').fill('Ravi ne 500 udhaar liya');
  await page.getByRole('button', { name: 'Read phrase' }).click();
  await page.getByRole('button', { name: 'Confirm and post' }).click();
  await page.getByText('Entry posted to both accounts.').waitFor();
  await page.getByRole('button', { name: 'Statements', exact: true }).click();
  await page.getByRole('button', { name: 'Create customer link' }).click();
  const href = await page.getByRole('link', { name: 'Open Ravi’s statement' }).getAttribute('href');
  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(href);
  g.on('dialog', (d) => d.accept('Synthetic test dispute'));
  await g.getByRole('button', { name: 'Dispute', exact: true }).first().click();
  await g.getByText('Response recorded.').waitFor();
  await guest.close();
  await report('Statement');
  await page.getByRole('button', { name: 'Reconciliation', exact: true }).click();
  await page.getByRole('button', { name: 'Compare receipts' }).click();
  await page.getByText(/100\/100/).waitFor();
  await report('Reconciliation');
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByRole('heading', { name: 'Trial balance' }).waitFor();
  await report('Reports');
  await page.getByRole('button', { name: 'Day book', exact: true }).click();
  mkdirSync('test-results', { recursive: true });
  for (const width of [360, 768, 1280, 1920])
    for (const colorScheme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'horizontal overflow at ' + width,
      );
      await page.screenshot({ path: 'test-results/book-' + width + '-' + colorScheme + '.png' });
    }
  assert.deepEqual(errors, []);
  console.log(
    'Passed proposal, posting, guest dispute, CSV matching and reports; four axe scans and eight journal viewports/themes.',
  );
} finally {
  await browser.close();
}
