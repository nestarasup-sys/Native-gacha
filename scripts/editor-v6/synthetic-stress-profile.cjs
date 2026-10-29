const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

const MODEL_SLOT = 1
const MODEL_UPDATED_AT = '2026-10-29T00:00:00.000Z'
const WIDTH = 768
const HEIGHT = 900
const characters = [
  { id: 'stress-aurora', name: 'STRESS_Aurora', hair: '#442a68', outfit: '#8b62cf', skin: '#ffd8c3' },
  { id: 'stress-nix', name: 'STRESS_Nix', hair: '#bd463f', outfit: '#307f91', skin: '#f4c5a4' },
  { id: 'stress-brisa', name: 'STRESS_Brisa', hair: '#245c48', outfit: '#df6e8b', skin: '#e9ba9d' },
  { id: 'stress-dorian', name: 'STRESS_Dorian', hair: '#293c6f', outfit: '#e0a447', skin: '#c98e71' }
]

const parts = [
  { id: 'stress-head', name: 'Cabeça', kind: 'head', width: 142, height: 160, pivot: { x: 71, y: 160 } },
  { id: 'stress-torso', name: 'Tronco', kind: 'torso', width: 180, height: 220, pivot: { x: 90, y: 0 } },
  { id: 'stress-arm-left-upper', name: 'Braço esquerdo superior', kind: 'arm', width: 56, height: 150, pivot: { x: 28, y: 0 } },
  { id: 'stress-arm-left-lower', name: 'Antebraço esquerdo', kind: 'arm', width: 50, height: 138, pivot: { x: 25, y: 0 } },
  { id: 'stress-arm-right-upper', name: 'Braço direito superior', kind: 'arm', width: 56, height: 150, pivot: { x: 28, y: 0 } },
  { id: 'stress-arm-right-lower', name: 'Antebraço direito', kind: 'arm', width: 50, height: 138, pivot: { x: 25, y: 0 } },
  { id: 'stress-thigh-left', name: 'Coxa esquerda', kind: 'trousers', width: 74, height: 166, pivot: { x: 37, y: 0 } },
  { id: 'stress-calf-left', name: 'Canela esquerda', kind: 'leg', width: 62, height: 164, pivot: { x: 31, y: 0 } },
  { id: 'stress-thigh-right', name: 'Coxa direita', kind: 'trousers', width: 74, height: 166, pivot: { x: 37, y: 0 } },
  { id: 'stress-calf-right', name: 'Canela direita', kind: 'leg', width: 62, height: 164, pivot: { x: 31, y: 0 } }
]

const connections = [
  { parent: 'stress-torso', child: 'stress-head', anchor: { x: 90, y: 0 } },
  { parent: 'stress-torso', child: 'stress-arm-left-upper', anchor: { x: 24, y: 34 } },
  { parent: 'stress-arm-left-upper', child: 'stress-arm-left-lower', anchor: { x: 28, y: 150 } },
  { parent: 'stress-torso', child: 'stress-arm-right-upper', anchor: { x: 156, y: 34 } },
  { parent: 'stress-arm-right-upper', child: 'stress-arm-right-lower', anchor: { x: 28, y: 150 } },
  { parent: 'stress-torso', child: 'stress-thigh-left', anchor: { x: 48, y: 208 } },
  { parent: 'stress-thigh-left', child: 'stress-calf-left', anchor: { x: 37, y: 166 } },
  { parent: 'stress-torso', child: 'stress-thigh-right', anchor: { x: 132, y: 208 } },
  { parent: 'stress-thigh-right', child: 'stress-calf-right', anchor: { x: 37, y: 166 } }
]

const outline = '#49333d'
const modelPalette = { skin: '#f2c5a8', hair: '#4d345f', outfit: '#8662b6', trousers: '#384d70', shoe: '#49333d' }
const layerOrder = [
  'stress-arm-left-upper', 'stress-arm-left-lower', 'stress-arm-right-upper', 'stress-arm-right-lower',
  'stress-thigh-left', 'stress-calf-left', 'stress-thigh-right', 'stress-calf-right', 'stress-torso', 'stress-head'
]

function rotate(point, degrees) {
  const radians = degrees * Math.PI / 180
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) }
}

