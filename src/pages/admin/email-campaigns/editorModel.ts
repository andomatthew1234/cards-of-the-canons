import type { EmailCampaignBlock, EmailCampaignBlockType, EmailCampaignDraft } from '../../../types'

export const BLOCK_COLOURS = ['#fffaf0', '#fcf5de', '#f3ecdf', '#ead9bf', '#d8aa58', '#7f3b32', '#530000', '#2b0000', '#2d1c15', '#ffffff'] as const

const id = () => crypto.randomUUID()

export function createBlock(type: EmailCampaignBlockType): EmailCampaignBlock {
  const common = {
    id: id(), type, text: '', url: '', alt: '', caption: '', align: 'left' as const, size: 'medium' as const,
    backgroundColor: '#fffaf0', textColor: '#2d1c15', borderColor: '#d9c29a', borderWidth: 0,
    borderRadius: 0, padding: 12, fontFamily: 'serif' as const, fontWeight: 'normal' as const,
    lineHeight: 1.6, width: 100,
  }
  if (type === 'heading') return { ...common, text: 'A story worth sharing', fontSize: 30, lineHeight: 1.25 }
  if (type === 'paragraph') return { ...common, text: 'Write your message here.', fontSize: 16 }
  if (type === 'button') return { ...common, text: 'Discover more', url: 'https://doxatreasury.com/', align: 'center', backgroundColor: '#4b2f22', textColor: '#fff4da', borderColor: '#7f5a35', borderWidth: 1, borderRadius: 3, padding: 13 }
  if (type === 'link') return { ...common, text: 'Read the full story', url: 'https://doxatreasury.com/', textColor: '#6f481d', fontSize: 16 }
  if (type === 'image') return { ...common, backgroundColor: '#f3ecdf', alt: 'Describe this image', borderRadius: 0, padding: 0 }
  if (type === 'divider') return { ...common, backgroundColor: '#dfccb0', padding: 0 }
  if (type === 'spacer') return { ...common, padding: 28 }
  return { ...common, padding: 8, columns: [[createBlock('paragraph')], [createBlock('paragraph')]] }
}

export function blankCampaignDraft(): EmailCampaignDraft {
  return {
    revision: 0, name: '', subject: '', previewText: '', purpose: 'marketing', audience: 'mailing_list', recipientEmails: [],
    blocks: [createBlock('heading'), createBlock('paragraph'), createBlock('button')],
  }
}

export const campaignTemplates = [
  { id: 'announcement', name: 'Announcement', description: 'A bold headline, message and call to action.', blocks: () => [createBlock('heading'), createBlock('paragraph'), createBlock('button')] },
  { id: 'journal', name: 'Journal release', description: 'A story-led layout with image and reading link.', blocks: () => { const image = createBlock('image'); image.caption = 'A new story from the Doxa Journal'; const heading = createBlock('heading'); heading.text = 'A new Journal story'; const link = createBlock('link'); link.text = 'Read the Journal'; link.url = 'https://doxatreasury.com/journal'; return [image, heading, createBlock('paragraph'), link] } },
  { id: 'product', name: 'Product launch', description: 'Two-column product feature and shop button.', blocks: () => { const columns = createBlock('columns'); columns.columns = [[createBlock('image')], [createBlock('heading'), createBlock('paragraph'), createBlock('button')]]; return [columns] } },
  { id: 'blank', name: 'Blank canvas', description: 'Start with a clean, open canvas.', blocks: () => [] },
] as const

export type BlockLocation = { parentId: string | null; columnIndex: number | null; index: number }

export function findBlock(blocks: EmailCampaignBlock[], blockId: string): EmailCampaignBlock | undefined {
  for (const block of blocks) {
    if (block.id === blockId) return block
    for (const column of block.columns ?? []) {
      const match = findBlock(column, blockId)
      if (match) return match
    }
  }
}

export function findLocation(blocks: EmailCampaignBlock[], blockId: string): BlockLocation | null {
  const rootIndex = blocks.findIndex((block) => block.id === blockId)
  if (rootIndex >= 0) return { parentId: null, columnIndex: null, index: rootIndex }
  for (const parent of blocks) {
    for (let columnIndex = 0; columnIndex < (parent.columns?.length ?? 0); columnIndex += 1) {
      const index = parent.columns![columnIndex].findIndex((block) => block.id === blockId)
      if (index >= 0) return { parentId: parent.id, columnIndex, index }
    }
  }
  return null
}

export function containerBlocks(blocks: EmailCampaignBlock[], location: Omit<BlockLocation, 'index'>) {
  if (!location.parentId) return blocks
  return findBlock(blocks, location.parentId)?.columns?.[location.columnIndex ?? 0] ?? []
}

