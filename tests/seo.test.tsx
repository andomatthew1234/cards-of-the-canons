import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PageMeta } from '../src/components/PageMeta'
import { categorySlug, isPrivateOrUtilityPath } from '../src/lib/seo'

afterEach(() => {
  document.head.querySelectorAll('script[data-page-json-ld]').forEach((node) => node.remove())
})

describe('SEO architecture', () => {
  it('normalises durable category slugs and recognises private routes', () => {
    expect(categorySlug('Study Sets & Guides')).toBe('study-sets-and-guides')
    expect(isPrivateOrUtilityPath('/account/security')).toBe(true)
    expect(isPrivateOrUtilityPath('/admin/orders')).toBe(true)
    expect(isPrivateOrUtilityPath('/shop')).toBe(false)
  })

  it('writes complete public metadata and clears stale structured data', async () => {
    const structured = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Doxa' }
    const view = render(<MemoryRouter initialEntries={['/about']}><PageMeta title="About" description="About the collection." jsonLd={structured} /></MemoryRouter>)
    await waitFor(() => expect(document.title).toBe('About — Doxa'))
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', expect.stringMatching(/\/about$/))
    expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute('content', 'About — Doxa')
    expect(document.head.querySelector('script[data-page-json-ld]')).not.toBeNull()
    view.rerender(<MemoryRouter initialEntries={['/about']}><PageMeta title="About" description="Updated public description." /></MemoryRouter>)
    await waitFor(() => expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Updated public description.'))
    expect(document.head.querySelector('script[data-page-json-ld]')).toBeNull()
  })

  it('automatically prevents indexing of account pages', async () => {
    render(<MemoryRouter initialEntries={['/account/security']}><PageMeta title="Security" description="Private account security." /></MemoryRouter>)
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow,noarchive'))
  })
})
