import { describe, expect, it } from 'vitest'
import type { EmailCampaignDraft } from '../../../types'
import { createBlock, findLocation, insertBlock, moveBlock, normaliseBlocks, validateCampaignDraft } from './editorModel'

describe('email campaign editor model', () => {
  it('moves real blocks from the canvas into a column at a precise position', () => {
    const heading = createBlock('heading')
    const paragraph = createBlock('paragraph')
    const columns = createBlock('columns')
    const blocks = [heading, paragraph, columns]
    const moved = moveBlock(blocks, paragraph.id, { parentId: columns.id, columnIndex: 1 }, 0)

    expect(findLocation(moved, paragraph.id)).toEqual({ parentId: columns.id, columnIndex: 1, index: 0 })
    expect(moved.map((block) => block.id)).toEqual([heading.id, columns.id])
  })

  it('inserts a palette block between existing canvas blocks', () => {
    const first = createBlock('heading')
    const second = createBlock('paragraph')
    const button = createBlock('button')
    expect(insertBlock([first, second], button, { parentId: null, columnIndex: null }, 1).map((block) => block.id)).toEqual([first.id, button.id, second.id])
  })

  it('keeps legacy blocks sendable and accepts short visible campaign details', () => {
    const legacy = { id: 'legacy-block', type: 'paragraph', text: 'Hello', url: '', alt: '', caption: '', align: 'left', size: 'medium' } as const
    const blocks = normaliseBlocks([legacy])
    const draft: EmailCampaignDraft = { revision: 0, name: 'hi', subject: 'i', previewText: '', blocks, purpose: 'marketing', audience: 'mailing_list', recipientEmails: [] }
    expect(validateCampaignDraft(draft)).toBe('')
    expect(Object.prototype.hasOwnProperty.call(blocks[0], 'columns')).toBe(false)
  })
})