export function mapBlock(blocks: EmailCampaignBlock[], blockId: string, update: (block: EmailCampaignBlock) => EmailCampaignBlock): EmailCampaignBlock[] {
  return blocks.map((block) => block.id === blockId ? update(block) : block.columns ? { ...block, columns: block.columns.map((column) => mapBlock(column, blockId, update)) } : block)
}

export function removeBlock(blocks: EmailCampaignBlock[], blockId: string): { blocks: EmailCampaignBlock[]; removed?: EmailCampaignBlock } {
  let removed: EmailCampaignBlock | undefined
  const next = blocks.filter((block) => {
    if (block.id === blockId) { removed = block; return false }
    return true
  }).map((block) => {
    if (!block.columns) return block
    return { ...block, columns: block.columns.map((column) => {
      const result = removeBlock(column, blockId)
      if (result.removed) removed = result.removed
      return result.blocks
    }) }
  })
  return { blocks: next, ...(removed ? { removed } : {}) }
}

export function insertBlock(blocks: EmailCampaignBlock[], block: EmailCampaignBlock, location: Omit<BlockLocation, 'index'>, index: number) {
  if (!location.parentId) {
    const next = [...blocks]; next.splice(Math.max(0, Math.min(index, next.length)), 0, block); return next
  }
  return mapBlock(blocks, location.parentId, (parent) => {
    const columns = (parent.columns ?? [[], []]).map((column) => [...column])
    const target = columns[location.columnIndex ?? 0] ?? []
    target.splice(Math.max(0, Math.min(index, target.length)), 0, block)
    columns[location.columnIndex ?? 0] = target
    return { ...parent, columns }
  })
}

export function moveBlock(blocks: EmailCampaignBlock[], blockId: string, target: Omit<BlockLocation, 'index'>, index: number) {
  const source = findLocation(blocks, blockId)
  const result = removeBlock(blocks, blockId)
  if (!result.removed) return blocks
  let adjusted = index
  if (source && source.parentId === target.parentId && source.columnIndex === target.columnIndex && source.index < index) adjusted -= 1
  return insertBlock(result.blocks, result.removed, target, adjusted)
}

export function duplicateBlock(block: EmailCampaignBlock): EmailCampaignBlock {
  return { ...block, id: id(), columns: block.columns?.map((column) => column.map(duplicateBlock)) }
}

export function normaliseBlocks(blocks: EmailCampaignBlock[]): EmailCampaignBlock[] {
  return blocks.map((block) => {
    const normalised: EmailCampaignBlock = {
      backgroundColor: '#fffaf0', textColor: '#2d1c15', borderColor: '#d9c29a', borderWidth: 0, borderRadius: 0,
      padding: block.type === 'spacer' ? (block.size === 'large' ? 48 : block.size === 'small' ? 16 : 28) : 12,
      fontFamily: 'serif', fontWeight: 'normal', lineHeight: 1.6, width: 100,
      ...block,
    }
    if (block.columns) normalised.columns = block.columns.map(normaliseBlocks)
    return normalised
  })
}

export function validateCampaignDraft(draft: EmailCampaignDraft) {
  if (!draft.name.trim()) return 'Add an internal campaign name.'
  if (!draft.subject.trim()) return 'Add an email subject.'
  if (!draft.blocks.length) return 'Add at least one content block.'
  const visit = (blocks: EmailCampaignBlock[]): string => {
    for (const block of blocks) {
      if ((block.type === 'heading' || block.type === 'paragraph') && !block.text.trim()) return 'Every text block needs content.'
      if ((block.type === 'button' || block.type === 'link') && (!block.text.trim() || !block.url.startsWith('https://'))) return 'Every button and link needs a label and secure https:// address.'
      if (block.type === 'image' && (!block.url.startsWith('https://') || block.alt.trim().length < 3)) return 'Every image needs a secure address and a useful description.'
      if (block.type === 'columns') {
        if (!block.columns || block.columns.length < 2 || block.columns.some((column) => !column.length)) return 'Every column needs at least one content block.'
        const issue = visit(block.columns.flat())
        if (issue) return issue
      }
    }
    return ''
  }
  const issue = visit(draft.blocks)
  if (issue) return issue
  if (draft.audience === 'all_accounts' && draft.purpose !== 'service') return 'Website accounts can only receive necessary service messages.'
  if (draft.audience === 'individuals' && !draft.recipientEmails.length) return 'Choose at least one recipient.'
  return ''
}
