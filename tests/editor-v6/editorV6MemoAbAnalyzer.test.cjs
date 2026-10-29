const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const sharp = require('sharp')

const root = path.resolve(__dirname, '../..')
const analyzer = path.join(root, 'scripts', 'editor-v6', 'analyze-memo-ab.cjs')
const labels = ['A1', 'B1', 'B2', 'A2', 'A3', 'B3']

test('analisador A/B aceita evidências sintéticas e não sobrescreve um relatório', async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gacha-memo-ab-test-'))
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }))
  const inputRoot = path.join(temporaryRoot, 'input')
  const outputRoot = path.join(temporaryRoot, 'analysis')
  await fs.mkdir(inputRoot, { recursive: true })
  const screenshotPath = path.join(temporaryRoot, 'scene.png')
  await sharp({ create: { width: 2, height: 2, channels: 4, background: '#a5c4eb' } }).png().toFile(screenshotPath)

  for (const label of labels) {
    const memoizationEnabled = label[0] === 'A'
    const report = {
      measurements: [{
        key: 'heavy', elapsedMs: 30_000, memoizationEnabled, poseChangesObserved: true,
        poseChangeNamesObserved: ['STRESS_Aurora', 'STRESS_Nix', 'STRESS_Brisa', 'STRESS_Dorian'],
        project: { motionTransitions: 284, missingMotions: 0 },
        react: [
          { route: '/editor-v6', commits: 10, commitSamples: [], p95CommitMs: 1, worstCommitMs: 2, longTasks: 0, longTaskMs: 0, playback: { logicalFrameUpdates: 900, logicalFrameGaps: [] } },
          { route: '/editor-v6/surface', commits: 10, commitSamples: [], p95CommitMs: 1, worstCommitMs: 2 },
          { route: '/editor-v6/scene', commits: 10, commitSamples: [] },
          { route: '/editor-v6/timeline', commits: 10, commitSamples: [] }
        ],
        rafIntervals: [{ durationMs: 13.3 }, { durationMs: 13.5 }],
        p50FrameMs: 13.3, p95FrameMs: 13.5, p99FrameMs: 13.8, worstFrameMs: 16,
        jsHeapPeakBytes: 100 * 1024 * 1024, pageErrors: [], sceneScreenshotPath: screenshotPath,
        runtimeConfig: { userAgent: 'synthetic', hardwareConcurrency: 4, viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 } }
      }]
    }
    const variant = memoizationEnabled ? 'memo-on' : 'memo-off'
    await fs.writeFile(path.join(inputRoot, `heavy-${variant}-${label}.json`), JSON.stringify(report), { flag: 'wx' })
  }

  const env = {
    ...process.env,
    GACHA_EDITOR_V6_STRESS_AB_INPUT_ROOT: inputRoot,
    GACHA_EDITOR_V6_STRESS_AB_OUTPUT_ROOT: outputRoot
  }
  const firstRun = spawnSync(process.execPath, [analyzer], { cwd: root, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout)

  const date = new Date().toISOString().slice(0, 10)
  const jsonPath = path.join(outputRoot, `AB_MEMO_${date}.json`)
  const markdownPath = path.join(outputRoot, `AB_MEMO_${date}.md`)
  const before = await fs.readFile(jsonPath, 'utf8')
  assert.equal(JSON.parse(before).rounds.length, 6)
  assert.match(await fs.readFile(markdownPath, 'utf8'), /A\/B da memoização do Editor V6/)

  const secondRun = spawnSync(process.execPath, [analyzer], { cwd: root, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.notEqual(secondRun.status, 0)
  assert.match(secondRun.stderr, /já existe e será preservado/)
  assert.equal(await fs.readFile(jsonPath, 'utf8'), before)
})
