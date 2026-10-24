import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { siteSettings as defaultSettings } from '../config'
import { getPageContent, getSiteSettings } from '../lib/data'
import { BRAND_NAME, LEGACY_BRAND_NAME, replaceLegacyBrand } from '../lib/brand'
import { normaliseSiteTheme } from '../lib/siteTheme'
import { cloneWebsiteContent, defaultWebsiteContent, type WebsiteContent } from '../cms/websiteContent'
import { getPublishedWebsiteContent } from '../lib/websiteEditor'
import type { PageContent, SiteSettings } from '../types'
import { SiteThemeProvider } from './SiteThemeContext'

export const defaultPageContent: Record<PageContent['page'], PageContent> = {
  home: {
    page: 'home', eyebrow: 'History worth holding', title: 'The Glory of the Church', body: 'Discover the beauty, history and living witness of the Church through stories created to collect, revisit and share.', status: 'published', contentVersion: 2,
    sections: {
      hero: { accent: 'carefully collected.', imageUrl: '/images/history/mount-athos-simonopetra.jpg', imageAlt: 'Simonopetra Monastery rising from the cliffs above the Aegean Sea at Mount Athos', imageCredit: 'Simonopetra, Mount Athos · Angelos @ Ottawa · Public domain', primaryActionLabel: 'Explore the collection', secondaryActionLabel: 'Discover our purpose' },
      values: { firstTitle: 'Rich context', firstBody: 'Designed to encourage learning', secondTitle: 'Collectible format', secondBody: 'Created for thoughtful discovery', thirdTitle: 'Considered detail', thirdBody: 'Made to read, revisit and share', marquee: 'Collectible storytelling · Church history · Thoughtful discovery · Designed to revisit' },
      featured: { eyebrow: 'Featured collection', title: 'Explore the collection', body: 'Discover cards and collections that bring remarkable people, moments and ideas from Church history into view.' },
      story: { eyebrow: 'Our mission', title: 'Sharing the beauty of the Church.', body: 'Doxa exists to make the beauty and history of the Church tangible. Through considered artwork and collectible stories, we hope to help people encounter an inheritance that is alive, luminous and worth sharing.', imageUrl: '/images/history/byzantine-church-interior.jpg', imageAlt: 'Chandelier and apse mosaic inside the Byzantine Church of Panagia Gorgoepikoos in Athens', imageCredit: 'Panagia Gorgoepikoos, Athens · George E. Koronaios · CC BY-SA 4.0 · Cropped for display', actionLabel: 'Discover our purpose' },
    },
  },
  about: { page: 'about', eyebrow: 'Our purpose', title: 'Church history, made to collect and explore.', body: 'Doxa brings stories from Christian and Church history into an approachable, tactile format—created for curious minds, thoughtful conversations and a deeper appreciation of the past.', imageUrl: '/images/history/hosios-loukas.jpg', imageAlt: 'The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia, Greece', status: 'published' },
}

const legacyPageCopy = {
  homeBodies: [
    'A proposed collection of cards designed to make remarkable people, moments and ideas from church history inviting to discover.',
    'A proposed card collection that presents remarkable people, moments and ideas from church history in an inviting, accessible format.',
  ],
  aboutTitles: ['A thoughtful collection, still being shaped.', 'A thoughtful collection, carefully taking shape.'],
  aboutBodies: [
    'Cards of the Canons is the working name for John Chapman’s proposed collectible-card project. The current direction brings stories from Christian and church history into an approachable, tactile format.',
    'Cards of the Canons is the working title for John Chapman’s proposed collectible-card project. It brings stories from Christian and church history into an approachable, tactile format.',
  ],
}

