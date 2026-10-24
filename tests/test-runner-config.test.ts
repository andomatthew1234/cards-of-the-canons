import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('test runner stability contract', () => {
  it('uses the same bounded worker count locally and in CI', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(packageJson.scripts.test).toContain('--maxWorkers=1')
    expect(packageJson.scripts['test:ci']).toContain('--maxWorkers=1')
    expect(viteConfig).toContain('maxWorkers: 1')
  })
})
