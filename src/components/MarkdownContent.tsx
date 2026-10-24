import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

function safeUrl(url?: string) {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('#')) return url
  try {
    const parsed = new URL(url)
    return ['https:', 'mailto:'].includes(parsed.protocol) ? url : ''
  } catch { return '' }
}

const components: Components = {
  a: ({ href, children, ...props }) => {
    const target = safeUrl(href)
    if (!target) return <span>{children}</span>
    const external = target.startsWith('https://')
    return <a {...props} href={target} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  },
  img: ({ src, alt, ...props }) => {
    const target = safeUrl(typeof src === 'string' ? src : undefined)
    return target ? <img {...props} src={target} alt={alt ?? ''} loading="lazy" decoding="async" /> : null
  },
}

export function MarkdownContent({ markdown, className = '' }: { markdown: string; className?: string }) {
  return <div className={`markdown-content ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>{markdown}</ReactMarkdown></div>
}
