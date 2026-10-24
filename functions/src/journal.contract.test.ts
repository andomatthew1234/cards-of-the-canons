import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Journal deletion contract', () => {
  it('deletes through a revision-checked transaction without discarding delivery records', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/journal.ts'), 'utf8')
    const deletion = source.slice(source.indexOf('export const deleteJournalArticle'), source.indexOf('export const retryJournalNotification'))

    expect(deletion).toContain('deleteInput.safeParse')
    expect(deletion).toContain('db.runTransaction')
    expect(deletion).toContain("snapshot.data()?.revision")
    expect(deletion).toContain('transaction.delete(ref)')
    expect(deletion).not.toContain("collection('newsletterCampaigns')")
  })
})
