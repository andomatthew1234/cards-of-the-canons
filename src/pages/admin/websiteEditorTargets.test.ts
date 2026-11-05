import { describe, expect, it } from 'vitest'
import { targetsForPage, websiteEditorTargets } from './websiteEditorTargets'

describe('website editor compact homepage panel targets', () => {
  it('routes each live-preview panel to the shared editorial-panel controls', () => {
    expect(websiteEditorTargets['home-council']).toMatchObject({
      page: 'home',
      section: 'home',
      controlId: 'editorial-panels',
    })
    expect(websiteEditorTargets['home-genesis']).toMatchObject({
      page: 'home',
      section: 'home',
      controlId: 'editorial-panels',
      label: 'Edit How It Began',
    })
    expect(websiteEditorTargets['home-from-scriptorium']).toMatchObject({
      page: 'home',
      section: 'home',
      controlId: 'editorial-panels',
    })
  })

  it('includes all compact panels in the Home preview target inventory', () => {
    expect(targetsForPage('home').map((target) => target.id)).toEqual(
      expect.arrayContaining(['home-council', 'home-genesis', 'home-from-scriptorium']),
    )
  })
})
