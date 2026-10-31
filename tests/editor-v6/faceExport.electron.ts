import { app, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { editorV6FaceModeAtFrame } from '../../src/shared/editorV6FaceSchedule'

const root = resolve(process.argv[2]), folder = resolve(process.argv[3]), fixturePath = resolve(process.argv[4])
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
const readRgbAt = (pixels: Buffer, width: number, height: number, frame: number, x: number, y: number) => {
  const offset = frame * width * height * 3 + (y * width + x) * 3
  return [...pixels.subarray(offset, offset + 3)]
}
function transformedPatchBounds(actor: EditorV6Element, patch: NonNullable<EditorV6MotionBakeResult['motion']['frames'][number]['facePatch']>, width: number, height: number) {
  const actorWidth = actor.width * 19.2, actorHeight = actor.height * 10.8
  const centerX = (50 + actor.x) * 19.2, centerY = (50 + actor.y) * 10.8, radians = actor.rotation * Math.PI / 180
  const corners = [
    [patch.x, patch.y], [patch.x + patch.width, patch.y],
    [patch.x, patch.y + patch.height], [patch.x + patch.width, patch.y + patch.height]
  ].map(([x, y]) => {
    const localX = (x! - .5) * actorWidth * (actor.flipX ? -1 : 1), localY = (y! - .5) * actorHeight
    return { x: centerX + localX * Math.cos(radians) - localY * Math.sin(radians), y: centerY + localX * Math.sin(radians) + localY * Math.cos(radians) }
  })
  const scaleX = width / 1920, scaleY = height / 1080
  const xs = corners.map((point) => point.x * scaleX), ys = corners.map((point) => point.y * scaleY)
  const localCenterX = (patch.x + patch.width / 2 - .5) * actorWidth * (actor.flipX ? -1 : 1)
  const localCenterY = (patch.y + patch.height / 2 - .5) * actorHeight
  return {
    left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys),
    centerX: (centerX + localCenterX * Math.cos(radians) - localCenterY * Math.sin(radians)) * scaleX,
    centerY: (centerY + localCenterX * Math.sin(radians) + localCenterY * Math.cos(radians)) * scaleY
  }
}

