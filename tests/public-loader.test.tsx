import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Layout } from '../src/components/Layout'

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../src/context/CartContext', () => ({ useCart: () => ({ count: 0 }) }))
vi.mock('../src/context/SiteContentContext', () => ({
  useSiteContent: () => ({ website: undefined, ready: false }),
}))

describe('public loading paint', () => {
  it('has an accessible loading state without a visible text node that can flash before CSS', () => {
    render(<MemoryRouter><Layout><p>Page</p></Layout></MemoryRouter>)
    const status = screen.getByRole('status', { name: 'Loading Doxa Treasury' })
    expect(status).toBeEmptyDOMElement()
  })

  it('does not opt into a late web-font swap', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('display=optional')
    expect(html).not.toContain('display=swap')
  })
})
