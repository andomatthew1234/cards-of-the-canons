import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SafeRichText } from '../src/components/SafeRichText'

describe('SafeRichText', () => {
  it('renders the supported formatting without HTML injection', () => {
    const { container } = render(<SafeRichText value={'A **careful** *story* with [context](https://example.com).\n\n- First\n- Second\n<script>alert(1)</script>'} />)
    expect(screen.getByText('careful').tagName).toBe('STRONG')
    expect(screen.getByText('story').tagName).toBe('EM')
    expect(screen.getByRole('link', { name: 'context' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
  })

  it('does not turn non-HTTPS or malformed links into anchors', () => {
    render(<SafeRichText value={'[unsafe](javascript:alert(1))\n[plain](http://example.com)'} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
