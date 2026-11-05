import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_THEME, siteThemeCssVariables } from './siteTheme'

describe('site theme surfaces', () => {
  it('uses Eternal White for every surface token', () => {
    expect(DEFAULT_SITE_THEME.palette.surface).toBe('#fcf5de')
    expect(siteThemeCssVariables(DEFAULT_SITE_THEME)['--white']).toBe('#fcf5de')
    expect(siteThemeCssVariables(DEFAULT_SITE_THEME)['--surface']).toBe('#fcf5de')
  })

  it('keeps both CSS aliases in sync for an administrator-selected surface colour', () => {
    const theme = structuredClone(DEFAULT_SITE_THEME)
    theme.palette.surface = '#fefefe'

    const variables = siteThemeCssVariables(theme)
    expect(variables['--white']).toBe('#fefefe')
    expect(variables['--surface']).toBe('#fefefe')
  })
})
