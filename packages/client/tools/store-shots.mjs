/**
 * Play Store listing art, made out of the game rather than about it.
 *
 * The first pass at store art was generated photography — a warm amber CRT on
 * a cluttered desk, a lone clerk in a symmetric corridor of filing cabinets.
 * It read as AI slop, and the tells were specific: dead-centre one-point
 * perspective, a uniform warm bloom with no ugly light anywhere, props
 * arranged rather than dropped, haze doing the emotional work, and not one
 * banal object — no calendar, no coat on a chair, no bin.
 *
 * The fix is not a better prompt. A store listing's job is to show the thing
 * being installed, and this game's whole aesthetic argument is the screen
 * itself: amber phosphor, IBM Plex Mono, a beige bezel. Art built from that
 * cannot read as generated, because none of it is — it is the product,
 * photographed.
 *
 * Wants the client served and an API running. See docs/store/README.md.
 *
 *   node tools/store-shots.mjs [clientUrl] [apiUrl]
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', '..', 'docs', 'store');
const CLIENT = process.argv[2] ?? 'http://127.0.0.1:4190/';
const API = process.argv[3] ?? 'http://127.0.0.1:8791';

const SCREEN = '#14100c';
const BEZEL = '#d8cdb4';
const AMBER = '#ffb742';
const BODY = '#d98a2b';
const DIM = '#8a5620';

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

/**
 * Play wants 1080x1920 for a phone screenshot, but that is a *pixel* size, not
 * a CSS width — and the client's compact layout is keyed on
 * `max-width: 720px and (orientation: portrait)`.
 *
 * Rendering at a 1080px CSS viewport therefore produced the desktop layout:
 * the beige desk, the bezel, the whole machine. Dropped into the feature
 * graphic's device frame it came out as a bezel inside a bezel, and as a store
 * listing it advertised a screen no phone will ever show.
 *
 * 360 CSS px at 3x is a real phone viewport and lands on 1080x1920 exactly.
 */
const page = await browser.newPage({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
});
await page.goto(CLIENT, { waitUntil: 'networkidle' });
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(2500);

/**
 * Fast-forward so the screenshots show a career rather than an empty log.
 *
 * A store screenshot of hour zero shows three onboarding lines and nothing
 * else, which is an honest picture of a game nobody has played yet and a
 * dishonest picture of the game.
 */
const token = await page.evaluate(() => localStorage.getItem('deepholdings.token'));
for (let i = 0; i < 8; i += 1) {
  await page.evaluate(
    async ([t, api]) => {
      await fetch(`${api}/v1/dev/advance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
        body: JSON.stringify({ hours: 4 }),
      });
    },
    [token, API],
  );
}
await page.reload({ waitUntil: 'networkidle' });
await page.keyboard.press('Enter').catch(() => {});
// Long enough for the teletype reveal to finish; a screenshot of half-typed
// lines looks like a rendering bug rather than an effect.
await page.waitForTimeout(9000);

const shots = [];
async function capture(name) {
  const path = join(OUT, `screenshot-${name}.png`);
  await page.screenshot({ path });
  shots.push(path);
  return path;
}

await capture('1-terminal');

/** The other screens, by tab, skipping any this officer has not unlocked. */
const tabs = await page.locator('[role="tab"]').allTextContents();
for (const [i, label] of tabs.entries()) {
  if (i === 0) continue;
  await page.locator('[role="tab"]').nth(i).click();
  await page.waitForTimeout(1800);
  await capture(`${i + 1}-${label.trim().toLowerCase().replace(/\W+/g, '-')}`);
}

/**
 * Feature graphic, 1024x500.
 *
 * Play crops and overlays this, so the title sits left of centre and the right
 * half stays quiet. Built from the same tokens as the app: no photograph, no
 * device mockup, no drop shadow pretending to be a product shot.
 */
const terminalShot = join(OUT, 'screenshot-1-terminal.png');
const featureHtml = `
<style>
  @font-face {
    font-family:'Plex';
    src:url('file://${join(HERE, '..', '..', '..', 'node_modules', '@fontsource', 'ibm-plex-mono', 'files', 'ibm-plex-mono-latin-600-normal.woff2')}') format('woff2');
    font-weight:600;
  }
  @font-face {
    font-family:'Plex';
    src:url('file://${join(HERE, '..', '..', '..', 'node_modules', '@fontsource', 'ibm-plex-mono', 'files', 'ibm-plex-mono-latin-400-normal.woff2')}') format('woff2');
    font-weight:400;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  #f{width:1024px;height:500px;background:${SCREEN};font-family:'Plex',monospace;
     position:relative;overflow:hidden;display:flex;align-items:center}
  /* The scanline wash the game draws over its own screen. */
  #f::after{content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0 2px,rgba(0,0,0,.22) 2px 4px)}
  .copy{padding-left:58px;width:600px;z-index:2}
  h1{font-size:60px;font-weight:600;color:${AMBER};letter-spacing:1px;line-height:1.04;
     text-shadow:0 0 26px rgba(255,183,66,.4)}
  .rule{width:250px;height:5px;background:${BODY};margin:22px 0 20px}
  p{font-size:20px;font-weight:400;color:${BODY};line-height:1.55}
  .dim{color:${DIM};font-size:17px;margin-top:20px}
  /* The device: the game's own bezel, not a stock phone mockup. */
  .device{position:absolute;right:-38px;top:-46px;width:392px;height:592px;
    background:${BEZEL};border-radius:34px;padding:20px;transform:rotate(6deg);
    box-shadow:-26px 22px 60px rgba(0,0,0,.65);z-index:1}
  .device img{width:100%;height:100%;object-fit:cover;object-position:top center;
    border-radius:16px;display:block}
</style>
<div id="f">
  <div class="copy">
    <h1>DEEP<br>HOLDINGS</h1>
    <div class="rule"></div>
    <p>File the orders. Someone else goes down.</p>
    <div class="dim">An idle dungeon career, administered from a desk.</div>
  </div>
  <div class="device"><img src="file://${terminalShot}"></div>
</div>`;
writeFileSync('/tmp/_feature.html', featureHtml);

const wide = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await wide.goto('file:///tmp/_feature.html');
await wide.waitForTimeout(900);
const featurePath = join(OUT, 'feature-graphic-1024x500.png');
await wide.locator('#f').screenshot({ path: featurePath });
shots.push(featurePath);

await browser.close();
console.log(shots.map((s) => s.replace(OUT, 'docs/store')).join('\n'));
