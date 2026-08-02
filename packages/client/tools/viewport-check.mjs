/**
 * Does the layout work at the three sizes it has to work at?
 *
 * There was no check like this, and a mobile layout fault shipped and had to be
 * reported from a phone: at 360 CSS px the tab strip needed 499px, had 220, and
 * left four of the six screens behind a horizontal swipe with no affordance.
 * Nothing in the test suite could have caught it — the client tests are pure
 * logic, and a CSS media query has no unit under test.
 *
 * So this drives a real browser at real phone dimensions and asserts the things
 * that were wrong: every screen reachable without a gesture, nothing overflowing
 * sideways, every touch target big enough where the pointer is coarse, and no
 * page errors on any screen.
 *
 * `hasTouch` matters more than it looks. Without it `@media (pointer: coarse)`
 * does not apply, so the tab heights measured are not the heights a phone
 * renders and the 44px assertion passes against the wrong numbers.
 *
 * Wants the client served and an API running with DEV_TOOLS:
 *
 *   npm run viewports -w @deepholdings/client [clientUrl] [apiUrl]
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const CLIENT = process.argv[2] ?? 'http://127.0.0.1:4190/';
const API = process.argv[3] ?? 'http://127.0.0.1:8791';

const CANDIDATES = [
  process.env.CHROMIUM,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chromium. Set CHROMIUM.');
  process.exit(2);
}

const VIEWPORTS = [
  {
    name: 'portrait 390x844',
    opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    // The command line is not rendered in compact portrait: everything it does
    // has a touch equivalent, and as a corner button it read as the primary
    // action of every screen. See Console.
    commandBar: false,
    coarse: true,
  },
  {
    name: 'landscape 844x390',
    opts: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    commandBar: true,
    coarse: true,
  },
  {
    name: 'desktop 1200x900',
    opts: { viewport: { width: 1200, height: 900 } },
    commandBar: true,
    coarse: false,
  },
];

const browser = await chromium.launch({ executablePath });
const failures = [];

for (const { name, opts, commandBar, coarse } of VIEWPORTS) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(CLIENT, { waitUntil: 'networkidle' });
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(2000);

  // Clearance is earned, so a fresh account has two tabs and would not exercise
  // the case that broke. Fast-forward until all six are granted.
  const token = await page.evaluate(() => localStorage.getItem('deepholdings.token'));
  for (let i = 0; i < 16; i += 1) {
    await page.evaluate(
      async ([t, api]) => {
        await fetch(`${api}/v1/dev/advance`, {
          method: 'POST',
          headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
          body: JSON.stringify({ hours: 2 }),
        });
      },
      [token, API],
    );
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(5000);
  // A funeral overlay is modal and eats every click behind it.
  const dialog = page.locator('[role="dialog"] button').first();
  if (await dialog.count()) await dialog.click().catch(() => {});
  await page.waitForTimeout(500);

  const fail = (message) => failures.push(`${name}: ${message}`);

  const bars = await page.locator('input[aria-label="Command"]').count();
  if ((bars > 0) !== commandBar) {
    fail(`command bar ${bars > 0 ? 'present' : 'absent'}, expected the opposite`);
  }

  const tabs = await page.locator('[role="tab"]').count();
  const reachable = await page.evaluate(() => {
    const list = document.querySelector('[role="tablist"]');
    if (!list) return 0;
    const bounds = list.getBoundingClientRect();
    return [...document.querySelectorAll('[role="tab"]')].filter((tab) => {
      const box = tab.getBoundingClientRect();
      return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
    }).length;
  });
  if (reachable !== tabs) fail(`${reachable} of ${tabs} tabs reachable without scrolling`);

  for (let i = 0; i < tabs; i += 1) {
    const label = (await page.locator('[role="tab"]').nth(i).textContent())?.trim();
    await page.locator('[role="tab"]').nth(i).click();
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 0) fail(`${label} overflows horizontally by ${overflow}px`);
  }

  if (coarse) {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"], button')]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.height < 44;
        })
        .map((el) => el.textContent?.trim().slice(0, 24) || el.getAttribute('aria-label')),
    );
    if (small.length > 0) fail(`${small.length} touch targets under 44px: ${small.join(', ')}`);
  }

  if (errors.length > 0) fail(`${errors.length} page errors: ${errors[0]}`);
  console.log(`${name.padEnd(18)} ${tabs} tabs, command bar ${bars > 0 ? 'on' : 'off'}`);
  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nAll three viewports clean.');
