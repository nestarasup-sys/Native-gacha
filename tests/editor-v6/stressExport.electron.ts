import { app, ipcMain, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { editorV6MotionPlans, missingEditorV6Motions } from '../../src/shared/editorV6Motion'
import { editorV6ElementSize } from '../../src/shared/editorV6SceneModel'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { forEachDecodedFrameBatch } from '../../scripts/editor-v6/stressFrameSamples'
import type { EditorV6Asset } from '../../src/shared/editorV6'

const root = resolve(process.argv[2]), projectFolder = resolve(process.argv[3]), outputFolder = resolve(process.argv[4])
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs') as { resolveEditorV6TestVideoToolsDirectory: (root: string) => string }
type WindowsProcessRow = { pid: number; role: string; name: string; workingSetBytes: number; privateBytes: number; cpuSeconds: number | null; cpuPercentSincePreviousSample: number | null }
const { createWindowsProcessSampler } = require('../../scripts/editor-v6/windowsProcessSampler.cjs') as { createWindowsProcessSampler: (scriptPath: string) => { sample: (processes: Array<{ pid: number; role: string }>, frame: number) => Promise<{ sampledAt: string; frame: number; processes: WindowsProcessRow[] }>; close: () => Promise<void> } }
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
const ffmpeg = join(videoTools, 'ffmpeg.exe'), ffprobe = join(videoTools, 'ffprobe.exe')
const assetFolder = (category: EditorV6Asset['category']) => category === 'background' ? 'backgrounds' : category === 'character' ? 'characters' : 'objects'
function integerOption(name: string, fallback: number) {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < 1) throw Error(`--${name} precisa ser um inteiro positivo.`)
  return value
}

function projectWithActorCount(project: ReturnType<typeof editorV6DocumentSchema.parse>, count: number) {
  if (count < 1 || count > 8) throw Error('--actor-count aceita de 1 a 8 personagens.')
  const tracks = project.timeline.tracks
  const characterTracks = tracks.filter((track) => track.kind === 'character')
  if (!characterTracks.length) throw Error('O projeto sintético não contém personagens para o perfil de memória.')
  if (count <= characterTracks.length) {
    const selected = characterTracks.slice(0, count)
    const retainedElementIds = new Set(selected.flatMap((track) => track.blocks.flatMap((block) => block.elementId ? [block.elementId] : [])))
    const nonCharacterIds = project.elements.filter((element) => element.kind !== 'character').map((element) => element.id)
    return editorV6DocumentSchema.parse({
      ...project,
      elements: project.elements.filter((element) => element.kind !== 'character' || retainedElementIds.has(element.id)),
      timeline: { ...project.timeline, tracks: tracks.filter((track) => track.kind !== 'character' || selected.includes(track)), knownElementIds: [...retainedElementIds, ...nonCharacterIds] }
    })
  }
  const elements = [...project.elements]
  const clonedTracks = [...characterTracks]
  for (let index = characterTracks.length; index < count; index++) {
    const source = characterTracks[index % characterTracks.length]
    const sourceElement = elements.find((element) => element.id === source.blocks[0]?.elementId)
    if (!sourceElement) throw Error(`Não foi possível duplicar o personagem sintético ${source.name}.`)
    const elementId = randomUUID(), characterId = `stress-copy-${randomUUID()}`
    const shift = (index - characterTracks.length + 1) * (index % 2 ? -5 : 5)
    elements.push({ ...sourceElement, id: elementId, characterId, text: `${sourceElement.text} · cópia ${index + 1}`, x: sourceElement.x + shift })
    const blocks = source.blocks.map((block) => {
      const { incomingMotion: _motion, ...copy } = block
      return {
        ...copy,
        id: randomUUID(), elementId, characterId, motionEnabled: false,
        ...(block.state ? { state: { ...block.state, id: elementId, characterId, text: `${block.state.text} · cópia ${index + 1}`, x: block.state.x + shift } } : {})
      }
    })
    clonedTracks.push({ ...source, id: randomUUID(), characterId, name: `${source.name} · cópia ${index + 1}`, motionEnabled: false, blocks })
  }
  const knownElementIds = [...new Set([...(project.timeline.knownElementIds ?? []), ...elements.slice(project.elements.length).map((element) => element.id)])]
  return editorV6DocumentSchema.parse({ ...project, elements, timeline: { ...project.timeline, tracks: [...tracks.filter((track) => track.kind !== 'character'), ...clonedTracks], knownElementIds } })
}
protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
app.setPath('userData', join(outputFolder, 'stress-export-profile'))
app.on('window-all-closed', () => {})

