/* Browser regression check: PLAYWRIGHT_MODULE_PATH may point to an existing
   Playwright installation. SITE_URL defaults to the local Vite preview. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const siteUrl = process.env.SITE_URL || 'http://127.0.0.1:4175/';

async function sampleTurn(page, expectedFace) {
  const frames = await page.evaluate(async () => {
    const samples = [];
    const start = performance.now();
    document.querySelector('.home-history-flip').click();
    await new Promise(resolve => {
      const sample = () => {
        const inner = document.querySelector('.home-history-flip-inner');
        const matrix = new DOMMatrix(getComputedStyle(inner).transform);
        const faces = [...inner.querySelectorAll('.home-history-face')]
          .filter(e => getComputedStyle(e).display !== 'none');
        samples.push({ cos: matrix.m11, faces: faces.map(e => e.className), phase: inner.className });
        if (performance.now() - start < 1200) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return samples;
  });
  assert.ok(frames.length >= 5, `Insufficient animation samples: ${frames.length}`);
  assert.equal(frames.filter(frame => frame.cos < -0.001).length, 0, 'Artwork must never rotate into a mirrored orientation');
  assert.ok(frames.every(frame => frame.faces.length === 1), 'Exactly one card face must be rendered in every frame');
  assert.ok(frames.at(-1).faces[0].includes(expectedFace), `Turn should finish on ${expectedFace}`);
  assert.equal(frames.at(-1).phase, 'home-history-flip-inner', 'Turn must settle instead of getting stuck edge-on');
  return frames.length;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { name: 'mobile', width: 390, height: 844, mobile: true, reduced: false },
      { name: 'desktop', width: 1280, height: 900, mobile: false, reduced: false },
      { name: 'reduced motion', width: 390, height: 844, mobile: true, reduced: true },
    ]) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        isMobile: scenario.mobile,
        hasTouch: scenario.mobile,
        reducedMotion: scenario.reduced ? 'reduce' : 'no-preference',
      });
      try {
        const page = await context.newPage();
        await page.goto(siteUrl, { waitUntil: 'commit', timeout: 90000 });
        const card = page.locator('.home-history-flip');
        await card.waitFor({ timeout: 90000 });
        await card.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.home-history-flip').getAttribute('aria-busy') === 'false');
        await page.waitForTimeout(800);
        const forwardFrames = await sampleTurn(page, 'home-history-back');
        const reverseFrames = await sampleTurn(page, 'home-history-front');
        // Several taps during the outgoing half must not interrupt the current turn.
        await page.evaluate(() => {
          const card = document.querySelector('.home-history-flip');
          card.click(); card.click(); card.click();
        });
        await page.waitForTimeout(1200);
        assert.equal(await card.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.home-history-front').isVisible(), false);
        assert.equal(await page.locator('.home-history-back').isVisible(), true);
        console.log(`${scenario.name}: both directions passed (${forwardFrames + reverseFrames} frames); repeated taps settle correctly`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
