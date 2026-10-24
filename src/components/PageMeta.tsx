import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { absoluteUrl, DEFAULT_SOCIAL_IMAGE, isPrivateOrUtilityPath, type JsonLd } from '../lib/seo'
import { useSiteContent } from '../context/SiteContentContext'

type PageMetaProps = {
  title: string
  description: string
  canonicalPath?: string
  image?: string
  type?: 'website' | 'product' | 'article'
  noIndex?: boolean
  jsonLd?: JsonLd | Array<JsonLd | null> | null
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value))
}

export function PageMeta({ title, description, canonicalPath, image = DEFAULT_SOCIAL_IMAGE, type = 'website', noIndex, jsonLd }: PageMetaProps) {
  const { pathname } = useLocation()
  const { settings:siteSettings,website } = useSiteContent()
  useEffect(() => {
    const sensitivePage = isPrivateOrUtilityPath(pathname)
    const notIndexable = sensitivePage || noIndex === true
    const fullTitle = title === website.seo.siteTitle || title === siteSettings.businessName ? title : website.seo.titleTemplate.replace('%s',title)
    const canonical = absoluteUrl(canonicalPath ?? pathname)
    const socialImage = absoluteUrl(image)
    const privateTitle = pathname.startsWith('/admin') ? `Administration — ${siteSettings.businessName}` : `Secure area — ${siteSettings.businessName}`
    document.title = sensitivePage ? privateTitle : fullTitle
    setMeta('meta[name="description"]', { name: 'description', content: sensitivePage ? 'Secure Doxa account area.' : description })
    setMeta('meta[name="robots"]', { name: 'robots', content: notIndexable ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' })
    document.head.querySelectorAll('script[data-page-json-ld]').forEach((node) => node.remove())
    if (sensitivePage) {
      document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach((node) => node.remove())
      document.head.querySelector('link[rel="canonical"]')?.remove()
      return
    }
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: siteSettings.businessName })
    setMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle })
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    setMeta('meta[property="og:type"]', { property: 'og:type', content: type })
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
    setMeta('meta[property="og:image"]', { property: 'og:image', content: socialImage })
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle })
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImage })
    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonicalLink) {
      canonicalLink = document.createElement('link')
      canonicalLink.rel = 'canonical'
      document.head.appendChild(canonicalLink)
    }
    canonicalLink.href = canonical

    const entries = (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean) as JsonLd[]
    if (!notIndexable) entries.forEach((entry) => {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.pageJsonLd = 'true'
      script.text = JSON.stringify(entry).replace(/</g, '\\u003c')
      document.head.appendChild(script)
    })
  }, [canonicalPath, description, image, jsonLd, noIndex, pathname, siteSettings.businessName, title, type, website.seo.siteTitle, website.seo.titleTemplate])
  return null
}