async function main() {
  await app.whenReady()
  await mkdir(outputFolder, { recursive: true })
  const stored = JSON.parse(await readFile(join(projectFolder, 'editorV6.json'), 'utf8'))
  const assets = await Promise.all((stored.assets as EditorV6Asset[]).map(async (asset) => {
    const bytes = await readFile(join(projectFolder, 'assets', assetFolder(asset.category), `${asset.id}.png`))
    return { ...asset, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
  }))
  const sourceProject = projectWithActorCount(editorV6DocumentSchema.parse({ ...stored, assets }), integerOption('actor-count', 4))
  const project = editorV6DocumentSchema.parse({
    ...sourceProject,
    exportAudio: [],
    timeline: {
      ...sourceProject.timeline,
      tracks: sourceProject.timeline.tracks.filter((track) => track.kind !== 'audio').map((track) => track.kind === 'video'
        ? { ...track, blocks: track.blocks.map((block) => block.mediaId ? { ...block, audioEnabled: false } : block) }
        : track)
    }
  })
  const plans = editorV6MotionPlans(project)
  const missing = missingEditorV6Motions(project)
  if (missing.length) throw Error(`O projeto de estresse não tem ${missing.length} atlas de transição persistidos.`)
  const mediaEndFrame = Math.max(0, ...project.timeline.tracks.filter((track) => track.kind === 'video').flatMap((track) => track.blocks.filter((block) => block.mediaId).map((block) => block.startFrame + block.durationFrames)))
  const nonCharacterBoundaries = project.timeline.tracks.filter((track) => track.kind !== 'character' && track.kind !== 'audio').flatMap((track) => track.blocks.flatMap((block) => [block.startFrame, block.startFrame + block.durationFrames]))
  const visibleMotionPlans = plans.filter((plan) => {
    const samples = plan.samples.map((sample) => plan.endFrame + sample.offset)
    const first = samples[0], last = samples.at(-1)
    return samples.length >= 2 && first >= mediaEndFrame && !nonCharacterBoundaries.some((frame) => frame > first && frame <= last)
  })
  if (!process.argv.includes('--memory-profile') && visibleMotionPlans.length < 20) throw Error(`Poucas transições estão isoladas o bastante para validar os quadros exportados (${visibleMotionPlans.length}).`)
  const sampleFrames = [...new Set(visibleMotionPlans.flatMap((plan) => {
    const first = plan.samples[0], last = plan.samples.at(-1)
    return [plan.endFrame + first.offset, plan.endFrame + last.offset]
  }))].sort((a, b) => a - b)

  const processSampler = createWindowsProcessSampler(join(root, 'scripts/editor-v6/windows-process-sampler.ps1'))
  const ffmpegPids = new Set<number>()
  const exportRendererPids = new Set<number>()
  const exportWindows = new Map<number, Electron.BrowserWindow>()
  const processMemorySamples: Array<{ sampledAt: string; frame: number; mainNodeMemory: NodeJS.MemoryUsage; electronProcesses: Array<{ pid: number; type: string; workingSetBytes: number | null; privateBytes: number | null; cpuPercentSincePreviousSample: number | null }>; rendererHeap: unknown; operatingSystemProcesses: WindowsProcessRow[] }> = []
  const processSamplingErrors: string[] = []
  let lastObservedFrame = 0, sampleInFlight = false
  const sampleProcessMemory = async (frame: number) => {
    if (sampleInFlight) return
    sampleInFlight = true
    try {
      const metrics = app.getAppMetrics()
      const describe = (metric: Electron.ProcessMetric) => ({
        pid: metric.pid,
        type: metric.type,
        workingSetBytes: Number.isFinite(metric.memory?.workingSetSize) ? Math.round(metric.memory.workingSetSize * 1024) : null,
        privateBytes: Number.isFinite(metric.memory?.privateBytes) ? Math.round(metric.memory.privateBytes * 1024) : null,
        cpuPercentSincePreviousSample: Number.isFinite(metric.cpu?.percentCPUUsage) ? metric.cpu.percentCPUUsage : null
      })
      const electronProcesses = metrics.map(describe)
      const processes = new Map<number, string>()
      for (const metric of metrics) processes.set(metric.pid, metric.pid === process.pid ? 'main' : exportRendererPids.has(metric.pid) ? 'exportRenderer' : /gpu/i.test(metric.type) ? 'gpu' : `electron:${metric.type}`)
      for (const pid of ffmpegPids) processes.set(pid, 'ffmpeg')
      const renderer = [...exportWindows.entries()].find(([, window]) => !window.isDestroyed())
      const rendererHeap = renderer ? await renderer[1].webContents.executeJavaScript(`(() => { const memory = performance.memory; return memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null })()`).catch(() => null) : null
      const system = await processSampler.sample([...processes].map(([pid, role]) => ({ pid, role })), frame)
      processMemorySamples.push({ sampledAt: system.sampledAt, frame, mainNodeMemory: process.memoryUsage(), electronProcesses, rendererHeap, operatingSystemProcesses: system.processes })
    } finally { sampleInFlight = false }
  }

  const factory = createEditorV6WorkerFactory({
    ipcMain,
    html: join(root, 'out/renderer/editor-v6-export.html'),
    preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName, libraryVideoId) => join(projectFolder, libraryVideoId ? 'library' : 'media', fileName),
    inspectCapture: async ({ window, frame }) => {
      const rendererPid = window.webContents.getOSProcessId()
      exportRendererPids.add(rendererPid)
      exportWindows.set(rendererPid, window)
      lastObservedFrame = Math.max(lastObservedFrame, frame)
      if (processMemorySamples.length === 0) await sampleProcessMemory(frame)
    }
  })
  const turbo = process.env.GACHA_EDITOR_V6_STRESS_TURBO !== 'off'
  const comparisonModes = process.argv.includes('--compare-workers') ? [false, true, true, false, false, true] : [turbo]
  const width = integerOption('width', 320), height = integerOption('height', 180)
  if (width > 1920 || height > 1080) throw Error('O perfil sintético está limitado à saída 1920×1080.')
  const runSummaries: Array<{ run: number; parallelism: number; milliseconds: number; realTimeFactor: number; renderingMilliseconds: number; finalizationMilliseconds: number; rssStartBytes: number; rssPeakBytes: number; visibleTransitions: number; minimumChangedPixels: number; frameTiming: Array<{ parallelism: number; part: number; frameTiming: unknown }> }> = []
  let finalOutputPath = ''
  let finalReportPath = ''
  const processSamplerTimer = setInterval(() => { void sampleProcessMemory(lastObservedFrame).catch((error) => processSamplingErrors.push(String(error))) }, 2000)
  try {
    for (const [index, runTurbo] of comparisonModes.entries()) {
      const runSuffix = comparisonModes.length > 1 ? `-run-${index + 1}-workers-${runTurbo ? 2 : 1}` : ''
      const outputPath = join(outputFolder, `stress-${project.timeline.durationFrames / 30}s-${width}x${height}-silent${runSuffix}.mp4`)
      const reportPath = join(outputFolder, `stress-${project.timeline.durationFrames / 30}s-${width}x${height}-silent${runSuffix}.report.json`)
      finalOutputPath = outputPath; finalReportPath = reportPath
      console.log(`[V6 stress export] Rodada ${index + 1}/${comparisonModes.length}: ${runTurbo ? 'dois' : 'um'} worker(s), ${project.timeline.durationFrames} quadros, ${plans.length} transições.`)
      const report = await runEditorV6Export(project, {
        startFrame: 0, endFrame: project.timeline.durationFrames, width, height, turbo: runTurbo, encoder: 'cpu'
      }, {
        ffmpeg, ffprobe, tempRoot: join(outputFolder, 'temp'), id: randomUUID(), outputPath, reportPath,
        signal: new AbortController().signal,
        getCharacters: async () => [],
        onFfmpegProcessStarted: (pid) => { ffmpegPids.add(pid) },
        bakeMotion: async () => { throw Error('O fixture não deveria precisar gerar atlases de movimento.') },
        createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({ project: renderProject, width, height, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}) }, signal),
        audioPath: (_clip) => join(projectFolder, 'media', _clip.fileName),
        mediaPath: (_projectId, fileName, libraryVideoId) => join(projectFolder, libraryVideoId ? 'library' : 'media', fileName),
        progress: (patch) => { if (patch.message) console.log(`[V6 stress export] ${patch.message}`) }
      })
      const expectedParallelism = runTurbo ? 2 : 1
      if (report.state !== 'completed' || report.totalFrames !== project.timeline.durationFrames || report.motionTransitionsRequired !== 0 || report.motionTransitionsPrepared !== 0 || report.attempts[0]?.parallelism !== expectedParallelism) throw Error(`A exportação terminou com dados inesperados: ${JSON.stringify({ state: report.state, frames: report.totalFrames, transitionsRequired: report.motionTransitionsRequired, transitionsPrepared: report.motionTransitionsPrepared, parallelism: report.attempts[0]?.parallelism })}`)
      const probe = report.validation as { streams?: Array<{ codec_type: string; nb_read_frames?: string | number; nb_read_packets?: string | number; has_b_frames?: number; r_frame_rate?: string; duration?: string }>; format?: { duration?: string } }
      const video = probe.streams?.find((stream) => stream.codec_type === 'video')
      const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
      const validatedVideoFrames = video?.nb_read_frames ?? (Number(video?.has_b_frames ?? 0) === 0 ? video?.nb_read_packets : undefined)
      if (Number(validatedVideoFrames) !== project.timeline.durationFrames || video?.r_frame_rate !== '30/1' || audio || report.audioClips !== 0) throw Error('A exportação silenciosa perdeu quadros, taxa de quadros ou incluiu uma faixa de áudio.')

      const frameBytes = width * height * 3
      const motionChecks = visibleMotionPlans.map((plan) => {
        const first = plan.endFrame + plan.samples[0].offset, last = plan.endFrame + plan.samples.at(-1)!.offset
        const bounds = [plan.from, plan.to].map((element) => {
          const size = editorV6ElementSize(element)
          return {
            left: (50 + element.x) * width / 100 - size.width * width / 200,
            right: (50 + element.x) * width / 100 + size.width * width / 200,
            top: (50 + element.y) * height / 100 - size.height * height / 200,
            bottom: (50 + element.y) * height / 100 + size.height * height / 200
          }
        })
        const left = Math.max(0, Math.floor(Math.min(...bounds.map((item) => item.left)) - 4))
        const right = Math.min(width, Math.ceil(Math.max(...bounds.map((item) => item.right)) + 4))
        const bodyTop = Math.min(...bounds.map((item) => item.top + (item.bottom - item.top) * .3))
        const top = Math.max(0, Math.floor(bodyTop - 4))
        const bottom = Math.min(height, Math.ceil(Math.max(...bounds.map((item) => item.bottom)) + 4))
        return { plan, first, last, bounds: { left, top, width: right - left, height: bottom - top } }
      })
      const motionResultsById = new Map<string, { blockId: string; characterId: string; firstFrame: number; lastFrame: number; changedPixels: number; visible: boolean }>()
      const pendingFirstPatches = new Map<string, Buffer>()
      const cropPatch = (frame: Uint8Array, bounds: { left: number; top: number; width: number; height: number }) => {
        const patch = Buffer.allocUnsafe(bounds.width * bounds.height * 3)
        for (let y = 0; y < bounds.height; y++) {
          const sourceStart = ((bounds.top + y) * width + bounds.left) * 3
          patch.set(frame.subarray(sourceStart, sourceStart + bounds.width * 3), y * bounds.width * 3)
        }
        return patch
      }
      const comparePixels = (first: Uint8Array, last: Uint8Array, bounds: { left: number; top: number; width: number; height: number }, firstIsCrop: boolean) => {
        let changedPixels = 0
        for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
          const firstOffset = firstIsCrop ? (y * bounds.width + x) * 3 : ((bounds.top + y) * width + bounds.left + x) * 3
          const lastOffset = ((bounds.top + y) * width + bounds.left + x) * 3
          const delta = Math.abs(first[firstOffset] - last[lastOffset]) + Math.abs(first[firstOffset + 1] - last[lastOffset + 1]) + Math.abs(first[firstOffset + 2] - last[lastOffset + 2])
          if (delta > 50) changedPixels++
        }
        return changedPixels
      }
      forEachDecodedFrameBatch(sampleFrames, frameBytes, (batch) => {
        const expression = `select='${batch.map((frame) => `eq(n,${frame})`).join('+')}'`
        return execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', expression, '-fps_mode', 'passthrough', '-frames:v', String(batch.length), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: Math.max(16, Math.ceil(frameBytes * batch.length / 1024 ** 2) + 2) * 1024 ** 2 })
      }, (batch, decoded) => {
        const frameIndices = new Map(batch.map((frame, index) => [frame, index]))
        for (const check of motionChecks) {
          if (motionResultsById.has(check.plan.blockId)) continue
          const firstIndex = frameIndices.get(check.first), lastIndex = frameIndices.get(check.last)
          if (firstIndex === undefined && lastIndex === undefined) continue
          const firstFrame = firstIndex === undefined ? pendingFirstPatches.get(check.plan.blockId) : decoded.subarray(firstIndex * frameBytes, (firstIndex + 1) * frameBytes)
          if (firstIndex !== undefined && lastIndex === undefined) {
            pendingFirstPatches.set(check.plan.blockId, cropPatch(firstFrame!, check.bounds))
            continue
          }
          if (!firstFrame || lastIndex === undefined) throw Error(`A amostra RGBA da transição ${check.plan.blockId} ficou incompleta.`)
          const lastFrame = decoded.subarray(lastIndex * frameBytes, (lastIndex + 1) * frameBytes)
          const changedPixels = comparePixels(firstFrame, lastFrame, check.bounds, firstIndex === undefined)
          pendingFirstPatches.delete(check.plan.blockId)
          motionResultsById.set(check.plan.blockId, { blockId: check.plan.blockId, characterId: check.plan.characterId, firstFrame: check.first, lastFrame: check.last, changedPixels, visible: changedPixels >= 12 })
        }
      })
      const motionResults = motionChecks.map((check) => {
        const result = motionResultsById.get(check.plan.blockId)
        if (!result) throw Error(`A transição ${check.plan.blockId} não foi comparada nos quadros RGBA selecionados.`)
        return result
      })
      const invisible = motionResults.filter((result) => !result.visible)
      if (invisible.length) throw Error(`${invisible.length} transições não alteraram pixels suficientes do personagem no MP4 decodificado: ${JSON.stringify(invisible.slice(0, 8))}`)
      const rss = report.mainProcessMemory!
      for (const sample of processMemorySamples) {
        for (const metric of sample.electronProcesses as Array<{ pid: number; type: string }>) if (/renderer/i.test(metric.type)) exportRendererPids.add(metric.pid)
      }
      runSummaries.push({ run: index + 1, parallelism: expectedParallelism, milliseconds: report.milliseconds!, realTimeFactor: Number((report.milliseconds! / (project.timeline.durationFrames / 30 * 1000)).toFixed(3)), renderingMilliseconds: report.phaseMilliseconds.rendering, finalizationMilliseconds: report.phaseMilliseconds.finalization, rssStartBytes: rss.startRssBytes, rssPeakBytes: rss.peakRssBytes, visibleTransitions: motionResults.length, minimumChangedPixels: motionResults.length ? Math.min(...motionResults.map((result) => result.changedPixels)) : 0, frameTiming: report.attempts.flatMap((attempt) => attempt.parts.map((part) => ({ parallelism: attempt.parallelism, part: part.index, frameTiming: part.frameTiming ?? {} }))) })
    }
    const idleSampleSeconds = integerOption('idle-sample-seconds', 0)
    if (idleSampleSeconds > 120) throw Error('--idle-sample-seconds está limitado a 120 segundos.')
    const idleSampleStartIndex = processMemorySamples.length
    if (idleSampleSeconds > 0) await new Promise((resolve) => setTimeout(resolve, idleSampleSeconds * 1000))
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (processSamplingErrors.length) throw Error(`A coleta de métricas de processo falhou: ${processSamplingErrors.join('; ')}`)
    const afterExport = await processSampler.sample([
      ...[...exportRendererPids].map((pid) => ({ pid, role: 'exportRenderer' })),
      ...[...ffmpegPids].map((pid) => ({ pid, role: 'ffmpeg' }))
    ], project.timeline.durationFrames)
    const summarizeProcessMemory = () => {
      const all = processMemorySamples.flatMap((sample) => sample.operatingSystemProcesses)
      return [...new Map(all.map((item) => [`${item.role}:${item.pid}`, item])).keys()].map((key) => {
        const rows = all.filter((item) => `${item.role}:${item.pid}` === key)
        const first = rows[0], last = rows.at(-1)!
        return {
          role: first.role, pid: first.pid, processName: first.name, samples: rows.length,
          firstWorkingSetBytes: first.workingSetBytes, peakWorkingSetBytes: Math.max(...rows.map((item) => item.workingSetBytes)),
          lastWorkingSetBytes: last.workingSetBytes, firstPrivateBytes: first.privateBytes,
          peakPrivateBytes: Math.max(...rows.map((item) => item.privateBytes)), lastPrivateBytes: last.privateBytes,
          maximumCpuPercentSincePreviousSample: Math.max(0, ...rows.map((item) => item.cpuPercentSincePreviousSample ?? 0))
        }
      })
    }
    const summarizeNodeMemory = (samples: typeof processMemorySamples) => {
      const metrics = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'] as const
      return Object.fromEntries(metrics.map((key) => {
        const values = samples.map((sample) => sample.mainNodeMemory[key])
        return [key, { firstBytes: values[0] ?? 0, peakBytes: Math.max(0, ...values), lastBytes: values.at(-1) ?? 0 }]
      }))
    }
    const idleSamples = processMemorySamples.slice(idleSampleStartIndex)
    const summarizeIdleProcesses = () => {
      const rows = idleSamples.flatMap((sample) => sample.operatingSystemProcesses)
      return [...new Map(rows.map((item) => [`${item.role}:${item.pid}`, item])).keys()].map((key) => {
        const samples = rows.filter((item) => `${item.role}:${item.pid}` === key)
        return { role: samples[0].role, pid: samples[0].pid, samples: samples.length, firstPrivateBytes: samples[0].privateBytes, peakPrivateBytes: Math.max(...samples.map((item) => item.privateBytes)), lastPrivateBytes: samples.at(-1)!.privateBytes, firstWorkingSetBytes: samples[0].workingSetBytes, peakWorkingSetBytes: Math.max(...samples.map((item) => item.workingSetBytes)), lastWorkingSetBytes: samples.at(-1)!.workingSetBytes }
      })
    }
    const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] }
    const variants = [1, 2].map((parallelism) => {
      const runs = runSummaries.filter((run) => run.parallelism === parallelism)
      return { parallelism, runs: runs.length, medianMilliseconds: median(runs.map((run) => run.milliseconds)), medianRenderingMilliseconds: median(runs.map((run) => run.renderingMilliseconds)), peakRssBytes: Math.max(...runs.map((run) => run.rssPeakBytes)), minimumVisibleTransitions: Math.min(...runs.map((run) => run.visibleTransitions)) }
    })
    const summary = {
      passed: true, comparison: comparisonModes.length > 1, outputPath: finalOutputPath, reportPath: finalReportPath,
      frames: project.timeline.durationFrames, durationSeconds: project.timeline.durationFrames / 30, width, height, actorCount: project.timeline.tracks.filter((track) => track.kind === 'character').length, fps: '30/1', audioClips: 0, videoInputs: 0, audioOutput: false,
      motionAtlasesPersisted: plans.length, motionTransitionsNewlyPreparedDuringExport: 0,
      decodedSampleFramesPerRun: sampleFrames.length, visibleTransitionsPerRun: visibleMotionPlans.length,
      processMemorySampling: { intervalSeconds: 2, idleSampleSeconds, samples: processMemorySamples, processSummary: summarizeProcessMemory(), mainNodeMemory: summarizeNodeMemory(processMemorySamples), idleProcessSummary: summarizeIdleProcesses(), idleMainNodeMemory: summarizeNodeMemory(idleSamples), afterExportProcessesStillAlive: afterExport.processes.map((item) => ({ pid: item.pid, role: item.role, name: item.name })), exportRendererPids: [...exportRendererPids], ffmpegPids: [...ffmpegPids] },
      frameTiming: runSummaries.flatMap((run) => run.frameTiming.map((part) => ({ run: run.run, ...part }))),
      runOrder: runSummaries.map((run) => run.parallelism), runs: runSummaries, variants
    }
    if (comparisonModes.length > 1 && (variants.some((variant) => variant.runs !== 3) || runSummaries.some((run) => run.visibleTransitions !== visibleMotionPlans.length))) throw Error('A comparação não completou três rodadas por variante com todas as transições visíveis.')
    await writeFile(join(outputFolder, 'stress-export-validation.json'), JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify(summary, null, 2))
  } finally { clearInterval(processSamplerTimer); factory.dispose(); exportWindows.clear(); await processSampler.close() }
}

const timeout = setTimeout(() => { console.error('A exportação de estresse excedeu 30 minutos.'); app.exit(1) }, 30 * 60 * 1000)
void main().then(() => { clearTimeout(timeout); app.exit(0) }, (error: unknown) => { clearTimeout(timeout); console.error('[V6 stress export] Falha:', error); app.exit(1) })
