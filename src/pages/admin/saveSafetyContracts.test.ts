import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('admin save reconciliation', () => {
  it('does not replace newer Website Editor content after an older save finishes', () => {
    const editor = source('src/pages/admin/WebsiteEditorPage.tsx')
    expect(editor).toContain('const hasNewerChanges = JSON.stringify(contentRef.current) !== savedSnapshot')
    expect(editor).toContain('if (!hasNewerChanges) setContent(cloneWebsiteContent(validation.data))')
  })

  it('preserves newer Journal edits while accepting the saved server revision', () => {
    const journal = source('src/pages/admin/JournalEditorPage.tsx')
    expect(journal).toContain('const hasNewerChanges = JSON.stringify(articleRef.current) !== requestedSnapshot')
    expect(journal).toContain('setArticle(hasNewerChanges ? { ...articleRef.current, id: saved.id, revision: saved.revision')
  })

  it('updates the campaign autosave reference before a queued save begins', () => {
    const campaign = source('src/pages/admin/email-campaigns/CampaignStudio.tsx')
    expect(campaign).toContain('latestRef.current = { ...latestRef.current, id: saved.id, revision: saved.revision }')
  })
})