function markupForPart(part, palette) {
  if (part.kind === 'head') return `<ellipse cx="71" cy="83" rx="57" ry="70" fill="${palette.skin}" stroke="${outline}" stroke-width="7"/><path d="M15 65Q13 12 70 10Q123 13 128 60L111 48Q92 59 67 43Q49 64 18 66Z" fill="${palette.hair}" stroke="${outline}" stroke-width="6" stroke-linejoin="round"/><path d="M39 82q10-8 20 0M83 82q10-8 20 0" fill="none" stroke="${outline}" stroke-width="5" stroke-linecap="round"/><ellipse cx="50" cy="93" rx="5" ry="7" fill="${outline}"/><ellipse cx="92" cy="93" rx="5" ry="7" fill="${outline}"/><path d="M61 113q10 8 20 0" fill="none" stroke="${outline}" stroke-width="4" stroke-linecap="round"/>`
  if (part.kind === 'torso') return `<path d="M55 7Q90 20 125 7L164 45L145 87L137 211Q90 226 43 211L36 87L16 45Z" fill="${palette.outfit}" stroke="${outline}" stroke-width="8" stroke-linejoin="round"/><path d="M67 17Q90 42 113 17" fill="none" stroke="#f6e8fb" stroke-width="8" stroke-linecap="round"/><path d="M56 88L67 202M124 88L113 202" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="5"/>`
  if (part.kind === 'arm') return `<path d="M17 8Q28 1 39 8L48 20L43 ${part.height - 20}Q28 ${part.height + 1} 11 ${part.height - 17}L8 27Z" fill="${palette.skin}" stroke="${outline}" stroke-width="7" stroke-linejoin="round"/><path d="M12 25Q28 34 45 23" fill="none" stroke="#fff0df" stroke-opacity=".65" stroke-width="4"/>`
  if (part.kind === 'trousers') return `<path d="M11 8Q37 2 63 8L70 ${part.height - 14}Q57 ${part.height + 1} 39 ${part.height - 14}L35 76L32 ${part.height - 14}Q18 ${part.height + 1} 5 ${part.height - 14}Z" fill="${palette.trousers}" stroke="${outline}" stroke-width="7" stroke-linejoin="round"/><path d="M13 24H62" stroke="#ffffff" stroke-opacity=".24" stroke-width="5"/>`
  return `<path d="M12 7Q31 0 50 8L57 ${part.height - 28}Q58 ${part.height - 8} 42 ${part.height - 5}L8 ${part.height - 5}Q0 ${part.height - 10} 6 ${part.height - 26}Z" fill="${palette.skin}" stroke="${outline}" stroke-width="7" stroke-linejoin="round"/><path d="M4 ${part.height - 28}Q28 ${part.height - 19} 58 ${part.height - 29}M9 ${part.height - 12}Q29 ${part.height - 4} 52 ${part.height - 14}" fill="none" stroke="${outline}" stroke-width="6" stroke-linecap="round"/>`
}

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
}

function placeAtAnchor(part, anchor, rotation) {
  const offset = rotate({ x: part.pivot.x - part.width / 2, y: part.pivot.y - part.height / 2 }, rotation)
  const center = { x: anchor.x - offset.x, y: anchor.y - offset.y }
  return {
    id: part.id, name: part.name,
    x: Math.round(center.x - part.width / 2), y: Math.round(center.y - part.height / 2),
    width: part.width, height: part.height, rotation,
    jointAnchor: { x: Math.round(anchor.x), y: Math.round(anchor.y) }
  }
}

function mapLocalPoint(part, transform, point) {
  const center = { x: transform.x + part.width / 2, y: transform.y + part.height / 2 }
  const offset = rotate({ x: point.x - part.width / 2, y: point.y - part.height / 2 }, transform.rotation)
  return { x: Math.round(center.x + offset.x), y: Math.round(center.y + offset.y) }
}

function buildPose(sitting) {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const transforms = new Map()
  const torso = byId.get('stress-torso')
  transforms.set(torso.id, placeAtAnchor(torso, { x: 384, y: sitting ? 222 : 196 }, sitting ? 3 : 0))

  const angleFor = (id) => {
    if (!sitting) return 0
    if (id === 'stress-arm-left-upper' || id === 'stress-thigh-left') return 78
    if (id === 'stress-arm-right-upper' || id === 'stress-thigh-right') return -78
    if (id === 'stress-arm-left-lower') return 52
    if (id === 'stress-arm-right-lower') return -52
    return 0
  }

  for (const link of connections) {
    const parent = byId.get(link.parent)
    const child = byId.get(link.child)
    const parentTransform = transforms.get(link.parent)
    const anchor = mapLocalPoint(parent, parentTransform, link.anchor)
    transforms.set(child.id, placeAtAnchor(child, anchor, angleFor(child.id)))
  }
  return parts.map((part) => transforms.get(part.id))
}

function jointLinks(poseParts) {
  const byId = new Map(poseParts.map((part) => [part.id, part]))
  return connections.map((link, index) => {
    const parent = byId.get(link.parent)
    const child = byId.get(link.child)
    const parentDefinition = parts.find((part) => part.id === link.parent)
    const parentAnchor = mapLocalPoint(parentDefinition, parent, link.anchor)
    const childAnchor = child.jointAnchor
    return {
      id: `stress-joint-${index + 1}`, parentPartId: link.parent, childPartId: link.child,
      parentAnchor, childAnchor, pivot: { x: Math.round((parentAnchor.x + childAnchor.x) / 2), y: Math.round((parentAnchor.y + childAnchor.y) / 2) }, fixed: true
    }
  })
}

function manifestPart(part, transform, dataUrl) {
  const sourceTransform = {
    x: transform.x, y: transform.y, width: transform.width, height: transform.height,
    rotation: transform.rotation, anchorVersion: 1, jointAnchor: { ...transform.jointAnchor }
  }
  return { ...transform, dataUrl, sourceTransform }
}

