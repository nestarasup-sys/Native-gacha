import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { editorV6DocumentSchema, isEditorV6Document } from '../../src/shared/editorV6Schema'
import { editorV6MotionPlans, missingEditorV6Motions } from '../../src/shared/editorV6Motion'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6MediaAsset, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6LibraryIndex } from '../../electron/domains/editorV6/libraryIndex'

type Scenario = {
  key: 'light' | 'medium' | 'heavy' | 'multimedia'
  title: string
  durationFrames: number
  posesPerCharacter: number
  characterBlocks: number
  speechBlocks: number
  thoughtBlocks: number
  backgroundBlocks: number
  imageWidth: number
  imageHeight: number
  transitionActorCount?: number
  instantTransitions?: boolean
  staggerFrames?: number
}

type FixtureAsset = { asset: EditorV6Asset; bytes: Buffer }
type ScenarioResult = { scenario: Scenario; document: EditorV6Document; files: Map<string, Buffer> }
type CapturedCharacter = {
  character: CustomizerCharacter
  poses: Array<{ poseSlot: number; dataUrl: string; width: number; height: number; geometry: { x: number; y: number; width: number; height: number } }>
  transitions: Array<{ fromPoseSlot: number; toPoseSlot: number; assetDataUrl: string; frames: EditorV6MotionFrame[]; metrics: { milliseconds: number; preparedRigs: number; samples: number; atlasPixels: number } }>
}

const createdAt = '2026-10-26T12:00:00.000Z'
const actorPositions = [-36, -12, 12, 36]
const colors = [
  { hair: '#442a68', skin: '#ffd8c3', clothes: '#8b62cf', accent: '#f6c95e' },
  { hair: '#bd463f', skin: '#f4c5a4', clothes: '#307f91', accent: '#f0dd88' },
  { hair: '#245c48', skin: '#e9ba9d', clothes: '#df6e8b', accent: '#a8d86c' },
  { hair: '#293c6f', skin: '#c98e71', clothes: '#e0a447', accent: '#8ec8ea' }
]

const scenarios: Scenario[] = [
  { key: 'light', title: '[TESTE] Estresse leve — 4 personagens STRESS', durationFrames: 7200, posesPerCharacter: 2, characterBlocks: 8, speechBlocks: 28, thoughtBlocks: 12, backgroundBlocks: 4, imageWidth: 512, imageHeight: 768 },
  { key: 'medium', title: '[TESTE] Estresse médio — 4 personagens STRESS', durationFrames: 10800, posesPerCharacter: 4, characterBlocks: 24, speechBlocks: 112, thoughtBlocks: 56, backgroundBlocks: 16, imageWidth: 800, imageHeight: 1200 },
  { key: 'heavy', title: '[TESTE] Estresse pesado — 4 personagens STRESS', durationFrames: 18000, posesPerCharacter: 8, characterBlocks: 72, speechBlocks: 280, thoughtBlocks: 140, backgroundBlocks: 40, imageWidth: 1280, imageHeight: 1920 },
  { key: 'multimedia', title: '[TESTE] Estresse multimídia — codecs e áudio', durationFrames: 7200, posesPerCharacter: 8, characterBlocks: 24, speechBlocks: 112, thoughtBlocks: 56, backgroundBlocks: 16, imageWidth: 800, imageHeight: 1200 }
]

const stressExperiment = process.env.GACHA_EDITOR_V6_STRESS_EXPERIMENT ?? 'baseline'
const experimentProfiles: Record<string, Partial<Scenario>> = {
  baseline: {},
  frames200: { characterBlocks: 90 },
  frames300: { characterBlocks: 60 },
  static: { transitionActorCount: 0 },
  instant: { instantTransitions: true },
  'isolated-one': { transitionActorCount: 1, backgroundBlocks: 1, speechBlocks: 0, thoughtBlocks: 0 },
  'isolated-four': { transitionActorCount: 4, backgroundBlocks: 1, speechBlocks: 0, thoughtBlocks: 0 },
  staggered: { staggerFrames: 12 }
}
if (!experimentProfiles[stressExperiment]) throw new Error(`Experimento de estresse desconhecido: ${stressExperiment}`)
const heavyIndex = scenarios.findIndex((scenario) => scenario.key === 'heavy')
scenarios[heavyIndex] = { ...scenarios[heavyIndex], ...experimentProfiles[stressExperiment] }