async function main() {
  await app.whenReady()
  await mkdir(folder, { recursive: true })
  const hiBakeFixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
    sourceDataUrl: string
    sourceWidth: number
    sourceHeight: number
    asset: EditorV6MotionBakeResult['asset']
    metrics: EditorV6MotionBakeResult['metrics']
    frames: Array<{ facePatch: NonNullable<EditorV6MotionBakeResult['motion']['frames'][number]['facePatch']> }>
  }
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
  const mouthPatchPath = join(folder, 'mouth-loop-atlas.png')
  runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black@0.0:s=192x64:r=1', '-vf', 'format=rgba,drawbox=x=4:y=30:w=56:h=4:color=lime@1:t=fill,drawbox=x=68:y=22:w=56:h=20:color=lime@1:t=fill,drawbox=x=132:y=10:w=56:h=44:color=lime@1:t=fill', '-frames:v', '1', mouthPatchPath])
  const mouthPatchId = randomUUID()
  const mouthPatchAsset = { id: mouthPatchId, category: 'character' as const, name: 'Atlas sintético com três aberturas', mimeType: 'image/png' as const, dataUrl: `data:image/png;base64,${(await readFile(mouthPatchPath)).toString('base64')}`, timelineSnapshot: true }
  const syntheticSpeaker: CustomizerCharacter = { id: 'silent-face-fixture', name: 'Fixture silenciosa', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), hair: '', outfit: '', skin: '', customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const bakeSyntheticMouth = async (request: EditorV6MotionBakeRequest): Promise<EditorV6MotionBakeResult> => {
    const frames = request.plan.samples.map((sample, index) => {
      const sprite = { x: index * 64, y: 0, width: 64, height: 64, atlasWidth: 192, atlasHeight: 64 }
      return { offset: sample.offset, sprite, x: request.plan.from.x, y: request.plan.from.y, width: request.plan.from.width, height: request.plan.from.height, rotation: 0, flipX: false, facePatch: { sprite, x: 0.08, y: 0.08, width: 0.2, height: 0.2 } }
    })
    return { asset: mouthPatchAsset, motion: { version: 1, key: request.plan.key, assetId: mouthPatchId, frames }, metrics: { milliseconds: 1, preparedRigs: 1, samples: frames.length, atlasPixels: 192 * 64 } }
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
    getCharacters: async () => [syntheticSpeaker],
    bakeMotion: bakeSyntheticMouth,
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
  assert(report.options.mouthLoop === true && report.mouthAnimation?.stateAtlases === 1 && report.mouthAnimation.atlasPixels === 192 * 64, 'A exportação de fala não preparou o atlas facial sintético obrigatório.')

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
  const hiBaseId = randomUUID(), hiPatchAsset = hiBakeFixture.asset, hiPatchId = hiPatchAsset.id
  const hiBaseAsset = { id: hiBaseId, category: 'character' as const, name: 'Personagem sintético 640 × 960', mimeType: 'image/png' as const, dataUrl: hiBakeFixture.sourceDataUrl }
  const hiCharacters: CustomizerCharacter[] = []
  const hiActors: EditorV6Element[] = [
    { id: randomUUID(), kind: 'character', characterId: 'high-resolution-mouth-normal', assetId: hiBaseId, text: 'Fixture facial normal', x: -30, y: 0, width: 40, height: 70, rotation: 0, flipX: false, zIndex: 1 },
    { id: randomUUID(), kind: 'character', characterId: 'high-resolution-mouth-small', assetId: hiBaseId, text: 'Fixture facial pequeno e espelhado', x: 0, y: 0, width: 24, height: 42, rotation: 31, flipX: true, zIndex: 2 },
    { id: randomUUID(), kind: 'character', characterId: 'high-resolution-mouth-large', assetId: hiBaseId, text: 'Fixture facial grande e rotacionado', x: 30, y: 0, width: 52, height: 88, rotation: -24, flipX: false, zIndex: 3 }
  ]
  for (const actor of hiActors) hiCharacters.push({ id: actor.characterId!, name: actor.text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), hair: '', outfit: '', skin: '', customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } })
  const hiTimeline = createEditorV6Timeline(hiActors)
  const hiProjectId = randomUUID()
  const hiSpeechBlocks = hiActors.map((actor) => ({ id: randomUUID(), label: `Fala de ${actor.text}`, characterId: actor.characterId!, startFrame: 8, durationFrames: 16 }))
  const hiProject: EditorV6Document = {
    schemaVersion: 1, id: hiProjectId, title: 'Paridade facial em alta resolução', color: '#ffffff', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    backgroundColor: '#151515', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [hiBaseAsset], elements: hiActors, exportAudio: [],
    timeline: { ...hiTimeline, durationFrames: 40, tracks: hiTimeline.tracks.map((track) => track.kind === 'character'
      ? { ...track, blocks: track.blocks.map((block) => ({ ...block, durationFrames: 40, state: hiActors.find((actor) => actor.id === block.elementId) })) }
      : track.kind === 'speech' ? { ...track, blocks: hiSpeechBlocks } : track) }
  }
  const hiBake = async (request: EditorV6MotionBakeRequest): Promise<EditorV6MotionBakeResult> => {
    const frames = request.plan.samples.map((sample, index) => {
      const facePatch = hiBakeFixture.frames[index]?.facePatch
      if (!facePatch) throw Error(`O bake Chromium não gerou o recorte facial ${index + 1}.`)
      return {
      offset: sample.offset, sprite: facePatch.sprite,
      x: request.plan.from.x, y: request.plan.from.y, width: request.plan.from.width, height: request.plan.from.height, rotation: 0, flipX: false,
      facePatch
    }})
    return { asset: hiPatchAsset, motion: { version: 1, key: request.plan.key, assetId: hiPatchId, frames }, metrics: { ...hiBakeFixture.metrics, samples: frames.length } }
  }
  const bakedPatch = hiBakeFixture.frames[2].facePatch
  const fullFrameAtlasEquivalentPixels = Math.ceil(Math.sqrt(hiBakeFixture.frames.length)) ** 2 * hiBakeFixture.sourceWidth * hiBakeFixture.sourceHeight
  assert(hiBakeFixture.metrics.atlasPixels < fullFrameAtlasEquivalentPixels / 10, 'O atlas da boca não reduziu o armazenamento em relação a quadros completos do personagem.')
  const atlasPixelReductionPercent = Number(((1 - hiBakeFixture.metrics.atlasPixels / fullFrameAtlasEquivalentPixels) * 100).toFixed(2))
  const hiResults = []
  for (const [label, width, height] of [['720p', 1280, 720], ['1080p', 1920, 1080]] as const) {
    const hiOutput = join(folder, `mouth-local-composition-${label}.mp4`)
    const hiReport = await runEditorV6Export(hiProject, { startFrame: 0, endFrame: 40, width, height, turbo: true, encoder: 'cpu', mouthLoop: false }, {
      ffmpeg, ffprobe, tempRoot: folder, id: randomUUID(), outputPath: hiOutput, reportPath: join(folder, `mouth-local-composition-${label}.report.json`), signal: new AbortController().signal,
      getCharacters: async () => hiCharacters, bakeMotion: hiBake,
      createWorker: async (renderProject, part, signal, layeredVideo, mouthLoops) => {
        const worker = await factory.create({ project: renderProject, width, height, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}) }, signal)
        return { frame: worker.frame, close: worker.close }
      },
      audioPath: () => { throw Error('A fixture facial não deve usar áudio.'); }, mediaPath: () => { throw Error('A fixture facial não deve usar mídia externa.'); }, progress: () => {}
    })
    assert(hiReport.state === 'completed' && !hiReport.fallback && hiReport.options.mouthLoop === true, `A exportação facial ${label} falhou ou aceitou desligar a boca: ${hiReport.error ?? hiReport.state}.`)
    assert(hiReport.mouthAnimation?.stateAtlases === hiActors.length * 2 && hiReport.mouthAnimation.atlasPixels === hiBakeFixture.metrics.atlasPixels * hiActors.length * 2, `As camadas faciais ${label} não correspondem aos três personagens falando nos dois trechos Turbo.`)
    const hiProbe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', hiOutput], { encoding: 'utf8', windowsHide: true })) as { streams: Array<{ width?: number; height?: number; r_frame_rate?: string; nb_frames?: string }> }
    assert(hiProbe.streams[0]?.width === width && hiProbe.streams[0]?.height === height && hiProbe.streams[0]?.r_frame_rate === '30/1' && Number(hiProbe.streams[0]?.nb_frames) === 40, `O MP4 facial ${label} perdeu resolução, taxa ou quadros.`)
    const speakerId = hiActors[0].characterId!
    const speakerFrames = Array.from({ length: 16 }, (_, index) => 8 + index).filter((frame) => ['talk', 'talk-blink'].includes(editorV6FaceModeAtFrame(hiProject.id, hiProject.timeline, speakerId, frame)))
    const talkFrame = speakerFrames[0]
    assert(talkFrame !== undefined, 'A fixture não encontrou um quadro de fala para validar a boca.')
    const decoded = runFfmpeg(['-i', hiOutput, '-vf', `select='eq(n,7)+eq(n,${talkFrame})+eq(n,19)+eq(n,20)+eq(n,24)'`, '-fps_mode', 'passthrough', '-frames:v', '5', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    const frameBytes = width * height * 3
    assert(decoded.length === frameBytes * 5, `A validação ${label} não recebeu os quadros antes, durante, depois da fala e da emenda Turbo.`)
    const mouthRegions = hiActors.map((actor) => transformedPatchBounds(actor, bakedPatch, width, height))
    const mouthSamples = mouthRegions.map((region) => readRgbAt(decoded, width, height, 1, Math.round(region.centerX), Math.round(region.centerY)))
    for (const [index, [red, green, blue]] of mouthSamples.entries()) assert(green > 150 && red < 130 && blue < 130, `A camada facial transformada ${index + 1} não apareceu no MP4 ${label}: ${red},${green},${blue}.`)
    const [mouthRed, mouthGreen, mouthBlue] = mouthSamples[0]
    const seamMouthCounts = [2, 3].map((frameIndex) => {
      const region = mouthRegions[0]
      let greenPixels = 0
      for (let y = Math.max(0, Math.floor(region.top)); y < Math.min(height, Math.ceil(region.bottom)); y += 2) for (let x = Math.max(0, Math.floor(region.left)); x < Math.min(width, Math.ceil(region.right)); x += 2) {
        const [red, green, blue] = readRgbAt(decoded, width, height, frameIndex, x, y)
        if (green > 150 && green > red * 1.35 && green > blue * 1.2) greenPixels++
      }
      return greenPixels
    })
    assert(seamMouthCounts.every((count) => count > 0) && Math.abs(seamMouthCounts[0] - seamMouthCounts[1]) <= Math.max(20, seamMouthCounts[0] * .25), `A boca saltou na emenda Turbo ${label}: ${seamMouthCounts.join(' → ')} pixels.`)
    const countGreenPixels = (frame: number) => {
      let count = 0
      for (let y = Math.max(0, Math.floor(mouthRegions[0].top)); y < Math.min(height, Math.ceil(mouthRegions[0].bottom)); y += 2) for (let x = Math.max(0, Math.floor(mouthRegions[0].left)); x < Math.min(width, Math.ceil(mouthRegions[0].right)); x += 2) {
        const [red, green, blue] = readRgbAt(decoded, width, height, frame, x, y)
        if (green > 150 && green > red * 1.35 && green > blue * 1.2) count++
      }
      return count
    }
    const beforeSpeechGreenPixels = countGreenPixels(0), afterSpeechGreenPixels = countGreenPixels(4)
    assert(Math.abs(beforeSpeechGreenPixels - afterSpeechGreenPixels) <= Math.max(20, beforeSpeechGreenPixels * .1), `A boca não voltou ao estado original depois da fala em ${label}: ${beforeSpeechGreenPixels} → ${afterSpeechGreenPixels} pixels verdes.`)
    const patchRegions = mouthRegions.map((region) => ({ left: Math.max(0, Math.floor(region.left)), top: Math.max(0, Math.floor(region.top)), right: Math.min(width, Math.ceil(region.right)), bottom: Math.min(height, Math.ceil(region.bottom)) }))
    const maskMargin = 24
    const firstRegion = mouthRegions[0]
    const cropX = Math.max(0, Math.floor(firstRegion.left)) - Math.max(0, Math.floor(firstRegion.left)) % 2
    const cropY = Math.max(0, Math.floor(firstRegion.top)) - Math.max(0, Math.floor(firstRegion.top)) % 2
    const cropRight = Math.min(width, Math.ceil(firstRegion.right)), cropBottom = Math.min(height, Math.ceil(firstRegion.bottom))
    const cropWidth = Math.floor((cropRight - cropX) / 2) * 2, cropHeight = Math.floor((cropBottom - cropY) / 2) * 2
    const mouthDecode = runFfmpeg(['-i', hiOutput, '-vf', `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},format=rgb24`, '-frames:v', '40', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    const cropFrameBytes = cropWidth * cropHeight * 3
    assert(mouthDecode.length === cropFrameBytes * 40, `A validação ${label} não conseguiu comparar os 40 quadros da boca.`)
    const mouthAreas = speakerFrames.map((frame) => {
      let greenPixels = 0
      for (let y = Math.max(0, Math.floor(firstRegion.top)); y < Math.min(height, Math.ceil(firstRegion.bottom)); y += 2) for (let x = Math.max(0, Math.floor(firstRegion.left)); x < Math.min(width, Math.ceil(firstRegion.right)); x += 2) {
        const [red, green, blue] = readRgbAt(mouthDecode, cropWidth, cropHeight, frame, x - cropX, y - cropY)
        if (green > 150 && green > red * 1.35 && green > blue * 1.2) greenPixels++
      }
      return greenPixels
    })
    assert(new Set(mouthAreas).size >= 2 && Math.max(...mouthAreas) > Math.min(...mouthAreas) && Math.max(...mouthAreas) > beforeSpeechGreenPixels + 20, `A área da boca não variou em relação ao quadro antes da fala em ${label}: ${beforeSpeechGreenPixels} → ${mouthAreas.join(',')}.`)
    let difference = 0, count = 0
    for (let y = 80; y < height - 80; y += 4) for (let x = 80; x < width - 80; x += 4) {
      if (patchRegions.some((region) => x >= region.left - maskMargin && x <= region.right + maskMargin && y >= region.top - maskMargin && y <= region.bottom + maskMargin)) continue
      const before = readRgbAt(decoded, width, height, 0, x, y), during = readRgbAt(decoded, width, height, 1, x, y)
      difference += Math.abs(before[0] - during[0]) + Math.abs(before[1] - during[1]) + Math.abs(before[2] - during[2]); count += 3
    }
    const outsideMouthMeanAbsoluteDifference = difference / Math.max(1, count)
    assert(outsideMouthMeanAbsoluteDifference <= 5, `A imagem fora da boca mudou no MP4 ${label} (MAE ${outsideMouthMeanAbsoluteDifference.toFixed(3)}).`)
    const exportMilliseconds = hiReport.milliseconds
    hiResults.push({ resolution: label, width, height, frames: Number(hiProbe.streams[0].nb_frames), turboParts: hiReport.attempts[0]?.parts.length ?? 0, speakingCharacters: hiActors.length, transformations: hiActors.map(({ width, height, rotation, flipX }) => ({ width, height, rotation, flipX })), seamMouthCounts, afterSpeechGreenPixels, exportMilliseconds, effectiveFps: Number((Number(hiProbe.streams[0].nb_frames) / (exportMilliseconds / 1000)).toFixed(1)), mainProcessMemory: hiReport.mainProcessMemory, phaseMilliseconds: hiReport.phaseMilliseconds, bakeMilliseconds: hiBakeFixture.bakeMilliseconds, mouthPatchAtlasPixels: hiBakeFixture.metrics.atlasPixels, bakedPatchPixels: bakedPatch.sprite.width * bakedPatch.sprite.height, fullFrameAtlasEquivalentPixels, atlasPixelReductionPercent, sourceCharacterResolution: `${hiBakeFixture.sourceWidth}x${hiBakeFixture.sourceHeight}`, sourceCharacterPixels: hiBakeFixture.sourceWidth * hiBakeFixture.sourceHeight, mouthSamples, mouthGreenPixelCounts: mouthAreas, outsideMouthMeanAbsoluteDifference: Number(outsideMouthMeanAbsoluteDifference.toFixed(4)), output: hiOutput })
  }
  const result = { passed: true, state: report.state, totalFrames: report.totalFrames, fps: report.fps, audioClips: report.audioClips, streams: probe.streams.map((stream) => stream.codec_type), frameModes, thoughtPixels, highResolutionMouthExports: hiResults, output }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2))
  factory.dispose()
  app.exit(0)
}

main().catch((error) => { console.error('[Editor V6 · teste silencioso de faces]', error); app.exit(1) })
