import type { CSSProperties } from 'react'
import { BRAND_NAME, HEADER_BRAND_NAME } from './brand'
import type { SiteTheme, SiteThemePalette, SiteTypographyPreset } from '../types'

const HEX_COLOUR = /^#[0-9a-f]{6}$/i
const LOCAL_IMAGE = /^\/images\/[A-Za-z0-9._/-]+$/
const FIREBASE_STORAGE_IMAGE = /^https:\/\/firebasestorage\.googleapis\.com\/[A-Za-z0-9?&=._~%/-]+$/
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g

export const SITE_TYPOGRAPHY: Record<SiteTypographyPreset, { heading: string; body: string; label: string }> = {
  heritage: {
    heading: "'Libre Baskerville', Georgia, serif",
    body: "'DM Sans', Arial, sans-serif",
    label: 'Heritage',
  },
  classical: {
    heading: 'Georgia, Times New Roman, serif',
    body: "'DM Sans', Arial, sans-serif",
    label: 'Classical',
  },
  editorial: {
    heading: "'Libre Baskerville', Georgia, serif",
    body: 'Georgia, Times New Roman, serif',
    label: 'Editorial',
  },
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  version: 1,
  typography: 'heritage',
  palette: {
    ink: '#1c0f0a',
    brown: '#35190f',
    brownAccent: '#70401d',
    gold: '#8f5a0c',
    goldLight: '#d8b04a',
    paper: '#f3e5ca',
    cream: '#dec69a',
    line: '#b58743',
    surface: '#fcf5de',
    muted: '#5f4a3b',
    success: '#36563e',
    danger: '#7c302b',
  },
  logo: {
    mode: 'monogram',
    monogram: 'D',
    imageUrl: '',
    imageAlt: `${BRAND_NAME} logo`,
  },
  header: {
    brandName: HEADER_BRAND_NAME,
    navigation: { home: 'Home', shop: 'Shop', about: 'About', contact: 'Contact' },
  },
  footer: {
    brandName: BRAND_NAME,
    description: 'A considered storefront for collectible stories from Church history.',
    exploreHeading: 'Explore',
    accountHeading: 'Account',
    copyrightText: 'All rights reserved.',
    navigation: {
      shop: 'Browse the collection',
      about: 'Our purpose',
      contact: 'Enquiries & quotes',
      account: 'Account Centre',
      orders: 'Orders & purchases',
      security: 'Security & sign-in',
      administrator: 'Administrator',
    },
  },
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeText(value: unknown, fallback: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(CONTROL_CHARACTERS, '').trim().slice(0, maximum)
  return cleaned || (allowEmpty ? '' : fallback)
}

function safeColour(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOUR.test(value) ? value.toLowerCase() : fallback
}

/** Persisted logo URLs are deliberately limited to first-party images. */
export function isSafeThemeImageUrl(value: unknown): value is string {
  return typeof value === 'string' && (LOCAL_IMAGE.test(value) || FIREBASE_STORAGE_IMAGE.test(value))
}

function normalisePalette(value: unknown): SiteThemePalette {
  const palette = record(value)
  const fallback = DEFAULT_SITE_THEME.palette
  return {
    ink: safeColour(palette.ink, fallback.ink),
    brown: safeColour(palette.brown, fallback.brown),
    brownAccent: safeColour(palette.brownAccent, fallback.brownAccent),
    gold: safeColour(palette.gold, fallback.gold),
    goldLight: safeColour(palette.goldLight, fallback.goldLight),
    paper: safeColour(palette.paper, fallback.paper),
    cream: safeColour(palette.cream, fallback.cream),
    line: safeColour(palette.line, fallback.line),
    surface: safeColour(palette.surface, fallback.surface),
    muted: safeColour(palette.muted, fallback.muted),
    success: safeColour(palette.success, fallback.success),
    danger: safeColour(palette.danger, fallback.danger),
  }
}

/**
 * Treats Firestore as untrusted input. Only named font presets, hex colours,
 * bounded plain text and first-party image URLs reach the rendered theme.
 */
export function normaliseSiteTheme(value: unknown): SiteTheme {
  const theme = record(value)
  const logo = record(theme.logo)
  const header = record(theme.header)
  const headerNavigation = record(header.navigation)
  const footer = record(theme.footer)
  const footerNavigation = record(footer.navigation)
  const typography = typeof theme.typography === 'string' && theme.typography in SITE_TYPOGRAPHY
    ? theme.typography as SiteTypographyPreset
    : DEFAULT_SITE_THEME.typography
  const requestedMode = logo.mode === 'image' || logo.mode === 'text' || logo.mode === 'monogram' ? logo.mode : DEFAULT_SITE_THEME.logo.mode
  const imageUrl = isSafeThemeImageUrl(logo.imageUrl) ? logo.imageUrl : ''

  return {
    version: 1,
    typography,
    palette: normalisePalette(theme.palette),
    logo: {
      mode: requestedMode === 'image' && !imageUrl ? 'monogram' : requestedMode,
      monogram: safeText(logo.monogram, DEFAULT_SITE_THEME.logo.monogram, 3),
      imageUrl,
      imageAlt: safeText(logo.imageAlt, DEFAULT_SITE_THEME.logo.imageAlt, 120),
    },
    header: {
      brandName: safeText(header.brandName, DEFAULT_SITE_THEME.header.brandName, 100),
      navigation: {
        home: safeText(headerNavigation.home, DEFAULT_SITE_THEME.header.navigation.home, 40),
        shop: safeText(headerNavigation.shop, DEFAULT_SITE_THEME.header.navigation.shop, 40),
        about: safeText(headerNavigation.about, DEFAULT_SITE_THEME.header.navigation.about, 40),
        contact: safeText(headerNavigation.contact, DEFAULT_SITE_THEME.header.navigation.contact, 40),
      },
    },
    footer: {
      brandName: safeText(footer.brandName, DEFAULT_SITE_THEME.footer.brandName, 100),
      description: safeText(footer.description, DEFAULT_SITE_THEME.footer.description, 320),
      exploreHeading: safeText(footer.exploreHeading, DEFAULT_SITE_THEME.footer.exploreHeading, 60),
      accountHeading: safeText(footer.accountHeading, DEFAULT_SITE_THEME.footer.accountHeading, 60),
      copyrightText: safeText(footer.copyrightText, DEFAULT_SITE_THEME.footer.copyrightText, 160),
      navigation: {
        shop: safeText(footerNavigation.shop, DEFAULT_SITE_THEME.footer.navigation.shop, 60),
        about: safeText(footerNavigation.about, DEFAULT_SITE_THEME.footer.navigation.about, 60),
        contact: safeText(footerNavigation.contact, DEFAULT_SITE_THEME.footer.navigation.contact, 60),
        account: safeText(footerNavigation.account, DEFAULT_SITE_THEME.footer.navigation.account, 60),
        orders: safeText(footerNavigation.orders, DEFAULT_SITE_THEME.footer.navigation.orders, 60),
        security: safeText(footerNavigation.security, DEFAULT_SITE_THEME.footer.navigation.security, 60),
        administrator: safeText(footerNavigation.administrator, DEFAULT_SITE_THEME.footer.navigation.administrator, 60),
      },
    },
  }
}

export type SiteThemeCssProperties = CSSProperties & Record<`--${string}`, string>

export function siteThemeCssVariables(themeValue: unknown): SiteThemeCssProperties {
  const theme = normaliseSiteTheme(themeValue)
  const fonts = SITE_TYPOGRAPHY[theme.typography]
  return {
    '--ink': theme.palette.ink,
    '--brown': theme.palette.brown,
    '--brown-2': theme.palette.brownAccent,
    '--gold': theme.palette.gold,
    '--gold-light': theme.palette.goldLight,
    '--paper': theme.palette.paper,
    '--cream': theme.palette.cream,
    '--line': theme.palette.line,
    '--white': theme.palette.surface,
    '--surface': theme.palette.surface,
    '--muted': theme.palette.muted,
    '--green': theme.palette.success,
    '--danger': theme.palette.danger,
    '--serif': fonts.heading,
    '--sans': fonts.body,
  }
}
