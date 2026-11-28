import { normalizeEditorV6Timeline } from '../../src/shared/editorV6TimelineCore'
import { app, ipcMain, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { gzipSync, gunzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element, type EditorV6MediaAsset } from '../../src/shared/editorV6'
import { editorV6MotionPlans, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { FIRST_HAIR_MOTION_PRESET } from '../../src/shared/hairMotionEngine'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'

const root = resolve(process.argv[2])
const folder = resolve(process.argv[3])
const extendedFeatures = process.argv.includes('--extended-features')
const unifiedCards = process.argv.includes('--unified-cards')
const recordReference = process.argv.includes('--record-reference')
const width = 320, height = 180, frameCount = extendedFeatures ? 135 : 90, fps = 30
const videoStartFrame = extendedFeatures ? 90 : 45
const frameBytes = width * height * 4
const captureLayers = ['scene', 'background', 'foreground'] as const
type CaptureLayer = typeof captureLayers[number]
const threshold = {
  maxSceneFrames: 1,
  maxForegroundFrames: 1,
  maxForegroundChangedPixelsPerFrame: 18,
  maxForegroundChannelDelta: 1,
  maxBackgroundChangedPixelsPerFrame: 0
} as const
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw Error(message) }
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const { resolveEditorV6TestVideoToolsDirectory } = require('../../scripts/editor-v6/testVideoTools.cjs') as { resolveEditorV6TestVideoToolsDirectory: (root: string) => string }
const videoTools = resolveEditorV6TestVideoToolsDirectory(root)
const ffmpeg = join(videoTools, 'ffmpeg.exe'), ffprobe = join(videoTools, 'ffprobe.exe')
const run = (executable: string, args: string[]) => execFileSync(executable, ['-v', 'error', ...args], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 })

protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
app.setPath('userData', join(folder, 'profile'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})

