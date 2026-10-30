import { app, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6FaceModeAtFrame } from '../../src/shared/editorV6FaceSchedule'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
app.setPath('userData', join(folder, 'profile'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})
process.on('unhandledRejection', (error) => { console.error('Rejeição não tratada na validação silenciosa de faces:', error); app.exit(1) })

const ffmpeg = join(root, 'resources/video-tools/ffmpeg.exe')
const ffprobe = join(root, 'resources/video-tools/ffprobe.exe')
const runFfmpeg = (args: string[]) => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 32 * 1024 ** 2 })
const readPixels = (pixels: Buffer, frame: number, width: number, x: number, y: number) => {
  const offset = frame * width * 180 * 3 + (y * width + x) * 3
  return [...pixels.subarray(offset, offset + 3)]
}

async function main() {
  await app.whenReady()
  await mkdir(folder, { recursive: true })
  const colors = [
    ['idle', 'yellow'],
    ['talk', 'red'],
    ['blink', 'blue'],
    ['talk-blink', 'magenta']
  ] as const
  const assets = []
  const assetIds: Record<string, string> = {}
  for (const [mode, color] of colors) {
    const path = join(folder, `${mode}.png`)
    runFfmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=16x16`, '-frames:v', '1', path])
    const id = randomUUID()
    assetIds[mode] = id
    assets.push({ id, category: 'character' as const, name: `${mode} fixture`, mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(path)).toString('base64')}` })
  }

  const actor: EditorV6Element = {
    id: randomUUID(), kind: 'character', characterId: 'silent-face-fixture', assetId: assetIds.idle,
    faceModeAssetIds: { talk: assetIds.talk, blink: assetIds.blink, 'talk-blink': assetIds['talk-blink'] },
    text: 'Fixture silenciosa', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1
  }
  const thought: EditorV6Element = { id: randomUUID(), kind: 'thought', text: 'Pensamento', x: 0, y: -30, width: 28, height: 12, rotation: 0, zIndex: 2 }
  const speech = { id: randomUUID(), label: 'Fala fixture', characterId: actor.characterId, startFrame: 8, durationFrames: 12 }
  const timeline = createEditorV6Timeline([actor, thought])
  let projectId = randomUUID()
  let scheduleTimeline = { ...timeline, durationFrames: 40, tracks: timeline.tracks.map((track) => track.kind === 'speech' ? { ...track, blocks: [speech] } : track) }
  for (let attempt = 0; attempt < 5000; attempt++, projectId = randomUUID()) {
    const modes = Array.from({ length: 40 }, (_, frame) => editorV6FaceModeAtFrame(projectId, scheduleTimeline, actor.characterId!, frame))
    const hasIdle = modes.some((mode, frame) => frame < 8 && mode === undefined)
    const hasTalk = modes.some((mode, frame) => frame >= 8 && frame < 20 && mode === 'talk')
    const hasBlink = modes.some((mode, frame) => (frame < 8 || frame >= 20) && mode === 'blink')
    const hasTalkBlink = modes.some((mode) => mode === 'talk-blink')
    if (hasIdle && hasTalk && hasBlink && hasTalkBlink) break
    if (attempt === 4999) throw Error('Não foi possível criar uma amostra com repouso, fala, piscada e sobreposição.')
  }
  const project: EditorV6Document = {
    schemaVersion: 1, id: projectId, title: 'Validação silenciosa de faces', color: '#ffffff',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), backgroundColor: '#111111',
    backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, assets, elements: [actor, thought], exportAudio: [],
    timeline: {
      ...scheduleTimeline,
      knownElementIds: [...scheduleTimeline.knownElementIds ?? [], thought.id],
      tracks: scheduleTimeline.tracks.map((track) => track.kind === 'character'
        ? { ...track, blocks: track.blocks.map((block) => ({ ...block, state: block.state ? { ...block.state, faceModeAssetIds: actor.faceModeAssetIds } : block.state })) }
        : track.kind === 'thought'
          ? { ...track, blocks: [{ id: randomUUID(), label: thought.text, elementId: thought.id, state: thought, startFrame: 20, durationFrames: 5 }] }
          : track)
    }
  }

  const factory = createEditorV6WorkerFactory({
    ipcMain: (await import('electron')).ipcMain,
    html: join(root, 'out/renderer/editor-v6-export.html'),
    preload: join(root, 'out/preload/editorV6ExportPreload.cjs')
  })
  let workerCount = 0
  const output = join(folder, 'face-state-silent.mp4')
  const report = await runEditorV6Export(project, { startFrame: 0, endFrame: 40, width: 320, height: 180, turbo: false, encoder: 'cpu' }, {
    ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: output, reportPath: join(folder, 'face-state-silent.report.json'), signal: new AbortController().signal,
    getCharacters: async () => [],
    bakeMotion: async () => { throw Error('A validação silenciosa não deve preparar movimento nem áudio.'); },
    createWorker: async (renderProject, part, signal, layeredVideo, mouthLoops) => {
      workerCount++
      const worker = await factory.create({ project: renderProject, width: 320, height: 180, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}) }, signal)
      return { frame: worker.frame, close: worker.close }
    },
    audioPath: () => { throw Error('A validação silenciosa tentou acessar um arquivo de áudio.'); },
    mediaPath: () => { throw Error('A validação silenciosa tentou acessar uma mídia externa.'); },
    progress: () => {}
  })
  assert(report.state === 'completed' && !report.fallback, `A exportação silenciosa falhou: ${report.error ?? report.state}.`)
  assert(report.totalFrames === 40 && report.audioClips === 0 && report.videoInputs === 0, 'A exportação incluiu mídia ou não entregou os 40 quadros silenciosos.')
  assert(workerCount === 1, `A exportação abriu ${workerCount} renderizadores; esperado: 1.`)

  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8', windowsHide: true })) as { streams: Array<{ codec_type: string; width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }>; format: { duration?: string } }
  const videos = probe.streams.filter((stream) => stream.codec_type === 'video')
  assert(videos.length === 1 && probe.streams.every((stream) => stream.codec_type === 'video'), 'O MP4 da validação silenciosa contém uma trilha que não é vídeo.')
  assert(videos[0].width === 320 && videos[0].height === 180 && videos[0].r_frame_rate === '30/1' && Number(videos[0].nb_frames) === 40, 'O MP4 silencioso tem resolução, FPS ou quantidade de quadros incorretos.')
  assert(Math.abs(Number(probe.format.duration) - 40 / 30) < 1 / 30, 'A duração do MP4 silencioso não corresponde a 40 quadros.')

  const pixels = runFfmpeg(['-i', output, '-map', '0:v:0', '-an', '-frames:v', '40', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
  const frameBytes = 320 * 180 * 3
  assert(pixels.length === frameBytes * 40, `A análise recebeu ${pixels.length} bytes de pixels; esperado ${frameBytes * 40}.`)
  const frameModes: Record<string, number> = {}
  for (let frame = 0; frame < 40; frame++) {
    const mode = editorV6FaceModeAtFrame(project.id, project.timeline, actor.characterId!, frame) ?? 'idle'
    frameModes[mode] = (frameModes[mode] ?? 0) + 1
    const [red, green, blue] = readPixels(pixels, frame, 320, 160, 90)
    const correctColor = mode === 'talk-blink'
      ? red > 150 && green < 100 && blue > 100
      : mode === 'talk'
        ? red > 150 && green < 100 && blue < 100
        : mode === 'blink'
          ? red < 100 && green < 100 && blue > 150
          : red > 150 && green > 100 && blue < 100
    assert(correctColor, `Quadro ${frame} não usou a face ${mode}: RGB ${red},${green},${blue}.`)
  }

  let thoughtPixels = 0
  for (let y = 24; y < 49; y++) for (let x = 112; x < 208; x++) {
    const [red, green, blue] = readPixels(pixels, 20, 320, x, y)
    if (red > 220 && green > 220 && blue > 220) thoughtPixels++
  }
  assert(thoughtPixels > 250, `O pensamento não apareceu sobre a animação facial: ${thoughtPixels} pixels claros.`)
  const result = { passed: true, state: report.state, totalFrames: report.totalFrames, fps: report.fps, audioClips: report.audioClips, streams: probe.streams.map((stream) => stream.codec_type), frameModes, thoughtPixels, output }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2))
  factory.dispose()
  app.exit(0)
}

main().catch((error) => { console.error('[Editor V6 · teste silencioso de faces]', error); app.exit(1) })