export function normalisePageContent(content: PageContent): PageContent {
  const defaults = defaultPageContent[content.page]
  const branded = {
    ...defaults,
    ...content,
    eyebrow: replaceLegacyBrand(content.eyebrow),
    title: replaceLegacyBrand(content.title),
    body: replaceLegacyBrand(content.body),
  }
  if (content.page === 'home') {
    const withSections: PageContent = { ...branded, contentVersion: 2, sections: {
      ...defaultPageContent.home.sections!,
      ...content.sections,
      hero: { ...defaultPageContent.home.sections!.hero, ...content.sections?.hero },
      values: { ...defaultPageContent.home.sections!.values, ...content.sections?.values },
      featured: { ...defaultPageContent.home.sections!.featured, ...content.sections?.featured },
      story: { ...defaultPageContent.home.sections!.story, ...content.sections?.story },
    } }
    return legacyPageCopy.homeBodies.includes(content.body) ? { ...withSections, body: defaultPageContent.home.body } : withSections
  }
  if (content.page === 'about') {
    return {
      ...branded,
      eyebrow: content.eyebrow === 'Design preview' ? defaultPageContent.about.eyebrow : branded.eyebrow,
      title: legacyPageCopy.aboutTitles.includes(content.title) ? defaultPageContent.about.title : branded.title,
      body: legacyPageCopy.aboutBodies.includes(content.body) ? defaultPageContent.about.body : branded.body,
    }
  }
  return branded
}

export function normaliseSiteSettings(settings: SiteSettings): SiteSettings {
  const legacyAnnouncements = [
    'Design preview — sample products, imagery and prices are shown for review.',
    'Design preview — sample products, imagery and pricing are presented for review.',
  ]
  const businessName = settings.businessName.toLowerCase() === LEGACY_BRAND_NAME.toLowerCase() ? BRAND_NAME : replaceLegacyBrand(settings.businessName)
  const theme = normaliseSiteTheme(settings.theme)
  return {
    ...settings,
    businessName,
    contactEmail: settings.contactEmail === 'notifications@doxatreasury.com' ? defaultSettings.contactEmail : settings.contactEmail,
    announcement: legacyAnnouncements.includes(settings.announcement) ? defaultSettings.announcement : replaceLegacyBrand(settings.announcement),
    // Before the theme editor existed, the footer followed Business name.
    // Retain that behaviour until an explicit theme block is saved.
    theme: settings.theme ? theme : { ...theme, footer: { ...theme.footer, brandName: businessName } },
  }
}

function legacyWebsiteContent(settings: SiteSettings, pages: Record<PageContent['page'], PageContent>): WebsiteContent {
  const website = cloneWebsiteContent(defaultWebsiteContent)
  const theme = normaliseSiteTheme(settings.theme)
  website.branding = { ...website.branding, businessName: settings.businessName, headerName: theme.header.brandName, footerName: theme.footer.brandName, publicContactEmail: settings.contactEmail, tagline: theme.footer.description }
  website.header = { ...website.header, announcementText: settings.announcement }
  website.theme = { typography: theme.typography, palette: theme.palette, logo: theme.logo }
  website.navigation.primary = website.navigation.primary.map((link) => ({ ...link, label: theme.header.navigation[link.id as keyof typeof theme.header.navigation] ?? link.label }))
  website.footer.description = theme.footer.description
  website.footer.copyrightText = theme.footer.copyrightText
  website.pages.home = { ...website.pages.home, eyebrow: pages.home.eyebrow, title: pages.home.title, body: pages.home.body, sections: { ...website.pages.home.sections, ...pages.home.sections } }
  website.pages.about = { ...website.pages.about, eyebrow: pages.about.eyebrow, title: pages.about.title, body: pages.about.body, image: pages.about.imageUrl ? { imageUrl:pages.about.imageUrl,imageAlt:pages.about.imageAlt ?? website.pages.about.image!.imageAlt,imageCredit:website.pages.about.image?.imageCredit ?? '' } : website.pages.about.image }
  return website
}

