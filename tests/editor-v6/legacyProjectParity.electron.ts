import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { editorV6MotionPlans, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FabricatorProject, FaceCatalogItem, ModelPart } from '../../src/shared/fabricator'
import { prepareEditorV6LegacyCharacterCrops } from '../../src/renderer/src/features/editorV6/editorV6LegacyCharacterCropNormalization'
import { applyEditorV6CharacterAssetCrops, editorV6RefreshedCharacterGeometry } from '../../src/renderer/src/features/editorV6/editorV6CharacterRefreshModel'

export type LegacyParityCatalog = { poses: FabricatorProject[]; mouths: FaceCatalogItem[] }
type Bake = (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
type Dependencies = {
  folder: string; owner: BrowserWindow; source: FabricatorProject; arm: ModelPart; character: CustomizerCharacter
  setCatalog: (catalog: LegacyParityCatalog) => void
  bake: Bake
  exportProject: (project: EditorV6Document, label: string, bake: Bake) => Promise<{ state: string; totalFrames?: number; motionTransitionsPrepared?: number }>
  decode: (label: string) => Buffer
}

const actorWidth = 30
const canvas = { width: 100, height: 100 }
const crops = [{ left: 10, top: 20, width: 55, height: 60 }, { left: 35, top: 20, width: 55, height: 60 }]

function persistenceFor(root: string) {
  return createEditorV6DocumentPersistence({
    files: fs, editorV6Path: id => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
    validate: (value): value is EditorV6Document => editorV6DocumentSchema.safeParse(value).success,
    assertLibraryVideoReferencesAvailable: async () => {}, assertLibraryBackgroundReferencesAvailable: async () => {}, assertLibraryMediaReferencesAvailable: async () => {},
    coordinateLibraryReferenceChange: operation => operation(), decodeImage: url => Buffer.from(url.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes })
  })
}