function uuid(seed: string): string {
  const hex = createHash('sha256').update(`editor-v6-stress:${seed}`).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4]
  const raw = hex.join('')
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

function dataUrl(bytes: Buffer): string { return `data:image/png;base64,${bytes.toString('base64')}` }

function backgroundSvg(index: number): string {
  const palettes = [['#b8d7ee', '#f4d3e4', '#f9e8c0'], ['#8fc9bd', '#97b4de', '#f1dcaa'], ['#f4b7a3', '#d8b2e1', '#fff0bd'], ['#9fb7dc', '#b2decb', '#f7d4a1']]
  const [top, mid, bottom] = palettes[index % palettes.length]
  const stars = Array.from({ length: 46 }, (_, i) => {
    const x = (i * 137 + index * 59) % 1920, y = (i * 83 + 31) % 720, r = 2 + (i % 6)
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${0.18 + (i % 5) * 0.09}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${top}"/><stop offset=".52" stop-color="${mid}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#sky)"/>${stars}<circle cx="1540" cy="205" r="126" fill="#fff8dc" opacity=".64"/><path d="M0 846Q300 742 620 846T1250 836T1920 824V1080H0Z" fill="#9c8bb4" opacity=".22"/><path d="M0 938Q350 817 700 934T1400 918T1920 900V1080H0Z" fill="#fff" opacity=".28"/><path d="M0 1015Q440 925 850 1006T1600 1000T1920 985V1080H0Z" fill="#648e8a" opacity=".2"/></svg>`
}

function propSvg(index: number): string {
  const palette = colors[index % colors.length]
  const shapes = ['<path d="M256 35L312 194 480 205 349 313 395 480 256 384 117 480 163 313 32 205 200 194Z"/>', '<path d="M115 85h282v310H115z"/><path d="M157 132h198v32H157zm0 70h198v24H157zm0 58h147v24H157z" fill="white"/>', '<circle cx="256" cy="256" r="200"/><path d="M110 260q146-180 292 0-146 180-292 0" fill="white"/><circle cx="256" cy="260" r="65" fill="' + palette.accent + '"/>', '<path d="M250 30l46 149 157 2-126 91 47 150-126-93-127 93 48-150-126-91 157-2z"/>']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g fill="${palette.clothes}" stroke="#443c5c" stroke-width="14" stroke-linejoin="round">${shapes[index % shapes.length]}</g><circle cx="415" cy="91" r="35" fill="${palette.accent}" opacity=".9"/><circle cx="415" cy="91" r="12" fill="white"/></svg>`
}

async function raster(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' }).png({ compressionLevel: 8, adaptiveFiltering: true }).toBuffer()
}

function asset(seed: string, category: EditorV6Asset['category'], name: string, bytes: Buffer, timelineSnapshot = false): FixtureAsset {
  return { asset: { id: uuid(`${seed}:asset`), category, name, mimeType: 'image/png', dataUrl: dataUrl(bytes), ...(timelineSnapshot ? { timelineSnapshot: true } : {}) }, bytes }
}

function bytesFromDataUrl(value: string): Buffer {
  const encoded = value.match(/^data:image\/(?:png|jpeg|webp);base64,([\s\S]+)$/)?.[1]
  if (!encoded) throw new Error('O teste offscreen retornou uma imagem fora do formato PNG/JPEG/WebP base64.')
  return Buffer.from(encoded, 'base64')
}

async function buildScenario(scenario: Scenario, capturedCharacters: CapturedCharacter[]): Promise<ScenarioResult> {
  const key = scenario.key
  const files = new Map<string, Buffer>()
  const assets: FixtureAsset[] = []
  const characterAssets: Array<Array<FixtureAsset & { poseSlot: number }>> = []
  const transitionAssets = new Map<string, FixtureAsset & { frames: EditorV6MotionFrame[] }>()

  for (let actor = 0; actor < capturedCharacters.length; actor++) {
    const captured = capturedCharacters[actor]
    if (captured.poses.length < 2 || captured.transitions.length < 2) throw new Error(`${captured.character.name}: faltam snapshots ou transições reais no bundle offscreen.`)
    const poses: Array<FixtureAsset & { poseSlot: number }> = []
    for (let pose = 0; pose < 2; pose++) {
      const source = captured.poses[pose]
      const bytes = bytesFromDataUrl(source.dataUrl)
      const item = asset(`${key}:character:${captured.character.id}:pose:${source.poseSlot}`, 'character', `${captured.character.name} · pose ${source.poseSlot}`, bytes, pose > 0)
      poses.push({ ...item, poseSlot: source.poseSlot }); assets.push(item)
    }
    characterAssets.push(poses)
    for (const transition of captured.transitions) {
      const bytes = bytesFromDataUrl(transition.assetDataUrl)
      const item = asset(`${key}:character:${captured.character.id}:motion:${transition.fromPoseSlot}-${transition.toPoseSlot}`, 'character', `${captured.character.name} · transição ${transition.fromPoseSlot}→${transition.toPoseSlot}`, bytes, true)
      assets.push(item)
      transitionAssets.set(`${captured.character.id}:${transition.fromPoseSlot}->${transition.toPoseSlot}`, { ...item, frames: transition.frames })
    }
  }

  const backgroundCount = key === 'light' ? 2 : key === 'medium' ? 4 : 8
  const backgrounds: FixtureAsset[] = []
  for (let index = 0; index < backgroundCount; index++) {
    const item = asset(`${key}:background:${index}`, 'background', `Fundo ${String(index + 1).padStart(2, '0')}`, await raster(backgroundSvg(index), 1920, 1080))
    assets.push(item); backgrounds.push(item)
  }
  const props: FixtureAsset[] = []
  for (let index = 0; index < 4; index++) {
    const item = asset(`${key}:prop:${index}`, 'object', `Adereço ${String(index + 1).padStart(2, '0')}`, await raster(propSvg(index), 512, 512))
    assets.push(item); props.push(item)
  }

  const elements: EditorV6Element[] = []
  const actors: EditorV6Element[] = capturedCharacters.map(({ character }, index) => {
    const name = character.name
    const basePose = characterAssets[index][0]
    const geometry = capturedCharacters[index].poses.find((pose) => pose.poseSlot === basePose.poseSlot)!.geometry
    const element: EditorV6Element = {
      id: uuid(`${key}:element:actor:${index}`), kind: 'character', assetId: basePose.asset.id,
      characterId: character.id, characterSourceUpdatedAt: character.updatedAt,
      faceAppearance: character.customization.faceAppearance,
      poseSlot: basePose.poseSlot, text: name,
      x: actorPositions[index] + geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rotation: 0, zIndex: 20 + index
    }
    elements.push(element)
    return element
  })
  const propsElements: EditorV6Element[] = props.map((item, index) => {
    const element: EditorV6Element = {
      id: uuid(`${key}:element:prop:${index}`), kind: 'image', assetId: item.asset.id,
      text: `Adereço ${index + 1}`, x: actorPositions[index], y: 32, width: 9, height: 9, rotation: index % 2 ? 12 : -8, zIndex: 8 + index
    }
    elements.push(element)
    return element
  })

  const durationFrames = scenario.durationFrames
  const videoTrack: EditorV6TimelineTrack = { id: uuid(`${key}:track:video`), kind: 'video', name: 'Vídeo / fundos', muted: false, locked: false, blocks: [] }
  const speechTrack: EditorV6TimelineTrack = { id: uuid(`${key}:track:speech`), kind: 'speech', name: 'Fala', muted: false, locked: false, blocks: [] }
  const thoughtTrack: EditorV6TimelineTrack = { id: uuid(`${key}:track:thought`), kind: 'thought', name: 'Pensamento', muted: false, locked: false, blocks: [] }
  const backgroundBlocks: EditorV6TimelineBlock[] = []
  for (let index = 0; index < scenario.backgroundBlocks; index++) {
    const startFrame = Math.floor(index * durationFrames / scenario.backgroundBlocks)
    const endFrame = Math.floor((index + 1) * durationFrames / scenario.backgroundBlocks)
    const backgroundAsset = backgrounds[index % backgrounds.length]
    const block: EditorV6TimelineBlock = {
      id: uuid(`${key}:block:background:${index}`), label: `Fundo ${index + 1}`,
      startFrame, durationFrames: endFrame - startFrame,
      background: { backgroundColor: '#d7b5cd', backgroundAssetId: backgroundAsset.asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }
    }
    videoTrack.blocks.push(block); backgroundBlocks.push(block)
  }

  const mediaAssets: EditorV6MediaAsset[] = []
  const audioTracks: EditorV6TimelineTrack[] = []
  if (key === 'multimedia') {
    const mediaRoot = process.env.GACHA_EDITOR_V6_STRESS_MEDIA_ROOT
    if (!mediaRoot) throw new Error('O cenário multimídia precisa de fixtures FFmpeg temporárias.')
    const mediaDefinitions = [
      { seed: 'video-h264', file: 'video-h264.mp4', kind: 'video' as const, mimeType: 'video/mp4', hasAudio: true, width: 320, height: 180 },
      { seed: 'video-vp9', file: 'video-vp9.webm', kind: 'video' as const, mimeType: 'video/webm', hasAudio: true, width: 320, height: 180 },
      { seed: 'audio-left', file: 'audio-left.wav', kind: 'audio' as const, mimeType: 'audio/wav', hasAudio: false },
      { seed: 'audio-right', file: 'audio-right.ogg', kind: 'audio' as const, mimeType: 'audio/ogg', hasAudio: false }
    ]
    for (const definition of mediaDefinitions) {
      const bytes = await readFile(join(mediaRoot, definition.file))
      const media: EditorV6MediaAsset = {
        id: uuid(`${key}:${definition.seed}`), name: definition.file,
        fileName: `${uuid(`${key}:${definition.seed}`)}.${definition.file.split('.').at(-1)}`,
        kind: definition.kind, mimeType: definition.mimeType, sourceFrames: 1200,
        hasAudio: definition.hasAudio, sizeBytes: bytes.length,
        ...('width' in definition ? { width: definition.width, height: definition.height } : {})
      }
      mediaAssets.push(media); files.set(media.fileName, bytes)
      if (definition.kind === 'video') {
        const index = mediaAssets.filter((item) => item.kind === 'video').length - 1
        videoTrack.blocks.push({
          id: uuid(`${key}:block:${definition.seed}`), mediaId: media.id,
          mediaInFrame: 0, audioEnabled: true, gain: 1,
          label: definition.file, startFrame: index * 600, durationFrames: 600
        })
      } else {
        const trackIndex = mediaAssets.filter((item) => item.kind === 'audio').length
        audioTracks.push({
          id: uuid(`${key}:track:audio:${trackIndex}`), kind: 'audio', name: `Áudio ${trackIndex}`,
          muted: false, locked: false,
          blocks: [{ id: uuid(`${key}:block:${definition.seed}`), mediaId: media.id, mediaInFrame: 0, audioEnabled: true, gain: .6, label: definition.file, startFrame: 0, durationFrames: 1200 }]
        })
      }
    }
  }

  for (let index = 0; index < propsElements.length; index++) {
    const startFrame = Math.floor(index * durationFrames / propsElements.length)
    const element = propsElements[index]
    videoTrack.blocks.push({ id: uuid(`${key}:block:prop:${index}`), elementId: element.id, label: element.text, startFrame, durationFrames: Math.max(1, Math.min(durationFrames - startFrame, Math.floor(durationFrames / 3))), state: { ...element } })
  }

  const characterTracks: EditorV6TimelineTrack[] = []
  for (let actor = 0; actor < actors.length; actor++) {
    const element = actors[actor], poses = characterAssets[actor]
    const track: EditorV6TimelineTrack = { id: uuid(`${key}:track:character:${actor}`), kind: 'character', characterId: element.characterId, name: element.text, muted: false, locked: false, motionEnabled: !scenario.instantTransitions, blocks: [] }
    for (let index = 0; index < scenario.characterBlocks; index++) {
      const offset = index === 0 ? 0 : (scenario.staggerFrames ?? 0) * actor
      const startFrame = index === 0 ? 0 : Math.floor(index * durationFrames / scenario.characterBlocks) + offset
      const endFrame = index + 1 === scenario.characterBlocks ? durationFrames : Math.floor((index + 1) * durationFrames / scenario.characterBlocks) + offset
      const shouldTransition = actor < (scenario.transitionActorCount ?? actors.length)
      const poseIndex = shouldTransition ? (index + actor) % Math.min(2, scenario.posesPerCharacter) : actor % Math.min(2, scenario.posesPerCharacter)
      const geometry = capturedCharacters[actor].poses.find((pose) => pose.poseSlot === poses[poseIndex].poseSlot)!.geometry
      const nextState: EditorV6Element = { ...element, assetId: poses[poseIndex].asset.id, poseSlot: poses[poseIndex].poseSlot, x: actorPositions[actor] + geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
      track.blocks.push({ id: uuid(`${key}:block:character:${actor}:${index}`), elementId: element.id, characterId: element.characterId, label: `${element.text} · pose ${poses[poseIndex].poseSlot}`, startFrame, durationFrames: endFrame - startFrame, state: nextState })
    }
    characterTracks.push(track)
  }

  const speechEvents: Array<{ startFrame: number; durationFrames: number; parent: EditorV6TimelineBlock }> = []
  const addComment = (kind: 'speech' | 'thought', index: number, startFrame: number, durationFrames: number, parent: EditorV6TimelineBlock, actorIndex: number) => {
    const name = actors[actorIndex].text
    const element: EditorV6Element = {
      id: uuid(`${key}:element:${kind}:${index}`), kind, text: kind === 'speech' ? `${name}: fala de estresse ${index + 1}` : `${name}: pensamento paralelo ${index + 1}`,
      x: actorPositions[actorIndex], y: kind === 'thought' ? -15 : -29, width: 26, height: 13, rotation: 0, zIndex: 60 + index
    }
    elements.push(element)
    const track = kind === 'speech' ? speechTrack : thoughtTrack
    track.blocks.push({
      id: uuid(`${key}:block:${kind}:${index}`), elementId: element.id, characterId: actors[actorIndex].characterId,
      label: element.text, startFrame, durationFrames, state: { ...element },
      parentBlockId: parent.id, relativeStartFrame: startFrame - parent.startFrame
    })
  }

  for (let index = 0; index < scenario.speechBlocks; index++) {
    const parent = backgroundBlocks[index % backgroundBlocks.length]
    const end = parent.startFrame + parent.durationFrames
    const durationFrames = Math.min(32, Math.max(18, Math.floor(parent.durationFrames / 5)))
    const slots = Math.ceil(scenario.speechBlocks / backgroundBlocks.length)
    const localIndex = Math.floor(index / backgroundBlocks.length)
    const available = Math.max(1, parent.durationFrames - durationFrames)
    const localOffset = Math.floor(localIndex * available / Math.max(1, slots - 1))
    const startFrame = parent.startFrame + Math.min(localOffset, available)
    const actorIndex = index % actors.length
    speechEvents.push({ startFrame, durationFrames, parent })
    addComment('speech', index, startFrame, durationFrames, parent, actorIndex)
  }

  for (let index = 0; index < scenario.thoughtBlocks; index++) {
    const anchor = speechEvents[Math.floor(index * speechEvents.length / scenario.thoughtBlocks)]
    const parent = anchor.parent
    const end = parent.startFrame + parent.durationFrames
    const durationFrames = Math.min(48, Math.max(20, Math.floor(parent.durationFrames / 4)))
    const offset = (index % 3 - 1) * 10
    const startFrame = Math.max(parent.startFrame, Math.min(end - durationFrames, anchor.startFrame + offset))
    addComment('thought', index, startFrame, durationFrames, parent, (index + 1) % actors.length)
  }

  videoTrack.blocks.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))
  speechTrack.blocks.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))
  thoughtTrack.blocks.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))
  const timeline = {
    fps: 30 as const, durationFrames,
    tracks: [videoTrack, ...audioTracks, speechTrack, thoughtTrack, ...characterTracks],
    knownElementIds: elements.map((element) => element.id)
  }

  const projectId = uuid(`${key}:project`)
  const backgroundAssetId = backgrounds[0].asset.id
  const document: EditorV6Document = {
    schemaVersion: 1, id: projectId, title: scenario.title, color: key === 'light' ? '#a5c4eb' : key === 'medium' ? '#e9bd82' : '#d88791',
    createdAt, updatedAt: createdAt,
    backgroundColor: '#d7b5cd', backgroundAssetId, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: assets.map(({ asset }) => asset), ...(mediaAssets.length ? { media: mediaAssets } : {}), elements, timeline
  }

  const plans = editorV6MotionPlans(document)
  const planByBlock = new Map(plans.map((plan) => [plan.blockId, plan]))
  document.timeline = {
    ...document.timeline,
    tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
      const plan = planByBlock.get(block.id)
      if (!plan) return block
      const fromPose = Number(plan.from.poseSlot)
      const toPose = Number(plan.to.poseSlot)
      const transition = transitionAssets.get(`${plan.characterId}:${fromPose}->${toPose}`)
      if (!transition) throw new Error(`${scenario.title}: faltou transição real ${fromPose}→${toPose} para ${plan.characterId}.`)
      const actorIndex = capturedCharacters.findIndex(({ character }) => character.id === plan.characterId)
      const offsetX = actorPositions[actorIndex]
      const frames = transition.frames.map((frame) => ({ ...frame, x: frame.x + offsetX }))
      return { ...block, incomingMotion: { version: 1 as const, key: plan.key, assetId: transition.asset.id, frames } }
    }) }))
  }

  const background = await raster(backgroundSvg(0), 480, 270)
  const portraitLayers = await Promise.all(characterAssets.map((poses, index) => sharp(poses[0].bytes).resize(64, 128, { fit: 'contain' }).png().toBuffer().then((input) => ({ input, left: 34 + index * 105, top: 118 }))))
  const thumbnail = await sharp(background).composite(portraitLayers).jpeg({ quality: 72, mozjpeg: true }).toBuffer()
  document.thumbnailDataUrl = `data:image/jpeg;base64,${thumbnail.toString('base64')}`

  for (const item of assets) files.set(item.asset.id, item.bytes)
  const checked = editorV6DocumentSchema.safeParse(document)
  if (!checked.success) throw new Error(`${scenario.title}: ${checked.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  if (missingEditorV6Motions(checked.data).length) throw new Error(`${scenario.title}: uma transição de pose ficou sem atlas.`)
  const overlapping = checked.data.timeline.tracks.find((track) => track.kind === 'speech')!.blocks.some((speech) => checked.data.timeline.tracks.find((track) => track.kind === 'thought')!.blocks.some((thought) => speech.startFrame < thought.startFrame + thought.durationFrames && thought.startFrame < speech.startFrame + speech.durationFrames))
  if (scenario.speechBlocks > 0 && scenario.thoughtBlocks > 0 && !overlapping) throw new Error(`${scenario.title}: faltaram blocos sobrepostos de fala e pensamento.`)
  return { scenario, document: checked.data, files }
}

async function writeScenario(root: string, result: ScenarioResult) {
  const { scenario, document, files } = result
  const folder = join(root, `editorV6-${document.id}`)
  for (const relative of ['assets/backgrounds', 'assets/characters', 'assets/objects', 'prints']) await mkdir(join(folder, relative), { recursive: true })
  const categoryFolder = (category: EditorV6Asset['category']) => category === 'background' ? 'backgrounds' : category === 'character' ? 'characters' : 'objects'
  for (const category of ['background', 'character', 'object'] as const) {
    const directory = join(folder, 'assets', categoryFolder(category))
    const current = new Set(document.assets.filter((item) => item.category === category).map((item) => `${item.id}.png`))
    for (const filename of await readdir(directory)) if (filename.toLowerCase().endsWith('.png') && !current.has(filename)) await unlink(join(directory, filename))
  }
  for (const item of document.assets) {
    const bytes = files.get(item.id)
    if (!bytes) throw new Error(`PNG da fixture não encontrado: ${item.name}`)
    await writeFile(join(folder, 'assets', categoryFolder(item.category), `${item.id}.png`), bytes)
  }
  if (document.media?.length) {
    await mkdir(join(folder, 'media'), { recursive: true })
    for (const item of document.media) {
      const bytes = files.get(item.fileName)
      if (!bytes) throw new Error(`Mídia de fixture não encontrada: ${item.name}`)
      await writeFile(join(folder, 'media', item.fileName), bytes)
    }
  }
  const { assets, ...metadata } = document
  const stored = { ...metadata, title: document.title.trim(), assets: assets.map(({ dataUrl: _dataUrl, ...item }) => ({ ...item, mimeType: 'image/png' as const })) }
  await writeFile(join(folder, 'editorV6.json'), JSON.stringify(stored, null, 2), 'utf8')

  const persistedAssets = await Promise.all(stored.assets.map(async (item) => {
    const bytes = await readFile(join(folder, 'assets', categoryFolder(item.category), `${item.id}.png`))
    return { ...item, dataUrl: dataUrl(bytes) }
  }))
  const reopened = editorV6DocumentSchema.safeParse({ ...stored, assets: persistedAssets })
  if (!reopened.success) throw new Error(`${scenario.title}: falhou a validação após reler os PNGs.`)
  return {
    key: scenario.key, title: document.title, id: document.id, folder,
    characters: document.elements.filter((element) => element.kind === 'character').length,
    characterNames: document.elements.filter((element) => element.kind === 'character').map((element) => element.text),
    characterIds: document.elements.filter((element) => element.kind === 'character').map((element) => element.characterId),
    blocks: document.timeline.tracks.reduce((sum, track) => sum + track.blocks.length, 0),
    tracks: document.timeline.tracks.length, assets: document.assets.length, media: document.media?.length ?? 0,
    motionTransitions: editorV6MotionPlans(document).length,
    stressExperiment,
    motionWindows: editorV6MotionPlans(document).map((plan) => ({ characterName: document.elements.find((element) => element.characterId === plan.characterId)?.text ?? plan.characterId, startFrame: plan.startFrame, endFrame: plan.endFrame })),
    linkedSpeechBlocks: document.timeline.tracks.filter((track) => track.kind === 'speech').flatMap((track) => track.blocks).filter((block) => block.characterId).length,
    linkedThoughtBlocks: document.timeline.tracks.filter((track) => track.kind === 'thought').flatMap((track) => track.blocks).filter((block) => block.characterId).length,
    missingMotions: missingEditorV6Motions(reopened.data).length,
    overlappingSpeechThought: scenario.speechBlocks > 0 && scenario.thoughtBlocks > 0,
    durationSeconds: document.timeline.durationFrames / 30
  }
}

const enabled = process.env.GACHA_EDITOR_V6_STRESS_FIXTURES === '1'
describe.skipIf(!enabled)('projetos de estresse do Editor V6', () => {
  it('cria e valida projetos com os quatro personagens reais, imagens e transições renderizadas no Electron', async () => {
    const root = process.env.GACHA_EDITOR_V6_STRESS_ROOT
    if (!root) throw new Error('O gerador precisa de uma pasta raiz explícita para os projetos de estresse.')
    const bundlePath = process.env.GACHA_EDITOR_V6_STRESS_CHARACTERS_BUNDLE
    if (!bundlePath) throw new Error('Capture os personagens e as animações em uma janela Electron offscreen antes de gerar os projetos.')
    const capturedCharacters = JSON.parse(await readFile(bundlePath, 'utf8')) as CapturedCharacter[]
    const expectedNames = ['STRESS_Aurora', 'STRESS_Nix', 'STRESS_Brisa', 'STRESS_Dorian']
    expect(capturedCharacters.map(({ character }) => character.name)).toEqual(expectedNames)
    expect(new Set(capturedCharacters.map(({ character }) => character.id)).size).toBe(4)
    expect(capturedCharacters.every((entry) => entry.poses.length === 2 && entry.transitions.length === 2)).toBe(true)
    await mkdir(root, { recursive: true })
    const output = []
    for (const scenario of scenarios) output.push(await writeScenario(root, await buildScenario(scenario, capturedCharacters)))
    expect(output).toHaveLength(4)
    expect(output.map((item) => item.characters)).toEqual([4, 4, 4, 4])
    expect(output.every((item) => item.characterNames.join(',') === expectedNames.join(','))).toBe(true)
    expect(output.every((item) => new Set(item.characterIds).size === 4)).toBe(true)
    expect(output[0].blocks).toBeLessThan(output[1].blocks)
    expect(output[1].blocks).toBeLessThan(output[2].blocks)
    expect(output[3].media).toBe(4)

    const persistence = createEditorV6DocumentPersistence({
      files: { access, mkdir, readFile, rename, unlink, rm, writeFile },
      editorV6Path: (id) => join(root, `editorV6-${id}`),
      editorV6LibraryPath: () => root,
      validate: isEditorV6Document,
      decodeImage: (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'),
      normalizeImage: async (bytes) => ({ bytes })
    })
    const library = createEditorV6LibraryIndex({ files: { mkdir, readdir }, editorV6LibraryPath: () => root, readEditorV6Summary: persistence.readEditorV6Summary })
    const summaries = await library.listEditorV6s()
    const fixtureIds = new Set(scenarios.map((scenario) => uuid(`${scenario.key}:project`)))
    const fixtureSummaries = summaries.filter((summary) => fixtureIds.has(summary.id))
    expect(fixtureSummaries).toHaveLength(4)
    expect(fixtureSummaries.every((summary) => !('assets' in summary))).toBe(true)
    for (const id of fixtureIds) {
      const reopened = await persistence.readEditorV6(id)
      expect(reopened).not.toBeNull()
      expect(reopened!.assets.every((asset) => asset.dataUrl.startsWith('data:image/png;base64,'))).toBe(true)
      if (id === uuid('multimedia:project')) expect(reopened!.media).toHaveLength(4)
      expect(missingEditorV6Motions(reopened!)).toHaveLength(0)
    }
    const reportSummaries = output.map(({ folder: _folder, ...summary }) => summary)
    const reportPath = process.env.GACHA_EDITOR_V6_STRESS_SUMMARY_PATH
    if (reportPath) {
      await mkdir(dirname(reportPath), { recursive: true })
      await writeFile(reportPath, JSON.stringify(reportSummaries, null, 2), 'utf8')
    }
    console.log(JSON.stringify(reportSummaries, null, 2))
  }, 120_000)
})
