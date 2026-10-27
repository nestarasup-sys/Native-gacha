import { app, BrowserWindow, ipcMain, protocol, type IpcMainInvokeEvent } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'
import { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FabricatorProject } from '../../src/shared/fabricator'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, moveEditorV6ElementInPeriod, prepareEditorV6PositionAtFrame } from '../../src/shared/editorV6Timeline'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
app.setPath('userData', join(folder, 'profile'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})
process.on('unhandledRejection', (error) => { console.error('Rejeição não tratada no exportador:', error); app.exit(1) })
const ffmpeg = join(root, 'resources/video-tools/ffmpeg.exe'), ffprobe = join(root, 'resources/video-tools/ffprobe.exe')
const run = (args: string[]) => execFileSync(ffmpeg, ['-v', 'error', ...args], { windowsHide: true, maxBuffer: 16 * 1024 ** 2 })
async function main() {
  await app.whenReady()
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
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'), mediaPath: (_projectId, fileName, libraryVideoId) => join(folder, libraryVideoId ? 'library' : 'media', fileName) })
  let active = 0, peak = 0
  const makeWorker = async (signal: AbortSignal, width = 320, height = 180, renderProject = project, layeredVideo = false) => {
    active++; peak = Math.max(peak, active)
    try {
      const worker = await factory.create({ project: renderProject, width, height, layeredVideo }, signal)
      let closed = false
      return { frame: worker.frame, close: () => { if (closed) return; closed = true; active--; worker.close() } }
    } catch (error) { active--; throw error }
  }
  const options = { startFrame: 5, endFrame: 86, width: 320, height: 180, turbo: true, encoder: 'cpu' as const }
  const output = join(folder, 'turbo.mp4')
  const progressMessages: string[] = []
  const base = { ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: output, reportPath: join(folder, 'turbo.report.json'), signal: new AbortController().signal, getCharacters: async () => [], bakeMotion: async () => { throw Error('Unexpected motion bake.') }, createWorker: (renderProject: EditorV6Document, _part: unknown, signal: AbortSignal, layeredVideo: boolean) => makeWorker(signal, 320, 180, renderProject, layeredVideo), audioPath: () => audio, mediaPath: (_projectId: string, fileName: string) => join(folder, 'media', fileName), progress: (patch: { message?: string }) => { if (patch.message) progressMessages.push(patch.message) } }
  const report = await runEditorV6Export(project, options, base)
  assert(report.state === 'completed' && !report.fallback, 'Turbo não concluiu com duas partes.')
  assert(report.attempts[0].parts.map((part) => part.frames).sort((a, b) => a - b).join(',') === '40,41', 'Partes perderam ou repetiram quadros.')
  assert(report.attempts[0].parts.every((part) => (part.frameTiming?.frameRoundTripMs?.samples ?? 0) > 0 && (part.frameTiming?.rafWaitMs?.samples ?? 0) > 0 && (part.frameTiming?.captureMs?.samples ?? 0) > 0), 'O relatório não separou os tempos de renderização, espera RAF e captura por quadro.')
  assert(peak === 2 && active === 0, 'Os dois trabalhos não foram paralelos ou deixaram janelas abertas.')
  assert(report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0) > 60, 'Quadros estáticos não foram reaproveitados.')
  const rgb = run(['-i', output, '-vf', "select='eq(n,39)+eq(n,40)+eq(n,41)'", '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const pixel = (frame: number, x: number, y: number) => Array.from(rgb.subarray(frame * 320 * 180 * 3 + (y * 320 + x) * 3, frame * 320 * 180 * 3 + (y * 320 + x) * 3 + 3))
  assert(pixel(0, 10, 10)[2] > 200 && pixel(1, 10, 10)[1] > 200 && pixel(2, 10, 10)[1] > 200, 'Emenda avançou, repetiu quadros ou trocou os canais BGRA.')
  assert(pixel(1, 240, 90)[0] > 200 && pixel(1, 240, 90)[1] > 200 && pixel(1, 240, 90)[2] < 40, 'A segunda parte perdeu o estado do personagem anterior ao seu início.')
  const talkPath = join(folder, 'talk.png')
  run(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', talkPath])
  const talkAssetId = randomUUID(), thoughtId = randomUUID()
  const talkAsset = { id: talkAssetId, category: 'character' as const, name: 'Talk test', mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(talkPath)).toString('base64')}` }
  const faceActor = { ...actor, faceModeAssetIds: { talk: talkAssetId } }
  const thought = { id: thoughtId, kind: 'thought' as const, text: 'Teste', x: 0, y: -30, width: 28, height: 12, rotation: 0, zIndex: 2 }
  const faceProject: EditorV6Document = {
    ...project, title: 'Face state capture test', exportAudio: [], assets: [...project.assets, talkAsset], elements: [faceActor, thought],
    timeline: { ...project.timeline, durationFrames: 40, knownElementIds: [...project.timeline.knownElementIds ?? [], thoughtId], tracks: project.timeline.tracks.map((track) => track.kind === 'character'
      ? { ...track, blocks: track.blocks.map((block) => ({ ...block, state: block.state ? { ...block.state, faceModeAssetIds: { talk: talkAssetId } } : block.state })) }
      : track.kind === 'speech' ? { ...track, blocks: [{ id: randomUUID(), label: 'Talk window', characterId: 'alice', startFrame: 8, durationFrames: 12 }] }
        : track.kind === 'thought' ? { ...track, blocks: [{ id: randomUUID(), label: thought.text, elementId: thought.id, state: thought, startFrame: 20, durationFrames: 5 }] }
          : track)
    }
  }
  const faceOutput = join(folder, 'face-state.mp4')
  const faceReport = await runEditorV6Export(faceProject, { ...options, startFrame: 0, endFrame: 40 }, { ...base, id: randomUUID(), outputPath: faceOutput, reportPath: join(folder, 'face-state.report.json') })
  assert(!faceReport.fallback, 'Trocas de talk/pensamento não concluíram com a captura normal.')
  const faceFrames = run(['-i', faceOutput, '-frames:v', '40', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const faceFrameBytes = 320 * 180 * 3
  for (let frame = 0; frame < 40; frame++) {
    const offset = frame * faceFrameBytes + (90 * 320 + 240) * 3
    const [red, green, blue] = faceFrames.subarray(offset, offset + 3)
    const speaking = frame >= 8 && frame < 20
    assert(speaking ? red > 150 && green < 100 && blue < 100 : red > 150 && green > 100 && blue < 100,
      `O personagem teve quadro vazio ou rosto incorreto na troca ${speaking ? 'talk' : 'idle'} do quadro ${frame}: ${red},${green},${blue}.`)
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
  assert(JSON.parse(await readFile(join(folder, 'cancelled.report.json'), 'utf8')).state === 'cancelled', 'Cancelamento não salvou relatório.')
  const silent = { ...project, exportAudio: [] }
  const single = await runEditorV6Export(silent, { ...options, startFrame: 50, endFrame: 51 }, { ...base, id: randomUUID(), outputPath: join(folder, 'single.mp4'), reportPath: join(folder, 'single.report.json') })
  assert(single.totalFrames === 1 && single.attempts[0].parallelism === 1 && !single.fallback, 'Intervalo de um quadro não foi tratado corretamente.')
  await mkdir(join(folder, 'media'), { recursive: true })
  const videoId = randomUUID(), videoFileName = `${videoId}.mp4`, videoPath = join(folder, 'media', videoFileName)
  run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=600:sample_rate=48000:duration=4', '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'aac', '-shortest', videoPath])
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
  // Exercise the actual restricted sandbox preload, IPC queue and hidden bake worker.
  const owner = new BrowserWindow({ show: false, webPreferences: { sandbox: true, preload: join(root, 'out/preload/preload.cjs') } })
  await owner.loadURL('data:text/html,<html><body>isolated preload check</body></html>')
  assert(await owner.webContents.executeJavaScript('typeof window.desktop?.bakeEditorV6Motion === "function"'), 'Main sandbox preload failed to load; app pages would be empty.')
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
  service.cancelAll(); await service.drain(); owner.destroy()
  project = staticProject
  assert(!(await readdir(folder)).some((name) => name.startsWith('editor-v6-export-') || name.startsWith('.editor-v6-')), 'Temporários de exportação não foram removidos.')
  factory.dispose()
  const summary = { passed: true, peakWorkers: peak, frames: 81, reused: report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0), audioContinuousAtSeam: true, fallback: fallback.fallback, cancelledDestinationPreserved: true, singleFrame: true, fullHd: true, sandboxPreloads: true, motionAcrossTurboSeam: true, motionCancelled: true, output }
  await writeFile(join(folder, 'result.json'), JSON.stringify(summary))
  console.log(JSON.stringify(summary, null, 2))
  app.exit(0)
}
const timeout = setTimeout(() => { console.error('Tempo limite do teste de exportação.'); app.exit(1) }, 120000)
void main().catch((error) => { clearTimeout(timeout); console.error(error); app.exit(1) })