const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const faceSurface = (mouth: string) => svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><g stroke="#302b42" stroke-linecap="round" stroke-linejoin="round"><path d="M42 59q8-7 16 0M65 59q8-7 16 0" fill="none" stroke-width="3"/><circle cx="50" cy="62" r="3.5"/><circle cx="73" cy="62" r="3.5"/><path d="M59 72l-3 8 5 1" fill="none" stroke-width="2"/><path d="${mouth}" fill="#a93c61" stroke-width="2.5"/></g></svg>`)

function makeDocument(actor: EditorV6Element, media: EditorV6MediaAsset): EditorV6Document {
  const timeline = createEditorV6Timeline([actor])
  const template = timeline.tracks.find(track => track.kind === 'character')!.blocks[0]
  const transition = { ...actor, x: 43, activeExpressionPresetId: 'golden-pose-transition' }
  timeline.durationFrames = frameCount
  timeline.tracks = timeline.tracks.map(track => {
    if (track.kind === 'character') return { ...track, blocks: [
      { ...template, id: 'golden-pose-before', startFrame: 0, durationFrames: 30, state: { ...actor } },
      { ...template, id: 'golden-pose-after', label: 'Transição de pose', startFrame: 30, durationFrames: 60, state: transition }
    ] }
    if (track.kind === 'speech') return { ...track, blocks: [
      { id: 'golden-speech', label: 'Fala sintética', characterId: 'golden-character', startFrame: 22, durationFrames: 40 }
    ] }
    if (track.kind === 'video') return { ...track, blocks: [
      { id: 'golden-video', label: 'Vídeo sintético', mediaId: media.id, startFrame: videoStartFrame, durationFrames: frameCount - videoStartFrame, mediaInFrame: 0,
        mediaLayout: extendedFeatures ? { x: 0, y: 0, width: 72, height: 64, rotation: 0 } : { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        ...(extendedFeatures ? { videoPresentation: {
          loadingGif: true,
          timeCards: [{ startSeconds: 0.2, endSeconds: 0.6, text: 'Future' as const }],
          bottomCards: [{ startSeconds: 0.4, endSeconds: 1, text: 'Golden context card' }]
        } } : {}) }
    ] }
    return track
  })
  if (extendedFeatures) timeline.tracks.push({ id: 'golden-intro-track', kind: 'intro', name: 'Intro', muted: false, locked: false, blocks: [
    { id: 'golden-intro', label: 'Apresentação bilíngue', startFrame: 0, durationFrames: 24,
      intro: { kind: 'character', characterId: 'golden-character', assetId: actor.assetId,
        englishText: 'A warning from the future', text: 'Um aviso do futuro', flipX: true,
        portraitLayout: { x: -12, y: 0, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, rotation: 0, zIndex: 0 } } }
  ] })
  return {
    schemaVersion: 1, id: 'golden-export-fixture-v1', title: 'Golden export fixture',
    color: '#ffffff', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    backgroundColor: '#b88ab7', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [actorAsset, talkAsset, talkBlinkAsset], elements: [actor], media: [media], timeline
  }
}

let actorAsset: EditorV6Document['assets'][number]
let talkAsset: EditorV6Document['assets'][number]
let talkBlinkAsset: EditorV6Document['assets'][number]

function makeHairMotion(actorId: string, actorAssetId: string): EditorV6HairMotionBundle {
  const avatar = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><path d="M18 157 Q22 117 43 111 L47 96 76 96 80 111 Q105 119 107 157Z" fill="#48527a" stroke="#25263b" stroke-width="4"/><path d="M25 79 Q8 51 25 26 Q40 4 67 12 Q103 12 104 51 L94 102 80 115 39 108 26 95Z" fill="#302b42" stroke="#201d2b" stroke-width="5"/><ellipse cx="61" cy="66" rx="27" ry="34" fill="#f2c5a5" stroke="#9a625b" stroke-width="3"/><path d="M33 62 Q29 23 57 15 Q91 7 99 43 Q83 31 68 37 Q49 26 33 62Z" fill="#343044" stroke="#201d2b" stroke-width="4"/></svg>')
  const neutralFace = faceSurface('M55 88q6 4 12 0')
  const talkFace = faceSurface('M55 85q6-2 12 0q-1 11-6 11q-5 0-6-11')
  const talkBlinkFace = faceSurface('M55 85q6-2 12 0q-1 11-6 11q-5 0-6-11')
  const texture = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64" viewBox="0 0 80 64"><path d="M5 8 Q24 1 39 9 Q55 16 76 5 Q68 30 48 31 Q29 32 18 58 Q19 34 5 8Z" fill="#282433"/><path d="M11 10 Q28 6 40 14 Q55 21 70 10 Q62 26 46 27 Q28 28 21 48 Q21 30 11 10Z" fill="#827c96"/><path d="M19 13 Q34 12 43 18 Q54 22 64 17 Q55 24 44 23 Q31 23 24 36Z" fill="#d8d4e0"/></svg>')
  const preset = {
    ...FIRST_HAIR_MOTION_PRESET,
    physics: { ...FIRST_HAIR_MOTION_PRESET.physics, wind: 100, gust: 100, speed: 200, stiffness: 24, damping: 32, responsiveness: 75, anchor: 8 },
    enabled: { back: false, front: false, fringe: true },
    intensity: { back: 0, front: 0, fringe: 150 }
  }
  const rigTargets: Array<[string, string]> = [[actorAssetId, 'golden-face-neutral'], ['golden-talk-face', 'golden-face-talk'], ['golden-talk-blink-face', 'golden-face-talk-blink']]
  return {
    presetSlot: 1, preset,
    surfaces: [
      { id: 'golden-avatar-base', dataUrl: avatar },
      { id: 'golden-face-neutral', dataUrl: neutralFace },
      { id: 'golden-face-talk', dataUrl: talkFace },
      { id: 'golden-face-talk-blink', dataUrl: talkBlinkFace }
    ],
    textures: [{ id: 'golden-fringe-texture', dataUrl: texture }],
    rigs: rigTargets.map(([assetId, faceSurfaceId]) => ({
      elementId: actorId, assetId, characterId: 'golden-character', poseSlot: null,
      baseSurfaceId: 'golden-avatar-base', faceSurfaceId, eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null,
      artworkWidth: 120, artworkHeight: 160, outputWidth: 120, outputHeight: 160, shapeScaleX: 1, shapeScaleY: 1,
      sourceCrop: { left: 0, top: 0, width: 120, height: 160 }, sourceHead: { width: 60, height: 70 },
      targetHead: { x: 30, y: 30, width: 60, height: 68, rotation: 0 },
      layers: [{ id: 'golden-fringe', textureId: 'golden-fringe-texture', side: 'fringe' as const, width: 78, height: 58, x: 0, y: -36, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0.25 }]
    }))
  }
}

function makeMotionBake(atlasDataUrl: string) {
  return async (request: EditorV6MotionBakeRequest, signal: AbortSignal): Promise<EditorV6MotionBakeResult> => {
    signal.throwIfAborted()
    const assetId = randomUUID()
    const faceAssetId = `${assetId}-face`
    const sprite = { x: 0, y: 0, width: 16, height: 16, atlasWidth: 16, atlasHeight: 16 }
    const frames = request.plan.samples.map(sample => ({
      offset: sample.offset, sprite,
      x: request.plan.from.x + (request.plan.to.x - request.plan.from.x) * sample.progress,
      y: request.plan.from.y + (request.plan.to.y - request.plan.from.y) * sample.progress,
      width: request.plan.from.width + (request.plan.to.width - request.plan.from.width) * sample.progress,
      height: request.plan.from.height + (request.plan.to.height - request.plan.from.height) * sample.progress,
      rotation: request.plan.from.rotation + (request.plan.to.rotation - request.plan.from.rotation) * sample.progress,
      flipX: request.plan.from.flipX ?? false,
      facePatch: { sprite, x: 0.08, y: 0.08, width: 0.2, height: 0.2 }
    }))
    return {
      asset: { id: assetId, category: 'character', name: 'Synthetic motion atlas', mimeType: 'image/png', dataUrl: atlasDataUrl },
      faceAsset: { id: faceAssetId, category: 'character', name: 'Synthetic face atlas', mimeType: 'image/png', dataUrl: atlasDataUrl },
      mouthIsolationMode: 'legacy-patch',
      motion: { version: 1, key: request.plan.key, assetId, faceAssetId, frames },
      metrics: { milliseconds: 0, preparedRigs: 1, samples: frames.length, atlasPixels: 256 }
    }
  }
}

function rawForLayer(layer: CaptureLayer, captures: Map<number, Buffer>, firstFrame: number, rangeFrames: number): Buffer {
  const ordered = [...captures.entries()].filter(([frame]) => frame >= firstFrame && frame < firstFrame + rangeFrames).sort(([left], [right]) => left - right)
  assert(ordered.length > 0 && ordered[0][0] === firstFrame, `Captura ${layer} não iniciou no quadro ${firstFrame}.`)
  const raw = Buffer.allocUnsafe(frameBytes * rangeFrames)
  let captureIndex = 0
  let current: Buffer | undefined
  for (let offset = 0; offset < rangeFrames; offset++) {
    const frame = firstFrame + offset
    while (captureIndex < ordered.length && ordered[captureIndex][0] <= frame) current = ordered[captureIndex++][1]
    assert(current?.length === frameBytes, `Camada ${layer} sem bitmap válido no quadro ${frame}.`)
    current.copy(raw, offset * frameBytes)
  }
  return raw
}

function compareRaw(reference: Buffer, actual: Buffer, layer: CaptureLayer, firstFrame: number, comparedFrameCount: number) {
  const differingFrames: Array<{ frame: number; changedPixels: number; maxChannelDelta: number; boundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null }> = []
  let totalChangedPixels = 0, maxChangedPixelsPerFrame = 0, maxChannelDelta = 0
  const allBounds = { minX: width, minY: height, maxX: -1, maxY: -1 }
  for (let offset = 0; offset < comparedFrameCount; offset++) {
    let changedPixels = 0, frameMaxDelta = 0
    const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 }
    const start = offset * frameBytes
    for (let pixel = 0; pixel < width * height; pixel++) {
      let changed = false
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(reference[start + pixel * 4 + channel] - actual[start + pixel * 4 + channel])
        frameMaxDelta = Math.max(frameMaxDelta, delta)
        if (delta !== 0) changed = true
      }
      if (!changed) continue
      changedPixels++
      const x = pixel % width, y = Math.floor(pixel / width)
      bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y)
    }
    if (changedPixels) {
      totalChangedPixels += changedPixels
      maxChangedPixelsPerFrame = Math.max(maxChangedPixelsPerFrame, changedPixels)
      maxChannelDelta = Math.max(maxChannelDelta, frameMaxDelta)
      allBounds.minX = Math.min(allBounds.minX, bounds.minX); allBounds.minY = Math.min(allBounds.minY, bounds.minY)
      allBounds.maxX = Math.max(allBounds.maxX, bounds.maxX); allBounds.maxY = Math.max(allBounds.maxY, bounds.maxY)
      differingFrames.push({ frame: firstFrame + offset, changedPixels, maxChannelDelta: frameMaxDelta, boundingBox: bounds })
    }
  }
  return {
    layer, firstFrame, comparedFrames: comparedFrameCount, differingFrameCount: differingFrames.length,
    totalChangedPixels, maxChangedPixelsPerFrame, maxChannelDelta,
    boundingBox: allBounds.maxX < 0 ? null : allBounds,
    differingFrames
  }
}

async function main() {
  await app.whenReady()
  await mkdir(join(folder, 'media'), { recursive: true })
  const actorPngPath = join(folder, 'actor.png'), talkPngPath = join(folder, 'actor-talk.png'), talkBlinkPngPath = join(folder, 'actor-talk-blink.png'), mouthPngPath = join(folder, 'mouth.png')
  const faceAssetFilter = 'format=rgba,drawbox=x=20:y=85:w=80:h=70:color=0x4f5875@1:t=fill,drawbox=x=33:y=24:w=54:h=63:color=0xf0c3a5@1:t=fill,drawbox=x=30:y=18:w=60:h=17:color=0x30293c@1:t=fill,drawbox=x=41:y=55:w=12:h=4:color=0x302b42@1:t=fill,drawbox=x=65:y=55:w=12:h=4:color=0x302b42@1:t=fill'
  for (const [path, mouth] of [[actorPngPath, 'drawbox=x=55:y=74:w=12:h=2:color=0x302b42@1:t=fill'], [talkPngPath, 'drawbox=x=55:y=72:w=14:h=8:color=0xa93c61@1:t=fill'], [talkBlinkPngPath, 'drawbox=x=41:y=58:w=12:h=2:color=0x302b42@1:t=fill,drawbox=x=65:y=58:w=12:h=2:color=0x302b42@1:t=fill,drawbox=x=55:y=72:w=14:h=8:color=0xa93c61@1:t=fill']] as const) {
    run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=120x160', '-vf', `${faceAssetFilter},${mouth}`, '-frames:v', '1', '-pix_fmt', 'rgba', path])
  }
  run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', mouthPngPath])
  const videoFileName = 'golden-video.mp4', videoPath = join(folder, 'media', videoFileName)
  run(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=1.5', '-frames:v', '45', '-an', '-c:v', 'mpeg4', '-q:v', '3', '-pix_fmt', 'yuv420p', videoPath])
  const actorAssetId = 'golden-actor-asset', talkAssetId = 'golden-talk-face', talkBlinkAssetId = 'golden-talk-blink-face'
  actorAsset = { id: actorAssetId, category: 'character', name: 'Synthetic actor', mimeType: 'image/png', dataUrl: `data:image/png;base64,${(await readFile(actorPngPath)).toString('base64')}` }
  talkAsset = { id: talkAssetId, category: 'character', name: 'Synthetic talking face', mimeType: 'image/png', dataUrl: `data:image/png;base64,${(await readFile(talkPngPath)).toString('base64')}` }
  talkBlinkAsset = { id: talkBlinkAssetId, category: 'character', name: 'Synthetic talk blink face', mimeType: 'image/png', dataUrl: `data:image/png;base64,${(await readFile(talkBlinkPngPath)).toString('base64')}` }
  const actor: EditorV6Element = {
    id: 'golden-character-element', kind: 'character', characterId: 'golden-character', assetId: actorAssetId,
    text: 'Synthetic actor', x: 25, y: 5, width: 35, height: 88, rotation: 0, zIndex: 1,
    faceModeAssetIds: { talk: talkAssetId, 'talk-blink': talkBlinkAssetId }
  }
  const videoStat = await stat(videoPath)
  const media: EditorV6MediaAsset = { id: 'golden-video-asset', name: 'Synthetic video', fileName: videoFileName, kind: 'video', mimeType: 'video/mp4', sourceFrames: 45, hasAudio: false, width, height, sizeBytes: videoStat.size }
  const project = makeDocument(actor, media)
  if (unifiedCards) {
    const clip = project.timeline.tracks.find(track => track.kind === 'video')!.blocks[0]
    clip.videoPresentation = { loadingGif: true, cards: [{
      startSeconds: 0.2, endSeconds: 1,
      temporal: { startSeconds: 0.2, endSeconds: 0.6, enabled: true, text: 'Future' },
      english: { startSeconds: 0.4, endSeconds: 0.6, enabled: true, text: 'Golden context' },
      portuguese: { startSeconds: 0.4, endSeconds: 1, enabled: true, text: 'Golden context card' }
    }] }
    project.timeline = normalizeEditorV6Timeline(project.timeline)
    assert(project.timeline.tracks.find(track => track.kind === 'card')?.blocks.length === 1, 'O vídeo precisa de um único bloco de card.')
    assert(resolveEditorV6SceneAtFrame(project, 102).videoCardItems?.some(card => card.position === 'english'), 'Inglês deve aparecer no quadro 102.')
    assert(!resolveEditorV6SceneAtFrame(project, 108).videoCardItems?.some(card => card.position === 'english'), 'Inglês deve sair no quadro 108.')
  }
  const motionPlans = editorV6MotionPlans(project)
  assert(motionPlans.length === 1, `Fixture esperava uma transição de personagem, obteve ${motionPlans.length}.`)
  assert(!resolveEditorV6SceneAtFrame(project, videoStartFrame - 1).mediaVideo && resolveEditorV6SceneAtFrame(project, videoStartFrame).mediaVideo?.mediaId === media.id, `O trecho sem vídeo/com vídeo não coincide com o corte no frame ${videoStartFrame}.`)
  if (extendedFeatures) {
    assert(resolveEditorV6SceneAtFrame(project, 0).intro?.kind === 'character', 'A Intro sintética não está visível no início.')
    assert(resolveEditorV6SceneAtFrame(project, 0).loadingGifFrame !== undefined, 'O GIF de pré-roll não está visível três segundos antes do vídeo.')
    assert(resolveEditorV6SceneAtFrame(project, 102).videoCards?.timeCard === 'Future', 'O card temporal não ficou ativo no intervalo previsto.')
    assert(resolveEditorV6SceneAtFrame(project, 102).videoCards?.bottomCard === 'Golden context card', 'O card inferior não ficou ativo no intervalo previsto.')
    assert(resolveEditorV6SceneAtFrame(project, 108).videoCards?.timeCard === undefined, 'O card temporal não desapareceu ao fim do intervalo.')
    assert(resolveEditorV6SceneAtFrame(project, 108).videoCards?.bottomCard === 'Golden context card'
      && resolveEditorV6SceneAtFrame(project, 120).videoCards?.bottomCard === undefined, 'O card inferior não respeitou o próprio intervalo.')
  }
  const character: CustomizerCharacter = { id: 'golden-character', name: 'Synthetic actor', hair: '#302b42', outfit: '#48527a', skin: '#f2c5a5', createdAt: project.createdAt, updatedAt: project.updatedAt, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const mouthDataUrl = `data:image/png;base64,${(await readFile(mouthPngPath)).toString('base64')}`
  const bakeMotion = makeMotionBake(mouthDataUrl)
  const syntheticHairMotion = makeHairMotion(actor.id, actorAssetId)
  const captures: Record<CaptureLayer, Map<number, Buffer>> = { scene: new Map(), background: new Map(), foreground: new Map() }
  const factory = createEditorV6WorkerFactory({
    ipcMain, html: join(root, 'out/renderer/editor-v6-export.html'), preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName) => join(folder, 'media', fileName),
    inspectCapture: async ({ frame, layer, bitmap }) => {
      if (frame < 0 || frame >= frameCount) return
      captures[layer ?? 'scene'].set(frame, Buffer.from(bitmap))
    }
  })
  const outputPath = join(folder, 'golden-export.mp4')
  let report
  const previousDiagnostics = process.env.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS
  process.env.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS = '1'
  try {
    report = await runEditorV6Export(project, { startFrame: 0, endFrame: frameCount, width, height, turbo: true, encoder: 'cpu', mouthLoop: true, mouthLoopCycleFrames: 30 }, {
      ffmpeg, ffprobe, tempRoot: folder, reportPath: join(folder, 'job-report.json'), outputPath, id: randomUUID(),
      createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({
        project: renderProject, width, height, layeredVideo, hairAnimation: syntheticHairMotion,
        ...(mouthLoops ? { mouthLoops } : {})
      }, signal),
      getCharacters: async () => [character], bakeMotion,
      audioPath: () => { throw Error('A fixture dourada não contém áudio.') },
      mediaPath: (_projectId, fileName) => join(folder, 'media', fileName),
      signal: new AbortController().signal, progress: () => {}
    })
  } finally {
    if (previousDiagnostics === undefined) delete process.env.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS
    else process.env.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS = previousDiagnostics
    factory.dispose()
  }
  assert(report.state === 'completed' && !report.fallback && report.totalFrames === frameCount, `O export sintético não concluiu sem fallback em ${frameCount} quadros.`)
  assert(report.videoInputs === 1, `Fixture esperava 1 entrada de vídeo, obteve ${report.videoInputs}.`)
  assert((report.mouthAnimation?.stateAtlases ?? 0) > 0, 'O export não preparou o atlas da boca durante a fala.')
  assert(report.motionTransitionsRequired === 1 && report.motionTransitionsPrepared === 1, 'O export não preparou a transição de pose sintética.')
  const parts = report.attempts[0]?.parts ?? []
  if (extendedFeatures) {
    assert(parts.length >= 2 && parts.reduce((sum, part) => sum + part.frames, 0) === frameCount
      && parts[0].startFrame === 0 && parts.at(-1)?.endFrame === frameCount
      && parts.every((part, index) => index === 0 || parts[index - 1].endFrame === part.startFrame), 'O Turbo não cobriu a timeline estendida sem lacunas ou sobreposições.')
  } else assert(parts.length === 2 && parts.map(part => part.frames).sort((a, b) => a - b).join(',') === '45,45', 'O Turbo não criou duas partes de 45 quadros com emenda no frame 45.')
  const hairRasterFrames = parts.reduce((sum, part) => sum + (part.frameMetrics?.hairRasterFrames ?? 0), 0)
  assert(hairRasterFrames > 0, 'A animação de cabelo sintética não rasterizou quadros.')
  const capturedFrames = (layer: CaptureLayer) => [...captures[layer].keys()].sort((left, right) => left - right)
  if (extendedFeatures) {
    assert(captures.scene.has(0), 'A captura principal não incluiu a Intro e o GIF de pré-roll no primeiro quadro.')
    assert(captures.foreground.has(102) && captures.foreground.has(108) && captures.foreground.has(120), 'A captura em primeiro plano não cobriu os intervalos e desaparecimentos dos cards.')
  } else assert(captures.scene.has(0) && captures.scene.has(videoStartFrame - 1) && captures.background.has(videoStartFrame) && captures.foreground.has(videoStartFrame), `A captura não cobriu a emenda: cena=${capturedFrames('scene').length} [${capturedFrames('scene').slice(0, 3)}…${capturedFrames('scene').slice(-3)}], background=${capturedFrames('background').length} [${capturedFrames('background').slice(0, 3)}…${capturedFrames('background').slice(-3)}], foreground=${capturedFrames('foreground').length} [${capturedFrames('foreground').slice(0, 3)}…${capturedFrames('foreground').slice(-3)}].`)
  const captureRanges: Record<CaptureLayer, { firstFrame: number; frameCount: number }> = Object.fromEntries(captureLayers.map(layer => {
    if (!extendedFeatures) return [layer, { firstFrame: layer === 'scene' ? 0 : videoStartFrame, frameCount: layer === 'scene' ? videoStartFrame : frameCount - videoStartFrame }]
    const frames = capturedFrames(layer)
    assert(frames.length > 0, `A camada ${layer} não produziu capturas para a fixture estendida.`)
    return [layer, { firstFrame: frames[0], frameCount: frames.at(-1)! - frames[0] + 1 }]
  })) as Record<CaptureLayer, { firstFrame: number; frameCount: number }>
  const raw = Object.fromEntries(captureLayers.map(layer => [layer, rawForLayer(layer, captures[layer], captureRanges[layer].firstFrame, captureRanges[layer].frameCount)])) as Record<CaptureLayer, Buffer>
  const probe = JSON.parse(run(ffprobe, ['-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', outputPath]).toString('utf8'))
  const stream = probe.streams?.[0]
  assert(stream?.width === width && stream?.height === height && stream?.r_frame_rate === '30/1' && Number(stream?.nb_frames) === frameCount, 'MP4 sintético tem resolução, FPS ou número de quadros inválido.')
  const decoded = run(ffmpeg, ['-i', outputPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
  assert(decoded.length === width * height * 3 * frameCount, `A decodificação do MP4 retornou um número diferente de ${frameCount} quadros.`)
  const seamStart = videoStartFrame * width * height * 3
  const beforeVideo = decoded.subarray(seamStart - width * height * 3, seamStart)
  const firstVideoFrame = decoded.subarray(seamStart, seamStart + width * height * 3)
  let seamChangedPixels = 0
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 3
    if (beforeVideo[offset] !== firstVideoFrame[offset] || beforeVideo[offset + 1] !== firstVideoFrame[offset + 1]
      || beforeVideo[offset + 2] !== firstVideoFrame[offset + 2]) seamChangedPixels++
  }
  assert(seamChangedPixels > 1000, `O MP4 não mostrou mudança suficiente no primeiro quadro do vídeo após a emenda (${seamChangedPixels} pixels).`)
  const mp4Pixel = (frame: number, x: number, y: number) => {
    const offset = (frame * width * height + y * width + x) * 3
    return [decoded[offset], decoded[offset + 1], decoded[offset + 2]]
  }
  let cardSamples: Record<string, number[]> | undefined
  if (extendedFeatures) {
    cardSamples = { timeCard: mp4Pixel(102, 80, 28), bottomCard: mp4Pixel(102, 80, 154) }
    const matchesCardFill = (pixel: number[]) => pixel.every((channel, index) => Math.abs(channel - [48, 21, 36][index]) <= 40)
    assert(matchesCardFill(cardSamples.timeCard), `O card temporal não apareceu no MP4 final: RGB=${cardSamples.timeCard}.`)
    if (unifiedCards) {
      cardSamples.portuguese = mp4Pixel(102, 80, 168)
      assert(matchesCardFill(cardSamples.portuguese), 'O card em português deve ficar na segunda linha do MP4.')
      assert(!matchesCardFill(mp4Pixel(108, 80, 168)) && matchesCardFill(mp4Pixel(108, 80, 154)),
        'Quando o card em inglês termina, o português deve encostar no vídeo.')
    }
    assert(matchesCardFill(cardSamples.bottomCard), `O card inferior não apareceu no MP4 final: RGB=${cardSamples.bottomCard}.`)
  }

  const capturesSummary = Object.fromEntries(captureLayers.map(layer => [layer, {
    firstFrame: captureRanges[layer].firstFrame, frameCount: captureRanges[layer].frameCount,
    capturedSnapshots: captures[layer].size, rawBytes: raw[layer].length, rawSha256: sha256(raw[layer]),
    frameSha256: Array.from({ length: captureRanges[layer].frameCount }, (_, offset) => sha256(raw[layer].subarray(offset * frameBytes, (offset + 1) * frameBytes)))
  }]))
  let qualityComparison: Record<string, unknown> | null = null
  if (recordReference) {
    const manifest = {
      schemaVersion: 1, generatedFromRevision: process.env.GACHA_EDITOR_V6_GOLDEN_REFERENCE_REVISION ?? null,
      fixture: { version: extendedFeatures ? 2 : 1, features: extendedFeatures ? ['intro-bilingual', 'timed-video-cards', 'loading-gif'] : [], width, height, fps, frames: frameCount, rawFormat: 'BGRA', videoFrames: [videoStartFrame, frameCount], speechFrames: [22, 62], poseTransitionFrame: 30, turboSeamFrame: videoStartFrame, captureRanges },
      threshold, layers: Object.fromEntries(captureLayers.map(layer => {
        const compressed = gzipSync(raw[layer])
        return [layer, { file: `${layer}.bgra.gz`, firstFrame: captureRanges[layer].firstFrame, frameCount: captureRanges[layer].frameCount, rawBytes: raw[layer].length, rawSha256: sha256(raw[layer]), compressedBytes: compressed.length, compressedSha256: sha256(compressed), frameSha256: capturesSummary[layer as CaptureLayer].frameSha256 }]
      }))
    }
    await Promise.all(captureLayers.map(layer => writeFile(join(folder, `${layer}.bgra.gz`), gzipSync(raw[layer]))))
    await writeFile(join(folder, 'golden.json'), JSON.stringify(manifest, null, 2))
  } else if (!unifiedCards) {
    const referenceFolder = join(root, `tests/editor-v6/fixtures/golden-export-v${extendedFeatures ? 2 : 1}`)
    const manifest = JSON.parse(await readFile(join(referenceFolder, 'golden.json'), 'utf8'))
    assert(JSON.stringify(manifest.threshold) === JSON.stringify(threshold), 'O limiar de comparação armazenado diverge do limiar pré-registrado.')
    const comparisons: Record<CaptureLayer, ReturnType<typeof compareRaw>> = {} as Record<CaptureLayer, ReturnType<typeof compareRaw>>
    for (const layer of captureLayers) {
      const expectedCompressed = await readFile(join(referenceFolder, manifest.layers[layer].file))
      assert(sha256(expectedCompressed) === manifest.layers[layer].compressedSha256, `SHA-256 comprimido inválido para a referência ${layer}.`)
      const expected = gunzipSync(expectedCompressed)
      assert(expected.length === raw[layer].length && sha256(expected) === manifest.layers[layer].rawSha256, `SHA-256 ou tamanho bruto inválido para a referência ${layer}.`)
      const expectedFrameHashes = Array.from({ length: captureRanges[layer].frameCount }, (_, offset) => sha256(expected.subarray(offset * frameBytes, (offset + 1) * frameBytes)))
      assert(expectedFrameHashes.join(',') === manifest.layers[layer].frameSha256.join(','), `Hashes individuais de quadro inválidos na referência ${layer}.`)
      comparisons[layer] = compareRaw(expected, raw[layer], layer, captureRanges[layer].firstFrame, captureRanges[layer].frameCount)
    }
    const scene = comparisons.scene, background = comparisons.background, foreground = comparisons.foreground
    const withinFloor = scene.differingFrameCount <= threshold.maxSceneFrames
      && scene.maxChangedPixelsPerFrame <= threshold.maxForegroundChangedPixelsPerFrame
      && scene.maxChannelDelta <= threshold.maxForegroundChannelDelta
      && background.maxChangedPixelsPerFrame <= threshold.maxBackgroundChangedPixelsPerFrame
      && foreground.differingFrameCount <= threshold.maxForegroundFrames
      && foreground.maxChangedPixelsPerFrame <= threshold.maxForegroundChangedPixelsPerFrame
      && foreground.maxChannelDelta <= threshold.maxForegroundChannelDelta
    assert(withinFloor, `A captura excedeu o piso D0 pré-registrado: ${JSON.stringify(comparisons)}`)
    if (extendedFeatures) {
      assert(manifest.fixture.version === 2, 'A referência dourada não corresponde à versão da fixture solicitada.')
      assert(JSON.stringify(manifest.fixture.features) === JSON.stringify(['intro-bilingual', 'timed-video-cards', 'loading-gif']), 'A referência dourada não cobre todos os recursos visuais da fixture estendida.')
    }
    qualityComparison = { withinFloor, threshold, layers: comparisons }
  }
  const result = {
    passed: true, mode: unifiedCards ? 'unified-cards' : recordReference ? 'record-reference' : 'compare', fixture: { version: extendedFeatures ? 2 : 1, features: extendedFeatures ? ['intro-bilingual', 'timed-video-cards', 'loading-gif'] : [], width, height, fps, frames: frameCount },
    timeline: { noVideo: [0, videoStartFrame], video: [videoStartFrame, frameCount], speech: [22, 62], poseTransitionFrame: 30, turboSeamFrame: videoStartFrame },
    export: { state: report.state, fallback: report.fallback, totalFrames: report.totalFrames, videoInputs: report.videoInputs, parts: parts.map(part => ({ startFrame: part.startFrame, endFrame: part.endFrame, frames: part.frames })), mouthAtlases: report.mouthAnimation?.stateAtlases ?? 0, motionTransitions: [report.motionTransitionsPrepared, report.motionTransitionsRequired], hairRasterFrames },
    mp4: { width: stream.width, height: stream.height, fps: stream.r_frame_rate, frames: Number(stream.nb_frames), decodedBytes: decoded.length, ...(cardSamples ? { cardSamples } : {}) },
    capture: Object.fromEntries(captureLayers.map(layer => [layer, {
      firstFrame: captureRanges[layer].firstFrame, frameCount: captureRanges[layer].frameCount,
      capturedSnapshots: captures[layer].size, rawBytes: raw[layer].length, rawSha256: sha256(raw[layer])
    }])), qualityComparison
  }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  app.exit(0)
}

const timeout = setTimeout(() => { console.error('Teste dourado ultrapassou 55 s.'); app.exit(1) }, 55_000)
void main().catch(error => { clearTimeout(timeout); console.error(error); app.exit(1) })
