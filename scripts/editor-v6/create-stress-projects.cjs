const { spawnSync } = require('node:child_process')
const { resolve, join } = require('node:path')

const workspace = process.cwd()
const output = resolve(process.env.GACHA_EDITOR_V6_STRESS_ROOT || join(workspace, 'app-data', 'runtime', 'profile', 'studios', 'Editor V6'))
const vitest = resolve(workspace, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.editor-v6.config.ts', 'tests/editor-v6/editorV6StressProjects.test.ts'], {
  cwd: workspace,
  stdio: 'inherit',
  env: { ...process.env, GACHA_EDITOR_V6_STRESS_FIXTURES: '1', GACHA_EDITOR_V6_STRESS_ROOT: output }
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
