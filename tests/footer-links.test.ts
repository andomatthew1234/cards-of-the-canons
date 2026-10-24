import { describe, expect, it } from 'vitest'
import { getVisibleFooterGroups, shouldRenderFooterLink } from '../src/components/Layout'

describe('public footer link visibility', () => {
  it.each(['', '#', '/', '/home', 'http://instagram.com/doxa', 'https://instagram.com/', 'https://example.com/doxa', 'https://x.com/coming-soon'])(
    'hides an unfinished social destination: %s',
    (path) => {
      expect(shouldRenderFooterLink({ id: 'instagram', label: 'Instagram', path, visible: true })).toBe(false)
    },
  )

  it('keeps published social profiles and legitimate internal footer links', () => {
    expect(shouldRenderFooterLink({ id: 'youtube', label: 'YouTube', path: 'https://youtube.com/@doxatreasury', visible: true })).toBe(true)
    expect(shouldRenderFooterLink({ id: 'account', label: 'Account', path: '/account', visible: true })).toBe(true)
  })

  it('removes a footer group when all of its links are placeholders', () => {
    expect(getVisibleFooterGroups([{
      id: 'social',
      heading: 'Follow',
      links: [{ id: 'instagram', label: 'Instagram', path: '#', visible: true }],
    }], false)).toEqual([])
  })
})
