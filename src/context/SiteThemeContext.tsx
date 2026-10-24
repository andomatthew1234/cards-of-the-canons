import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DEFAULT_SITE_THEME, normaliseSiteTheme } from '../lib/siteTheme'
import type { SiteTheme } from '../types'

const SiteThemeContext = createContext<SiteTheme>(DEFAULT_SITE_THEME)

export function SiteThemeProvider({ theme, children }: { theme?: SiteTheme; children: ReactNode }) {
  const value = useMemo(() => normaliseSiteTheme(theme), [theme])
  return <SiteThemeContext.Provider value={value}>{children}</SiteThemeContext.Provider>
}

export function useSiteTheme() {
  return useContext(SiteThemeContext)
}
