import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getVisibleFooterGroups, isSocialFooterLink, shouldRenderFooterLink } from '../src/components/Layout'

describe('public footer link visibility', () => {
  it('keeps the registered business identity in the public footer', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(layout).toContain('ABN 57 919 748 380 NSW, Australia')
    expect(layout).toContain('className="footer-abn"')
  })

  it('keeps Socials, Legal and Contact in one responsive three-column row', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    const styles = readFileSync('src/styles.css', 'utf8')
    const supportColumns = layout.slice(layout.indexOf('className="footer-support-columns"'))

    expect(supportColumns.indexOf('footer-social-links')).toBeLessThan(supportColumns.indexOf('footer-legal-links'))
    expect(supportColumns.indexOf('footer-legal-links')).toBeLessThan(supportColumns.indexOf('className="footer-contact"'))
    expect(styles).toMatch(/\.footer-support-columns\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s)
    expect(styles).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.footer-support-columns\s*\{[^}]*grid-template-columns:\s*1fr/s)
  })
  it.each(['', '#', '/', '/home', 'http://instagram.com/doxa', 'https://instagram.com/', 'https://example.com/doxa', 'https://x.com/coming-soon'])(
    'hides an unfinished social destination: %s',
    (path) => {
      expect(shouldRenderFooterLink({ id: 'instagram', label: 'Instagram', path, visible: true })).toBe(false)
    },
  )

  it('keeps published social profiles and legitimate internal footer links', () => {
    expect(shouldRenderFooterLink({ id: 'youtube', label: 'YouTube', path: 'https://youtube.com/@doxatreasury', visible: true })).toBe(true)
    expect(shouldRenderFooterLink({ id: 'instagram', label: 'Instagram', path: 'https://instagram.com/doxatreasury', visible: false })).toBe(false)
    expect(shouldRenderFooterLink({ id: 'account', label: 'Account', path: '/account', visible: true })).toBe(true)
  })

  it('removes a footer group when all of its links are placeholders', () => {
    expect(getVisibleFooterGroups([{
      id: 'social',
      heading: 'Follow',
      links: [{ id: 'instagram', label: 'Instagram', path: '#', visible: true }],
    }], false)).toEqual([])
  })

  it('recognises legacy social labels so dedicated settings can replace them without duplicates', () => {
    expect(isSocialFooterLink({ id: 'spare-link', label: 'Instagram' })).toBe(true)
    expect(isSocialFooterLink({ id: 'journal', label: 'Our Journal' })).toBe(false)
  })
})
