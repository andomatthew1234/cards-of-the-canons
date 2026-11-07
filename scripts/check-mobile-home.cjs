// Browser regression check. Set PLAYWRIGHT_MODULE_PATH when Playwright is not
// installed locally; SITE_URL defaults to the local production preview.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const width of [320, 390, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })
      await page.goto(process.env.SITE_URL || 'http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' })
      await page.locator('.home-community-chapter').waitFor()
      const layout = await page.evaluate(() => {
        const chapters = [...document.querySelectorAll('.home-editorial-chapter')]
        const sections = [...document.querySelector('.home-shell .page-transition').children]
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          gaps: sections.slice(1).map((section, index) => section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom),
          hiddenPanels: chapters.flatMap(chapter => [...chapter.children])
            .filter(panel => getComputedStyle(panel).opacity !== '1' || getComputedStyle(panel).transform !== 'none')
            .map(panel => panel.className),
        }
      })
      assert.equal(layout.overflow, false, `${width}px: horizontal overflow`)
      assert.ok(layout.gaps.every(gap => gap <= 0.1), `${width}px: gaps between sections ${layout.gaps}`)
      assert.deepEqual(layout.hiddenPanels, [], `${width}px: blank or offset mobile panels while scrolling`)
      console.log(`PASS ${width}px: contiguous sections, immediately visible panels, no horizontal overflow`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
