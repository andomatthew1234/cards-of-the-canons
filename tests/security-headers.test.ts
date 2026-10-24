import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type HostingHeader = { key: string; value: string }
type HostingConfig = {
  ignore?: string[]
  headers?: Array<{ source: string; headers: HostingHeader[] }>
}

const config = JSON.parse(readFileSync('firebase.json', 'utf8')) as { hosting: HostingConfig }
const allHeaders = config.hosting.headers ?? []
const catchAll = allHeaders.find((entry) => entry.source === '**')
const headerValue = (key: string) => catchAll?.headers.find((header) => header.key === key)?.value ?? ''

describe('hosting security headers (S14)', () => {
  it('denies framing with both frame-ancestors and X-Frame-Options', () => {
    expect(headerValue('X-Frame-Options')).toBe('DENY')
    const enforced = headerValue('Content-Security-Policy')
    expect(enforced).toContain("frame-ancestors 'none'")
    expect(enforced).toContain("object-src 'none'")
    expect(enforced).toContain("base-uri 'self'")
  })

  it('serves the full policy as report-only until enforcement is verified', () => {
    const reportOnly = headerValue('Content-Security-Policy-Report-Only')
    expect(reportOnly).toContain("default-src 'self'")
    expect(reportOnly).toContain("script-src 'self'")
    expect(reportOnly).toContain("frame-ancestors 'none'")
    // No weakening directives anywhere in the served policies.
    for (const policy of [headerValue('Content-Security-Policy'), reportOnly]) {
      expect(policy).not.toContain('unsafe-eval')
      expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/)
    }
    // OAuth, App Check and Stripe connectivity stay possible under report-only.
    expect(reportOnly).toContain('accounts.google.com')
    expect(reportOnly).toContain('googleapis.com')
    expect(reportOnly).toContain('checkout.stripe.com')
  })

  it('keeps baseline hardening headers', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff')
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerValue('Permissions-Policy')).toContain('camera=()')
  })

  it('ignores environment and local file variants during deploys', () => {
    const ignore = config.hosting.ignore ?? []
    for (const pattern of ['**/*.env', '**/*.env.*', '**/*.local', '**/*.log', '**/*.map', '**/.*']) {
      expect(ignore).toContain(pattern)
    }
  })
})
