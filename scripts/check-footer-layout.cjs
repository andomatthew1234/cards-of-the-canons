// Set PLAYWRIGHT_MODULE_PATH if Playwright is installed outside this project.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(process.env.SITE_URL || 'http://127.0.0.1:4175/', { waitUntil: 'domcontentloaded' })
    await page.locator('.editorial-footer').waitFor()
    for (const width of [320, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const result = await page.locator('.editorial-footer').evaluate(footer => {
        const selectors = ['.footer-introduction', '.footer-navigation', '.footer-social-links', '.footer-legal-links']
        if (innerWidth > 900) selectors.push('.footer-contact')
        const tops = selectors.map(selector => footer.querySelector(selector)).filter(Boolean)
          .map(element => element.getBoundingClientRect().top)
        return { tops, overflow: footer.scrollWidth > footer.clientWidth }
      })
      assert.ok(result.tops.length >= 3, 'Footer brand, navigation and legal groups must exist')
      assert.ok(Math.max(...result.tops) - Math.min(...result.tops) < 2, `${width}px: footer columns start on different rows`)
      assert.equal(result.overflow, false, `${width}px: footer overflows horizontally`)
      console.log(`PASS ${width}px: footer brand and columns align without overflow`)
    }
  } finally { await browser.close() }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
