import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertJournalMutationAllowed } from './journal'

describe('Journal deletion contract', () => {
  it('paginates the admin archive and provides a direct ID lookup', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/journal.ts'), 'utf8')
    const listing = source.slice(source.indexOf('export const listJournalArticlesAdmin'), source.indexOf('export const saveJournalArticle'))

    expect(listing).toContain('pageSize + 1')
    expect(listing).toContain('nextCursor')
    expect(listing).toContain('startAfter(cursor)')
    expect(listing).toContain("where('status', 'in', ['draft', 'published'])")
    expect(listing).toContain('export const getJournalArticleAdmin')
    expect(listing).toContain("doc(parsed.data.articleId).get()")
  })

  it('requires recent verified administrator authentication for destructive changes', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/journal.ts'), 'utf8')
    const deletion = source.slice(source.indexOf('export const deleteJournalArticle'), source.indexOf('export const retryJournalNotification'))

    expect(deletion).toContain('authorizeRequest')
    expect(deletion).toContain('requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS')
    expect(deletion).toContain('requireVerifiedEmail: true')
  })

  it('archives a published story but physically deletes a draft without discarding delivery records', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/journal.ts'), 'utf8')
    const deletion = source.slice(source.indexOf('export const deleteJournalArticle'), source.indexOf('export const retryJournalNotification'))

    expect(deletion).toContain('deleteInput.safeParse')
    expect(deletion).toContain('db.runTransaction')
    expect(deletion).toContain("snapshot.data()?.revision")
    expect(deletion).toContain("status === 'published'")
    expect(deletion).toContain("status: 'archived'")
    expect(deletion).toContain('transaction.delete(ref)')
    expect(deletion).not.toContain("collection('newsletterCampaigns')")
  })

  it('prevents a stale editor from reviving an archived story', () => {
    const revisionBeforeArchive = 4
    const revisionAfterArchive = revisionBeforeArchive + 1

    expect(() => assertJournalMutationAllowed(revisionAfterArchive, revisionBeforeArchive, 'archived', 'publish'))
      .toThrow('changed elsewhere')
    expect(() => assertJournalMutationAllowed(revisionAfterArchive, revisionAfterArchive, 'archived', 'publish'))
      .toThrow('archived and cannot be changed or republished')
    expect(() => assertJournalMutationAllowed(revisionAfterArchive, revisionAfterArchive, 'archived', 'save'))
      .toThrow('archived and cannot be changed or republished')
  })
})
