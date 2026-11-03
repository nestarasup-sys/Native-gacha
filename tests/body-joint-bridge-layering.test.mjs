import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('composição do personagem desenha a ponte antes das partes de pele', async () => {
  const renderer = await read('src/renderer/src/characters/characterLayerRenderer.ts')
  const artworkStart = renderer.indexOf('async function renderArtwork(')
  const artworkEnd = renderer.indexOf('async function renderArtworkWithHair(')
  const artwork = renderer.slice(artworkStart, artworkEnd)
  const bridge = artwork.indexOf('await drawEnabledBodyJointBridges(')
  const bodyParts = artwork.indexOf('for (const { part } of parts)')
  assert.ok(bridge >= 0 && bodyParts > bridge)

  const withHair = renderer.slice(artworkEnd)
  const backHair = withHair.indexOf('for (const layer of validHairLayers) await drawBackHair(layer)')
  const hairBridge = withHair.indexOf('await drawEnabledBodyJointBridges(')
  const bodyOrder = withHair.indexOf('for (const id of order)')
  assert.ok(backHair >= 0 && hairBridge > backHair && bodyOrder > hairBridge)
})

test('composição com roupa e prévia de pose mantêm a pele acima da ponte', async () => {
  const wardrobe = await read('src/renderer/src/characters/characterWardrobeRenderer.ts')
  const bridgeLoop = wardrobe.indexOf('for (const bridge of bodyJointBridges)')
  const bodyLoop = wardrobe.indexOf('for (const partId of bodyOrder)')
  assert.ok(bridgeLoop >= 0 && bodyLoop > bridgeLoop)
  assert.doesNotMatch(wardrobe, /bodyBridgesAfterPart/)

  const pose = await read('src/renderer/src/features/fabricator/PoseWorkspace.tsx')
  assert.match(pose, /zIndex=\{Math\.min\(upperIndex, lowerIndex\)\}/)
})