async function writeNewFile(target, value) {
  await fs.writeFile(target, value, { flag: 'wx' })
}

/** Creates a fresh, fully synthetic Fabricator and Customizer profile for offscreen runs. */
async function createSyntheticStressProfile(profileRoot) {
  const root = path.resolve(profileRoot)
  try {
    const entries = await fs.readdir(root)
    if (entries.length) throw new Error('A raiz do perfil sintético não está vazia; nada foi substituído.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const modelPoseParts = buildPose(false)
  const sittingPoseParts = buildPose(true)
  const partBytes = new Map()
  for (const part of parts) {
    const png = await sharp(Buffer.from(svg(part.width, part.height, markupForPart(part, modelPalette)))).png().toBuffer()
    partBytes.set(part.id, png)
  }

  const sourceBody = parts.map((part, index) => {
    const transform = modelPoseParts[index]
    return `<g transform="translate(${transform.x} ${transform.y}) rotate(${transform.rotation} ${part.width / 2} ${part.height / 2})">${markupForPart(part, modelPalette)}</g>`
  }).join('')
  const sourceBytes = await sharp(Buffer.from(svg(WIDTH, HEIGHT, sourceBody))).png().toBuffer()
  const sourceFile = 'source-00000000-0000-4000-8000-000000000001.png'
  const sourceAssetName = sourceFile
  const sourceUpdatedAt = MODEL_UPDATED_AT
  const modelFolder = path.join(root, 'fabricator', 'models', `slot-${MODEL_SLOT}`)
  const modelPartsFolder = path.join(modelFolder, 'parts')
  const poseFolder = (slot) => path.join(root, 'fabricator', 'poses', `model-${MODEL_SLOT}`, `slot-${slot}`)
  const characterManifest = path.join(root, 'customizer', 'characters', 'characters.json')
  await fs.mkdir(modelPartsFolder, { recursive: true })
  await fs.mkdir(path.dirname(characterManifest), { recursive: true })
  await writeNewFile(path.join(modelFolder, sourceFile), sourceBytes)
  for (const [id, bytes] of partBytes) await writeNewFile(path.join(modelPartsFolder, `${id}.png`), bytes)

  const savedModelParts = modelPoseParts.map((transform) => {
    const definition = parts.find((part) => part.id === transform.id)
    const full = manifestPart(definition, transform, '')
    delete full.dataUrl
    delete full.sourceTransform.dataUrl
    return full
  })
  const model = {
    schemaVersion: 1, chromaVersion: 2, slot: MODEL_SLOT, name: 'Modelo sintético de estresse',
    sourceName: 'modelo-sintetico.png', sourceAssetName, sourceFile, width: WIDTH, height: HEIGHT,
    tolerance: 74, chromaBaseTolerance: 0, modelSkinTone: modelPalette.skin, modelOutlineColor: outline,
    parts: savedModelParts, joints: jointLinks(modelPoseParts), layerOrder, hiddenPartIds: [], updatedAt: sourceUpdatedAt
  }
  await writeNewFile(path.join(modelFolder, 'project.json'), JSON.stringify(model))

  for (const [slot, poseParts, name] of [
    [1, modelPoseParts, 'Sintética · em pé'], [2, sittingPoseParts, 'Sintética · sentada']
  ]) {
    const folder = poseFolder(slot)
    const assetsFolder = path.join(folder, 'parts')
    await fs.mkdir(assetsFolder, { recursive: true })
    for (const [id, bytes] of partBytes) await writeNewFile(path.join(assetsFolder, `${id}.png`), bytes)
    const savedParts = poseParts.map((transform) => {
      const definition = parts.find((part) => part.id === transform.id)
      const full = manifestPart(definition, transform, '')
      delete full.dataUrl
      return full
    })
    const pose = {
      schemaVersion: 1, slot, name, sourceModelSlot: MODEL_SLOT, sourceModelName: model.name,
      sourceModelUpdatedAt: sourceUpdatedAt, width: WIDTH, height: HEIGHT, parts: savedParts,
      joints: jointLinks(poseParts), layerOrder, hiddenPartIds: [], updatedAt: sourceUpdatedAt
    }
    await writeNewFile(path.join(folder, 'pose.json'), JSON.stringify(pose))
  }

  const createdAt = MODEL_UPDATED_AT
  const customizerCharacters = characters.map((character) => ({
    ...character,
    customization: { modelSlot: MODEL_SLOT, poseSlot: 1, modelSkinTone: character.skin, modelOutlineColor: outline, partOverrides: {}, layerOrder: [] },
    createdAt, updatedAt: createdAt
  }))
  await writeNewFile(characterManifest, JSON.stringify(customizerCharacters))
  return { root, characterNames: customizerCharacters.map((character) => character.name), sourceFile, partCount: parts.length, poseSlots: [1, 2] }
}

module.exports = { createSyntheticStressProfile }
