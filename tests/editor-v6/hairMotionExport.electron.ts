import { app, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3])
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
app.setPath('userData', join(folder, 'profile'))
app.on('window-all-closed', () => {})
process.on('unhandledRejection', error => { console.error(error); app.exit(1) })

async function main() {
  await app.whenReady()
  const ffmpeg = join(root, 'resources/video-tools/ffmpeg.exe')
  const render = (color: string, width: number, height: number) => execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { windowsHide: true })
  const pngData = (color: string, width: number, height: number) => `data:image/png;base64,${render(color, width, height).toString('base64')}`
  const actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: 'synthetic-character', assetId: 'synthetic-character-image', text: 'Fixture', x: 0, y: 0, width: 40, height: 40, rotation: 0, zIndex: 1 }
  const now = new Date().toISOString()
  const project: EditorV6Document = {
    schemaVersion: 1, id: randomUUID(), title: 'Hair motion synthetic export', color: '#ffffff', createdAt: now, updatedAt: now,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [{ id: actor.assetId!, category: 'character', name: 'Synthetic character', mimeType: 'image/png', dataUrl: pngData('yellow', 64, 64) }],
    elements: [actor], timeline: { ...createEditorV6Timeline([actor]), durationFrames: 61 }
  }
  const preset = {
    physics: { wind: 100, gust: 100, speed: 250, stiffness: 0, damping: 0, responsiveness: 0, anchor: 0 },
    enabled: { back: true, front: true, fringe: true }, intensity: { back: 100, front: 100, fringe: 150 }
  }
  const hairAnimation: EditorV6HairMotionBundle = {
    presetSlot: 1, preset,
    surfaces: [
      { id: 'body', dataUrl: pngData('yellow', 64, 64) },
      { id: 'face', dataUrl: pngData('white', 16, 16) }
    ],
    textures: [{ id: 'fringe', dataUrl: pngData('red', 32, 48) }],
    rigs: [{
      elementId: actor.id, assetId: actor.assetId!, characterId: actor.characterId!, baseSurfaceId: 'body', faceSurfaceId: 'face', overlaySurfaceId: null,
      artworkWidth: 64, artworkHeight: 64, outputWidth: 64, outputHeight: 64, shapeScaleX: 1, shapeScaleY: 1,
      sourceCrop: { left: 0, top: 0, width: 64, height: 64 }, sourceHead: { width: 32, height: 24 },
      targetHead: { x: 16, y: 8, width: 32, height: 24, rotation: 0 },
      layers: [{ id: 'fringe-1', textureId: 'fringe', side: 'fringe', width: 32, height: 48, x: 0, y: 8, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 1.2 }]
    }]
  }
  const payload: EditorV6WorkerPayload = { project, width: 320, height: 180, layeredVideo: false, hairAnimation }
  const factory = createEditorV6WorkerFactory({ ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs') })
  let sequential: Awaited<ReturnType<typeof factory.create>> | undefined
  let split: Awaited<ReturnType<typeof factory.create>> | undefined
  try {
    sequential = await factory.create(payload, new AbortController().signal)
    const first = await sequential.frame(0)
    const middle = await sequential.frame(30)
    const last = await sequential.frame(60)
    assert(first.bitmap && middle.bitmap && last.bitmap, 'O worker não entregou os quadros capturados da animação de cabelo.')
    const redPixelCount = (bitmap: Buffer) => {
      let count = 0
      for (let index = 0; index < bitmap.length; index += 4) {
        const [a, b, c] = bitmap.subarray(index, index + 3)
        if ((a > 140 && b < 110 && c < 110) || (c > 140 && b < 110 && a < 110)) count += 1
      }
      return count
    }
    assert(redPixelCount(first.bitmap) > 10, 'O cabelo de fixture não foi composto sobre o personagem.')
    assert(!first.bitmap.equals(last.bitmap), 'O cabelo ficou parado durante a exportação experimental.')
    split = await factory.create(payload, new AbortController().signal)
    const turboChunkStart = await split.frame(30)
    const turboChunkEnd = await split.frame(60)
    assert(middle.bitmap.equals(turboChunkStart.bitmap), 'O primeiro quadro de um trecho Turbo divergiu do render sequencial.')
    assert(last.bitmap.equals(turboChunkEnd.bitmap), 'A animação mudou de fase na fronteira de um trecho Turbo.')
    split.close(); split = undefined
    sequential.close(); sequential = undefined

    const ffprobe = join(root, 'resources/video-tools/ffprobe.exe')
    const outputPath = join(folder, 'hair-motion.mp4')
    const report = await runEditorV6Export(project, { startFrame: 0, endFrame: 61, width: 320, height: 180, turbo: true, encoder: 'cpu', hairAnimationPresetSlot: 1 }, {
      ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath, reportPath: join(folder, 'hair-motion.report.json'), signal: new AbortController().signal,
      getCharacters: async () => [], bakeMotion: async () => { throw Error('O fixture não deve preparar animações de pose.') },
      createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({ project: renderProject, width: 320, height: 180, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}), hairAnimation }, signal),
      audioPath: () => join(folder, 'unused-audio.wav'), mediaPath: () => join(folder, 'unused-media.mp4'), progress: () => {}
    })
    assert(report.state === 'completed' && !report.fallback && report.attempts[0]?.parts.length === 2, 'A exportação MP4 com animação de cabelo não concluiu em dois trechos Turbo.')
    assert(report.attempts[0].parts.every(part => (part.frameTiming?.hairCompositionMs?.samples ?? 0) > 0), 'O relatório do export não separou o tempo da composição experimental de cabelo.')
    const rawFrames = execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', "select='eq(n,0)+eq(n,30)+eq(n,60)'", '-fps_mode', 'passthrough', '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 16 * 1024 ** 2 })
    const frameBytes = 320 * 180 * 3
    assert(rawFrames.length === frameBytes * 3, 'O MP4 não contém os quadros esperados para validar a animação de cabelo.')
    const redPixels = (frameIndex: number) => {
      const pixels = new Uint8Array(320 * 180)
      let count = 0
      const start = frameIndex * frameBytes
      for (let y = 0; y < 180; y += 1) for (let x = 0; x < 320; x += 1) {
        const offset = start + (y * 320 + x) * 3
        if (rawFrames[offset] > 130 && rawFrames[offset + 1] < 115 && rawFrames[offset + 2] < 115) { pixels[y * 320 + x] = 1; count += 1 }
      }
      return { count, pixels }
    }
    const firstHair = redPixels(0), lastHair = redPixels(2)
    assert(firstHair.count > 10, 'O MP4 final não contém a camada de cabelo preparada.')
    let changedHairPixels = 0
    for (let index = 0; index < firstHair.pixels.length; index += 1) if (firstHair.pixels[index] !== lastHair.pixels[index]) changedHairPixels += 1
    assert(changedHairPixels > 5, `O MP4 final não mostra o movimento do cabelo entre o início e o fim (${changedHairPixels} pixels mudaram).`)
    await writeFile(join(folder, 'result.json'), JSON.stringify({ passed: true, framesChecked: [0, 30, 60], animatedPixels: true, turboBoundaryStable: true, mp4Completed: true, mp4HairChangedPixels: changedHairPixels }))
  } finally {
    sequential?.close(); split?.close(); factory.dispose()
  }
}

main().then(() => app.exit(0), error => { console.error(error); app.exit(1) })
