/**
 * What a new player actually sees — captured so a human can read it cold.
 *
 * The whole legibility problem was invisible from inside the code. Every test
 * passed, every checkbox in `ROADMAP.md` was ticked, and the product was
 * unreadable; the defect only surfaced when somebody opened the app and could
 * not tell what anything meant. Nothing I can assert replaces that, so this
 * produces the artefact that lets it happen again on purpose: every screen, at
 * the two moments that matter, as an image.
 *
 * **Hour zero is the one that counts.** Two tabs, no history, no unlocks — the
 * first thirty minutes is where this genre loses the players it loses, and the
 * store screenshots deliberately show a played career instead, so nobody had
 * ever looked at a fresh account rendered.
 *
 * Wants the client served and an API running with DEV_TOOLS:
 *
 *   node tools/cold-read.mjs <outDir> [clientUrl] [apiUrl]
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const CLIENT = process.argv[3] ?? 'http://127.0.0.1:4190/';
const API = process.argv[4] ?? 'http://127.0.0.1:8791';
if (!OUT) {
  console.error('usage: node tools/cold-read.mjs <outDir> [clientUrl] [apiUrl]');
  process.exit(2);
}

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

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath });

// A real phone viewport, and `hasTouch` so `@media (pointer: coarse)` applies —
// without it the layout measured is not the layout a phone renders.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});

const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));

await page.goto(CLIENT, { waitUntil: 'networkidle' });
// Skip the BIOS crawl; it is 12 lines at 260ms and not what is under review.
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(3000);

async function shot(name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  console.log(path);
}

/**
 * Clear the death overlay if one is up, photographing it on the way past.
 *
 * A week of play kills several recruits, and the overlay is modal — it
 * intercepts every click, so without this the run times out trying to reach a
 * tab underneath it. That is not a harness quirk: it is the actual first thing
 * a returning player has to deal with, and worth a picture of its own.
 */
async function clearDeath(prefix) {
  const overlay = page.locator('[aria-label="Character deceased"]');
  let seen = false;
  for (let i = 0; i < 8; i += 1) {
    if ((await overlay.count()) === 0) break;
    if (!seen) {
      await shot(`${prefix}-death`);
      seen = true;
    }
    await page.locator('[aria-label="Character deceased"] button').first().click();
    await page.waitForTimeout(1500);
  }
}

/** Every tab this officer is cleared for, in order. */
async function captureScreens(prefix) {
  await clearDeath(prefix);
  const tabs = await page.locator('[role="tab"]').allTextContents();
  for (const [i, label] of tabs.entries()) {
    await page.locator('[role="tab"]').nth(i).click();
    await page.waitForTimeout(1500);
    await shot(`${prefix}-${i + 1}-${label.trim().toLowerCase().replace(/\W+/g, '-')}`);
  }
  return tabs;
}

console.log('--- hour zero: what a stranger opens ---');
await captureScreens('day0');

// The help panel, which is the answer to "what on earth is a Commendation".
await page.locator('button[aria-label="What things mean"]').click();
await page.waitForTimeout(600);
await shot('day0-help');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('--- after a week ---');
const token = await page.evaluate(() => localStorage.getItem('deepholdings.token'));
for (let i = 0; i < 12; i += 1) {
  await page.evaluate(
    async ([t, api]) => {
      await fetch(`${api}/v1/dev/advance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
        body: JSON.stringify({ hours: 12 }),
      });
    },
    [token, API],
  );
}
await page.reload({ waitUntil: 'networkidle' });
await page.keyboard.press('Enter').catch(() => {});
// The teletype cascade is capped at 2.4s; a half-typed line photographs as a
// rendering fault rather than as an effect.
await page.waitForTimeout(9000);

const tabs = await captureScreens('day7');

// The Ledger's sections are the thing that was six columns at once. Each is a
// separate view now, so each needs looking at separately.
const ledgerAt = tabs.findIndex((label) => /ledger/i.test(label));
if (ledgerAt >= 0) {
  await page.locator('[role="tab"]').nth(ledgerAt).click();
  await page.waitForTimeout(1200);
  const sections = await page.locator('[aria-label="Ledger sections"] [role="tab"]').allTextContents();
  for (const [i, label] of sections.entries()) {
    await page.locator('[aria-label="Ledger sections"] [role="tab"]').nth(i).click();
    await page.waitForTimeout(1200);
    await shot(`day7-ledger-${label.trim().toLowerCase()}`);
  }
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} page error(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('\nNo page errors.');
