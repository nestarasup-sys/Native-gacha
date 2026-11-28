import { app, ipcMain, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6MediaAsset } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { editEditorV6IntroAppearance } from '../../src/renderer/src/features/editorV6/editorV6IntroInspectorTarget'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'

const root = resolve(process.argv[2])
const folder = resolve(process.argv[3])
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs') as { resolveEditorV6TestVideoToolsDirectory: (root: string) => string }
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
const ffmpeg = join(videoTools, 'ffmpeg.exe')
const ffprobe = join(videoTools, 'ffprobe.exe')
const width = 320, height = 180, frames = 60
const assert = (condition: unknown, description: string) => { if (!condition) throw Error(description) }
const run = (executable: string, args: string[]) => execFileSync(executable, ['-v', 'error', ...args], {
  windowsHide: true, maxBuffer: 32 * 1024 * 1024
})
const ids = {
  red: '33333333-3333-4333-8333-333333333333',
  blue: '99999999-9999-4999-8999-999999999999',
  green: '11111111-1111-4111-8111-111111111111'
} as const
const blockIds = {
  red: '11111111-1111-4111-8111-111111111111',
  blue: '22222222-2222-4222-8222-222222222222',
  green: '33333333-3333-4333-8333-333333333333'
} as const
type Shade = keyof typeof ids
protocol.registerSchemesAsPrivileged([{
  scheme: 'gacha-editor-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}])
app.setPath('userData', join(folder, 'profile'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})
process.on('unhandledRejection', reason => { console.error(reason); app.exit(1) })

function classifyPixel(red: number, green: number, blue: number): Shade | 'unknown' {
  if (red > 155 && green < 95 && blue < 95) return 'red'
  if (green > 120 && red < 95 && blue < 95) return 'green'
  if (blue > 150 && red < 95 && green < 95) return 'blue'
  return 'unknown'
}
async function main() {
  await app.whenReady()
  const mediaFolder = join(folder, 'media')
  await mkdir(mediaFolder, { recursive: true })
  const library: EditorV6MediaAsset[] = []
  for (const shade of ['red', 'blue', 'green'] as const) {
    const filename = ids[shade] + '.mp4', file = join(mediaFolder, filename)
    run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=' + (shade === 'green' ? 'lime' : shade)
      + ':s=' + width + 'x' + height + ':r=30:d=2', '-frames:v', String(frames),
      '-an', '-c:v', 'mpeg4', '-q:v', '2', '-pix_fmt', 'yuv420p', file])
    library.push({ id: ids[shade], name: shade, fileName: filename, kind: 'video',
      mimeType: 'video/mp4', sourceFrames: frames, hasAudio: false, width, height,
      sizeBytes: (await stat(file)).size })
  }
  const timeline = createEditorV6Timeline()
  const videoTrack = timeline.tracks.find(track => track.kind === 'video')!
  const layout = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
  videoTrack.blocks = [
    { id: blockIds.blue, label: 'blue', mediaId: ids.blue, startFrame: 20,
      durationFrames: 30, mediaInFrame: 0, mediaLayout: layout },
    { id: blockIds.red, label: 'red', mediaId: ids.red, startFrame: 0,
      durationFrames: 60, mediaInFrame: 0, mediaLayout: layout },
    { id: blockIds.green, label: 'green', mediaId: ids.green, startFrame: 20,
      durationFrames: 17, mediaInFrame: 0, mediaLayout: layout }
  ]
  assert(ids.green.localeCompare(ids.blue) < 0, 'Fixture must invert filename sorting.')
  const document: EditorV6Document = {
    schemaVersion: 1, id: randomUUID(), title: 'Synthetic MP4 overlap parity',
    color: '#ffffff', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [], assets: [], media: library, timeline: { ...timeline, durationFrames: frames }
  }
  const factory = createEditorV6WorkerFactory({
    ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'),
    preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName) => join(mediaFolder, fileName)
  })
  const output = join(folder, 'overlay-turbo.mp4')
  try {
    const result = await runEditorV6Export(document, {
      startFrame: 0, endFrame: frames, width, height, turbo: true, encoder: 'cpu'
    }, {
      ffmpeg, ffprobe, tempRoot: folder, reportPath: join(folder, 'overlay.report.json'),
      outputPath: output, id: randomUUID(),
      createWorker: (project, _part, signal, layeredVideo, mouthLoops) =>
        factory.create({ project, width, height, layeredVideo,
          ...(mouthLoops ? { mouthLoops } : {}) }, signal),
      getCharacters: async () => [],
      bakeMotion: async () => { throw Error('Unexpected motion preparation in video-only test.') },
      audioPath: () => { throw Error('Unexpected audio in synthetic videos.') },
      mediaPath: (_projectId, filename) => join(mediaFolder, filename),
      signal: new AbortController().signal, progress: () => {}
    })
    assert(result.state === 'completed' && !result.fallback, 'Turbo failed or fell back to one worker.')
    assert(result.videoInputs === 3, 'Expected three video inputs; got ' + result.videoInputs)
    assert(result.attempts[0].parts.map(part => part.frames).sort((a, b) => a - b).join(',') === '30,30',
      'Turbo lost or duplicated frames around the seam.')

    const probe = JSON.parse(run(ffprobe, ['-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
      '-of', 'json', output]).toString('utf8'))
    const stream = probe.streams?.[0]
    assert(stream?.width === width && stream?.height === height && stream?.r_frame_rate === '30/1'
      && Number(stream?.nb_frames) === frames, 'MP4 dimensions, frame count or rate differ from timeline.')
    const rgb = run(ffmpeg, ['-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    const frameBytes = width * height * 3
    assert(rgb.length === frames * frameBytes, 'Decoded MP4 has missing or extra RGB frames.')
    const observed: Shade[] = []
    for (let frame = 0; frame < frames; frame++) {
      const offset = frame * frameBytes + (90 * width + 160) * 3
      const actual = classifyPixel(rgb[offset], rgb[offset + 1], rgb[offset + 2])
      const preview = resolveEditorV6SceneAtFrame(document, frame).mediaVideo
      const expected = Object.entries(ids).find(([, id]) => id === preview?.mediaId)?.[0]
      assert(expected !== undefined, 'Preview missing video at frame ' + frame)
      assert(actual === expected, 'Preview/MP4 mismatch at frame ' + frame + ': expected ' +
        expected + ', got ' + actual + ' (' + [rgb[offset], rgb[offset + 1], rgb[offset + 2]].join(',') + ')')
      observed.push(actual as Shade)
    }
    assert(observed.slice(0, 20).every(value => value === 'red'), 'Red base clip is missing.')
    assert(observed.slice(20, 37).every(value => value === 'green'), 'Tie-break clip is not on top.')
    assert(observed.slice(37, 50).every(value => value === 'blue'), 'Earlier clip was not restored.')
    assert(observed.slice(50).every(value => value === 'red'), 'Underlying clip was not restored.')
    const report = JSON.parse(await readFile(join(folder, 'overlay.report.json'), 'utf8'))
    assert(report.state === 'completed', 'Export report did not finish.')
    // Real end-to-end A/B: the selectable 8 ms capture mode MUST retain
    // every decoded pixel, not just the MP4 frame count or successful exit.
    const fastOutput = join(folder, 'overlay-captura-8.mp4')
    const fastMode = await runEditorV6Export(document, {
      startFrame: 0, endFrame: frames, width, height, turbo: true, encoder: 'cpu', testMode: 'captura-8'
    }, {
      ffmpeg, ffprobe, tempRoot: folder, reportPath: join(folder, 'overlay-captura-8.report.json'),
      outputPath: fastOutput, id: randomUUID(),
      createWorker: (project, _part, signal, layeredVideo, mouthLoops) =>
        factory.create({ project, width, height, layeredVideo, testMode: 'captura-8',
          ...(mouthLoops ? { mouthLoops } : {}) }, signal),
      getCharacters: async () => [],
      bakeMotion: async () => { throw Error('Unexpected motion preparation in video-only test.') },
      audioPath: () => { throw Error('Unexpected audio in synthetic videos.') },
      mediaPath: (_projectId, filename) => join(mediaFolder, filename),
      signal: new AbortController().signal, progress: () => {}
    })
    assert(fastMode.state === 'completed' && !fastMode.fallback, 'Selectable 8ms mode failed a real Turbo MP4.')
    assert(fastMode.options.testMode === 'captura-8' && fastMode.exportTestSettings?.captureRetryMilliseconds === 8,
      'The selectable capture mode did not reach the real exporter or report.')
    assert(fastMode.attempts.length === 1 && fastMode.attempts[0].parts.length === 2,
      'The alternate mode lost Turbo two-worker composition.')
    const fastRgb = run(ffmpeg, ['-i', fastOutput, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    assert(fastRgb.equals(rgb), 'Selectable 8ms mode changed real MP4 decoded pixels or frame order.')
    const fastReport = JSON.parse(await readFile(join(folder, 'overlay-captura-8.report.json'), 'utf8'))
    assert(fastReport.exportTestSettings?.captureRetryMilliseconds === 8 && fastReport.options.testMode === 'captura-8',
      'The saved MP4 report omitted the selected capture strategy.')

    const introFrames = 30
    const presentationFrames = 120 + introFrames
    const portraitId = randomUUID()
    const editedBlockId = randomUUID()
    const portrait = run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1',
      '-threads', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'])
    const firstPart = { kind: 'character' as const, characterId: randomUUID(), assetId: portraitId, flipX: false,
      text: 'Português', englishText: 'English' }
    const decorated: EditorV6Document = {
      ...document,
      assets: [{ id: portraitId, name: 'Retrato de teste', mimeType: 'image/png', category: 'character',
        dataUrl: 'data:image/png;base64,' + portrait.toString('base64') }],
      timeline: { ...document.timeline, durationFrames: presentationFrames, tracks: [...document.timeline.tracks.map(track =>
        track.kind === 'video' ? { ...track, blocks: [{
          id: blockIds.green, label: 'green', mediaId: ids.green, startFrame: 96 + introFrames, durationFrames: 18,
          mediaLayout: { ...layout, width: 60, height: 50 },
          videoPresentation: { timeCard: 'Past', bottomCard: 'Context', loadingGif: true }
        }] } : track), { id: randomUUID(), kind: 'intro', name: 'Intro', muted: false, locked: false, blocks: [
          { id: randomUUID(), label: 'Tela preta', startFrame: 0, durationFrames: 10, intro: { kind: 'black', text: 'Arquivo' } },
          { id: randomUUID(), label: 'Primeira parte', startFrame: 10, durationFrames: 10, intro: firstPart },
          { id: editedBlockId, label: 'Segunda parte', startFrame: 20, durationFrames: 10, intro: {
            ...firstPart, text: 'Texto seguinte', englishText: 'Next text',
            flipX: true, portraitLayout: { x: -12, y: 3, characterScale: 75, characterWidthScale: 90, rotation: -12 }
          } }
        ] }] }
    }
    const changedPortrait = run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1',
      '-threads', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'])
    const editedPresentation = editEditorV6IntroAppearance(decorated, editedBlockId, working => ({
      ...working, assets: working.assets.map(asset => asset.id === portraitId
        ? { ...asset, dataUrl: 'data:image/png;base64,' + changedPortrait.toString('base64') } : asset)
    }))
    const presentationOutput = join(folder, 'presentation.mp4')
    const presentationReport = await runEditorV6Export(editedPresentation, {
      startFrame: 0, endFrame: presentationFrames, width, height, turbo: true, encoder: 'cpu'
    }, {
      ffmpeg, ffprobe, tempRoot: folder, reportPath: join(folder, 'presentation.report.json'),
      outputPath: presentationOutput, id: randomUUID(),
      createWorker: (project, _part, signal, layeredVideo) => factory.create({ project, width, height, layeredVideo }, signal),
      getCharacters: async () => [],
      bakeMotion: async () => { throw Error('Unexpected motion preparation in presentation test.') },
      audioPath: () => { throw Error('Unexpected audio in presentation test.') },
      mediaPath: (_projectId, filename) => join(mediaFolder, filename),
      signal: new AbortController().signal, progress: () => {}
    })
    assert(presentationReport.state === 'completed' && !presentationReport.fallback, 'Presentation export failed.')
    const presentationRgb = run(ffmpeg, ['-i', presentationOutput, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    assert(presentationRgb.length === presentationFrames * frameBytes, 'Presentation changed the output duration.')
    const absolutePixel = (frame: number, x: number, y: number) => {
      const offset = frame * frameBytes + (y * width + x) * 3
      return presentationRgb.subarray(offset, offset + 3)
    }
    const pixel = (frame: number, x: number, y: number) => absolutePixel(frame + introFrames, x, y)
    assert(absolutePixel(0, 10, 10).every(channel => channel < 12), 'Intro must begin with solid black.')
    const countPixels = (frame: number, x1: number, y1: number, x2: number, y2: number, predicate: (rgb: Buffer) => boolean) => {
      let count = 0
      for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) if (predicate(absolutePixel(frame, x, y))) count++
      return count
    }
    assert(countPixels(9, 100, 70, 220, 110, color => color.every(channel => channel > 170)) > 15, 'Black-screen title did not render.')
    assert(classifyPixel(...Array.from(absolutePixel(10, 80, 90)) as [number, number, number]) === 'blue', 'Portrait missing from the left half.')
    assert(absolutePixel(20, 20, 90).every(channel => channel < 12)
      && classifyPixel(...Array.from(absolutePixel(20, 125, 90)) as [number, number, number]) === 'red', 'Edited portrait or framing missing from encoded Intro.')
    assert(absolutePixel(10, 165, 10).every(channel => channel > 230), 'Right half must have a white card.')
    for (const y of [48, 132]) {
      const dark = (color: Buffer) => color.every(channel => channel < 70)
      const firstText = countPixels(19, 185, y - 12, 295, y + 12, dark)
      const nextText = countPixels(20, 185, y - 12, 295, y + 12, dark)
      assert(firstText > 10 && nextText > 10 && firstText !== nextText, 'Bilingual text must change exactly at the part boundary.')
    }
    assert(absolutePixel(30, 165, 10).every(channel => channel < 12), 'Intro overran the content start.')
    const isBlack = (frame: number, x: number, y: number) => pixel(frame, x, y).every(channel => channel < 12)
    const isLoading = (frame: number) => pixel(frame, 180, 85).every(channel => channel > 180)
    assert(isBlack(5, 180, 85) && isLoading(6) && isLoading(59) && isLoading(60) && isLoading(95),
      'GIF was missing, off center or mistimed at the Turbo boundary.')
    const loadingImage = (frame: number) => presentationRgb.subarray((frame + introFrames) * frameBytes + 80 * width * 3, (frame + introFrames) * frameBytes + 100 * width * 3)
    assert(!loadingImage(10).equals(loadingImage(18)), 'The encoded GIF did not animate.')
    assert(classifyPixel(...Array.from(pixel(96, 160, 90)) as [number, number, number]) === 'green', 'GIF must stop when the clip starts.')
    for (const y of [40, 140]) {
      assert(!isBlack(96, 84, y) && isBlack(96, 76, y) && isBlack(114, 84, y), 'Card extent or timing differs from fitted video.')
    }
    const summary = { passed: true, frames, turboParts: 2, mediaInputs: result.videoInputs,
      seamFrames: [29, 30], segments: ['red:0-19', 'green:20-36', 'blue:37-49', 'red:50-59'],
      presentation: { frames: presentationFrames, intro: [0, 10, 20, 30], loading: [36, 126], cards: [126, 144] } }
    await writeFile(join(folder, 'result.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary, null, 2))
  } finally { factory.dispose() }
  app.exit(0)
}
const timeout = setTimeout(() => { console.error('Timed out validating MP4 overlay parity.'); app.exit(1) }, 150000)
void main().catch(reason => { clearTimeout(timeout); console.error(reason); app.exit(1) })
