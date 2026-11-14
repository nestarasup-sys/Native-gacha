'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { median, suiteStart, readFreshReports } = require('../../scripts/editor-v6/summarize-planb-export-lab.cjs')

test('laboratório: extrai início UTC e calcula mediana', () => {
  assert.equal(suiteStart('plan-b-export-lab-2026-11-14T16-25-54-589Z-20356'), Date.parse('2026-11-14T16:25:54.589Z'))
  assert.equal(median([9, 1, 5]), 5)
  assert.equal(median([4, 2]), 3)
  assert.equal(median([null, NaN]), null)
})

test('laboratório: inclui só relatórios da rodada e desduplica cópias', async t => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'v6-lab-summary-'))
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
  const reports = path.join(tempRoot, 'failure-reports')
  const isolated = path.join(tempRoot, 'isolated-app-data', 'runtime', 'profile', 'studios', 'Editor V6', 'project', 'exports')
  await fs.mkdir(reports, { recursive: true })
  await fs.mkdir(isolated, { recursive: true })
  const old = { id: 'old', startedAt: '2026-11-14T16:20:00.000Z', error: 'stale' }
  const fresh = { id: 'fresh', startedAt: '2026-11-14T16:30:00.000Z', currentPhase: 'rendering', error: 'Falha no quadro 259', options: { encoder: 'cpu' }, mainProcessMemory: { peakRssBytes: 1024 } }
  await fs.writeFile(path.join(reports, 'old.report.json'), JSON.stringify(old))
  await fs.writeFile(path.join(reports, 'fresh.report.json'), JSON.stringify(fresh))
  await fs.writeFile(path.join(isolated, 'same-fresh-report.report.json'), JSON.stringify(fresh))
  const result = await readFreshReports(tempRoot, Date.parse('2026-11-14T16:25:54.000Z'))
  assert.equal(result.length, 1)
  assert.equal(result[0].failedFrame, 259)
  assert.equal(result[0].mainProcessPeakRssBytes, 1024)
})
