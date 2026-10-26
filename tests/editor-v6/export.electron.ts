import { app, BrowserWindow, ipcMain, protocol, type IpcMainInvokeEvent } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'
import { editorV6MotionPlans, attachEditorV6Motion } from '../../src/shared/editorV6Motion'
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
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'), mediaPath: (_projectId, fileName) => join(folder, 'media', fileName) })
  let active = 0, peak = 0
  const makeWorker = async (signal: AbortSignal, width = 320, height = 180) => {
    active++; peak = Math.max(peak, active)
    try {
      const worker = await factory.create({ project, width, height }, signal)
      let closed = false
      return { frame: worker.frame, close: () => { if (closed) return; closed = true; active--; worker.close() } }
    } catch (error) { active--; throw error }
  }
  const options = { startFrame: 5, endFrame: 86, width: 320, height: 180, turbo: true, encoder: 'cpu' as const }
  const output = join(folder, 'turbo.mp4')
  const base = { ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: output, reportPath: join(folder, 'turbo.report.json'), signal: new AbortController().signal, createWorker: (_part: unknown, signal: AbortSignal) => makeWorker(signal), audioPath: () => audio, mediaPath: (_projectId: string, fileName: string) => join(folder, 'media', fileName), progress: () => {} }
  const report = await runEditorV6Export(project, options, base)
  assert(report.state === 'completed' && !report.fallback, 'Turbo não concluiu com duas partes.')
  assert(report.attempts[0].parts.map((part) => part.frames).sort((a, b) => a - b).join(',') === '40,41', 'Partes perderam ou repetiram quadros.')
  assert(peak === 2 && active === 0, 'Os dois trabalhos não foram paralelos ou deixaram janelas abertas.')
  assert(report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0) > 60, 'Quadros estáticos não foram reaproveitados.')
  const rgb = run(['-i', output, '-vf', "select='eq(n,39)+eq(n,40)+eq(n,41)'", '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const pixel = (frame: number, x: number, y: number) => Array.from(rgb.subarray(frame * 320 * 180 * 3 + (y * 320 + x) * 3, frame * 320 * 180 * 3 + (y * 320 + x) * 3 + 3))
  assert(pixel(0, 10, 10)[2] > 200 && pixel(1, 10, 10)[1] > 200 && pixel(2, 10, 10)[1] > 200, 'Emenda avançou, repetiu quadros ou trocou os canais BGRA.')
  assert(pixel(1, 240, 90)[0] > 200 && pixel(1, 240, 90)[1] > 200 && pixel(1, 240, 90)[2] < 40, 'A segunda parte perdeu o estado do personagem anterior ao seu início.')
  const sound = run(['-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
  const rms = (start: number, count: number) => { let sum = 0; for (let index = start; index < start + count; index++) sum += sound.readFloatLE(index * 4) ** 2; return Math.sqrt(sum / count) }
  assert(rms(0, 1000) < .001 && rms(24000, 1000) > .02 && rms(64000 - 500, 1000) > .02, 'Áudio perdeu atraso, volume ou continuidade na emenda.')
  let injected = false
  const fallback = await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: join(folder, 'fallback.mp4'), reportPath: join(folder, 'fallback.report.json'), createWorker: (part, signal) => { if (part.index === 1 && !injected) { injected = true; throw Error('Falha simulada na segunda parte.'); } return makeWorker(signal) } })
  assert(fallback.fallback && fallback.attempts.length === 2 && fallback.attempts[1].parallelism === 1 && active === 0, 'Recuperação segura não reiniciou e concluiu a exportação.')
  const preserved = join(folder, 'preserved.mp4'), controller = new AbortController()
  await writeFile(preserved, 'arquivo anterior')
  let calls = 0, cancelled = false
  try {
    await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: preserved, reportPath: join(folder, 'cancelled.report.json'), signal: controller.signal, createWorker: async (_part, signal) => {
      const worker = await makeWorker(signal)
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
    ? { ...track, blocks: [{ id: randomUUID(), label: 'Test pattern', mediaId: videoId, mediaInFrame: 15, startFrame: 5, durationFrames: 10, audioEnabled: true, gain: 1 }] }
    : track.kind === 'audio' ? { ...track, blocks: [{ id: randomUUID(), label: 'Tone', mediaId: audioId, mediaInFrame: 0, startFrame: 0, durationFrames: 90, audioEnabled: true, gain: .5 }] }
      : { ...track, blocks: track.blocks }) } }
  project = mediaProject
  const mediaOutput = join(folder, 'media-timeline.mp4')
  const mediaReport = await runEditorV6Export(mediaProject, { ...options, startFrame: 0, endFrame: 30 }, { ...base, id: randomUUID(), outputPath: mediaOutput, reportPath: join(folder, 'media-timeline.report.json'), audioPath: (clip) => join(folder, 'media', clip.fileName) })
  assert(!mediaReport.fallback && mediaReport.videoInputs === 1 && mediaReport.audioClips === 2, 'Mídias da timeline não chegaram ao exportador.')
  const mediaRgb = run(['-i', mediaOutput, '-vf', "select='eq(n,0)+eq(n,10)'", '-fps_mode', 'passthrough', '-frames:v', '2', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const mediaFrameBytes = 320 * 180 * 3
  assert(!mediaRgb.subarray(0, mediaFrameBytes).equals(mediaRgb.subarray(mediaFrameBytes, mediaFrameBytes * 2)), 'Vídeo importado não mudou quadro a quadro na composição exportada.')
  const actorOverVideo = Array.from(mediaRgb.subarray((90 * 320 + 160) * 3, (90 * 320 + 160) * 3 + 3))
  assert(actorOverVideo[0] > 200 && actorOverVideo[1] > 200 && actorOverVideo[2] < 40, 'O vídeo cobriu o personagem, embora a camada do vídeo deva ficar atrás dos personagens.')
  const firstPixel = Array.from(mediaRgb.subarray(10 * 3, 10 * 3 + 3))
  assert(firstPixel.every((channel) => channel < 25), 'A faixa de vídeo vazou para antes do início do clip.')
  const mediaSound = run(['-i', mediaOutput, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
  let mediaRms = 0
  for (let index = 0; index < 1000; index++) mediaRms += mediaSound.readFloatLE(index * 4) ** 2
  assert(Math.sqrt(mediaRms / 1000) > .02, 'O áudio dos vídeos/áudios importados não foi mixado no MP4.')
  project = silent
  const fullHd = await runEditorV6Export(silent, { ...options, startFrame: 45, endFrame: 47, width: 1920, height: 1080 }, { ...base, id: randomUUID(), outputPath: join(folder, '1080p.mp4'), reportPath: join(folder, '1080p.report.json'), createWorker: (_part, signal) => makeWorker(signal, 1920, 1080) })
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
  let missingRejected = false
  try { await runEditorV6Export(motionProject, options, base) } catch (error) { missingRejected = String(error).includes('preparação das animações') }
  assert(missingRejected, 'Backend accepted export with missing motion frames.')
  const result = await bake(event, { id: randomUUID(), plan, character })
  motionProject = attachEditorV6Motion(motionProject, plan.blockId, result)
  const staticProject = project
  project = motionProject
  const motionOutput = join(folder, 'motion-turbo.mp4')
  const animated = await runEditorV6Export(project, options, { ...base, id: randomUUID(), outputPath: motionOutput, reportPath: join(folder, 'motion.report.json') })
  assert(!animated.fallback && animated.attempts[0].parts.reduce((sum,p)=>sum+p.rendered,0) >= 7, 'Animated frames were reused or Turbo failed.')
  const motionRgb = run(['-i',motionOutput,'-vf',"select='between(n,38,42)'",'-fps_mode','passthrough','-frames:v','5','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
  const frameBytes = 320*180*3
  for (let i=1;i<5;i++) assert(!motionRgb.subarray((i-1)*frameBytes,i*frameBytes).equals(motionRgb.subarray(i*frameBytes,(i+1)*frameBytes)), 'Motion froze across the Turbo seam.')
  const cancelId = randomUUID()
  const pending = bake(event,{id:cancelId,plan,character}).then(()=>false,()=>true)
  await handlers.get(editorV6IpcChannels.cancelEditorV6Motion)!(event,cancelId)
  assert(await pending, 'Motion cancellation failed.')
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
