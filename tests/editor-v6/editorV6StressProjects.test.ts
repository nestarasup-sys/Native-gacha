import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { editorV6DocumentSchema, isEditorV6Document } from '../../src/shared/editorV6Schema'
import { editorV6MotionPlans, missingEditorV6Motions } from '../../src/shared/editorV6Motion'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6LibraryIndex } from '../../electron/domains/editorV6/libraryIndex'

type Scenario = {
  key: 'light' | 'medium' | 'heavy'
  title: string
  durationFrames: number
  posesPerCharacter: number
  characterBlocks: number
  speechBlocks: number
  thoughtBlocks: number
  backgroundBlocks: number
  imageWidth: number
  imageHeight: number
}

type FixtureAsset = { asset: EditorV6Asset; bytes: Buffer }
type ScenarioResult = { scenario: Scenario; document: EditorV6Document; files: Map<string, Buffer> }

const createdAt = '2026-10-26T12:00:00.000Z'
const actorNames = ['Luna', 'Kael', 'Mika', 'Ravi']
const colors = [
  { hair: '#442a68', skin: '#ffd8c3', clothes: '#8b62cf', accent: '#f6c95e' },
  { hair: '#bd463f', skin: '#f4c5a4', clothes: '#307f91', accent: '#f0dd88' },
  { hair: '#245c48', skin: '#e9ba9d', clothes: '#df6e8b', accent: '#a8d86c' },
  { hair: '#293c6f', skin: '#c98e71', clothes: '#e0a447', accent: '#8ec8ea' }
]

const scenarios: Scenario[] = [
  { key: 'light', title: '[TESTE] Estresse leve — 4 personagens', durationFrames: 900, posesPerCharacter: 2, characterBlocks: 8, speechBlocks: 28, thoughtBlocks: 12, backgroundBlocks: 4, imageWidth: 512, imageHeight: 768 },
  { key: 'medium', title: '[TESTE] Estresse médio — 4 personagens', durationFrames: 3600, posesPerCharacter: 4, characterBlocks: 24, speechBlocks: 112, thoughtBlocks: 56, backgroundBlocks: 16, imageWidth: 800, imageHeight: 1200 },
  { key: 'heavy', title: '[TESTE] Estresse pesado — 4 personagens', durationFrames: 9000, posesPerCharacter: 8, characterBlocks: 72, speechBlocks: 280, thoughtBlocks: 140, backgroundBlocks: 40, imageWidth: 1280, imageHeight: 1920 }
]

function uuid(seed: string): string {
  const hex = createHash('sha256').update(`editor-v6-stress:${seed}`).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4]
  const raw = hex.join('')
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

function dataUrl(bytes: Buffer): string { return `data:image/png;base64,${bytes.toString('base64')}` }

