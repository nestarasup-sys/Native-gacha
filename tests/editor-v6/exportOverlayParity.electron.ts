import { app, ipcMain, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6MediaAsset } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'

const root = resolve(process.argv[2])
const folder = resolve(process.argv[3])
const ffmpeg = join(root, 'resources/video-tools/ffmpeg.exe')
const ffprobe = join(root, 'resources/video-tools/ffprobe.exe')
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
    const summary = { passed: true, frames, turboParts: 2, mediaInputs: result.videoInputs,
      seamFrames: [29, 30], segments: ['red:0-19', 'green:20-36', 'blue:37-49', 'red:50-59'] }
    await writeFile(join(folder, 'result.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary, null, 2))
  } finally { factory.dispose() }
  app.exit(0)
}
const timeout = setTimeout(() => { console.error('Timed out validating MP4 overlay parity.'); app.exit(1) }, 150000)
void main().catch(reason => { clearTimeout(timeout); console.error(reason); app.exit(1) })
