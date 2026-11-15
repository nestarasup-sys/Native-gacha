import { app, BrowserWindow, ipcMain, protocol, type IpcMainInvokeEvent } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'
import { editorV6MotionPlans, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import type { EditorV6ExportMouthLoops, EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import { FIRST_HAIR_MOTION_PRESET } from '../../src/shared/hairMotionEngine'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FabricatorProject } from '../../src/shared/fabricator'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { createEditorV6ExportWorkerData } from '../../electron/domains/editorV6/exportWorkerPayload'
import { encodingArgs, probeExportMedia, runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import type { EditorV6ExportReport } from '../../electron/domains/editorV6/exportRunner'
import { editorV6OutputColorFilter } from '../../electron/domains/editorV6/exportVideoComposition'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, moveEditorV6ElementInPeriod, prepareEditorV6PositionAtFrame } from '../../src/shared/editorV6Timeline'
import { editorV6FaceModeAtFrame } from '../../src/shared/editorV6FaceSchedule'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs') as { resolveEditorV6TestVideoToolsDirectory: (root: string) => string }
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
app.setPath('userData', join(folder, 'profile'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})
process.on('unhandledRejection', (error) => { console.error('Rejeição não tratada no exportador:', error); app.exit(1) })
const ffmpeg = join(videoTools, 'ffmpeg.exe'), ffprobe = join(videoTools, 'ffprobe.exe')
const run = (args: string[]) => execFileSync(ffmpeg, ['-v', 'error', ...args], { windowsHide: true, maxBuffer: 16 * 1024 ** 2 })
async function main() {
  await app.whenReady()
  const colorParts = [join(folder, 'color-tagged.mp4'), join(folder, 'color-unknown.mp4')]
  for (const [index, path] of colorParts.entries()) {
    const metadata = index === 0 ? 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709' : 'setparams=range=unknown:colorspace=unknown:color_primaries=unknown:color_trc=unknown'
    run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=0.1', '-vf', `${metadata},${editorV6OutputColorFilter}`, ...encodingArgs('libopenh264', 1), '-frames:v', '3', path])
  }
  const colorProbes = await Promise.all(colorParts.map((path) => probeExportMedia(ffprobe, path, new AbortController().signal)))
  const hashes = colorProbes.map((probe) => probe.streams.find((stream) => stream.codec_type === 'video')?.extradata_hash)
  assert(hashes[0] === hashes[1], `Partes com metadados de cor diferentes produziram cabeçalhos incompatíveis: ${hashes.join(' / ')}`)
  const concatList = join(folder, 'color-parts.txt'), colorOutput = join(folder, 'color-joined.mp4')
  await writeFile(concatList, colorParts.map((path) => `file '${path.replace(/\\/g, '/')}'`).join('\n') + '\n')
  run(['-f', 'concat', '-safe', '0', '-i', concatList, '-c:v', 'copy', colorOutput])
  const decodeColor = (path: string) => run(['-i', path, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  assert(decodeColor(colorOutput).equals(Buffer.concat(colorParts.map(decodeColor))), 'A junção alterou os quadros das partes com metadados de cor diferentes.')
  const png = join(folder, 'actor.png'), audio = join(folder, 'tone.wav')
  run(['-f', 'lavfi', '-i', 'color=c=yellow:s=16x16', '-frames:v', '1', png])
  run(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', audio])
  const assetId = randomUUID(), actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
  let project: EditorV6Document = { schemaVersion: 1, id: randomUUID(), title: 'Turbo test', color: '#ffffff', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: `data:image/png;base64,${(await readFile(png)).toString('base64')}` }], elements: [actor], timeline: { ...createEditorV6Timeline([actor]), durationFrames: 91 } }
  const position = prepareEditorV6PositionAtFrame(project, actor.id, 20)!
  project = moveEditorV6ElementInPeriod(position.document, position.blockId, 25, 0)
  project = editEditorV6BackgroundAtFrame(project, 30, { backgroundColor: '#0000ff' })
  project = editEditorV6BackgroundAtFrame(project, 45, { backgroundColor: '#00ff00' })
  project.exportAudio = [{ id: randomUUID(), fileName: `${randomUUID()}.wav`, name: 'Tone', sourceFrames: 120, sourceInFrame: 5, startFrame: 10, durationFrames: 80, gain: .75, muted: false }]
  const inspected = new Set<number>()
  const inspectEveryFrame = process.env.GACHA_EXPORT_CAPTURE_DIAGNOSTICS === '1' && process.env.GACHA_EXPORT_CAPTURE_EVERY_FRAME === '1'
  let capturePageHashes: string[] | null = null
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'), mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName), nativeRendererExecutable: join(root, 'out/native/editor-v6-renderer/Release/editor-v6-native-renderer.exe'), inspectCapture: async ({ window, frame, bitmap }) => {
    capturePageHashes?.push(createHash('sha256').update(bitmap).digest('hex'))
    if (process.env.GACHA_EXPORT_CAPTURE_DIAGNOSTICS !== '1') return
    if (!inspectEveryFrame && inspected.has(window.webContents.id)) return
    inspected.add(window.webContents.id)
    let yellowPixels = 0
    for (let offset = 0; offset < bitmap.length; offset += 4) if (bitmap[offset] < 80 && bitmap[offset + 1] > 120 && bitmap[offset + 2] > 180) yellowPixels++
    const dom = await window.webContents.executeJavaScript(`({ viewport: [innerWidth, innerHeight, devicePixelRatio], bounds: document.querySelector('svg')?.getBoundingClientRect().toJSON(), background: document.querySelector('svg rect')?.getAttribute('fill'), frame: document.querySelector('svg')?.getAttribute('data-frame'), images: Array.from(document.querySelectorAll('svg image')).map(image => ({ x: image.getAttribute('x'), y: image.getAttribute('y'), width: image.getAttribute('width'), height: image.getAttribute('height'), transform: image.parentElement.getAttribute('transform'), sourcePrefix: image.getAttribute('href')?.slice(0, 64), sourceSuffix: image.getAttribute('href')?.slice(-32) })), svg: document.querySelector('svg')?.getAttribute('viewBox') })`)
    const probeOffset = (90 * 320 + 240) * 4
    const probePixel = Array.from(bitmap.subarray(probeOffset, probeOffset + 4))
    const suffix = inspectEveryFrame ? `-${frame}` : ''
    await writeFile(join(folder, `capture-${window.webContents.id}${suffix}.json`), JSON.stringify({ frame, yellowPixels, probePixelBgra: probePixel, dom }))
  } })
  let active = 0, peak = 0
  const makeWorkerWithFactory = async (targetFactory: ReturnType<typeof createEditorV6WorkerFactory>, signal: AbortSignal, width = 320, height = 180, renderProject = project, layeredVideo = false, mouthLoops?: EditorV6ExportMouthLoops, hairAnimation?: EditorV6WorkerPayload['hairAnimation'], singlePassLayers = false, nativeRenderer = false) => {
    active++; peak = Math.max(peak, active)
    try {
      const worker = await targetFactory.create({ project: renderProject, width, height, layeredVideo, singlePassLayers, nativeRenderer, ...(mouthLoops ? { mouthLoops } : {}), ...(hairAnimation ? { hairAnimation } : {}) }, signal)
      let closed = false
      return { frame: worker.frame, close: () => { if (closed) return; closed = true; active--; worker.close() } }
    } catch (error) { active--; throw error }
  }
  const makeWorker = (signal: AbortSignal, width = 320, height = 180, renderProject = project, layeredVideo = false, mouthLoops?: EditorV6ExportMouthLoops) => makeWorkerWithFactory(factory, signal, width, height, renderProject, layeredVideo, mouthLoops)
  const chromiumFrameWorker = await makeWorkerWithFactory(factory, new AbortController().signal)
  const nativeFrameWorker = await makeWorkerWithFactory(factory, new AbortController().signal, 320, 180, project, false, undefined, undefined, false, true)
  let nativeRendererParity: { passed: true; width: number; height: number; meanAbsoluteChannelError: number; alphaDifferentPixels: number; nativeRasterMs: number } | undefined
  try {
    const [chromiumFrame, nativeFrame] = await Promise.all([chromiumFrameWorker.frame(0), nativeFrameWorker.frame(0)])
    assert(chromiumFrame.bitmap?.length === nativeFrame.bitmap?.length && nativeFrame.bitmap?.length === 320 * 180 * 4, 'O renderizador nativo e o Chromium não retornaram quadros BGRA com dimensões equivalentes.')
    assert(nativeFrame.timings.nativeRasterMs! > 0 && nativeFrame.timings.capturePageMs === undefined, 'O caminho nativo não registrou a rasterização própria nem deixou de capturar via Chromium.')
    const reference = chromiumFrame.bitmap!, actual = nativeFrame.bitmap!
    let absoluteError = 0, differentAlpha = 0
    for (let offset = 0; offset < reference.length; offset++) {
      absoluteError += Math.abs(reference[offset] - actual[offset])
      if ((offset & 3) === 3 && reference[offset] !== actual[offset]) differentAlpha++
    }
    const meanAbsoluteError = absoluteError / reference.length
    assert(meanAbsoluteError <= 4 && differentAlpha <= 320 * 180 * 0.01, `O quadro nativo divergiu do Chromium no fixture sintético: MAE=${meanAbsoluteError.toFixed(3)}, pixels com alpha distinto=${differentAlpha}.`)
    nativeRendererParity = { passed: true, width: 320, height: 180, meanAbsoluteChannelError: meanAbsoluteError, alphaDifferentPixels: differentAlpha, nativeRasterMs: nativeFrame.timings.nativeRasterMs! }
  } finally {
    chromiumFrameWorker.close(); nativeFrameWorker.close()
  }
  let native1080Benchmark: { passed: true; width: number; height: number; repetitions: number; nativeRoundTripMs: number[]; chromiumRoundTripMs: number[]; medianNativeRoundTripMs: number; medianChromiumRoundTripMs: number; medianNativeRasterMs: number; medianChromiumCapturePageMs: number; maxMeanAbsoluteChannelError: number } | undefined
  const samples: { nativeRoundTripMs: number; chromiumRoundTripMs: number; nativeRasterMs: number; chromiumCapturePageMs: number; meanAbsoluteChannelError: number }[] = []
  for (const [repetition, frameNumber] of [0, 25, 30].entries()) {
    const chromium1080Worker = await makeWorkerWithFactory(factory, new AbortController().signal, 1920, 1080)
    const native1080Worker = await makeWorkerWithFactory(factory, new AbortController().signal, 1920, 1080, project, false, undefined, undefined, false, true)
    try {
      const renderOne = async (mode: 'native' | 'chromium') => {
        const started = performance.now()
        const result = await (mode === 'native' ? native1080Worker : chromium1080Worker).frame(frameNumber)
        return { result, elapsedMs: performance.now() - started }
      }
      const order: Array<'native' | 'chromium'> = repetition % 2 === 0 ? ['chromium', 'native'] : ['native', 'chromium']
      const rendered = new Map<'native' | 'chromium', Awaited<ReturnType<typeof renderOne>>>()
      for (const mode of order) rendered.set(mode, await renderOne(mode))
      const chromium = rendered.get('chromium')!, native = rendered.get('native')!
      assert(chromium.result.bitmap?.length === native.result.bitmap?.length && native.result.bitmap?.length === 1920 * 1080 * 4, 'O renderizador nativo e o Chromium não retornaram quadros Full HD equivalentes.')
      const reference = chromium.result.bitmap!, actual = native.result.bitmap!
      let absoluteError = 0
      for (let offset = 0; offset < reference.length; offset++) absoluteError += Math.abs(reference[offset] - actual[offset])
      const meanAbsoluteChannelError = absoluteError / reference.length
      assert(meanAbsoluteChannelError <= 1, `A composição nativa Full HD divergiu do Chromium no quadro ${frameNumber}: MAE=${meanAbsoluteChannelError.toFixed(3)}.`)
      samples.push({ nativeRoundTripMs: native.elapsedMs, chromiumRoundTripMs: chromium.elapsedMs, nativeRasterMs: native.result.timings.nativeRasterMs!, chromiumCapturePageMs: chromium.result.timings.capturePageMs!, meanAbsoluteChannelError })
    } finally {
      chromium1080Worker.close(); native1080Worker.close()
    }
  }
  const medianOfThree = (values: number[]) => { const sorted = [...values].sort((left, right) => left - right); return sorted[1] }
  native1080Benchmark = {
    passed: true, width: 1920, height: 1080, repetitions: samples.length,
    nativeRoundTripMs: samples.map(sample => sample.nativeRoundTripMs), chromiumRoundTripMs: samples.map(sample => sample.chromiumRoundTripMs),
    medianNativeRoundTripMs: medianOfThree(samples.map(sample => sample.nativeRoundTripMs)), medianChromiumRoundTripMs: medianOfThree(samples.map(sample => sample.chromiumRoundTripMs)),
    medianNativeRasterMs: medianOfThree(samples.map(sample => sample.nativeRasterMs)), medianChromiumCapturePageMs: medianOfThree(samples.map(sample => sample.chromiumCapturePageMs)),
    maxMeanAbsoluteChannelError: Math.max(...samples.map(sample => sample.meanAbsoluteChannelError))
  }
  const options = { startFrame: 5, endFrame: 86, width: 320, height: 180, turbo: true, encoder: 'cpu' as const }
  const output = join(folder, 'turbo.mp4')
  const progressMessages: string[] = []
  const base = { ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: output, reportPath: join(folder, 'turbo.report.json'), signal: new AbortController().signal, getCharacters: async () => [], bakeMotion: async () => { throw Error('Unexpected motion bake.') }, getElectronProcessMetrics: () => app.getAppMetrics(), createWorker: (renderProject: EditorV6Document, _part: unknown, signal: AbortSignal, layeredVideo: boolean, mouthLoops?: EditorV6ExportMouthLoops) => makeWorker(signal, 320, 180, renderProject, layeredVideo, mouthLoops), audioPath: () => audio, mediaPath: (_projectId: string, fileName: string) => join(folder, 'media', fileName), progress: (patch: { message?: string }) => { if (patch.message) progressMessages.push(patch.message) } }
  const nativeOutput = join(folder, 'native-renderer.mp4')
  const nativeExport = await runEditorV6Export(project, { ...options, startFrame: 25, endFrame: 35, turbo: false, nativeRenderer: true }, {
    ...base, id: randomUUID(), outputPath: nativeOutput, reportPath: join(folder, 'native-renderer.report.json'),
    createWorker: (renderProject, part, signal, layeredVideo, mouthLoops) => {
      // Exercise the production asset transport through the sandboxed worker.
      const { project: workerProject, assetSources } = createEditorV6ExportWorkerData(renderProject, part, mouthLoops)
      assert(assetSources.size > 0, 'O teste nativo precisa carregar imagens pelo protocolo do worker.')
      return factory.create({ project: workerProject, width: 320, height: 180, layeredVideo, mouthLoops, nativeRenderer: true }, signal, assetSources)
    }
  })
  const nativePart = nativeExport.attempts.flatMap(attempt => attempt.parts)[0]
  assert(nativeExport.state === 'completed' && nativeExport.totalFrames === 10 && !nativeExport.fallback, 'O caminho nativo não concluiu uma exportação MP4 de ponta a ponta.')
  assert((nativePart?.frameTiming?.nativeRasterMs?.samples ?? 0) > 0 && nativePart?.frameTiming?.capturePageMs === undefined, 'O relatório da exportação nativa não separou a composição C++ da captura Chromium.')
  const nativePacketCount = Number(execFileSync(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'default=nw=1:nk=1', nativeOutput], { encoding: 'utf8', windowsHide: true }).trim())
  assert(nativePacketCount === 10, `O MP4 do renderizador nativo não contém os dez quadros esperados (${nativePacketCount}).`)
  const report = await runEditorV6Export(project, options, base)
  assert(report.state === 'completed' && !report.fallback, 'Turbo não concluiu com duas partes.')
  const film = await runEditorV6Export(project, { ...options, fps: 24, endFrame: options.endFrame - 2 }, {
    ...base, id: randomUUID(), outputPath: join(folder, '24fps.mp4'), reportPath: join(folder, '24fps.report.json')
  })
  const filmVideo = film.validation?.streams.find((stream) => stream.codec_type === 'video')
  assert(film.state === 'completed' && !film.fallback && film.totalFrames === 64 && filmVideo?.r_frame_rate === '24/1', 'A exportação Turbo a 24 FPS não preservou a cadência.')
  assert(film.attempts[0].parts.map(part => part.frames).sort((a, b) => a - b).join(',') === '32,32' && film.audioClips === 1, 'A exportação a 24 FPS perdeu quadros na emenda ou a trilha de áudio.')
  const validatedVideo = (report.validation as { streams?: Array<{ codec_type: string; has_b_frames?: number; nb_read_packets?: string; nb_read_frames?: string }> }).streams?.find(stream => stream.codec_type === 'video')
  assert(validatedVideo?.has_b_frames === 0 && Number(validatedVideo.nb_read_packets) === 81 && validatedVideo.nb_read_frames === undefined,
    'A validação final não contou os pacotes H.264 no caminho rápido ou decodificou o vídeo inteiro sem necessidade.')
  assert(report.mainProcessMemory && report.mainProcessMemory.startRssBytes > 0 && report.mainProcessMemory.peakRssBytes >= report.mainProcessMemory.startRssBytes && report.mainProcessMemory.sampleIntervalMs === 500, 'O relatório não registrou corretamente a memória RSS do processo principal.')
  assert(report.electronProcessMemory?.sampleCount > 0 && report.electronProcessMemory.sampleIntervalMs === 1000 && Object.keys(report.electronProcessMemory.peakByType).length > 0, 'O relatório não amostrou a memória agregada dos processos Electron durante o export.')
  assert(report.phaseMilliseconds.temporarySetup >= 0 && report.phaseMilliseconds.characterLoading >= 0 && report.phaseMilliseconds.motionPreparation >= 0 && report.phaseMilliseconds.encoderProbe > 0 && report.phaseMilliseconds.rendering > 0 && report.phaseMilliseconds.finalization > 0 && report.phaseMilliseconds.publication > 0 && report.milliseconds! >= report.phaseMilliseconds.publication, 'O relatório não separou os tempos das fases principais nem incluiu publicação no total.')
  const persistedReport = JSON.parse(await readFile(base.reportPath, 'utf8'))
  assert(persistedReport.state === 'completed' && persistedReport.phaseMilliseconds.publication === report.phaseMilliseconds.publication && persistedReport.electronProcessMemory?.sampleCount === report.electronProcessMemory.sampleCount, 'O relatório salvo não recebeu o estado, a duração da publicação e as amostras finais dos processos Electron.')
  const blockedTempRoot = join(folder, 'not-a-temp-folder')
  await writeFile(blockedTempRoot, 'file')
  let setupFailed = false
  try { await runEditorV6Export(project, options, { ...base, id: randomUUID(), tempRoot: blockedTempRoot, outputPath: join(folder, 'setup-failure.mp4'), reportPath: join(folder, 'setup-failure.report.json') }) } catch { setupFailed = true }
  const setupReport = JSON.parse(await readFile(join(folder, 'setup-failure.report.json'), 'utf8'))
  assert(setupFailed && setupReport.state === 'failed' && setupReport.error && setupReport.phaseMilliseconds.temporarySetup > 0, 'Falha ao criar a pasta temporária não gerou um relatório de diagnóstico.')
  assert(report.attempts[0].parts.map((part) => part.frames).sort((a, b) => a - b).join(',') === '40,41', 'Partes perderam ou repetiram quadros.')
  assert(report.attempts[0].parts.every((part) => Number.isFinite(part.startedAtOffsetMs) && Number.isFinite(part.finishedAtOffsetMs) && part.finishedAtOffsetMs! >= part.startedAtOffsetMs), 'O relatório não registrou intervalos monotônicos das partes.')
  assert(Math.max(...report.attempts[0].parts.map((part) => part.startedAtOffsetMs)) < Math.min(...report.attempts[0].parts.map((part) => part.finishedAtOffsetMs!)), 'Os intervalos do relatório não refletem a sobreposição real das partes paralelas.')
  assert(report.attempts[0].parts.every((part) => (part.frameTiming?.frameRoundTripMs?.samples ?? 0) > 0
    && (part.frameTiming?.captureMs?.samples ?? 0) > 0
    && (part.frameTiming?.capturePageMs?.samples ?? 0) > 0
    && (part.frameTiming?.captureBitmapMs?.samples ?? 0) > 0
    && part.frameRafGate === false),
  'O relatório não separou round-trip e captura, ou a exportação voltou a exigir o gate RAF legado.')
  assert(peak === 2 && active === 0, 'Os dois trabalhos não foram paralelos ou deixaram janelas abertas.')
  assert(report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0) > 60, 'Quadros estáticos não foram reaproveitados.')
  const rgb = run(['-i', output, '-vf', "select='eq(n,39)+eq(n,40)+eq(n,41)'", '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const pixel = (frame: number, x: number, y: number) => Array.from(rgb.subarray(frame * 320 * 180 * 3 + (y * 320 + x) * 3, frame * 320 * 180 * 3 + (y * 320 + x) * 3 + 3))
  assert(pixel(0, 10, 10)[2] > 200 && pixel(1, 10, 10)[1] > 200 && pixel(2, 10, 10)[1] > 200, 'Emenda avançou, repetiu quadros ou trocou os canais BGRA.')
  assert(pixel(1, 240, 90)[0] > 200 && pixel(1, 240, 90)[1] > 200 && pixel(1, 240, 90)[2] < 40, `A segunda parte perdeu o estado do personagem anterior ao seu início. Pixels antes/na/depois da emenda: ${[0, 1, 2].map(frame => pixel(frame, 240, 90).join(',')).join(' | ')}`)
  const talkPath = join(folder, 'talk.png')
  run(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', talkPath])
  const talkAssetId = randomUUID(), blinkAssetId = randomUUID(), talkBlinkAssetId = randomUUID(), thoughtId = randomUUID()
  const talkAsset = { id: talkAssetId, category: 'character' as const, name: 'Talk test', mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(talkPath)).toString('base64')}` }
  const blinkPath = join(folder, 'blink.png'), talkBlinkPath = join(folder, 'talk-blink.png')
  run(['-f', 'lavfi', '-i', 'color=c=blue:s=16x16', '-frames:v', '1', blinkPath])
  run(['-f', 'lavfi', '-i', 'color=c=magenta:s=16x16', '-frames:v', '1', talkBlinkPath])
  const blinkAsset = { id: blinkAssetId, category: 'character' as const, name: 'Blink test', mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(blinkPath)).toString('base64')}` }
  const talkBlinkAsset = { id: talkBlinkAssetId, category: 'character' as const, name: 'Talk blink test', mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(talkBlinkPath)).toString('base64')}` }
  const faceSpeechBlock = { id: randomUUID(), label: 'Talk window', characterId: 'alice', startFrame: 8, durationFrames: 12 }
  const faceScheduleTimeline = { ...project.timeline, durationFrames: 40, tracks: project.timeline.tracks.map((track) => track.kind === 'speech' ? { ...track, blocks: [faceSpeechBlock] } : track) }
  const faceProjectId = 'face-export-synthetic-8'
  const faceModes = Array.from({ length: 40 }, (_, frame) => editorV6FaceModeAtFrame(faceProjectId, faceScheduleTimeline, 'alice', frame))
  assert(faceModes[0] === undefined && faceModes[15] === 'talk-blink' && faceModes[20] === 'blink' && faceModes[21] === undefined, 'O fixture perdeu o ciclo determinístico de rosto que cruza a emenda Turbo.')
  const faceModeAssetIds = { talk: talkAssetId, blink: blinkAssetId, 'talk-blink': talkBlinkAssetId }
  const faceActor = { ...actor, faceModeAssetIds }
  const thought = { id: thoughtId, kind: 'thought' as const, text: 'Teste', x: 0, y: -30, width: 28, height: 12, rotation: 0, zIndex: 2 }
  const faceProject: EditorV6Document = {
    ...project, id: faceProjectId, title: 'Face state capture test', exportAudio: [], assets: [...project.assets, talkAsset, blinkAsset, talkBlinkAsset], elements: [faceActor, thought],
    timeline: { ...project.timeline, durationFrames: 40, knownElementIds: [...project.timeline.knownElementIds ?? [], thoughtId], tracks: project.timeline.tracks.map((track) => track.kind === 'character'
      ? { ...track, blocks: track.blocks.map((block) => ({ ...block, state: block.state ? { ...block.state, faceModeAssetIds } : block.state })) }
      : track.kind === 'speech' ? { ...track, blocks: [faceSpeechBlock] }
        : track.kind === 'thought' ? { ...track, blocks: [{ id: randomUUID(), label: thought.text, elementId: thought.id, state: thought, startFrame: 20, durationFrames: 5 }] }
          : track)
    }
  }
  const expectedFaceAssetIds = { talk: talkAssetId, blink: blinkAssetId, 'talk-blink': talkBlinkAssetId }
  for (const frame of [0, 15, 20, 21]) {
    const expected = faceModes[frame] ? expectedFaceAssetIds[faceModes[frame]!] : assetId
    const resolved = resolveEditorV6SceneAtFrame(faceProject, frame).elements.find((element) => element.id === faceActor.id)
    assert(resolved?.assetId === expected, `O fixture resolveu a imagem de rosto errada no quadro ${frame}.`)
  }
  const mouthAtlasPath = join(folder, 'mouth-loop-atlas.png')
  run(['-f', 'lavfi', '-i', 'color=c=red:s=48x16', '-frames:v', '1', mouthAtlasPath])
  const mouthAtlasData = `data:image/png;base64,${(await readFile(mouthAtlasPath)).toString('base64')}`
  const mouthCharacter: CustomizerCharacter = { id: 'alice', name: 'Alice', hair: '#000000', outfit: '#000000', skin: '#ffffff', createdAt: project.createdAt, updatedAt: project.updatedAt, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const mouthBlocks = [
    ...Array.from({ length: 15 }, (_, index) => ({ id: randomUUID(), elementId: faceActor.id, label: `Variação ${index + 1}`, startFrame: 5 + index * 2, durationFrames: 2, state: { ...faceActor, x: index - 7, activeFaceMode: 'idle' as const } })),
    { id: randomUUID(), elementId: faceActor.id, label: 'Continuação', startFrame: 35, durationFrames: 271, state: { ...faceActor, activeFaceMode: 'idle' as const } }
  ]
  const mouthProject: EditorV6Document = {
    ...project, title: 'Many mouth loop states', exportAudio: [], assets: [...project.assets, talkAsset], elements: [faceActor],
    timeline: { ...project.timeline, durationFrames: 306, tracks: project.timeline.tracks.map((track) => track.kind === 'character'
      ? { ...track, blocks: mouthBlocks }
      : track.kind === 'speech' ? { ...track, blocks: [{ id: randomUUID(), label: 'Speech', characterId: 'alice', startFrame: 5, durationFrames: 301 }] }
        : track) }
  }
  const mouthWorkerPayloads: Array<{ startFrame: number; cycleFrames: number; stateCount: number; assetCount: number; partStart: number; partEnd: number }> = []
  const mouthExportScopes = new Set<string>(), releasedMouthExportScopes = new Set<string>()
  const bakeMouthLoop = async (request: EditorV6MotionBakeRequest, signal: AbortSignal): Promise<EditorV6MotionBakeResult> => {
    signal.throwIfAborted()
    const assetId = randomUUID()
    const frames = request.plan.samples.map((sample, index) => ({ offset: sample.offset, sprite: { x: index * 16, y: 0, width: 16, height: 16, atlasWidth: 48, atlasHeight: 16 }, x: request.plan.from.x, y: request.plan.from.y, width: request.plan.from.width, height: request.plan.from.height, rotation: 0, flipX: false, facePatch: { sprite: { x: index * 16, y: 0, width: 16, height: 16, atlasWidth: 48, atlasHeight: 16 }, x: 0.08, y: 0.08, width: 0.2, height: 0.2 } }))
    return { asset: { id: assetId, category: 'character', name: 'Mouth loop', mimeType: 'image/png', dataUrl: mouthAtlasData }, mouthIsolationMode: 'legacy-patch', motion: { version: 1, key: request.plan.key, assetId, frames }, metrics: { milliseconds: 1, preparedRigs: 1, samples: frames.length, atlasPixels: 48 * 16 } }
  }
  const mouthOutput = join(folder, 'many-mouth-loop-states.mp4')
  const mouthReport = await runEditorV6Export(mouthProject, { startFrame: 5, endFrame: 306, width: 320, height: 180, turbo: false, encoder: 'cpu', mouthLoop: false, mouthLoopCycleFrames: 37 }, {
    ...base, id: randomUUID(), outputPath: mouthOutput, reportPath: join(folder, 'many-mouth-loop-states.report.json'),
    getCharacters: async () => [mouthCharacter], bakeMotion: (request, signal) => { assert(Boolean(request.cacheScope), 'O bake de boca não recebeu escopo frio da exportação.'); mouthExportScopes.add(request.cacheScope!); return bakeMouthLoop(request, signal) },
    releaseMotionCacheScope: (scope) => { releasedMouthExportScopes.add(scope) },
    createWorker: (renderProject, part, signal, layeredVideo, mouthLoops) => {
      mouthWorkerPayloads.push({ startFrame: mouthLoops?.startFrame ?? -1, cycleFrames: mouthLoops?.cycleFrames ?? -1, stateCount: mouthLoops?.states.length ?? 0, assetCount: renderProject.assets.length, partStart: part.startFrame, partEnd: part.endFrame })
      return makeWorker(signal, 320, 180, renderProject, layeredVideo, mouthLoops)
    }
  })
  assert(mouthReport.state === 'completed' && mouthReport.options.mouthLoop === false && mouthReport.mouthAnimation === undefined, 'O perfil sem boca não concluiu ou registrou ciclos faciais.')
  assert(mouthExportScopes.size === 0, 'O perfil sem boca iniciou bakes faciais.')
  assert(mouthWorkerPayloads.length === 1 && mouthWorkerPayloads[0].stateCount === 0 && mouthWorkerPayloads[0].startFrame === -1, 'O worker recebeu atlas ou estado da boca no perfil desativado.')
  assert(mouthReport.attempts[0].parallelism === 1 && mouthReport.attempts[0].parts.map((part) => part.frames).join(',') === '301', 'O perfil sem boca dividiu a fala em trechos desnecessariamente.')
  const faceOutput = join(folder, 'face-state.mp4')
  const faceReport = await runEditorV6Export(faceProject, { ...options, startFrame: 0, endFrame: 40 }, { ...base, id: randomUUID(), outputPath: faceOutput, reportPath: join(folder, 'face-state.report.json'), getCharacters: async () => [mouthCharacter], bakeMotion: bakeMouthLoop })
  assert(!faceReport.fallback, 'Trocas de talk/pensamento não concluíram com a captura normal.')
  const faceFrames = run(['-i', faceOutput, '-frames:v', '40', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const faceFrameBytes = 320 * 180 * 3
  for (let frame = 0; frame < 40; frame++) {
    const offset = frame * faceFrameBytes + (90 * 320 + 240) * 3
    const [red, green, blue] = faceFrames.subarray(offset, offset + 3)
    const mode = editorV6FaceModeAtFrame(faceProject.id, faceProject.timeline, 'alice', frame)
    const correctColor = mode === 'talk-blink'
      ? red > 150 && green < 100 && blue > 100
      : mode === 'talk'
        ? red > 150 && green < 100 && blue < 100
        : mode === 'blink'
          ? red < 100 && green < 100 && blue > 150
          : red > 150 && green > 100 && blue < 100
    assert(correctColor, `O MP4 exportado teve rosto incorreto no quadro ${frame} (${mode ?? 'idle'}): ${red},${green},${blue}.`)
  }
  let thoughtPixels = 0
  for (let y = 24; y < 49; y++) for (let x = 112; x < 208; x++) {
    const offset = 20 * faceFrameBytes + (y * 320 + x) * 3
    const red = faceFrames[offset], green = faceFrames[offset + 1], blue = faceFrames[offset + 2]
    if (red > 220 && green > 220 && blue > 220) thoughtPixels++
  }
  assert(thoughtPixels > 250, `O primeiro quadro do pensamento perdeu o balão: ${thoughtPixels} pixels claros detectados.`)
  const sound = run(['-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
  const rms = (start: number, count: number) => { let sum = 0; for (let index = start; index < start + count; index++) sum += sound.readFloatLE(index * 4) ** 2; return Math.sqrt(sum / count) }
  assert(rms(0, 1000) < .001 && rms(24000, 1000) > .02 && rms(64000 - 500, 1000) > .02, 'Áudio perdeu atraso, volume ou continuidade na emenda.')
  let injected = false
  const fallback = await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: join(folder, 'fallback.mp4'), reportPath: join(folder, 'fallback.report.json'), createWorker: (renderProject, part, signal, layeredVideo) => { if (part.index === 1 && !injected) { injected = true; throw Error('Falha simulada na segunda parte.'); } return makeWorker(signal, 320, 180, renderProject, layeredVideo) } })
  assert(fallback.fallback && fallback.attempts.length === 2 && fallback.attempts[1].parallelism === 1 && active === 0, 'Recuperação segura não reiniciou e concluiu a exportação.')
  const strictReportPath = join(folder, 'strict-turbo.report.json')
  let strictError = ''
  try {
    await runEditorV6Export(project, { ...options, width: 1920, height: 1080, forceTurbo1080: true }, { ...base, id: randomUUID(), outputPath: join(folder, 'strict-turbo.mp4'), reportPath: strictReportPath, createWorker: () => { throw Error('Falha Turbo simulada.') } })
  } catch (error) { strictError = String(error) }
  const strictReport = JSON.parse(await readFile(strictReportPath, 'utf8'))
  assert(strictError.includes('Turbo obrigatório falhou') && !strictReport.fallback && strictReport.attempts.length === 1 && active === 0, 'Turbo obrigatório não deve iniciar a recuperação segura.')
  const preserved = join(folder, 'preserved.mp4'), controller = new AbortController()
  await writeFile(preserved, 'arquivo anterior')
  let calls = 0, cancelled = false
  try {
    await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: preserved, reportPath: join(folder, 'cancelled.report.json'), signal: controller.signal, createWorker: async (renderProject, _part, signal, layeredVideo) => {
      const worker = await makeWorker(signal, 320, 180, renderProject, layeredVideo)
      return { ...worker, frame: async (frame) => { const result = await worker.frame(frame); if (++calls >= 2) controller.abort(Error('Cancelamento de teste.')); return result } }
    } })
  } catch { cancelled = true }
  assert(cancelled && (await readFile(preserved, 'utf8')) === 'arquivo anterior' && active === 0, 'Cancelamento substituiu o destino ou deixou renderizadores abertos.')
  const cancelledReport = JSON.parse(await readFile(join(folder, 'cancelled.report.json'), 'utf8'))
  assert(cancelledReport.state === 'cancelled' && cancelledReport.mainProcessMemory?.peakRssBytes >= cancelledReport.mainProcessMemory?.startRssBytes, 'Cancelamento não salvou o estado e a memória do processo no relatório.')
  const silent = { ...project, exportAudio: [] }
  const single = await runEditorV6Export(silent, { ...options, startFrame: 50, endFrame: 51 }, { ...base, id: randomUUID(), outputPath: join(folder, 'single.mp4'), reportPath: join(folder, 'single.report.json') })
  assert(single.totalFrames === 1 && single.attempts[0].parallelism === 1 && !single.fallback, 'Intervalo de um quadro não foi tratado corretamente.')
  const telemetryFailure = await runEditorV6Export(silent, { ...options, startFrame: 50, endFrame: 51 }, {
    ...base, id: randomUUID(), outputPath: join(folder, 'telemetry-failure.mp4'), reportPath: join(folder, 'telemetry-failure.report.json'),
    getCharacters: async () => { await new Promise(resolve => setTimeout(resolve, 1100)); return [] },
    getElectronProcessMetrics: () => { throw Error('Falha simulada no coletor de métricas.') }
  })
  assert(telemetryFailure.state === 'completed' && (telemetryFailure.electronProcessMemory?.failedSamples ?? 0) > 0, 'Uma falha no coletor de memória interrompeu a exportação ou não foi registrada como amostra perdida.')
  await mkdir(join(folder, 'media'), { recursive: true })
  const videoId = randomUUID(), videoFileName = `${videoId}.mp4`, videoPath = join(folder, 'media', videoFileName)
  run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=600:sample_rate=48000:duration=4', '-c:v', 'mpeg4', '-q:v', '3', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-shortest', videoPath])
  const audioId = randomUUID(), audioFileName = `${audioId}.wav`
  await copyFile(audio, join(folder, 'media', audioFileName))
  const mediaProject: EditorV6Document = { ...silent, id: randomUUID(), media: [
    { id: videoId, name: 'Test pattern', fileName: videoFileName, kind: 'video', mimeType: 'video/mp4', sourceFrames: 120, hasAudio: true, width: 320, height: 180, sizeBytes: (await stat(videoPath)).size },
    { id: audioId, name: 'Tone', fileName: audioFileName, kind: 'audio', mimeType: 'audio/wav', sourceFrames: 120, hasAudio: true, sizeBytes: (await stat(join(folder, 'media', audioFileName))).size }
  ], timeline: { ...createEditorV6Timeline(), durationFrames: 90, tracks: createEditorV6Timeline().tracks.map((track) => track.kind === 'video'
    ? { ...track, blocks: [{ id: randomUUID(), label: 'Test pattern', mediaId: videoId, mediaInFrame: 15, startFrame: 5, durationFrames: 10, mediaLayout: { x: 20, y: 0, width: 30, height: 30, rotation: 15 }, audioEnabled: true, gain: 1 }] }
    : track.kind === 'audio' ? { ...track, blocks: [{ id: randomUUID(), label: 'Tone', mediaId: audioId, mediaInFrame: 0, startFrame: 0, durationFrames: 90, audioEnabled: true, gain: .5 }] }
      : { ...track, blocks: track.blocks }) } }
  project = mediaProject
  const mediaOutput = join(folder, 'media-timeline.mp4')
  const mediaReport = await runEditorV6Export(mediaProject, { ...options, startFrame: 0, endFrame: 30 }, { ...base, id: randomUUID(), outputPath: mediaOutput, reportPath: join(folder, 'media-timeline.report.json'), audioPath: (clip) => join(folder, 'media', clip.fileName) })
  assert(!mediaReport.fallback && mediaReport.videoInputs === 1 && mediaReport.audioClips === 2, 'Mídias da timeline não chegaram ao exportador.')
  const mediaRgb = run(['-i', mediaOutput, '-vf', "select='eq(n,0)+eq(n,10)'", '-fps_mode', 'passthrough', '-frames:v', '2', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const mediaFrameBytes = 320 * 180 * 3
  assert(!mediaRgb.subarray(0, mediaFrameBytes).equals(mediaRgb.subarray(mediaFrameBytes, mediaFrameBytes * 2)), 'Vídeo importado não mudou quadro a quadro na composição exportada.')
  const actorOverVideo = Array.from(mediaRgb.subarray((90 * 320 + 230) * 3, (90 * 320 + 230) * 3 + 3))
  assert(actorOverVideo[0] > 200 && actorOverVideo[1] > 200 && actorOverVideo[2] < 40, 'O vídeo cobriu o personagem, embora a camada do vídeo deva ficar atrás dos personagens.')
  const videoOutside = Array.from(mediaRgb.subarray(mediaFrameBytes + (10 * 320 + 10) * 3, mediaFrameBytes + (10 * 320 + 10) * 3 + 3))
  const positionedVideo = Array.from(mediaRgb.subarray(mediaFrameBytes + (90 * 320 + 200) * 3, mediaFrameBytes + (90 * 320 + 200) * 3 + 3))
  assert(videoOutside.every((channel) => channel < 25) && positionedVideo.some((channel) => channel > 40), 'O vídeo exportado não respeitou o tamanho e a posição configurados na prévia.')
  const firstPixel = Array.from(mediaRgb.subarray(10 * 3, 10 * 3 + 3))
  assert(firstPixel.every((channel) => channel < 25), 'A faixa de vídeo vazou para antes do início do clip.')
  const hiddenVideoProject: EditorV6Document = { ...mediaProject, timeline: { ...mediaProject.timeline, tracks: mediaProject.timeline.tracks.map((track) => track.kind === 'video' ? { ...track, hidden: true } : track) } }
  const hiddenVideoOutput = join(folder, 'hidden-video.mp4')
  const hiddenVideo = await runEditorV6Export(hiddenVideoProject, { ...options, startFrame: 0, endFrame: 30 }, { ...base, id: randomUUID(), outputPath: hiddenVideoOutput, reportPath: join(folder, 'hidden-video.report.json') })
  assert(hiddenVideo.videoInputs === 0 && !hiddenVideo.fallback, 'Faixa de vídeo oculta ainda foi enviada à composição.')
  const hiddenVideoRgb = run(['-i', hiddenVideoOutput, '-vf', "select='eq(n,10)'", '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const hiddenActor = Array.from(hiddenVideoRgb.subarray((90 * 320 + 240) * 3, (90 * 320 + 240) * 3 + 3))
  assert(hiddenActor[0] > 180 && hiddenActor[1] > 120 && hiddenActor[2] < 80, `Ocultar a faixa de vídeo removeu o personagem da exportação: ${hiddenActor.join(',')}.`)
  let outOfRangeLayeredVideo: boolean | undefined
  const outOfRange = await runEditorV6Export(mediaProject, { ...options, startFrame: 20, endFrame: 30 }, { ...base, id: randomUUID(), outputPath: join(folder, 'video-out-of-range.mp4'), reportPath: join(folder, 'video-out-of-range.report.json'), createWorker: (renderProject, _part, signal, layeredVideo) => { outOfRangeLayeredVideo = layeredVideo; return makeWorker(signal, 320, 180, renderProject, layeredVideo) } })
  assert(outOfRange.videoInputs === 0 && outOfRangeLayeredVideo === false, 'Um vídeo fora do intervalo ativou captura em camadas desnecessária.')
  const mediaSound = run(['-i', mediaOutput, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
  let mediaRms = 0
  for (let index = 0; index < 1000; index++) mediaRms += mediaSound.readFloatLE(index * 4) ** 2
  assert(Math.sqrt(mediaRms / 1000) > .02, 'O áudio dos vídeos/áudios importados não foi mixado no MP4.')
  const damagedAacPath = join(folder, 'damaged-audio.aac')
  run(['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-f', 'adts', damagedAacPath])
  const damagedAac = await readFile(damagedAacPath)
  let aacOffset = 0, aacFrames = 0
  while (aacOffset + 7 <= damagedAac.length) {
    if (damagedAac[aacOffset] !== 0xff || (damagedAac[aacOffset + 1] & 0xf0) !== 0xf0) { aacOffset++; continue }
    const frameLength = ((damagedAac[aacOffset + 3] & 3) << 11) | (damagedAac[aacOffset + 4] << 3) | (damagedAac[aacOffset + 5] >> 5)
    const headerLength = (damagedAac[aacOffset + 1] & 1) === 1 ? 7 : 9
    if (frameLength < headerLength || aacOffset + frameLength > damagedAac.length) break
    if (aacFrames % 10 !== 0) damagedAac.fill(0, aacOffset + headerLength, aacOffset + frameLength)
    aacFrames++
    aacOffset += frameLength
  }
  assert(aacFrames >= 100, `O fixture AAC inválido não contém quadros suficientes (${aacFrames}).`)
  const damagedAacFileName = `${randomUUID()}.aac`
  await writeFile(join(folder, 'media', damagedAacFileName), damagedAac)
  const damagedAudioProject: EditorV6Document = { ...silent, id: randomUUID(), exportAudio: [{ id: randomUUID(), name: 'Fixture AAC com erros', fileName: damagedAacFileName, sourceFrames: 120, sourceInFrame: 0, startFrame: 0, durationFrames: 120, gain: 1, muted: false }] }
  const recoveredAudioOutput = join(folder, 'recovered-aac.mp4')
  const recoveredAudio = await runEditorV6Export(damagedAudioProject, options, { ...base, id: randomUUID(), outputPath: recoveredAudioOutput, reportPath: join(folder, 'recovered-aac.report.json'), audioPath: () => join(folder, 'media', damagedAacFileName) })
  assert(recoveredAudio.state === 'completed' && !recoveredAudio.fallback && recoveredAudio.audioClips === 1, 'O Turbo não recuperou a mixagem AAC após o limite de erro do FFmpeg.')
  assert(recoveredAudio.deliveryWarning?.includes('Fixture AAC com erros') && recoveredAudio.deliveryWarning.includes('AAC inválidos') && recoveredAudio.deliveryWarning.includes('trechos danificados'), 'A recuperação AAC não informou o nome da fonte e a possível perda nos trechos corrompidos.')
  const recoveredAudioProbe = await probeExportMedia(ffprobe, recoveredAudioOutput, new AbortController().signal, true)
  const recoveredAudioStream = recoveredAudioProbe.streams.find((stream) => stream.codec_type === 'audio')
  assert(recoveredAudioStream && Math.abs(Number(recoveredAudioStream.duration) - 81 / 30) <= .05, 'A recuperação não manteve a faixa de áudio até o fim do intervalo exportado.')
  const recoveredAudioPcm = run(['-i', recoveredAudioOutput, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
  let recoveredAudioEnergy = 0
  for (let index = 0; index < recoveredAudioPcm.length / 4; index++) recoveredAudioEnergy += recoveredAudioPcm.readFloatLE(index * 4) ** 2
  assert(recoveredAudioEnergy > .001, 'A recuperação AAC publicou somente silêncio, sem pacotes decodificáveis.')
  const unrecoverableAacFileName = `${randomUUID()}.aac`, unrecoverableAac = Buffer.from(damagedAac)
  aacOffset = 0
  while (aacOffset + 7 <= unrecoverableAac.length) {
    if (unrecoverableAac[aacOffset] !== 0xff || (unrecoverableAac[aacOffset + 1] & 0xf0) !== 0xf0) { aacOffset++; continue }
    const frameLength = ((unrecoverableAac[aacOffset + 3] & 3) << 11) | (unrecoverableAac[aacOffset + 4] << 3) | (unrecoverableAac[aacOffset + 5] >> 5)
    const headerLength = (unrecoverableAac[aacOffset + 1] & 1) === 1 ? 7 : 9
    if (frameLength < headerLength || aacOffset + frameLength > unrecoverableAac.length) break
    unrecoverableAac.fill(0, aacOffset + headerLength, aacOffset + frameLength)
    aacOffset += frameLength
  }
  await writeFile(join(folder, 'media', unrecoverableAacFileName), unrecoverableAac)
  const unrecoverableProject: EditorV6Document = { ...silent, id: randomUUID(), exportAudio: [{ id: randomUUID(), name: 'Fixture AAC sem quadros válidos', fileName: unrecoverableAacFileName, sourceFrames: 120, sourceInFrame: 0, startFrame: 0, durationFrames: 120, gain: 1, muted: false }] }
  const unrecoverableOutput = join(folder, 'unrecoverable-aac.mp4'), unrecoverableReportPath = join(folder, 'unrecoverable-aac.report.json')
  let unrecoverableError = ''
  try {
    await runEditorV6Export(unrecoverableProject, { ...options, startFrame: 0, endFrame: 4, turbo: false }, { ...base, id: randomUUID(), outputPath: unrecoverableOutput, reportPath: unrecoverableReportPath, audioPath: () => join(folder, 'media', unrecoverableAacFileName) })
  } catch (error) { unrecoverableError = String(error) }
  let unrecoverableWasPublished = true
  try { await stat(unrecoverableOutput) } catch { unrecoverableWasPublished = false }
  const unrecoverableReport = JSON.parse(await readFile(unrecoverableReportPath, 'utf8'))
  assert(unrecoverableError.includes('Fixture AAC sem quadros válidos') && unrecoverableError.includes('não foi publicado') && !unrecoverableWasPublished && unrecoverableReport.state === 'failed', 'A exportação publicou silêncio ou não identificou a fonte sem quadros AAC recuperáveis.')
  const libraryFolder = join(folder, 'library')
  await mkdir(libraryFolder, { recursive: true })
  const libraryVideoId = randomUUID(), libraryVideoFileName = `${libraryVideoId}.mp4`
  await copyFile(videoPath, join(libraryFolder, libraryVideoFileName))
  const linkedProject: EditorV6Document = {
    ...mediaProject,
    media: mediaProject.media!.map((media) => media.id === videoId ? { ...media, id: libraryVideoId, fileName: libraryVideoFileName, libraryVideoId } : media),
    timeline: { ...mediaProject.timeline, tracks: mediaProject.timeline.tracks.map((track) => track.kind === 'video' ? { ...track, blocks: track.blocks.map((block) => ({ ...block, mediaId: libraryVideoId })) } : track) }
  }
  const linkedOutput = join(folder, 'library-linked.mp4')
  const linkedReport = await runEditorV6Export(linkedProject, { ...options, startFrame: 0, endFrame: 30 }, { ...base, id: randomUUID(), outputPath: linkedOutput, reportPath: join(folder, 'library-linked.report.json'), mediaPath: (_projectId, fileName, libraryId) => join(folder, libraryId ? 'library' : 'media', fileName), audioPath: (clip) => join(folder, clip.libraryVideoId ? 'library' : 'media', clip.fileName) })
  assert(!linkedReport.fallback && linkedReport.videoInputs === 1 && linkedReport.audioClips === 2, 'Vídeo vinculado por ID não chegou ao preview de exportação e à mixagem de áudio.')
  project = silent
  const fullHd = await runEditorV6Export(silent, { ...options, startFrame: 45, endFrame: 47, width: 1920, height: 1080 }, { ...base, id: randomUUID(), outputPath: join(folder, '1080p.mp4'), reportPath: join(folder, '1080p.report.json'), createWorker: (renderProject, _part, signal, layeredVideo) => makeWorker(signal, 1920, 1080, renderProject, layeredVideo) })
  assert(fullHd.totalFrames === 2 && !fullHd.fallback && active === 0, 'Exportação 1080p não concluiu com duas partes.')
  const hdPixels = run(['-i', join(folder, '1080p.mp4'), '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  let actorPixels = 0
  for (let offset = 0; offset < hdPixels.length; offset += 3) if (hdPixels[offset] > 180 && hdPixels[offset + 1] > 120 && hdPixels[offset + 2] < 80) actorPixels++
  assert(Math.abs(actorPixels - 384 * 432) < 384 * 432 * .02, `1080p distorceu a área do personagem: ${actorPixels} pixels, esperado ${384 * 432}.`)
  // Exercise the actual restricted sandbox preload, IPC queue and hidden bake worker.
  const owner = new BrowserWindow({ show: false, webPreferences: { sandbox: true, preload: join(root, 'out/preload/preload.cjs') } })
  await owner.loadURL('data:text/html,<html><body>isolated preload check</body></html>')
  assert(await owner.webContents.executeJavaScript('typeof window.desktop?.editorV6?.bakeEditorV6Motion === "function"'), 'Main sandbox preload did not expose the Editor V6 motion contract.')
  const bluePath = join(folder, 'blue.png')
  run(['-f','lavfi','-i','color=c=blue:s=16x16','-frames:v','1',bluePath])
  const blue = `data:image/png;base64,${(await readFile(bluePath)).toString('base64')}`
  const source: FabricatorProject = { schemaVersion: 1, slot: 1, name: 'Synthetic', sourceName: 'test', sourceAssetName: 'test', sourceDataUrl: '', width: 100, height: 100, tolerance: 0, updatedAt: new Date().toISOString(), joints: [], layerOrder: ['head','arm'], parts: [{ id: 'head', name: 'head', x: 35,y: 20,width: 30,height: 60,rotation: 0,dataUrl: project.assets[0].dataUrl },{id: 'arm',name: 'arm',x: 10,y: 50,width: 10,height: 10,rotation: 0,dataUrl: blue}] }
  const target = { ...source, parts: source.parts.map(p => p.id === 'arm' ? { ...p, x: 80 } : p) }
  const character: CustomizerCharacter = { id: 'alice',name: 'Alice',hair: '#000000',outfit: '#000000',skin: '#ffffff',createdAt: source.updatedAt,updatedAt: source.updatedAt,customization: { modelSlot: 1,poseSlot: null,partOverrides: {},layerOrder: [] } }
  ipcMain.handle('fabricator:load-slot', () => source)
  ipcMain.handle('fabricator:poses:load', (_event, _slot, pose) => pose === 1 ? source : target)
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: any[]) => any>()
  const service = createEditorV6MotionService({ ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); ipcMain.handle(channel, handler) } }, assertTrustedSender: () => {}, html: join(root, 'out/renderer/index.html'), preload: join(root, 'out/preload/editorV6MotionPreload.cjs') })
  let motionProject = prepareEditorV6PositionAtFrame(project, actor.id, 50)!.document
  motionProject = { ...motionProject, timeline: { ...motionProject.timeline, tracks: motionProject.timeline.tracks.map(t => t.kind !== 'character' ? t : { ...t, blocks: t.blocks.map(b => ({ ...b, state: { ...b.state!, poseSlot: b.startFrame === 50 ? 2 : 1 } })) }) } }
  const plan = editorV6MotionPlans(motionProject)[0]
  assert(plan.endFrame === 50 && plan.startFrame === 42.5, 'Motion fixture does not straddle Turbo seam.')
  const event = { sender: owner.webContents, senderFrame: owner.webContents.mainFrame } as IpcMainInvokeEvent
  const bake = handlers.get(editorV6IpcChannels.bakeEditorV6Motion)!
  const cancelId = randomUUID()
  const pending = bake(event,{id:cancelId,plan,character}).then(()=>false,()=>true)
  await handlers.get(editorV6IpcChannels.cancelEditorV6Motion)!(event,cancelId)
  assert(await pending, 'Motion cancellation failed.')
  const staticProject = project
  project = motionProject
  const motionOutput = join(folder, 'motion-turbo.mp4')
  const animated = await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: motionOutput, reportPath: join(folder, 'motion.report.json'), getCharacters: async () => [character], bakeMotion: (request, signal) => service.bakeForExport(request, signal) })
  assert(!animated.fallback && animated.motionTransitionsRequired === 1 && animated.motionTransitionsPrepared === 1 && animated.attempts[0].parts.reduce((sum,p)=>sum+p.rendered,0) >= 7 && progressMessages.some((message) => message === 'Preparando transição 1/1 · Alice…'), 'Export did not prepare missing transitions with visible progress before rendering.')
  const motionRgb = run(['-i',motionOutput,'-vf',"select='between(n,38,42)'",'-fps_mode','passthrough','-frames:v','5','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
  const frameBytes = 320*180*3
  for (let i=1;i<5;i++) assert(!motionRgb.subarray((i-1)*frameBytes,i*frameBytes).equals(motionRgb.subarray(i*frameBytes,(i+1)*frameBytes)), 'Motion froze across the Turbo seam.')
  const videoMotionBase: EditorV6Document = {
    ...motionProject, backgroundColor: '#2050c0', media: mediaProject.media,
    timeline: { ...motionProject.timeline, tracks: motionProject.timeline.tracks.map((track) => track.kind === 'video'
      ? { ...track, blocks: [{ ...mediaProject.timeline.tracks.find((candidate) => candidate.kind === 'video')!.blocks[0], startFrame: 0, durationFrames: 90, mediaInFrame: 0 }] }
      : track) }
  }
  const videoMotionProject = editEditorV6BackgroundAtFrame(videoMotionBase, 45, { backgroundColor: '#00ff00' })
  const videoMotionOutput = join(folder, 'video-motion-turbo.mp4')
  const videoMotion = await runEditorV6Export(videoMotionProject, options, { ...base, id: randomUUID(), outputPath: videoMotionOutput, reportPath: join(folder, 'video-motion.report.json'), getCharacters: async () => [character], bakeMotion: (request, signal) => service.bakeForExport(request, signal) })
  assert(!videoMotion.fallback && videoMotion.motionTransitionsRequired === 1 && videoMotion.videoInputs === 1, 'A transição com vídeo na composição não concluiu o export.')
  assert(videoMotion.attempts[0].parts.every((part) => part.frameTiming?.backgroundCaptureMs?.samples === 1 && (part.frameTiming?.foregroundCaptureMs?.samples ?? 0) > 1), 'O fundo estático foi recapturado a cada mudança do personagem, ou a captura da camada mudou sem necessidade.')
  const transitionFrames = run(['-i', videoMotionOutput, '-vf', "select='between(n,38,44)'", '-fps_mode', 'passthrough', '-frames:v', '7', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  for (let index = 0; index < 7; index++) {
    const offset = index * frameBytes + (10 * 320 + 10) * 3
    const backgroundPixel = Array.from(transitionFrames.subarray(offset, offset + 3))
    const backgroundIsBlue = index < 2 && backgroundPixel[0] < 45 && backgroundPixel[1] > 55 && backgroundPixel[2] > 150
    const backgroundIsGreen = index >= 2 && backgroundPixel[0] < 45 && backgroundPixel[1] > 150 && backgroundPixel[2] < 80
    assert(backgroundIsBlue || backgroundIsGreen, `A captura de fundo piscou ou ignorou a mudança do quadro ${index}: ${backgroundPixel.join(',')}.`)
    let characterPixels = 0
    for (let y = 35; y < 145; y++) for (let x = 175; x < 315; x++) {
      const offset = index * frameBytes + (y * 320 + x) * 3
      const red = transitionFrames[offset], green = transitionFrames[offset + 1], blue = transitionFrames[offset + 2]
      if (red > 160 && green > 100 && green < 245 && blue < 100) characterPixels++
    }
    assert(characterPixels > 50, `O personagem sumiu durante a troca de pose no quadro ${index} (${characterPixels} pixels detectados).`)
  }
  const uniqueCaptureFrameCount = 60
  let uniqueCaptureProject = silent
  for (let frame = 0; frame < uniqueCaptureFrameCount; frame++) {
    const red = (frame * 47) % 256, green = (frame * 89 + 40) % 256, blue = (frame * 131 + 80) % 256
    const backgroundColor = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
    uniqueCaptureProject = editEditorV6BackgroundAtFrame(uniqueCaptureProject, frame, { backgroundColor })
  }
  const uniqueCapture320Output = join(folder, 'capture-profile-unique-320.mp4')
  const uniqueCapture320 = await runEditorV6Export(uniqueCaptureProject, { ...options, startFrame: 0, endFrame: uniqueCaptureFrameCount, turbo: false }, {
    ...base, id: randomUUID(), outputPath: uniqueCapture320Output, reportPath: join(folder, 'capture-profile-unique-320.report.json')
  })
  const uniqueCapture1080Output = join(folder, 'capture-profile-unique-1080.mp4')
  capturePageHashes = []
  const uniqueCapture1080 = await runEditorV6Export(uniqueCaptureProject, { ...options, startFrame: 0, endFrame: uniqueCaptureFrameCount, width: 1920, height: 1080, turbo: false }, {
    ...base, id: randomUUID(), outputPath: uniqueCapture1080Output, reportPath: join(folder, 'capture-profile-unique-1080.report.json'),
    createWorker: (renderProject, _part, signal, layeredVideo) => makeWorker(signal, 1920, 1080, renderProject, layeredVideo)
  })
  const uniqueCapturePageHashes = capturePageHashes
  capturePageHashes = null
  const assertUniqueCaptureProfile = (profile: EditorV6ExportReport, resolution: string) => {
    const parts = profile.attempts.flatMap((attempt) => attempt.parts)
    assert(profile.state === 'completed' && !profile.fallback && profile.totalFrames === uniqueCaptureFrameCount, `Perfil ${resolution} não exportou os ${uniqueCaptureFrameCount} quadros únicos.`)
    assert(parts.reduce((sum, part) => sum + part.rendered, 0) === uniqueCaptureFrameCount && parts.reduce((sum, part) => sum + part.reused, 0) === 0, `Perfil ${resolution} reutilizou quadros; a amostra de captura não ficou completa.`)
    assert(parts.reduce((sum, part) => sum + (part.frameTiming?.capturePageMs?.samples ?? 0), 0) === uniqueCaptureFrameCount, `Perfil ${resolution} não mediu capturePage em todos os quadros.`)
  }
  assertUniqueCaptureProfile(uniqueCapture320, '320p')
  assertUniqueCaptureProfile(uniqueCapture1080, '1080p')
  assert(uniqueCapturePageHashes?.length === uniqueCaptureFrameCount && new Set(uniqueCapturePageHashes).size === uniqueCaptureFrameCount, 'capturePage não produziu 60 capturas únicas no perfil 1080p.')
  service.cancelAll(); await service.drain(); owner.destroy()
  project = staticProject
  assert(!(await readdir(folder)).some((name) => name.startsWith('editor-v6-export-') || name.startsWith('.editor-v6-')), 'Temporários de exportação não foram removidos.')
  factory.dispose()
  const paintCaptureHashes: string[] = []
  const paintFactory = createEditorV6WorkerFactory({
    ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName), captureMode: 'paint-event',
    inspectCapture: async ({ bitmap }) => { paintCaptureHashes.push(createHash('sha256').update(bitmap).digest('hex')) }
  })
  const uniquePaint1080Output = join(folder, 'capture-profile-paint-1080.mp4')
  const uniquePaint1080 = await runEditorV6Export(uniqueCaptureProject, { ...options, startFrame: 0, endFrame: uniqueCaptureFrameCount, width: 1920, height: 1080, turbo: false }, {
    ...base, id: randomUUID(), outputPath: uniquePaint1080Output, reportPath: join(folder, 'capture-profile-paint-1080.report.json'),
    createWorker: (renderProject, _part, signal, layeredVideo) => makeWorkerWithFactory(paintFactory, signal, 1920, 1080, renderProject, layeredVideo)
  })
  paintFactory.dispose()
  const separateWorkerPaintParity = {
    capturePageFrames: uniqueCapturePageHashes?.length ?? 0,
    paintEventFrames: paintCaptureHashes.length,
    exactFrameParity: uniqueCapturePageHashes?.length === uniqueCaptureFrameCount && paintCaptureHashes.length === uniqueCaptureFrameCount && uniqueCapturePageHashes.every((hash, index) => hash === paintCaptureHashes[index]),
    firstDivergentFrame: uniqueCapturePageHashes?.findIndex((hash, index) => hash !== paintCaptureHashes[index]) ?? -1
  }
  assert(uniquePaint1080.totalFrames === uniqueCaptureFrameCount && !uniquePaint1080.fallback && active === 0, 'O perfil paint-event 1080p não concluiu os 60 quadros ou deixou renderizadores abertos.')
  assert(paintCaptureHashes.length === uniqueCaptureFrameCount, `paint-event capturou ${paintCaptureHashes.length}/${uniqueCaptureFrameCount} quadros no perfil 1080p.`)
  assert(separateWorkerPaintParity.exactFrameParity, `As capturas em workers separados divergem no quadro ${separateWorkerPaintParity.firstDivergentFrame}; investigar antes de promover paint-event.`)
  const skipSameWorkerPaint = process.env.GACHA_EDITOR_V6_SKIP_SAME_WORKER_PAINT === '1'
  let sameWorkerPaintParity: EditorV6ExportReport | undefined
  if (!skipSameWorkerPaint) {
    const sameWorkerPaintFactory = createEditorV6WorkerFactory({
      ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
      mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName), captureMode: 'compare-paint'
    })
    const sameWorkerPaintOutput = join(folder, 'capture-profile-same-worker-1080.mp4')
    try {
      sameWorkerPaintParity = await runEditorV6Export(uniqueCaptureProject, { ...options, startFrame: 0, endFrame: uniqueCaptureFrameCount, width: 1920, height: 1080, turbo: false }, {
        ...base, id: randomUUID(), outputPath: sameWorkerPaintOutput, reportPath: join(folder, 'capture-profile-same-worker-1080.report.json'),
        createWorker: (renderProject, _part, signal, layeredVideo) => makeWorkerWithFactory(sameWorkerPaintFactory, signal, 1920, 1080, renderProject, layeredVideo)
      })
    } finally { sameWorkerPaintFactory.dispose() }
    const sameWorkerParts = sameWorkerPaintParity.attempts.flatMap((attempt) => attempt.parts)
    const sameWorkerPaintParityPassed = sameWorkerPaintParity.state === 'completed'
      && !sameWorkerPaintParity.fallback
      && sameWorkerPaintParity.totalFrames === uniqueCaptureFrameCount
      && sameWorkerParts.reduce((sum, part) => sum + part.rendered, 0) === uniqueCaptureFrameCount
      && sameWorkerParts.reduce((sum, part) => sum + part.reused, 0) === 0
      && sameWorkerParts.reduce((sum, part) => sum + (part.frameTiming?.capturePageMs?.samples ?? 0), 0) === uniqueCaptureFrameCount
    assert(sameWorkerPaintParityPassed && active === 0, 'A comparação paint/capturePage no mesmo worker não verificou os 60 tokens/quadro ou deixou renderizadores abertos.')
  }
  const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const hairAvatarBase = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><path d="M18 157 Q22 117 43 111 L47 96 76 96 80 111 Q105 119 107 157Z" fill="#48527a" stroke="#25263b" stroke-width="4"/><path d="M25 79 Q8 51 25 26 Q40 4 67 12 Q103 12 104 51 L94 102 80 115 39 108 26 95Z" fill="#302b42" stroke="#201d2b" stroke-width="5"/><ellipse cx="61" cy="66" rx="27" ry="34" fill="#f2c5a5" stroke="#9a625b" stroke-width="3"/><path d="M33 62 Q29 23 57 15 Q91 7 99 43 Q83 31 68 37 Q49 26 33 62Z" fill="#343044" stroke="#201d2b" stroke-width="4"/></svg>')
  const faceSurface = (eyes: string, mouth: string) => svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><g stroke="#302b42" stroke-linecap="round" stroke-linejoin="round">${eyes}<path d="M59 72l-3 8 5 1" fill="none" stroke-width="2"/><path d="${mouth}" fill="#a93c61" stroke-width="2.5"/></g></svg>`)
  const faceSurfaces = [
    { id: 'synthetic-face-neutral', dataUrl: faceSurface('<path d="M42 59q8-7 16 0M65 59q8-7 16 0" fill="none" stroke-width="3"/><circle cx="50" cy="62" r="3.5" fill="#28243a"/><circle cx="73" cy="62" r="3.5" fill="#28243a"/>', 'M55 88q6 4 12 0') },
    { id: 'synthetic-face-talk', dataUrl: faceSurface('<path d="M42 59q8-7 16 0M65 59q8-7 16 0" fill="none" stroke-width="3"/><circle cx="50" cy="62" r="3.5" fill="#28243a"/><circle cx="73" cy="62" r="3.5" fill="#28243a"/>', 'M55 85q6-2 12 0q-1 11-6 11q-5 0-6-11') },
    { id: 'synthetic-face-blink', dataUrl: faceSurface('<path d="M42 62q8 4 16 0M65 62q8 4 16 0" fill="none" stroke-width="3"/>', 'M55 88q6 4 12 0') },
    { id: 'synthetic-face-talk-blink', dataUrl: faceSurface('<path d="M42 62q8 4 16 0M65 62q8 4 16 0" fill="none" stroke-width="3"/>', 'M55 85q6-2 12 0q-1 11-6 11q-5 0-6-11') }
  ]
  const hairFaceVideoProject: EditorV6Document = {
    ...faceProject, media: mediaProject.media,
    timeline: { ...faceProject.timeline, tracks: faceProject.timeline.tracks.map(track => track.kind === 'video'
      ? { ...track, blocks: mediaProject.timeline.tracks.find(candidate => candidate.kind === 'video')!.blocks }
      : track) }
  }
  const syntheticHairPreset = {
    ...FIRST_HAIR_MOTION_PRESET,
    physics: { ...FIRST_HAIR_MOTION_PRESET.physics, wind: 100, gust: 100, speed: 200, stiffness: 24, damping: 32, responsiveness: 75, anchor: 8 },
    enabled: { back: false, front: false, fringe: true },
    intensity: { back: 0, front: 0, fringe: 150 }
  }
  const syntheticHairMotion: EditorV6HairMotionBundle = {
    presetSlot: 1, preset: syntheticHairPreset,
    surfaces: [{ id: 'synthetic-avatar-base', dataUrl: hairAvatarBase }, ...faceSurfaces],
    textures: [{ id: 'synthetic-moving-fringe', dataUrl: svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64" viewBox="0 0 80 64"><path d="M5 8 Q24 1 39 9 Q55 16 76 5 Q68 30 48 31 Q29 32 18 58 Q19 34 5 8Z" fill="#282433"/><path d="M11 10 Q28 6 40 14 Q55 21 70 10 Q62 26 46 27 Q28 28 21 48 Q21 30 11 10Z" fill="#827c96"/><path d="M19 13 Q34 12 43 18 Q54 22 64 17 Q55 24 44 23 Q31 23 24 36Z" fill="#d8d4e0"/></svg>') }],
    rigs: [
      [assetId, 'synthetic-face-neutral'], [talkAssetId, 'synthetic-face-talk'], [blinkAssetId, 'synthetic-face-blink'], [talkBlinkAssetId, 'synthetic-face-talk-blink']
    ].map(([rigAssetId, faceSurfaceId]) => ({
      elementId: faceActor.id, assetId: rigAssetId, characterId: 'alice', poseSlot: null,
      baseSurfaceId: 'synthetic-avatar-base', faceSurfaceId, eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null,
      artworkWidth: 120, artworkHeight: 160, outputWidth: 120, outputHeight: 160, shapeScaleX: 1, shapeScaleY: 1,
      sourceCrop: { left: 0, top: 0, width: 120, height: 160 }, sourceHead: { width: 60, height: 70 },
      targetHead: { x: 30, y: 30, width: 60, height: 68, rotation: 0 },
      layers: [{ id: 'synthetic-fringe', textureId: 'synthetic-moving-fringe', side: 'fringe' as const, width: 78, height: 58, x: 0, y: -36, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0.25 }]
    }))
  }
  const animatedHairCaptureDigests: Array<{ frame: number; layer?: 'background' | 'foreground'; digest: string }> = []
  const hairFaceCompareFactory = createEditorV6WorkerFactory({
    ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName), captureMode: 'compare-paint',
    inspectCapture: async ({ frame, layer, bitmap }) => {
      if (layer !== 'foreground') return
      const digest = createHash('sha256')
      for (let y = 48; y < 104; y++) digest.update(bitmap.subarray((y * 320 + 200) * 4, (y * 320 + 280) * 4))
      animatedHairCaptureDigests.push({ frame, layer, digest: digest.digest('hex') })
    }
  })
  const layeredHairFaceOutput = join(folder, 'capture-profile-layered-hair-face.mp4')
  const layeredHairFaceParity = await runEditorV6Export(hairFaceVideoProject, { ...options, startFrame: 0, endFrame: 40, turbo: false }, {
    ...base, id: randomUUID(), outputPath: layeredHairFaceOutput, reportPath: join(folder, 'capture-profile-layered-hair-face.report.json'),
    getCharacters: async () => [mouthCharacter], bakeMotion: bakeMouthLoop,
    createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => {
      assert(layeredVideo, 'A fixture de cabelo/face não ativou a renderização de vídeo em camadas.')
      return makeWorkerWithFactory(hairFaceCompareFactory, signal, 320, 180, renderProject, layeredVideo, mouthLoops, syntheticHairMotion)
    }
  })
  hairFaceCompareFactory.dispose()
  const layeredHairFaceParts = layeredHairFaceParity.attempts.flatMap(attempt => attempt.parts)
  const layeredHairRasterFrames = layeredHairFaceParts.reduce((sum, part) => sum + (part.frameMetrics?.hairRasterFrames ?? 0), 0)
  const layeredBackgroundCaptureSamples = layeredHairFaceParts.reduce((sum, part) => sum + (part.frameTiming?.backgroundCaptureMs?.samples ?? 0), 0)
  const layeredForegroundCaptureSamples = layeredHairFaceParts.reduce((sum, part) => sum + (part.frameTiming?.foregroundCaptureMs?.samples ?? 0), 0)
  const sameWorkerLayerComparisons = layeredBackgroundCaptureSamples + layeredForegroundCaptureSamples
  const earlyAnimatedHairDigests = animatedHairCaptureDigests.filter(item => item.frame < 8).map(item => item.digest)
  const layeredHairFaceParityPassed = layeredHairFaceParity.state === 'completed' && !layeredHairFaceParity.fallback
    && layeredHairFaceParity.totalFrames === 40 && layeredHairFaceParity.videoInputs === 1
    && layeredHairRasterFrames >= 30 && layeredBackgroundCaptureSamples > 0 && layeredForegroundCaptureSamples >= 30
    && sameWorkerLayerComparisons === 41
    && new Set(earlyAnimatedHairDigests).size > 1 && active === 0
  assert(layeredHairFaceParityPassed, `Paridade de vídeo/cabelo/face no mesmo worker incompleta: quadros=${layeredHairFaceParity.totalFrames}, camadas=${layeredBackgroundCaptureSamples}/${layeredForegroundCaptureSamples}, cabelo=${layeredHairRasterFrames}, cabelo animado único=${new Set(earlyAnimatedHairDigests).size}, workers=${active}.`)

  // Compare the production stacked readback with the old serial path on the
  // same animated/video/face fixture. Hash raw BGRA layers before encoding.
  const layerModeRuns: Record<'serial' | 'stacked', Array<{ milliseconds: number; frames: number; rendered: number; capturePageMs: number; ffmpegWriteMs: number; effectiveFps: number }>> = { serial: [], stacked: [] }
  let layerModeParity = { compared: 0, exact: 0, withinTolerance: 0, maxChannelDelta: 0, alphaDifferentBytes: 0, outsideTolerance: [] as Array<{ frame: number; layer: string; changedPixels: number; maxDelta: number; alphaDifferentBytes: number }> }
  const median = (values: number[]) => {
    const ordered = [...values].sort((a, b) => a - b)
    return ordered.length % 2 ? ordered[(ordered.length - 1) / 2] : (ordered[(ordered.length / 2) - 1] + ordered[ordered.length / 2]) / 2
  }
  for (let repetition = 0; repetition < 3; repetition++) {
    const order = repetition % 2 === 0 ? ['serial', 'stacked'] as const : ['stacked', 'serial'] as const
    const digestRuns: Partial<Record<'serial' | 'stacked', Array<{ frame: number; layer: 'background' | 'foreground'; digest: string }>>> = {}
    for (const mode of order) {
      const digests: Array<{ frame: number; layer: 'background' | 'foreground'; digest: string; bitmap: Buffer }> = []
      digestRuns[mode] = digests
      const modeFactory = createEditorV6WorkerFactory({
        ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
        mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName),
        inspectCapture: async ({ frame, layer, bitmap }) => {
          if (layer === 'background' || layer === 'foreground') digests.push({ frame, layer, digest: createHash('sha256').update(bitmap).digest('hex'), bitmap: Buffer.from(bitmap) })
        }
      })
      const outputPath = join(folder, `layer-capture-${mode}-${repetition}.mp4`)
      const reportPath = join(folder, `layer-capture-${mode}-${repetition}.report.json`)
      const previousMode = process.env.GACHA_EDITOR_V6_LAYER_CAPTURE
      if (mode === 'serial') process.env.GACHA_EDITOR_V6_LAYER_CAPTURE = 'serial'
      else delete process.env.GACHA_EDITOR_V6_LAYER_CAPTURE
      const startedAt = performance.now()
      let profile: EditorV6ExportReport
      try {
        profile = await runEditorV6Export(hairFaceVideoProject, { ...options, startFrame: 0, endFrame: 40, turbo: false }, {
          ...base, id: randomUUID(), outputPath, reportPath, getCharacters: async () => [mouthCharacter], bakeMotion: bakeMouthLoop,
          createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => {
            assert(layeredVideo, 'O benchmark de camadas precisa exercitar a composição de vídeo.')
            return makeWorkerWithFactory(modeFactory, signal, 320, 180, renderProject, layeredVideo, mouthLoops, syntheticHairMotion, mode === 'stacked')
          }
        })
      } finally {
        if (previousMode === undefined) delete process.env.GACHA_EDITOR_V6_LAYER_CAPTURE
        else process.env.GACHA_EDITOR_V6_LAYER_CAPTURE = previousMode
        modeFactory.dispose()
      }
      const wallMilliseconds = performance.now() - startedAt
      const parts = profile.attempts.flatMap(attempt => attempt.parts)
      const frames = parts.reduce((sum, part) => sum + part.frames, 0)
      const rendered = parts.reduce((sum, part) => sum + part.rendered, 0)
      const capturePageMs = parts.reduce((sum, part) => sum + (part.frameTiming?.capturePageMs?.totalMs ?? 0), 0)
      const ffmpegWriteMs = parts.reduce((sum, part) => sum + (part.frameTiming?.ffmpegWriteMs?.totalMs ?? 0), 0)
      assert(profile.state === 'completed' && !profile.fallback && frames === 40 && profile.videoInputs === 1 && active === 0,
        `Benchmark ${mode} #${repetition + 1} não exportou os 40 quadros de vídeo/cabelo (${frames}, estado ${profile.state}).`)
      layerModeRuns[mode].push({ milliseconds: wallMilliseconds, frames, rendered, capturePageMs, ffmpegWriteMs, effectiveFps: frames * 1000 / wallMilliseconds })
    }

    const serial = digestRuns.serial ?? []
    for (const actual of digestRuns.stacked ?? []) {
      const expected = serial.filter(candidate => candidate.layer === actual.layer && candidate.frame <= actual.frame)
        .sort((left, right) => right.frame - left.frame)[0]
      if (!expected) {
        layerModeParity.outsideTolerance.push({ frame: actual.frame, layer: actual.layer, changedPixels: -1, maxDelta: 255, alphaDifferentBytes: 1 })
        continue
      }
      layerModeParity.compared++
      if (expected.digest === actual.digest) { layerModeParity.exact++; continue }
      let changedPixels = 0, maxDelta = 0, alphaDifferentBytes = 0
      for (let pixel = 0; pixel < Math.min(expected.bitmap.length, actual.bitmap.length); pixel += 4) {
        let pixelChanged = false
        for (let channel = 0; channel < 3; channel++) {
          const delta = Math.abs(expected.bitmap[pixel + channel] - actual.bitmap[pixel + channel])
          maxDelta = Math.max(maxDelta, delta)
          pixelChanged ||= delta !== 0
        }
        if (expected.bitmap[pixel + 3] !== actual.bitmap[pixel + 3]) alphaDifferentBytes++
        if (pixelChanged) changedPixels++
      }
      layerModeParity.maxChannelDelta = Math.max(layerModeParity.maxChannelDelta, maxDelta)
      layerModeParity.alphaDifferentBytes += alphaDifferentBytes
      // Permit only rasterizer rounding of at most one 8-bit color value in
      // <=0.01% of pixels. Alpha, layer ordering and meaningful color changes
      // must remain identical across the two capture layouts.
      const maxToleratedPixels = Math.floor(Math.min(expected.bitmap.length, actual.bitmap.length) / 4 * 0.0001)
      if (maxDelta <= 1 && alphaDifferentBytes === 0 && changedPixels <= maxToleratedPixels) layerModeParity.withinTolerance++
      else if (layerModeParity.outsideTolerance.length < 8) layerModeParity.outsideTolerance.push({ frame: actual.frame, layer: actual.layer, changedPixels, maxDelta, alphaDifferentBytes })
    }
  }
  assert(layerModeParity.outsideTolerance.length === 0 && layerModeParity.compared >= 120,
    `A captura stacked divergiu além da tolerância de rasterização em ${layerModeParity.outsideTolerance.length} amostras: ${JSON.stringify(layerModeParity.outsideTolerance)}.`)
  const layerModeSummary = {
    repetitions: 3, uncontrolledMachine: true, layerComparisons: layerModeParity.compared, exactLayerComparisons: layerModeParity.exact,
    oneLsbToleranceComparisons: layerModeParity.withinTolerance, maxChannelDelta: layerModeParity.maxChannelDelta, alphaDifferentBytes: layerModeParity.alphaDifferentBytes,
    outsideTolerance: layerModeParity.outsideTolerance.length,
    serial: { runs: layerModeRuns.serial, medianMilliseconds: median(layerModeRuns.serial.map(run => run.milliseconds)), medianEffectiveFps: median(layerModeRuns.serial.map(run => run.effectiveFps)) },
    stacked: { runs: layerModeRuns.stacked, medianMilliseconds: median(layerModeRuns.stacked.map(run => run.milliseconds)), medianEffectiveFps: median(layerModeRuns.stacked.map(run => run.effectiveFps)) }
  }
  const captureProfile = (exportReport: EditorV6ExportReport) => exportReport.attempts.flatMap((attempt) => attempt.parts.map((part) => ({
    frames: part.frames,
    rendered: part.rendered,
    reused: part.reused,
    frameRoundTripMs: part.frameTiming?.frameRoundTripMs,
    ipcDrawMs: part.frameTiming?.ipcDrawMs,
    captureMs: part.frameTiming?.captureMs,
    capturePageMs: part.frameTiming?.capturePageMs,
    paintWaitMs: part.frameTiming?.paintWaitMs,
    captureBitmapMs: part.frameTiming?.captureBitmapMs,
    backgroundCaptureMs: part.frameTiming?.backgroundCaptureMs,
    foregroundCaptureMs: part.frameTiming?.foregroundCaptureMs,
    ffmpegWriteMs: part.frameTiming?.ffmpegWriteMs,
    frameMetrics: part.frameMetrics
  })))
  assert(captureProfile(fullHd).every((part) => (part.captureBitmapMs?.samples ?? 0) > 0), 'O teste 1080p não registrou custo de conversão/cópia do bitmap.')
  assert(captureProfile(videoMotion).every((part) => (part.backgroundCaptureMs?.samples ?? 0) > 0 && (part.foregroundCaptureMs?.samples ?? 0) > 0), 'O teste com vídeo em camadas não separou a captura do fundo e do primeiro plano.')
  const summary = { passed: true, peakWorkers: peak, frames: 81, reused: report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0), audioContinuousAtSeam: true, fallback: fallback.fallback, cancelledDestinationPreserved: true, singleFrame: true, fullHd: true, fullHdActorPixels: actorPixels, sandboxPreloads: true, motionAcrossTurboSeam: true, motionCancelled: true, output,
    nativeRendererParity,
    native1080Benchmark,
    nativeFullExport: { state: nativeExport.state, frames: nativeExport.totalFrames, rendered: nativePart?.rendered, reused: nativePart?.reused, timings: nativePart?.frameTiming },
    captureProfile: {
      turbo320: captureProfile(report), fullHd1080: captureProfile(fullHd), layeredVideo320: captureProfile(videoMotion),
      unique320: { totalFrames: uniqueCapture320.totalFrames, milliseconds: uniqueCapture320.milliseconds, parts: captureProfile(uniqueCapture320) },
      unique1080: { totalFrames: uniqueCapture1080.totalFrames, milliseconds: uniqueCapture1080.milliseconds, uniqueFrames: uniqueCapturePageHashes?.length, parts: captureProfile(uniqueCapture1080) },
      paintEvent1080: { totalFrames: uniquePaint1080.totalFrames, milliseconds: uniquePaint1080.milliseconds, parts: captureProfile(uniquePaint1080) },
      separateWorkerPaintParity,
      sameWorkerPaintParity: skipSameWorkerPaint
        ? { passed: false, skipped: true, reason: 'GACHA_EDITOR_V6_SKIP_SAME_WORKER_PAINT=1' }
        : { passed: sameWorkerPaintParity?.state === 'completed', totalFrames: sameWorkerPaintParity?.totalFrames, milliseconds: sameWorkerPaintParity?.milliseconds, parts: captureProfile(sameWorkerPaintParity!) },
      layeredHairFacePaintParity: {
        passed: layeredHairFaceParityPassed,
        totalFrames: layeredHairFaceParity.totalFrames,
        milliseconds: layeredHairFaceParity.milliseconds,
        videoInputs: layeredHairFaceParity.videoInputs,
        sameWorkerLayerComparisons,
        backgroundCaptureSamples: layeredBackgroundCaptureSamples,
        foregroundCaptureSamples: layeredForegroundCaptureSamples,
        hairRasterFrames: layeredHairRasterFrames,
        distinctEarlyHairFrames: new Set(earlyAnimatedHairDigests).size,
        expressionFrames: faceModes.filter(Boolean).length,
        parts: captureProfile(layeredHairFaceParity)
      },
      layeredCaptureSerialVsStacked: layerModeSummary
    },
    mouthStress: { frames: mouthReport.totalFrames, fps: mouthReport.fps, milliseconds: mouthReport.milliseconds, memory: mouthReport.mainProcessMemory, phases: mouthReport.phaseMilliseconds, atlas: mouthReport.mouthAnimation, partFrames: mouthReport.attempts[0].parts.map((part) => part.frames), output: mouthOutput } }
  await writeFile(join(folder, 'result.json'), JSON.stringify(summary))
  console.log(JSON.stringify(summary, null, 2))
  app.exit(0)
}
const timeout = setTimeout(() => { console.error('Tempo limite do teste de exportação.'); app.exit(1) }, 120000)
void main().catch((error) => { clearTimeout(timeout); console.error(error); app.exit(1) })