function characterSvg(actor: number, pose: number): string {
  const palette = colors[actor]
  const lean = ((pose % 3) - 1) * 18
  const armLift = pose % 2 ? -42 : 12
  const fringe = pose % 2 ? 'M153 244 Q220 150 286 235 Q252 216 227 265 Q197 221 153 244Z' : 'M153 244 Q194 173 252 216 Q276 194 307 243 Q268 226 244 269 Q205 222 153 244Z'
  const mouth = pose % 3 === 2 ? '<ellipse cx="230" cy="382" rx="12" ry="17" fill="#743c54"/>' : '<path d="M214 383 Q230 397 247 382" fill="none" stroke="#743c54" stroke-width="7" stroke-linecap="round"/>'
  const eyes = pose % 4 === 3
    ? '<path d="M176 331q15-10 29 0M253 331q15-10 29 0" fill="none" stroke="#372d4c" stroke-width="8" stroke-linecap="round"/>'
    : '<ellipse cx="191" cy="330" rx="16" ry="25" fill="#392c5b"/><ellipse cx="269" cy="330" rx="16" ry="25" fill="#392c5b"/><ellipse cx="196" cy="322" rx="5" ry="8" fill="white"/><ellipse cx="274" cy="322" rx="5" ry="8" fill="white"/>'
  const accessory = actor % 2 ? `<path d="M286 178l30 8-21 34z" fill="${palette.accent}"/><circle cx="298" cy="195" r="7" fill="white"/>` : `<circle cx="174" cy="190" r="23" fill="${palette.accent}"/><circle cx="174" cy="190" r="8" fill="white"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960" viewBox="0 0 480 960">
    <defs><linearGradient id="cloth" x2="0" y2="1"><stop stop-color="${palette.clothes}"/><stop offset="1" stop-color="#30264d"/></linearGradient><linearGradient id="hair" x2="1" y2="1"><stop stop-color="${palette.hair}"/><stop offset="1" stop-color="${palette.accent}"/></linearGradient></defs>
    <ellipse cx="235" cy="923" rx="126" ry="20" fill="#29233a" opacity=".16"/>
    <path d="M166 566Q110 616 ${118 + lean} 738L143 906Q185 932 222 908L236 736 256 909Q304 934 343 902L353 720Q354 611 292 563Z" fill="url(#cloth)" stroke="#392e4e" stroke-width="12"/>
    <path d="M183 591L234 675 278 588 296 752 148 751Z" fill="${palette.accent}" opacity=".85"/><path d="M166 783h134M161 815h139M153 849h145" stroke="#fff" stroke-opacity=".45" stroke-width="8"/>
    <path d="M170 576Q106 608 ${102 + lean} ${690 + armLift}L78 ${719 + armLift}Q86 ${741 + armLift} 110 ${736 + armLift}L217 650Z" fill="${palette.skin}" stroke="#bd8178" stroke-width="9"/>
    <path d="M292 576Q356 610 ${370 - lean} ${690 - armLift}L397 ${714 - armLift}Q390 ${740 - armLift} 366 ${735 - armLift}L254 650Z" fill="${palette.skin}" stroke="#bd8178" stroke-width="9"/>
    <path d="M153 226Q131 90 230 80Q339 91 316 248L303 436Q293 529 236 555Q165 526 155 431Z" fill="url(#hair)" stroke="#37294f" stroke-width="14"/>
    <ellipse cx="230" cy="335" rx="91" ry="116" fill="${palette.skin}"/>
    <path d="${fringe}" fill="url(#hair)" stroke="#37294f" stroke-width="8"/><path d="M153 252Q108 353 154 510Q107 473 119 326Q122 261 153 252ZM304 241Q367 344 308 514Q365 464 348 321Q337 265 304 241Z" fill="url(#hair)" stroke="#37294f" stroke-width="8"/>
    ${eyes}<ellipse cx="161" cy="370" rx="16" ry="8" fill="#ed8493" opacity=".55"/><ellipse cx="298" cy="370" rx="16" ry="8" fill="#ed8493" opacity=".55"/>${mouth}${accessory}
    <path d="M180 548l50 63 47-63" fill="${palette.accent}"/><path d="M203 612l27 31 26-31" fill="#fff" opacity=".88"/>
    <path d="M177 238Q184 148 240 140" fill="none" stroke="#fff" stroke-opacity=".36" stroke-width="13" stroke-linecap="round"/>
  </svg>`
}

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

