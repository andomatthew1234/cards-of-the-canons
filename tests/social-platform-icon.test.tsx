import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { socialIconById, XSocialIcon } from '../src/components/SocialPlatformIcon'

describe('social platform icons', () => {
  it('uses the X wordmark for the X platform instead of an @ glyph', () => {
    expect(socialIconById.x).toBe(XSocialIcon)
    const { container } = render(<XSocialIcon aria-label="X" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg?.querySelector('path')?.getAttribute('d')).toContain('18.244 2.25')
    expect(container.textContent).not.toContain('@')
  })
})
