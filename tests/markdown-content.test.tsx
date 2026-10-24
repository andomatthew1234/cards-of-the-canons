import { render, screen } from '@testing-library/react'
import { MarkdownContent } from '../src/components/MarkdownContent'

describe('MarkdownContent', () => {
  it('renders GitHub-flavoured content and safe links', () => {
    render(<MarkdownContent markdown={'## Heading\n\n| A | B |\n| - | - |\n| One | Two |\n\n[Safe](https://example.com)'} />)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Safe' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('does not render executable HTML or javascript links', () => {
    const { container } = render(<MarkdownContent markdown={'<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull()
  })
})
