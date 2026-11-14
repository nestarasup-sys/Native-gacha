'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function suiteStart(runId) {
  const match = /^(?:plan-b-export-lab-)(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(runId)
  if (!match) throw new Error('ID de execução não contém timestamp reconhecido.')
  return Date.parse(`${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`)
}

async function readFreshReports(runFolder, minimumTime) {
  const folders = [path.join(runFolder, 'failure-reports')]
  const isolated = path.join(runFolder, 'isolated-app-data', 'runtime', 'profile', 'studios', 'Editor V6')
  for (const project of await fs.readdir(isolated, { withFileTypes: true }).catch(() => [])) {
    if (project.isDirectory() && !project.isSymbolicLink()) folders.push(path.join(isolated, project.name, 'exports'))
  }
  const result = []
  const seen = new Set()
  for (const folder of folders) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.endsWith('.report.json')) continue
      const file = path.join(folder, entry.name)
      const report = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
      const startedAt = Date.parse(report?.startedAt)
      if (!report || !Number.isFinite(startedAt) || startedAt < minimumTime || seen.has(report.id)) continue
      seen.add(report.id)
      result.push({
        startedAt: report.startedAt, encoder: report.options?.encoder, state: report.state,
        phase: report.currentPhase, error: String(report.error ?? '').slice(0, 1800),
        failedFrame: Number(/Falha no quadro (\d+)/.exec(report.error ?? '')?.[1]) || null,
        phaseMilliseconds: report.phaseMilliseconds,
        motionPreparationMilliseconds: report.motionPreparation?.milliseconds,
        mainProcessPeakRssBytes: report.mainProcessMemory?.peakRssBytes,
        electronPeakWorkingSetBytes: report.electronProcessMemory?.peakTotalWorkingSetBytes,
        electronPeakPrivateBytes: report.electronProcessMemory?.peakTotalPrivateBytes,
        transitionsRequired: report.motionTransitionsRequired,
        transitionsPrepared: report.motionTransitionsPrepared
      })
    }
  }
  return result.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
}

async function summarize(runFolder) {
  const inputPath = path.join(runFolder, 'suite-report.json')
  const report = JSON.parse(await fs.readFile(inputPath, 'utf8'))
  const minimumTime = suiteStart(report.runId) - 3000
  for (const result of report.results) {
    result.failureDiagnostics = await readFreshReports(result.outputFolder, minimumTime)
    result.failureDiagnosticsFound = result.failureDiagnostics.length > 0
    result.failureSignature = result.error?.match(/(?:Turbo obrigatório falhou|AMF obrigatório falhou)[^\r\n]*/)?.[0]?.slice(0, 500) ?? null
    result.failedFrameFromLog = Number(/Falha no quadro (\d+)/.exec(result.error ?? '')?.[1]) || null
  }
  report.groups = report.groups.map(group => {
    const results = report.results.filter(item => item.project === group.project && item.toolchain === group.toolchain && item.encoder === group.encoder)
    const failures = results.flatMap(item => item.failureDiagnostics)
    return {
      ...group,
      failed: results.length - results.filter(item => item.exitCode === 0).length,
      medianMotionPreparationMs: median(failures.map(item => item.motionPreparationMilliseconds)),
      maxMainProcessPeakRssBytes: failures.length ? Math.max(...failures.map(item => item.mainProcessPeakRssBytes ?? 0)) || null : null,
      maxElectronPeakWorkingSetBytes: failures.length ? Math.max(...failures.map(item => item.electronPeakWorkingSetBytes ?? 0)) || null : null,
      failedFrames: [...new Set(failures.map(item => item.failedFrame).filter(Number.isFinite))],
      failureDiagnosticsCount: failures.length
    }
  })
  report.failureCauseSummary = {
    totalRuns: report.results.length,
    failedRuns: report.results.filter(item => item.exitCode !== 0).length,
    failuresBeforeEncoding: report.results.filter(item => item.failureDiagnostics.some(diagnostic => diagnostic.phase === 'rendering' && diagnostic.failedFrame)).length,
    distinctFailedFrames: [...new Set(report.results.flatMap(item => item.failureDiagnostics.map(diagnostic => diagnostic.failedFrame).filter(Number.isFinite)))].sort((a, b) => a - b),
    note: 'Export timing, encoded quality, and A/V synchronization are unavailable for runs that fail before the encoder produces a file.'
  }
  const outputPath = path.join(runFolder, 'suite-report-diagnostics.json')
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), { flag: 'wx' })
  return outputPath
}

if (require.main === module) {
  const folder = process.argv[2]
  if (!folder) throw new Error('Uso: node summarize-planb-export-lab.cjs <pasta-da-suite>')
  summarize(path.resolve(folder)).then(file => process.stdout.write(file + '\n')).catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

module.exports = { median, suiteStart, readFreshReports, summarize }