export async function checkLegacyProjectParity({ folder, owner, source, arm, character, setCatalog, bake, exportProject, decode }: Dependencies) {
  const images: Array<{ full: string; cropped: string; mouth: string }> = await owner.webContents.executeJavaScript(`(async () => {
    const image = async url => { const img = new Image(); img.src = url; await img.decode(); return img; };
    const [body, arm] = await Promise.all([image(${JSON.stringify(source.parts[0].dataUrl)}), image(${JSON.stringify(arm.dataUrl)})]);
    const make = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
    return ${JSON.stringify(crops)}.map((crop, index) => {
      const mouth = make(10, 10), m = mouth.getContext('2d'); m.fillStyle = index ? '#ff00ff' : '#00ff00'; m.fillRect(0, 0, 10, 10);
      const full = make(100, 100), f = full.getContext('2d');
      f.drawImage(body, 35, 20, 30, 60); f.drawImage(arm, index ? 80 : 10, 50, 10, 10); f.drawImage(mouth, 45, 50);
      const trimmed = make(crop.width, crop.height);
      trimmed.getContext('2d').drawImage(full, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
      return { full: full.toDataURL(), cropped: trimmed.toDataURL(), mouth: mouth.toDataURL() };
    });
  })()`)
  const poses = [10, 80].map(x => ({ ...source, slot: 3, layerOrder: ['head', 'arm'], parts: [source.parts[0], { ...arm, x }] }))
  const mouths = (['mouth-closed', 'mouth-open'] as const).map((sheet): FaceCatalogItem => ({
    schemaVersion: 1, id: sheet, modelSlot: 3, category: sheet, name: sheet,
    sheet: { kind: sheet, name: sheet, width: 10, height: 10, tolerance: 0, dataUrl: images[0].mouth },
    pieces: images.map(({ mouth }, index) => ({ id: `piece-${index}`, sheet, index, crop: { x: 0, y: 0, width: 10, height: 10 }, width: 10, height: 10, dataUrl: mouth })),
    transforms: { mouth: { x: 15, y: 35, scaleX: 1, scaleY: 1, rotation: 0 } },
    eyeLinked: true, browLinked: true, selectedNose: 0, selectedExpression: 0, updatedAt: source.updatedAt
  }))
  setCatalog({ poses, mouths })

  const id = randomUUID(), elementId = randomUUID(), assets = images.map(() => randomUUID()), blockIds = images.map(() => randomUUID())
  const base: EditorV6Element = { id: elementId, kind: 'character', characterId: character.id, text: character.name, x: 0, y: 0,
    width: actorWidth, height: actorWidth * 16 / 9, characterScale: 125, characterWidthScale: 120, characterHeightScale: 80, rotation: 15, flipX: true, zIndex: 1 }
  const states = images.map((_, index): EditorV6Element => ({ ...base, assetId: assets[index], poseSlot: index + 1, activeFaceMode: 'idle',
    activeExpressionPresetId: index ? 'surprise' : 'calm', faceAppearance: { modelSlot: 3, mouthClosedCatalogId: mouths[0].id, mouthOpenCatalogId: mouths[1].id,
      expressionIndex: index, eyeState: 0, eyebrows: false, noseIndex: 0, mouthOpen: false } }))
  const createDocument = (legacy: boolean): EditorV6Document => {
    const storedStates = legacy ? states : states.map((state, index): EditorV6Element => {
      // Independently project the cropped image center onto the displayed stage.
      const crop = crops[index]
      const gx = -(crop.left + crop.width / 2 - 50) * (1920 * .30 * 1.25 * 1.20 / canvas.width)
      const gy = (crop.top + crop.height / 2 - 50) * (1920 * .30 * 1.25 * .80 / canvas.width)
      const r = state.rotation * Math.PI / 180
      return { ...state, x: (gx * Math.cos(r) - gy * Math.sin(r)) / 19.2, y: (gx * Math.sin(r) + gy * Math.cos(r)) / 10.8,
        width: actorWidth * crop.width / canvas.width, height: base.height * crop.height / canvas.height, characterCanvasWidth: actorWidth,
        faceModeAssetIds: { idle: assets[index] } }
    })
    const timeline = createEditorV6Timeline([storedStates[0]])
    timeline.durationFrames = 40
    if (legacy) delete timeline.knownElementIds
    timeline.tracks.find(track => track.kind === 'character')!.blocks = storedStates.map((state, index) => ({ id: blockIds[index], elementId, label: character.name, startFrame: 20 * index, durationFrames: 20, state }))
    return { schemaVersion: 1, id, title: 'Paridade de retratos', color: '#ffffff', createdAt: source.updatedAt, updatedAt: source.updatedAt,
      backgroundColor: '#222222', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
      elements: [storedStates[0]], assets: images.map((image, index) => ({ id: assets[index], name: `Retrato ${index + 1}`, category: 'character', mimeType: 'image/png', dataUrl: legacy ? image.full : image.cropped })), timeline }
  }
  const legacyStore = persistenceFor(join(folder, 'legacy-fixture'))
  const modernStore = persistenceFor(join(folder, 'current-fixture'))
  await Promise.all([legacyStore.writeEditorV6(createDocument(true)), modernStore.writeEditorV6(createDocument(false))])
  const [legacy, modern] = await Promise.all([legacyStore.readEditorV6(id), modernStore.readEditorV6(id)])
  assert(legacy && modern)
  const oldManifestPath = join(folder, 'legacy-fixture', `editorV6-${id}`, 'editorV6.json')
  const oldManifest = await fs.readFile(oldManifestPath, 'utf8')
  assert.equal(resolveEditorV6SceneAtFrame(legacy, 20).elements[0].assetId, assets[1])
  assert.equal(resolveEditorV6SceneAtFrame(legacy, 20).elements[0].characterCanvasWidth, undefined)
  // The browser fixture generated known full/cropped PNG pairs. Supply the
  // same trim metadata to the renderer's legacy preparation and apply step.
  const legacyCrops = await prepareEditorV6LegacyCharacterCrops(legacy, () => false, async dataUrl => {
    const index = images.findIndex(image => image.full === dataUrl)
    assert(index >= 0)
    return { ...crops[index], sourceWidth: canvas.width, sourceHeight: canvas.height, dataUrl: images[index].cropped }
  })
  assert.equal(legacyCrops?.length, 2)
  const normalized = applyEditorV6CharacterAssetCrops(legacy, legacyCrops!)
  assert.equal(await fs.readFile(oldManifestPath, 'utf8'), oldManifest, 'A leitura e a preparação devem preservar os bytes da fixture legada.')
  const migratedStore = persistenceFor(join(folder, 'reopened-legacy-fixture'))
  await migratedStore.writeEditorV6(normalized)
  const reopened = await migratedStore.readEditorV6(id)
  assert(reopened)
  assert.deepEqual(reopened.timeline.knownElementIds, [elementId])
  const anchors = [0, 12, 20, 39].map(frame => {
    const oldFrame = resolveEditorV6SceneAtFrame(reopened, frame).elements[0]
    const newFrame = resolveEditorV6SceneAtFrame(modern, frame).elements[0]
    const refreshed = editorV6RefreshedCharacterGeometry(oldFrame, canvas, crops[frame < 20 ? 0 : 1])
    for (const key of ['x', 'y', 'width', 'height'] as const) assert(Math.abs(oldFrame[key] - newFrame[key]) < 1e-9, `Quadro ${frame}: ${key} divergiu ao reabrir.`)
    assert(Math.abs(refreshed.width - newFrame.width) < 1e-9 && Math.abs(refreshed.height - newFrame.height) < 1e-9)
    assert.equal(oldFrame.poseSlot, newFrame.poseSlot)
    assert.equal(oldFrame.activeExpressionPresetId, newFrame.activeExpressionPresetId)
    assert.equal(oldFrame.assetId, newFrame.assetId)
    return [frame, oldFrame.x, oldFrame.y]
  })
  assert.deepEqual(editorV6MotionPlans(reopened)[0].samples, editorV6MotionPlans(modern)[0].samples)
  const prepared: EditorV6MotionBakeResult[] = []
  const labels = ['legacy-parity', 'current-parity']
  for (const [index, document] of [reopened, modern].entries()) {
    const report = await exportProject(document, labels[index], async (request, signal) => {
      const result = await bake(request, signal)
      prepared.push(result)
      return result
    })
    assert.equal(report.state, 'completed')
    assert.equal(report.totalFrames, 40)
    assert.equal(report.motionTransitionsPrepared, 1)
  }
  assert.equal(prepared.length, 2)
  assert.equal(prepared[0].asset.dataUrl, prepared[1].asset.dataUrl)
  for (const [index, frame] of prepared[0].motion.frames.entries()) {
    const other = prepared[1].motion.frames[index]
    for (const key of ['x', 'y', 'width', 'height'] as const) assert(Math.abs(frame[key] - other[key]) < 1e-9, `Atlas: ${key} divergiu na amostra ${index}.`)
  }
  const oldPixels = decode(labels[0]), newPixels = decode(labels[1])
  assert.equal(oldPixels.length, 40 * 320 * 180 * 3)
  assert(oldPixels.equals(newPixels), 'O MP4 legado divergiu em pixels dos quadros decodificados do projeto atual.')
  const frameBytes = 320 * 180 * 3
  assert(!oldPixels.subarray(12 * frameBytes, 13 * frameBytes).equals(oldPixels.subarray(16 * frameBytes, 17 * frameBytes)), 'A transição precisa mudar pixels no MP4 para comprovar a paridade.')
  return { anchors, frames: oldPixels.length / frameBytes, motionSamples: prepared[0].motion.frames.length, identicalDecodedPixels: true }
}
