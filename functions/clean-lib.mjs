import { rmSync } from 'node:fs'

// Removes the compiled output before every build so stale artefacts (for
// example a test file compiled before an exclusion was added) can never ride
// along into a deployment.
rmSync(new URL('./lib', import.meta.url), { recursive: true, force: true })