function contentSettings(content: WebsiteContent): SiteSettings {
  const nav = Object.fromEntries(content.navigation.primary.map((item) => [item.id,item.label]))
  const groups = content.footer.groups
  const explore = groups.find((group) => group.id === 'explore') ?? groups[0]
  const account = groups.find((group) => group.id === 'account') ?? groups[1] ?? groups[0]
  const linkLabel = (id: string, fallback: string) => groups.flatMap((group) => group.links).find((link) => link.id === id)?.label ?? fallback
  return {
    businessName:content.branding.businessName,
    contactEmail:content.branding.publicContactEmail,
    announcement:content.header.announcementText,
    currency:'AUD',
    status:'published',
    theme:{
      version:1,
      ...content.theme,
      header:{ brandName:content.branding.headerName,navigation:{home:nav.home ?? 'Home',shop:nav.shop ?? 'Shop',about:nav.about ?? 'About',contact:nav.contact ?? 'Contact'} },
      footer:{ brandName:content.branding.footerName,description:content.footer.description,exploreHeading:explore?.heading ?? 'Explore',accountHeading:account?.heading ?? 'Account',copyrightText:content.footer.copyrightText,navigation:{shop:linkLabel('shop','Browse the collection'),about:linkLabel('about','Our purpose'),contact:linkLabel('contact','Enquiries & quotes'),account:linkLabel('account','Account Centre'),orders:linkLabel('orders','Orders & purchases'),security:linkLabel('security','Security & sign-in'),administrator:linkLabel('administrator','Administrator')} },
    },
  }
}

function contentPages(content: WebsiteContent): Record<PageContent['page'], PageContent> {
  return {
    home:{ page:'home',eyebrow:content.pages.home.eyebrow,title:content.pages.home.title,body:content.pages.home.body,contentVersion:2,sections:content.pages.home.sections,status:'published' },
    about:{ page:'about',eyebrow:content.pages.about.eyebrow,title:content.pages.about.title,body:content.pages.about.body,imageUrl:content.pages.about.image?.imageUrl,imageAlt:content.pages.about.image?.imageAlt,status:'published' },
  }
}

interface SiteContentValue { settings: SiteSettings; pages: Record<PageContent['page'], PageContent>; website: WebsiteContent; ready: boolean }
// Standalone component tests and isolated previews consume the context without
// the async provider, so the context fallback is immediately renderable. The
// real provider below still starts unready and gates public copy until Firebase
// has returned the published document.
const SiteContentContext = createContext<SiteContentValue>({ settings: defaultSettings, pages: defaultPageContent, website:defaultWebsiteContent, ready:true })

/**
 * Supplies an administrator-owned draft to the real storefront components.
 * This provider never reads or publishes data; callers remain responsible for
 * obtaining the draft through the protected editor API.
 */
export function SiteContentPreviewProvider({ content, children }: { content: WebsiteContent; children: ReactNode }) {
  const value = useMemo<SiteContentValue>(() => ({
    settings: contentSettings(content),
    pages: contentPages(content),
    website: content,
    ready: true,
  }), [content])
  return <SiteContentContext.Provider value={value}><SiteThemeProvider theme={value.settings.theme}>{children}</SiteThemeProvider></SiteContentContext.Provider>
}

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SiteContentValue>({ settings: defaultSettings, pages: defaultPageContent, website:defaultWebsiteContent, ready:false })
  useEffect(() => {
    let active = true
    const load = () => void (async () => {
      const published = await getPublishedWebsiteContent().catch(() => null)
      if (!active) return
      if (published) {
        setValue({ settings:contentSettings(published),pages:contentPages(published),website:published,ready:true })
        return
      }
      const [settings, home, about] = await Promise.all([getSiteSettings().catch(() => null), getPageContent('home').catch(() => null), getPageContent('about').catch(() => null)])
      if (!active) return
      const legacySettings = normaliseSiteSettings(settings ?? defaultSettings)
      const legacyPages = { home:normalisePageContent(home ?? defaultPageContent.home),about:normalisePageContent(about ?? defaultPageContent.about) }
      const website = legacyWebsiteContent(legacySettings,legacyPages)
      setValue({ settings:legacySettings,pages:legacyPages,website,ready:true })
    })()
    load()
    window.addEventListener('cards:content-updated', load)
    return () => { active = false; window.removeEventListener('cards:content-updated', load) }
  }, [])
  return <SiteContentContext.Provider value={value}><SiteThemeProvider theme={value.settings.theme}>{children}</SiteThemeProvider></SiteContentContext.Provider>
}

export function useSiteContent() { return useContext(SiteContentContext) }