async function buildScenario(scenario: Scenario): Promise<ScenarioResult> {
  const key = scenario.key
  const files = new Map<string, Buffer>()
  const assets: FixtureAsset[] = []
  const characterAssets: FixtureAsset[][] = []
  const atlasAssets: FixtureAsset[] = []

  for (let actor = 0; actor < 4; actor++) {
    const poses: FixtureAsset[] = []
    for (let pose = 0; pose < scenario.posesPerCharacter; pose++) {
      const bytes = await raster(characterSvg(actor, pose), scenario.imageWidth, scenario.imageHeight)
      const item = asset(`${key}:character:${actor}:pose:${pose}`, 'character', `${actorNames[actor]} · pose ${String(pose + 1).padStart(2, '0')}`, bytes, pose > 0)
      poses.push(item); assets.push(item)
    }
    characterAssets.push(poses)
    const tileWidth = 160, tileHeight = 320
    const tileBytes = await Promise.all(poses.map(({ bytes }) => sharp(bytes).resize(tileWidth, tileHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()))
    const atlasBytes = await sharp({ create: { width: tileWidth * tileBytes.length, height: tileHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(tileBytes.map((input, index) => ({ input, left: index * tileWidth, top: 0 })))
      .png({ compressionLevel: 8 }).toBuffer()
    const atlas = asset(`${key}:character:${actor}:motion-atlas`, 'character', `${actorNames[actor]} · atlas de poses`, atlasBytes, true)
    assets.push(atlas); atlasAssets.push(atlas)
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
  const actors: EditorV6Element[] = actorNames.map((name, index) => {
    const element: EditorV6Element = {
      id: uuid(`${key}:element:actor:${index}`), kind: 'character', assetId: characterAssets[index][0].asset.id,
      characterId: `stress-${key}-character-${index + 1}`, characterSourceUpdatedAt: createdAt,
      poseSlot: 0, activeExpressionPresetId: 'stress-neutral', text: `Stress ${name}`,
      x: 15 + index * 23, y: 68, width: 20, height: 49, rotation: 0, zIndex: 20 + index
    }
    elements.push(element)
    return element
  })
  const propsElements: EditorV6Element[] = props.map((item, index) => {
    const element: EditorV6Element = {
      id: uuid(`${key}:element:prop:${index}`), kind: 'image', assetId: item.asset.id,
      text: `Adereço ${index + 1}`, x: 12 + index * 25, y: 89, width: 9, height: 9, rotation: index % 2 ? 12 : -8, zIndex: 8 + index
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

  for (let index = 0; index < propsElements.length; index++) {
    const startFrame = Math.floor(index * durationFrames / propsElements.length)
    const element = propsElements[index]
    videoTrack.blocks.push({ id: uuid(`${key}:block:prop:${index}`), elementId: element.id, label: element.text, startFrame, durationFrames: Math.max(1, Math.min(durationFrames - startFrame, Math.floor(durationFrames / 3))), state: { ...element } })
  }

  const characterTracks: EditorV6TimelineTrack[] = []
  for (let actor = 0; actor < actors.length; actor++) {
    const element = actors[actor], poses = characterAssets[actor]
    const track: EditorV6TimelineTrack = { id: uuid(`${key}:track:character:${actor}`), kind: 'character', characterId: element.characterId, name: `Stress ${actorNames[actor]}`, muted: false, locked: false, motionEnabled: true, blocks: [] }
    for (let index = 0; index < scenario.characterBlocks; index++) {
      const startFrame = Math.floor(index * durationFrames / scenario.characterBlocks)
      const endFrame = index + 1 === scenario.characterBlocks ? durationFrames : Math.floor((index + 1) * durationFrames / scenario.characterBlocks)
      const poseIndex = (index + actor) % poses.length
      const nextState: EditorV6Element = { ...element, assetId: poses[poseIndex].asset.id, poseSlot: poseIndex, activeExpressionPresetId: `stress-expression-${poseIndex % 5}` }
      track.blocks.push({ id: uuid(`${key}:block:character:${actor}:${index}`), elementId: element.id, characterId: element.characterId, label: `${actorNames[actor]} · preset ${poseIndex + 1}`, startFrame, durationFrames: endFrame - startFrame, state: nextState })
    }
    characterTracks.push(track)
  }

  const speechEvents: Array<{ startFrame: number; durationFrames: number; parent: EditorV6TimelineBlock }> = []
  const addComment = (kind: 'speech' | 'thought', index: number, startFrame: number, durationFrames: number, parent: EditorV6TimelineBlock, actorIndex: number) => {
    const name = actorNames[actorIndex]
    const element: EditorV6Element = {
      id: uuid(`${key}:element:${kind}:${index}`), kind, text: kind === 'speech' ? `${name}: fala de estresse ${index + 1}` : `${name}: pensamento paralelo ${index + 1}`,
      x: 15 + actorIndex * 23, y: 22 + (kind === 'thought' ? 13 : 0), width: 28, height: 13, rotation: 0, zIndex: 60 + index
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
    tracks: [videoTrack, speechTrack, thoughtTrack, ...characterTracks],
    knownElementIds: elements.map((element) => element.id)
  }

  const projectId = uuid(`${key}:project`)
  const backgroundAssetId = backgrounds[0].asset.id
  const document: EditorV6Document = {
    schemaVersion: 1, id: projectId, title: scenario.title, color: key === 'light' ? '#a5c4eb' : key === 'medium' ? '#e9bd82' : '#d88791',
    createdAt, updatedAt: createdAt,
    backgroundColor: '#d7b5cd', backgroundAssetId, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: assets.map(({ asset }) => asset), elements, timeline
  }

  const atlasByCharacter = new Map(actors.map((element, index) => [element.characterId!, { asset: atlasAssets[index].asset, poseCount: characterAssets[index].length, tileWidth: 160, tileHeight: 320 }]))
  const plans = editorV6MotionPlans(document)
  const planByBlock = new Map(plans.map((plan) => [plan.blockId, plan]))
  document.timeline = {
    ...document.timeline,
    tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
      const plan = planByBlock.get(block.id)
      if (!plan) return block
      const atlas = atlasByCharacter.get(plan.characterId)
      if (!atlas) return block
      const fromPose = Number(plan.from.poseSlot ?? 0) % atlas.poseCount
      const toPose = Number(plan.to.poseSlot ?? 0) % atlas.poseCount
      let delta = (toPose - fromPose + atlas.poseCount) % atlas.poseCount
      if (delta > atlas.poseCount / 2) delta -= atlas.poseCount
      const frames = plan.samples.map((sample) => {
        const pose = (fromPose + Math.round(delta * sample.progress) + atlas.poseCount) % atlas.poseCount
        return {
          offset: sample.offset,
          sprite: { x: pose * atlas.tileWidth, y: 0, width: atlas.tileWidth, height: atlas.tileHeight, atlasWidth: atlas.tileWidth * atlas.poseCount, atlasHeight: atlas.tileHeight },
          x: plan.from.x + (plan.to.x - plan.from.x) * sample.progress,
          y: plan.from.y + (plan.to.y - plan.from.y) * sample.progress,
          width: plan.from.width + (plan.to.width - plan.from.width) * sample.progress,
          height: plan.from.height + (plan.to.height - plan.from.height) * sample.progress,
          rotation: plan.from.rotation + (plan.to.rotation - plan.from.rotation) * sample.progress,
          flipX: Boolean(plan.to.flipX)
        }
      })
      return { ...block, incomingMotion: { version: 1 as const, key: plan.key, assetId: atlas.asset.id, frames } }
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
  if (!overlapping) throw new Error(`${scenario.title}: faltaram blocos sobrepostos de fala e pensamento.`)
  return { scenario, document: checked.data, files }
}

async function writeScenario(root: string, result: ScenarioResult) {
  const { scenario, document, files } = result
  const folder = join(root, `editorV6-${document.id}`)
  for (const relative of ['assets/backgrounds', 'assets/characters', 'assets/objects', 'prints']) await mkdir(join(folder, relative), { recursive: true })
  const categoryFolder = (category: EditorV6Asset['category']) => category === 'background' ? 'backgrounds' : category === 'character' ? 'characters' : 'objects'
  for (const item of document.assets) {
    const bytes = files.get(item.id)
    if (!bytes) throw new Error(`PNG da fixture não encontrado: ${item.name}`)
    await writeFile(join(folder, 'assets', categoryFolder(item.category), `${item.id}.png`), bytes)
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
    title: document.title, id: document.id, folder,
    characters: document.elements.filter((element) => element.kind === 'character').length,
    blocks: document.timeline.tracks.reduce((sum, track) => sum + track.blocks.length, 0),
    tracks: document.timeline.tracks.length, assets: document.assets.length,
    motionTransitions: editorV6MotionPlans(document).length,
    overlappingSpeechThought: true,
    durationSeconds: document.timeline.durationFrames / 30
  }
}

const enabled = process.env.GACHA_EDITOR_V6_STRESS_FIXTURES === '1'
describe.skipIf(!enabled)('projetos de estresse do Editor V6', () => {
  it('cria e valida os projetos leve, médio e pesado, com quatro personagens e blocos sobrepostos', async () => {
    const root = process.env.GACHA_EDITOR_V6_STRESS_ROOT
    if (!root) throw new Error('O gerador precisa de uma pasta raiz explícita para os projetos de estresse.')
    await mkdir(root, { recursive: true })
    const output = []
    for (const scenario of scenarios) output.push(await writeScenario(root, await buildScenario(scenario)))
    expect(output).toHaveLength(3)
    expect(output.map((item) => item.characters)).toEqual([4, 4, 4])
    expect(output[0].blocks).toBeLessThan(output[1].blocks)
    expect(output[1].blocks).toBeLessThan(output[2].blocks)

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
    expect(fixtureSummaries).toHaveLength(3)
    expect(fixtureSummaries.every((summary) => !('assets' in summary))).toBe(true)
    for (const id of fixtureIds) {
      const reopened = await persistence.readEditorV6(id)
      expect(reopened).not.toBeNull()
      expect(reopened!.assets.every((asset) => asset.dataUrl.startsWith('data:image/png;base64,'))).toBe(true)
      expect(missingEditorV6Motions(reopened!)).toHaveLength(0)
    }
    console.log(JSON.stringify(output.map(({ folder: _folder, ...summary }) => summary), null, 2))
  }, 120_000)
})
