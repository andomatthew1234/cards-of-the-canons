import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Layout, SiteBrand } from '../src/components/Layout'
import { SiteThemeProvider, useSiteTheme } from '../src/context/SiteThemeContext'
import { DEFAULT_SITE_THEME, normaliseSiteTheme, siteThemeCssVariables } from '../src/lib/siteTheme'

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../src/context/CartContext', () => ({ useCart: () => ({ count: 2 }) }))
vi.mock('../src/context/SiteContentContext', () => ({ useSiteContent: () => ({ settings: { announcement: 'A quiet announcement.' } }) }))

function ThemeProbe() {
  const theme = useSiteTheme()
  return <output data-testid="theme" data-type={theme.typography} data-colour={theme.palette.gold}>{theme.header.navigation.shop}</output>
}

describe('public site theme', () => {
  it('hydrates old or partial settings with backwards-compatible defaults', () => {
    const theme = normaliseSiteTheme(undefined)
    expect(theme).toEqual(DEFAULT_SITE_THEME)

    const partial = normaliseSiteTheme({ header: { navigation: { shop: 'The collection' } } })
    expect(partial.header.navigation.shop).toBe('The collection')
    expect(partial.header.navigation.home).toBe('Home')
    expect(partial.footer.description).toBe(DEFAULT_SITE_THEME.footer.description)
    expect(partial.version).toBe(1)
  })

  it('allows curated fonts, strict colours and first-party logo images', () => {
    const theme = normaliseSiteTheme({
      typography: 'classical',
      palette: { gold: '#C09030', paper: '#F4EBDD' },
      logo: { mode: 'image', imageUrl: '/images/brand/doxa.svg', imageAlt: 'Doxa treasury' },
    })
    expect(theme.typography).toBe('classical')
    expect(theme.palette.gold).toBe('#c09030')
    expect(theme.palette.paper).toBe('#f4ebdd')
    expect(theme.logo).toMatchObject({ mode: 'image', imageUrl: '/images/brand/doxa.svg', imageAlt: 'Doxa treasury' })
    expect(siteThemeCssVariables(theme)['--serif']).toContain('Georgia')
  })

  it('rejects arbitrary CSS, unsupported fonts and unsafe logo URLs', () => {
    const theme = normaliseSiteTheme({
      typography: 'url(https://example.test/font.woff)',
      palette: { ink: 'red; background:url(javascript:alert(1))', gold: '#12345g' },
      logo: { mode: 'image', imageUrl: 'javascript:alert(1)', imageAlt: '<script>alert(1)</script>' },
      header: { brandName: 'Doxa\u0000 Cards' },
    })
    expect(theme.typography).toBe(DEFAULT_SITE_THEME.typography)
    expect(theme.palette.ink).toBe(DEFAULT_SITE_THEME.palette.ink)
    expect(theme.palette.gold).toBe(DEFAULT_SITE_THEME.palette.gold)
    expect(theme.logo.mode).toBe('monogram')
    expect(theme.logo.imageUrl).toBe('')
    expect(theme.header.brandName).toBe('Doxa Cards')
  })

  it('provides a normalised theme to descendants', () => {
    render(<SiteThemeProvider theme={normaliseSiteTheme({ typography: 'editorial', palette: { gold: '#b08020' }, header: { navigation: { shop: 'Archive' } } })}><ThemeProbe /></SiteThemeProvider>)
    expect(screen.getByTestId('theme')).toHaveAttribute('data-type', 'editorial')
    expect(screen.getByTestId('theme')).toHaveAttribute('data-colour', '#b08020')
    expect(screen.getByText('Archive')).toBeInTheDocument()
  })

  it('renders accessible image, monogram and text brand modes', () => {
    const imageTheme = normaliseSiteTheme({ logo: { mode: 'image', imageUrl: '/images/brand/doxa.svg', imageAlt: 'Doxa logo' } })
    const view = render(<SiteBrand theme={imageTheme} placement="header" />)
    expect(screen.getByRole('img', { name: 'Doxa logo' })).toHaveAttribute('src', '/images/brand/doxa.svg')

    view.rerender(<SiteBrand theme={normaliseSiteTheme({ logo: { mode: 'text' }, header: { brandName: 'Doxa Cards' } })} placement="header" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Doxa Cards')).toBeInTheDocument()
  })

  it('applies customised navigation, footer copy and palette to the public layout', () => {
    const theme = normaliseSiteTheme({
      typography: 'classical',
      palette: { paper: '#f0e5d1', gold: '#a07020' },
      header: { brandName: 'Doxa Archive', navigation: { home: 'Welcome', shop: 'Collection', about: 'Our story', contact: 'Write to us' } },
      footer: {
        brandName: 'Doxa Archive',
        description: 'Stories worth keeping.',
        exploreHeading: 'Discover',
        accountHeading: 'Your account',
        copyrightText: 'Rights reserved.',
        navigation: { shop: 'All pieces' },
      },
    })
    render(<MemoryRouter><SiteThemeProvider theme={theme}><Layout><p>Page content</p></Layout></SiteThemeProvider></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Doxa Archive home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeInTheDocument()
    expect(screen.getByText('Stories worth keeping.')).toBeInTheDocument()
    const shell = screen.getByText('Page content').closest('.site-shell')
    expect(shell).toHaveStyle({ '--paper': '#f0e5d1', '--gold': '#a07020' })
    expect(shell).toHaveAttribute('data-theme-typography', 'classical')
  })
})
