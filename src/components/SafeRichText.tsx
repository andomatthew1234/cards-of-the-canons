import { Fragment, type ReactNode } from 'react'

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https:\/\/[^)\s]+\))/g
const LINK_TOKEN = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/

function inline(text: string): ReactNode[] {
  return text.split(INLINE_TOKEN).filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>
    if (token.startsWith('*') && token.endsWith('*')) return <em key={index}>{token.slice(1, -1)}</em>
    const link = token.match(LINK_TOKEN)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    return <Fragment key={index}>{token}</Fragment>
  })
}

/**
 * A deliberately small rich-text renderer. Content stays plain text in
 * Firestore and is converted to React nodes without `dangerouslySetInnerHTML`.
 * Supported formatting: paragraphs, `-` lists, **bold**, *italic* and HTTPS
 * links. Everything else is displayed literally.
 */
export function SafeRichText({ value, className = '' }: { value: string; className?: string }) {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (!listItems.length) return
    const items = listItems
    listItems = []
    blocks.push(<ul key={`list-${blocks.length}`}>{items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>)
  }

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') && trimmed.length > 2) {
      listItems.push(trimmed.slice(2))
      return
    }
    flushList()
    if (trimmed) blocks.push(<p key={`paragraph-${blocks.length}`}>{inline(trimmed)}</p>)
  })
  flushList()

  return <div className={`safe-rich-text ${className}`.trim()}>{blocks}</div>
}
