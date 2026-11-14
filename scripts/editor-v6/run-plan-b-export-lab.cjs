'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const { spawn, spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const projectIds = {
  failureReproduction: '34b5bff1-e77e-4d3d-845b-710ab8d5c2c1',
  planB: '408a77d1-d964-4c04-a66b-f4e9fcfeee46'
}
const defaultHairPreset = {
  physics: { wind: -50, gust: 28, speed: 100, stiffness: 42, damping: 52, responsiveness: 55, anchor: 14 },
  enabled: { back: true, front: true, fringe: true },
  intensity: { back: 100, front: 75, fringe: 40 }
}
const nowId = () => new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid
const inside = (parent, child) => {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
const hashFile = async file => {
  const hash = crypto.createHash('sha256')
  for await (const chunk of require('node:fs').createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function inventory(target) {
  const stats = await fs.lstat(target)
  if (stats.isSymbolicLink()) throw new Error(`Fonte de benchmark contém symlink: ${path.basename(target)}`)
  if (stats.isFile()) return [{ path: path.basename(target), size: stats.size, sha256: await hashFile(target) }]
  if (!stats.isDirectory()) throw new Error(`Fonte de benchmark não é arquivo ou pasta regular: ${path.basename(target)}`)
  const files = []
  const walk = async (folder, prefix = '') => {
    const entries = await fs.readdir(folder, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolute = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Fonte de benchmark contém symlink: ${entry.name}`)
      const relative = path.join(prefix, entry.name)
      if (entry.isDirectory()) await walk(absolute, relative)
      else if (entry.isFile()) {
        const fileStats = await fs.stat(absolute)
        files.push({ path: relative, size: fileStats.size, sha256: await hashFile(absolute) })
      } else throw new Error(`Fonte de benchmark contém entrada especial: ${entry.name}`)
    }
  }
  await walk(target)
  return files
}

function runCapture(binary, args, { cwd = root, env = process.env, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = [], stderr = []
    let outBytes = 0, errBytes = 0
    child.stdout.on('data', chunk => { outBytes += chunk.length; if (outBytes <= maxBytes) stdout.push(chunk); else child.kill() })
    child.stderr.on('data', chunk => { errBytes += chunk.length; if (errBytes < 2 * 1024 * 1024) stderr.push(chunk) })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString('utf8'), outputExceeded: outBytes > maxBytes }))
  })
}

async function copySnapshot(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true })
}

async function prepareSnapshot(snapshotRoot) {
  const profileRoot = path.join(root, 'app-data', 'runtime', 'profile')
  const sources = {
    failureReproductionProject: path.join(profileRoot, 'studios', 'Editor V6', `editorV6-${projectIds.failureReproduction}`),
    planBProject: path.join(profileRoot, 'studios', 'Editor V6', `editorV6-${projectIds.planB}`),
    library: path.join(profileRoot, 'studios', 'Editor Gacha', 'media-library'),
    characters: path.join(profileRoot, 'customizer', 'characters', 'characters.json'),
    fabricator: path.join(profileRoot, 'fabricator')
  }
  for (const source of Object.values(sources)) await fs.access(source)
  const before = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, source]) => [key, await inventory(source)])))
  for (const [key, source] of Object.entries(sources)) {
    const destination = path.join(snapshotRoot, key, ...(key === 'characters' ? [path.basename(source)] : []))
    await copySnapshot(source, destination)
  }
  const after = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, source]) => [key, await inventory(source)])))
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('O app alterou os dados durante a cópia; snapshot descartado da execução e nenhuma fonte foi modificada.')
  const copied = Object.fromEntries(await Promise.all(Object.keys(sources).map(async key => [key, await inventory(
    key === 'characters' ? path.join(snapshotRoot, key, path.basename(sources.characters)) : path.join(snapshotRoot, key)
  )])))
  if (JSON.stringify(before) !== JSON.stringify(copied)) throw new Error('A cópia de benchmark não corresponde às fontes verificadas.')

  const shortProject = JSON.parse(await fs.readFile(path.join(snapshotRoot, 'failureReproductionProject', 'editorV6.json'), 'utf8'))
  const planBProject = JSON.parse(await fs.readFile(path.join(snapshotRoot, 'planBProject', 'editorV6.json'), 'utf8'))
  if (shortProject.id !== projectIds.failureReproduction || shortProject.title?.trim() !== 'Editor V6 01' || shortProject.timeline?.durationFrames !== 519) {
    throw new Error('O projeto de reprodução de 17,3 segundos não corresponde à cópia curta esperada.')
  }
  if (planBProject.id !== projectIds.planB || !planBProject.title?.includes('Plano B') || planBProject.timeline?.durationFrames !== 10800) {
    throw new Error('O projeto Plano B precisa continuar com exatamente 6 minutos a 30 fps.')
  }
  const motionCache = path.join(snapshotRoot, 'motion-cache-empty')
  await fs.mkdir(motionCache, { recursive: true })
  const preferenceRoot = path.join(root, 'out', 'editor-v6-stress', 'preferences')
  await fs.mkdir(preferenceRoot, { recursive: true })
  const presetFile = path.join(preferenceRoot, `plan-b-${path.basename(snapshotRoot)}-preset-2.json`)
  await fs.writeFile(presetFile, JSON.stringify({ slot: 2, preset: defaultHairPreset }, null, 2), { flag: 'wx' })
  await fs.writeFile(path.join(snapshotRoot, 'snapshot-manifest.json'), JSON.stringify({
    schemaVersion: 1, capturedAt: new Date().toISOString(), sourceMode: 'read-only isolated Plano B app-data',
    projects: [
      { title: shortProject.title, frames: shortProject.timeline.durationFrames, sha256: crypto.createHash('sha256').update(JSON.stringify(before.failureReproductionProject)).digest('hex') },
      { title: planBProject.title, frames: planBProject.timeline.durationFrames, sha256: crypto.createHash('sha256').update(JSON.stringify(before.planBProject)).digest('hex') }
    ], inventory: Object.fromEntries(Object.entries(copied).map(([key, files]) => [key, { files: files.length, bytes: files.reduce((sum, item) => sum + item.size, 0), sha256: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') }]))
  }, null, 2), { flag: 'wx' })
  return { projectIds, projectTitles: { failureReproduction: shortProject.title, planB: planBProject.title }, presetFile, motionCache }
}

function assertBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || result.stdout.trim() !== 'codex/editor-v6-plano-b') throw new Error('O laboratório só roda na branch codex/editor-v6-plano-b.')
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (dirty.status !== 0) throw new Error('Não foi possível verificar o estado local do checkout.')
  return { branch: result.stdout.trim(), existingChangesPreserved: dirty.stdout.trim().length > 0 }
}

async function verifyTools() {
  const original = path.join(root, 'resources', 'video-tools')
  const alternative = path.join(root, 'out', 'editor-v6-stress', 'tools', 'ffmpeg-n9.0.2-lgpl', 'unpacked', 'ffmpeg-n9.0.2-57-gd838f9f9ae-win64-lgpl-9.0', 'bin')
  const versions = {}
  for (const [name, folder] of [['bundled-8.1', original], ['comparison-9.0.2-pinned', alternative]]) {
    const ffmpeg = path.join(folder, 'ffmpeg.exe')
    const ffprobe = path.join(folder, 'ffprobe.exe')
    await Promise.all([fs.access(ffmpeg), fs.access(ffprobe)])
    const version = await runCapture(ffmpeg, ['-hide_banner', '-version'], { maxBytes: 64 * 1024 })
    const encoders = await runCapture(ffmpeg, ['-hide_banner', '-encoders'], { maxBytes: 1024 * 1024 })
    if (version.code !== 0 || encoders.code !== 0) throw new Error(`Não foi possível executar a build FFmpeg ${name}.`)
    const text = encoders.stdout.toString('utf8')
    versions[name] = {
      ffmpegPath: ffmpeg, ffprobePath: ffprobe, version: version.stdout.toString('utf8').split(/\r?\n/)[0],
      encoders: { libopenh264: /\blibopenh264\b/.test(text), h264_amf: /\bh264_amf\b/.test(text), h264_mf: /\bh264_mf\b/.test(text) }
    }
    if (!versions[name].encoders.libopenh264 || !versions[name].encoders.h264_amf) throw new Error(`Build ${name} não oferece os dois encoders necessários para uma comparação justa.`)
  }
  return { versions, alternativeSha256: await hashFile(path.join(alternative, 'ffmpeg.exe')) }
}

function collectMachineInfo() {
  const machine = {
    platform: process.platform, arch: process.arch, osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null, logicalProcessors: os.cpus().length,
    totalMemoryBytes: os.totalmem()
  }
  const script = "$ErrorActionPreference='Stop'; $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors; $gpu=Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM; $os=Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber; [pscustomobject]@{cpu=$cpu;gpu=@($gpu);os=$os}|ConvertTo-Json -Compress -Depth 4"
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (result.status === 0) {
    try { machine.windows = JSON.parse(result.stdout) }
    catch { machine.windowsProbeError = 'PowerShell CIM retornou JSON inválido.' }
  } else machine.windowsProbeError = result.error?.message ?? result.stderr?.trim() ?? `PowerShell encerrou com ${result.status}.`
  return machine
}

async function runWpr(args) {
  const result = await runCapture('wpr.exe', args, { maxBytes: 128 * 1024 })
  return { ok: result.code === 0, code: result.code, message: result.stdout.toString('utf8').trim() || result.stderr.trim() }
}

async function launchBenchmark({ label, projectFolder, projectId, snapshotRoot, outputFolder, encoder, toolsPath }) {
  const args = [
    path.join(root, 'scripts', 'editor-v6', 'benchmark-project-export.cjs'),
    `--project=${projectFolder}`, `--library=${path.join(snapshotRoot, 'library')}`,
    `--characters=${path.join(snapshotRoot, 'characters', 'characters.json')}`, `--fabricator=${path.join(snapshotRoot, 'fabricator')}`,
    `--motion-cache=${path.join(snapshotRoot, 'motion-cache-empty')}`, `--output=${outputFolder}`,
    `--encoder=${encoder}`, '--ui-export-profile', '--hair-preset-slot=2',
    `--hair-preset-file=${path.join(root, 'out', 'editor-v6-stress', 'preferences', `plan-b-${path.basename(snapshotRoot)}-preset-2.json`)}`,
    '--motion-bake-concurrency=2', '--repeat=1', '--disable-mouth-animation', '--capture-pixel-hashes', '--retain-quality-artifacts',
    ...(projectId === projectIds.failureReproduction ? ['--full-timeline'] : ['--duration-seconds=20'])
  ]
  if (toolsPath) args.push(`--video-tools=${toolsPath}`)
  const env = { ...process.env, GACHA_EDITOR_V6_STRESS_MOUTH_LOOP: '0', GACHA_EDITOR_V6_STRESS_RUN_LABEL: label }
  const output = await runCapture(process.execPath, args, { env, maxBytes: 4 * 1024 * 1024 })
  await fs.mkdir(outputFolder, { recursive: true })
  await fs.writeFile(path.join(outputFolder, 'benchmark-console.log'), output.stdout)
  await fs.writeFile(path.join(outputFolder, 'benchmark-console.err.log'), output.stderr)
  const validationPath = path.join(outputFolder, 'stress-export-validation.json')
  const validation = await fs.readFile(validationPath, 'utf8').then(JSON.parse).catch(() => null)
  const mp4Name = (await fs.readdir(outputFolder)).find(name => name.toLowerCase().endsWith('.mp4'))
  return {
    label, projectIdHash: crypto.createHash('sha256').update(projectId).digest('hex'), encoder,
    exitCode: output.code, error: output.code === 0 ? null : output.stderr.slice(-1800),
    outputFolder, validation,
    videoPath: mp4Name ? path.join(outputFolder, mp4Name) : null,
    reportFiles: await fs.readdir(path.join(outputFolder, 'failure-reports')).catch(() => [])
  }
}

async function probe(ffprobePath, videoPath) {
  const result = await runCapture(ffprobePath, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', videoPath], { maxBytes: 4 * 1024 * 1024 })
  if (result.code !== 0) throw new Error(result.stderr || 'ffprobe falhou.')
  return JSON.parse(result.stdout.toString('utf8'))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function readFailureReports(runFolder) {
  const folder = path.join(runFolder, 'failure-reports')
  const entries = await fs.readdir(folder).catch(() => [])
  const reports = []
  for (const name of entries.filter(name => name.endsWith('.report.json'))) {
    const report = await fs.readFile(path.join(folder, name), 'utf8').then(JSON.parse).catch(() => null)
    if (!report) continue
    reports.push({
      startedAt: report.startedAt, state: report.state, encoder: report.options?.encoder,
      selectedEncoders: (report.attempts ?? []).map(attempt => attempt.encoder), phase: report.currentPhase,
      error: String(report.error ?? '').slice(0, 1800), phaseMilliseconds: report.phaseMilliseconds,
      hairPreparationMilliseconds: report.hairPreparation?.totalMilliseconds,
      motionPreparationMilliseconds: report.motionPreparation?.milliseconds,
      mainProcessPeakRssBytes: report.mainProcessMemory?.peakRssBytes,
      electronPeakWorkingSetBytes: report.electronProcessMemory?.peakTotalWorkingSetBytes,
      electronPeakPrivateBytes: report.electronProcessMemory?.peakTotalPrivateBytes,
      transitionsRequired: report.motionTransitionsRequired,
      transitionsPrepared: report.motionTransitionsPrepared,
      parts: (report.attempts ?? []).flatMap(attempt => (attempt.parts ?? []).map(part => ({
        index: part.index, startFrame: part.startFrame, endFrame: part.endFrame, rendered: part.rendered,
        encoder: part.encoder, error: part.error, processExitCode: part.processExitCode
      })))
    })
  }
  return reports
}

async function runSuite() {
  const git = assertBranch()
  const smoke = process.argv.includes('--smoke')
  const tools = await verifyTools()
  const runId = `plan-b-export-lab-${nowId()}`
  const backupRoot = path.join(root, 'out', 'editor-v6-stress', 'backups', runId)
  const suiteRoot = path.join(root, 'out', 'editor-v6-stress', 'runs', runId)
  await fs.mkdir(path.dirname(backupRoot), { recursive: true })
  await fs.mkdir(path.dirname(suiteRoot), { recursive: true })
  await fs.mkdir(backupRoot, { recursive: false })
  await fs.mkdir(suiteRoot, { recursive: false })
  const snapshot = await prepareSnapshot(backupRoot)
  const snapshotInfo = JSON.parse(await fs.readFile(path.join(backupRoot, 'snapshot-manifest.json'), 'utf8'))
  const traces = []
  const results = []
  const projectRuns = smoke ? [
    { key: 'failureReproduction', id: projectIds.failureReproduction, folder: path.join(backupRoot, 'failureReproductionProject'), frames: 519, rounds: 1 }
  ] : [
    { key: 'failureReproduction', id: projectIds.failureReproduction, folder: path.join(backupRoot, 'failureReproductionProject'), frames: 519, rounds: 3 },
    { key: 'planB', id: projectIds.planB, folder: path.join(backupRoot, 'planBProject'), frames: 600, rounds: 1 }
  ]
  const modes = smoke ? [
    { id: 'bundled-8.1', toolsPath: null }
  ] : [
    { id: 'bundled-8.1', toolsPath: null },
    { id: 'comparison-9.0.2-pinned', toolsPath: path.join(root, 'out', 'editor-v6-stress', 'tools', 'ffmpeg-n9.0.2-lgpl', 'unpacked', 'ffmpeg-n9.0.2-57-gd838f9f9ae-win64-lgpl-9.0', 'bin') }
  ]
  const comparisonToolsPath = modes[1]?.toolsPath ?? modes[0].toolsPath ?? path.join(root, 'resources', 'video-tools')
  for (const project of projectRuns) {
    for (const tool of modes) {
      for (const encoder of ['cpu', 'amf']) {
        const shouldTrace = project.key === 'failureReproduction'
        const wprStatus = shouldTrace ? await runWpr(['-status']) : { ok: false, message: 'Trace reservado para a reprodução curta.' }
        const tracePath = path.join(suiteRoot, `${project.key}-${tool.id}-${encoder}.etl`)
        const traceStart = shouldTrace && !/recording is in progress|gravação está em andamento/i.test(wprStatus.message)
          ? await runWpr(['-start', 'GeneralProfile', '-start', 'GPU', '-filemode'])
          : { ok: false, message: shouldTrace ? 'WPR já tinha gravação ativa; não foi interrompida.' : 'Trace não solicitado.' }
        if (shouldTrace) traces.push({ project: project.key, tool: tool.id, encoder, path: tracePath, start: traceStart })
        for (let round = 1; round <= project.rounds; round++) {
          const label = `${project.key}-${tool.id}-${encoder}-${round}`
          if (traceStart.ok) await runWpr(['-marker', `V6LAB|${label}`]).catch(() => undefined)
          const outputFolder = path.join(suiteRoot, label)
          const run = await launchBenchmark({
            label, projectFolder: project.folder, projectId: project.id, snapshotRoot: backupRoot,
            outputFolder, encoder, toolsPath: tool.toolsPath
          })
          run.toolchain = tool.id
          run.project = project.key
          run.round = round
          run.failures = run.exitCode === 0 ? [] : await readFailureReports(outputFolder)
          if (run.videoPath) {
            const selectedProbe = await probe(tool.toolsPath ? path.join(tool.toolsPath, 'ffprobe.exe') : path.join(root, 'resources', 'video-tools', 'ffprobe.exe'), run.videoPath).catch(error => ({ error: error.message }))
            const independentProbe = await probe(path.join(comparisonToolsPath, 'ffprobe.exe'), run.videoPath).catch(error => ({ error: error.message }))
            run.ffprobe = { selectedBuild: selectedProbe, independent9_0Build: independentProbe }
            const quality = await runCapture(process.execPath, [path.join(root, 'scripts', 'editor-v6', 'compare-planb-quality.cjs'), outputFolder, run.videoPath, path.join(comparisonToolsPath, 'ffmpeg.exe'), '1920', '1080'], { maxBytes: 1024 * 1024 })
            run.quality = quality.code === 0 ? JSON.parse(quality.stdout.toString('utf8')) : { error: quality.stderr.trim() }
          }
          results.push(run)
          const validationRun = run.validation?.runs?.[0]
          const exportWallMs = validationRun?.mainExportWallMs ?? validationRun?.clickToValidatedWallMs ?? validationRun?.exportWallMs
          process.stdout.write(`[Plano B lab] ${label}: ${run.exitCode === 0 ? 'completo' : 'falhou'}${Number.isFinite(exportWallMs) ? ` · ${(exportWallMs / 1000).toFixed(1)}s` : ''}\n`)
        }
        if (traceStart.ok) {
          const traceStop = await runWpr(['-stop', tracePath, `Editor V6 Plano B ${project.key} ${tool.id} ${encoder}`, '-compress'])
          const traceRecord = traces.find(item => item.project === project.key && item.tool === tool.id && item.encoder === encoder)
          if (traceRecord) traceRecord.stop = traceStop
        }
      }
    }
  }
  const summary = {
    schemaVersion: 1, runId, createdAt: new Date().toISOString(), git,
    project: snapshot.projectTitles,
    snapshot: { path: backupRoot, projects: snapshotInfo.projects, inventory: snapshotInfo.inventory, hairPreset: 'FIRST_HAIR_MOTION_PRESET shipped by the app, assigned to slot 2; same preset snapshot for every encoder/build.' },
    machine: collectMachineInfo(), toolchains: tools, wpr: { executable: spawnSync('where.exe', ['wpr.exe'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? null, traces },
    methodology: { mode: smoke ? 'smoke' : 'full', failureProjectRounds: smoke ? 1 : 3, encoders: ['cpu', 'amf'], ffmpegBuilds: modes.map(tool => tool.id), profile: '1920x1080, Turbo strict, mouth animation disabled, hair preset slot 2, 30fps', fullFailureProjectFrames: 519, planBSampleFrames: smoke ? null : 600, wprScope: 'GeneralProfile + GPU, per encoder/build group' },
    groups: [...new Set(results.map(item => JSON.stringify([item.project, item.toolchain, item.encoder])))].map(key => {
      const [project, toolchain, encoder] = JSON.parse(key)
      const selected = results.filter(item => item.project === project && item.toolchain === toolchain && item.encoder === encoder)
      const times = selected.map(item => {
        const run = item.validation?.runs?.[0]
        return run?.mainExportWallMs ?? run?.clickToValidatedWallMs ?? run?.exportWallMs
      })
      const workingSetPeaks = selected.flatMap(item => item.validation?.runs?.[0]?.processPeaks ?? []).map(item => item.peakWorkingSetBytes)
      const privatePeaks = selected.flatMap(item => item.validation?.runs?.[0]?.processPeaks ?? []).map(item => item.peakPrivateBytes)
      const psnr = selected.flatMap(item => item.quality?.frames ?? []).map(item => item.psnrRgbDb)
      const ssim = selected.flatMap(item => item.quality?.frames ?? []).map(item => item.ssimLuma8x8)
      return { project, toolchain, encoder, runs: selected.length, completed: selected.filter(item => item.exitCode === 0).length,
        medianExportWallMs: median(times), maxProcessWorkingSetBytes: workingSetPeaks.length ? Math.max(...workingSetPeaks) : null,
        maxProcessPrivateBytes: privatePeaks.length ? Math.max(...privatePeaks) : null,
        medianPsnrRgbDb: median(psnr), medianSsimLuma8x8: median(ssim) }
    }),
    results
  }
  const summaryPath = path.join(suiteRoot, 'suite-report.json')
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), { flag: 'wx' })
  const successful = results.filter(item => item.exitCode === 0).length
  process.stdout.write(`[Plano B lab] concluído: ${successful}/${results.length} exports válidos. Relatório: ${summaryPath}\n`)
  return { summaryPath, successful, total: results.length }
}

if (require.main === module) runSuite().catch(error => {
  process.stderr.write(`[Plano B lab] ${error.stack || error.message}\n`)
  process.exitCode = 1
})

module.exports = { runSuite, inventory, compareBranch: assertBranch }
