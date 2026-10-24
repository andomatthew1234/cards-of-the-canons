import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('editor layout contracts', () => {
  it('keeps campaign content in the flexible final grid row', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/admin/email-campaigns/studio.css'), 'utf8')
    expect(css).toContain('grid-template-rows:64px 42px auto minmax(0,1fr)')
    expect(css).toContain('.campaign-studio-message-slot')
  })

  it('keeps the Website Editor preview scrollable while containing its public header', () => {
    const sharedCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/homepage.css'), 'utf8')
    const shellRule = sharedCss.match(/\.website-preview-shell\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(css).toContain('.website-draft-preview-surface .public-header')
    expect(css).toContain('position: absolute !important')
    expect(shellRule).toContain('overflow: auto')
    expect(shellRule).toContain('align-items: flex-start')
  })
})
