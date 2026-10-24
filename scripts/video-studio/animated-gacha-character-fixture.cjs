'use strict'

const { createCharacterMediaFixture } = require('./character-media-oracle-fixture.cjs')
const sharp = require('sharp')

const now = '2026-10-24T12:00:00.000Z'

async function svgPng(width, height, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
  return 'data:image/png;base64,' + (await sharp(Buffer.from(svg)).png({ palette: false }).toBuffer()).toString('base64')
}

function componentSummary({ dataUrl, defaultTransform, ...summary }) {
  return summary
}

/** Adds real PNG clothing, back/front hair, glasses and PT pupils to the canonical raster fixture. */
async function createAnimatedGachaCharacterFixture(options = {}) {
  const bootstrap = await createCharacterMediaFixture(options)
  const character = bootstrap.characters.characters[0]
  const front = await svgPng(115, 48, '<path d="M4 18 Q57 -9 112 18 L104 44 L65 24 L27 45Z" fill="#492b79" stroke="#24163d" stroke-width="3"/>')
  const back = await svgPng(120, 95, '<ellipse cx="60" cy="46" rx="58" ry="44" fill="#462d76"/><path d="M12 20h96v62H12Z" fill="#51377f"/>')
  const coat = await svgPng(90, 106, '<path d="M15 3H75L89 106H1Z" fill="#d63f75" stroke="#67233d" stroke-width="4"/><path d="M45 7V102" stroke="#fff0cf" stroke-width="5"/><path d="M19 35h18m28 0h18" stroke="#f5a7ba" stroke-width="5"/>')
  const sleeve = await svgPng(38, 95, '<path d="M8 2h24l5 84-13 8L1 85Z" fill="#42aecf" stroke="#174c68" stroke-width="4"/>')
  const glasses = await svgPng(94, 30, '<rect x="2" y="2" width="42" height="25" rx="9" fill="none" stroke="#293c4f" stroke-width="4"/><rect x="49" y="2" width="42" height="25" rx="9" fill="none" stroke="#293c4f" stroke-width="4"/><path d="M44 10h6" stroke="#293c4f" stroke-width="4"/>')
  const pupilLeft = await svgPng(10, 10, '<ellipse cx="5" cy="5" rx="4" ry="5" fill="#14233c"/><circle cx="3.8" cy="3" r="1.2" fill="#fff"/>')
  const pupilRight = await svgPng(10, 10, '<ellipse cx="5" cy="5" rx="4" ry="5" fill="#14233c"/><circle cx="3.8" cy="3" r="1.2" fill="#fff"/>')
  const brow = await svgPng(26, 7, '<path d="M1 6Q12 -1 25 3" fill="none" stroke="#4e2b45" stroke-width="4" stroke-linecap="round"/>')

  const hair = {
    schemaVersion: 1, id: 'stress-hair', modelSlot: 1, name: 'Cabelo de estresse com camadas',
    front: { dataUrl: front, width: 115, height: 48 },
    back: { dataUrl: back, width: 120, height: 95 }, fringe: null,
    transforms: { front: { x: -8, y: -16, scaleX: 1, scaleY: 1, rotation: 0 }, back: { x: -9, y: -8, scaleX: 1, scaleY: 1, rotation: 0 } },
    createdAt: now, updatedAt: now,
  }
  const wardrobe = {
    schemaVersion: 1, id: 'stress-outfit', modelSlot: 1, modelName: 'Modelo sintético',
    name: 'Roupa e acessório para estresse', width: 200, height: 300, updatedAt: now,
    components: [
      { id: 'stress-coat', name: 'Casaco', category: 'camisa', attachedPartId: 'torso', x: 55, y: 145, width: 90, height: 106, rotation: 0, dataUrl: coat },
      { id: 'stress-sleeve', name: 'Manga', category: 'manga-superior', attachedPartId: 'torso', x: 34, y: 142, width: 38, height: 95, rotation: -4, dataUrl: sleeve },
      { id: 'stress-glasses', name: 'Óculos acima do cabelo', category: 'oculos', attachedPartId: 'head', x: 52, y: 49, width: 94, height: 30, rotation: 0, renderAboveHair: true, dataUrl: glasses },
    ],
  }

  const eyes = [
    { id: 'stress-pupil-left', kind: 'pupil', name: 'Pupila PT esquerda', width: 10, height: 10, rightSidePositioned: false, x: 2, y: 0, pairId: 'stress-pupils', dataUrl: pupilLeft },
    { id: 'stress-pupil-right', kind: 'pupil', name: 'Pupila PT direita', width: 10, height: 10, rightSidePositioned: true, x: -2, y: 0, pairId: 'stress-pupils', dataUrl: pupilRight },
    { id: 'stress-brow-left', kind: 'eyebrow', name: 'Sobrancelha esquerda', width: 26, height: 7, rightSidePositioned: false, x: 30, y: 26, dataUrl: brow },
    { id: 'stress-brow-right', kind: 'eyebrow', name: 'Sobrancelha direita', width: 26, height: 7, rightSidePositioned: true, x: 70, y: 26, dataUrl: brow },
  ].map((asset) => ({
    schemaVersion: 1, modelSlot: 1, updatedAt: now,
    ...asset,
    defaultTransform: { x: asset.x, y: asset.y, scaleX: asset.kind === 'pupil' ? 0.8 : 1, scaleY: asset.kind === 'pupil' ? 0.8 : 1, rotation: 0 },
  }))

  character.customization.modelSkinTone = '#f2c7a5'
  character.customization.hairAppearance = { modelSlot: 1, frontStyleId: hair.id, backStyleId: hair.id }
  character.customization.wardrobeGroups = [
    { modelSlot: 1, setId: wardrobe.id, category: 'camisa', componentId: 'stress-coat', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    { modelSlot: 1, setId: wardrobe.id, category: 'manga-superior', componentId: 'stress-sleeve', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    { modelSlot: 1, setId: wardrobe.id, category: 'oculos', componentId: 'stress-glasses', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  ]
  character.customization.faceAppearance = {
    ...character.customization.faceAppearance,
    components: {
      ...character.customization.faceAppearance.components,
      'pupil-left': { assetId: 'stress-pupil-left' },
      'pupil-right': { assetId: 'stress-pupil-right' },
      'brow-left': { assetId: 'stress-brow-left' },
      'brow-right': { assetId: 'stress-brow-right' },
    },
  }

  bootstrap.characterAssets.entries.push(
    { method: 'loadHairStyle', args: [1, hair.id], value: hair },
    { method: 'loadWardrobeSet', args: [1, wardrobe.id], value: wardrobe },
    ...eyes.map((asset) => ({ method: 'loadFaceComponentAsset', args: [1, asset.id], value: asset })),
  )
  const pupilSummaries = eyes.filter((asset) => asset.kind === 'pupil').map(componentSummary)
  const browSummaries = eyes.filter((asset) => asset.kind === 'eyebrow').map(componentSummary)
  bootstrap.characterAssets.entries.push(
    { method: 'listFaceComponentAssets', args: [1, 'pupil'], value: pupilSummaries },
    { method: 'listFaceComponentAssets', args: [1, 'eyebrow'], value: browSummaries },
  )
  return bootstrap
}

module.exports = { createAnimatedGachaCharacterFixture }
