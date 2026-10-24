import { spawnSync } from 'node:child_process'

const npmCli = process.env.npm_execpath
const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
const commandPrefix = npmCli ? [npmCli] : []
const steps = [
  ['Production configuration', ['run', 'release:config']],
  ['Storefront production dependency audit', ['audit', '--omit=dev']],
  ['Functions production dependency audit', ['--prefix', 'functions', 'audit', '--omit=dev']],
  ['Storefront typecheck', ['run', 'typecheck']],
  ['Storefront tests', ['run', 'test:ci']],
  ['Functions typecheck', ['--prefix', 'functions', 'run', 'typecheck']],
  ['Functions tests', ['--prefix', 'functions', 'test']],
  ['Functions build', ['--prefix', 'functions', 'run', 'build']],
  ['Firebase Rules tests', ['run', 'rules:test']],
  ['Production build', ['run', 'build']],
  ['SEO validation', ['run', 'seo:check']],
]

for (const [label, args] of steps) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(command, [...commandPrefix, ...args], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('\nRelease checks passed.')
