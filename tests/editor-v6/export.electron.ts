import { app, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editEditorV6BackgroundAtFrame, moveEditorV6ElementInPeriod, prepareEditorV6PositionAtFrame } from '../../src/shared/editorV6Timeline'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
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
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs') })
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
  const base = { ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: output, reportPath: join(folder, 'turbo.report.json'), signal: new AbortController().signal, createWorker: (_part: unknown, signal: AbortSignal) => makeWorker(signal), audioPath: () => audio, progress: () => {} }
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
  const fullHd = await runEditorV6Export(silent, { ...options, startFrame: 45, endFrame: 47, width: 1920, height: 1080 }, { ...base, id: randomUUID(), outputPath: join(folder, '1080p.mp4'), reportPath: join(folder, '1080p.report.json'), createWorker: (_part, signal) => makeWorker(signal, 1920, 1080) })
  assert(fullHd.totalFrames === 2 && !fullHd.fallback && active === 0, 'Exportação 1080p não concluiu com duas partes.')
  assert(!(await readdir(folder)).some((name) => name.startsWith('editor-v6-export-') || name.startsWith('.editor-v6-')), 'Temporários de exportação não foram removidos.')
  factory.dispose()
  const summary = { passed: true, peakWorkers: peak, frames: 81, reused: report.attempts[0].parts.reduce((sum, part) => sum + part.reused, 0), audioContinuousAtSeam: true, fallback: fallback.fallback, cancelledDestinationPreserved: true, singleFrame: true, fullHd: true, output }
  await writeFile(join(folder, 'result.json'), JSON.stringify(summary))
  console.log(JSON.stringify(summary, null, 2))
  app.exit(0)
}
const timeout = setTimeout(() => { console.error('Tempo limite do teste de exportação.'); app.exit(1) }, 120000)
void main().catch((error) => { clearTimeout(timeout); console.error(error); app.exit(1) })
