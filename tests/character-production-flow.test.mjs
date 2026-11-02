/** Integração real dos contratos Fabricador DEV → Customizador → Studio em diretório temporário. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, access, rename, unlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricatorModelCatalog } from '../electron/domains/fabricator/modelCatalog.ts'
import { createFabricatorModelWriter } from '../electron/domains/fabricator/modelWriter.ts'
import { CustomizerCharacterRepository } from '../electron/domains/customizer/repository.ts'
import { CustomizerCharacterService } from '../electron/domains/customizer/service.ts'
import { fitStudioCharacterToStage } from '../src/shared/studioCharacterGeometry.ts'

const date = '2026-10-22T12:00:00.000Z'
const fileName = 'source-abcdef11-2345.png'
const part = { id: 'torso', name: 'Torso', x: 10, y: 15, width: 60, height: 80, rotation: 0 }
const manifest = { schemaVersion: 1, slot: 1, name: 'Modelo teste', sourceName: 'sheet.png',
  sourceFile: fileName, sourceAssetName: fileName, width: 200, height: 240, parts: [part], joints: [], updatedAt: date }

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'native-gacha-flow-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const folder = join(home, 'fabricator', 'slot-1')
  await mkdir(join(folder, 'parts'), { recursive: true })
  await writeFile(join(folder, 'project.json'), JSON.stringify(manifest))
  await writeFile(join(folder, fileName), Buffer.from([137, 80, 78, 71]))
  await writeFile(join(folder, 'parts', 'torso.png'), Buffer.from([1, 2, 3, 4]))
  const catalog = new FabricatorModelCatalog(10, slot => join(home, 'fabricator', `slot-${slot}`), { readFile, readAssetImage: readFile })
  const writer = createFabricatorModelWriter({
    slotPath: slot => join(home, 'fabricator', `slot-${slot}`),
    isValidSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    dataUrlBuffer: value => Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'),
    writeAssetImageSource: (path, bytes) => writeFile(path, bytes),
    files: { mkdir, readFile, writeFile, rename, readdir, access, unlink }
  })
  const target = join(home, 'customizer', 'characters', 'characters.json')
  let i = 0
  const repo = new CustomizerCharacterRepository(() => target, { access, readFile, writeFile, mkdir, rename, unlink }, [], () => `actor-${++i}`, () => date)
  const service = new CustomizerCharacterService(repo, () => `actor-${++i}`, () => date)
  return { folder, target, catalog, writer, service }
}

test('dois personagens compartilham catálogo sem sobrescrever suas configurações individuais', async t => {
  const { folder, target, catalog, writer, service } = await fixture(t)
  const sourceBefore = await readFile(join(folder, 'project.json'))
  const modelBefore = await catalog.loadSlot(1)
  assert.equal((await catalog.listSlots())[0]?.partCount, 1)
  assert.equal(modelBefore.parts[0].dataUrl, 'data:image/png;base64,AQIDBA==')
  const lia = await service.create('Lia')
  const nina = await service.create('Nina')
  const wardrobe = setId => [{ modelSlot: 1, setId, category: 'camisa', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }]
  await service.save({ ...lia, customization: { ...lia.customization, poseSlot: 2,
    partOverrides: { torso: { x: 12 } }, wardrobeGroups: wardrobe('camisa-1'),
    hairAppearance: { modelSlot: 1, styleId: 'franja-1' } } })
  await service.save({ ...nina, customization: { ...nina.customization, poseSlot: 1,
    partOverrides: { torso: { x: -3 } }, wardrobeGroups: wardrobe('camisa-2') } })
  const [savedLia, savedNina] = await service.list()
  assert.equal(savedLia.customization.wardrobeGroups[0].setId, 'camisa-1')
  assert.equal(savedNina.customization.wardrobeGroups[0].setId, 'camisa-2')
  assert.equal(savedLia.customization.partOverrides.torso.x, 12)
  assert.equal(savedNina.customization.partOverrides.torso.x, -3)
  assert.equal(savedLia.customization.modelSlot, modelBefore.slot)
  assert.equal(savedNina.customization.modelSlot, modelBefore.slot)
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), [savedLia, savedNina])
  assert.deepEqual(await catalog.loadSlot(1), modelBefore)
  assert.deepEqual(await readFile(join(folder, 'project.json')), sourceBefore)

  const updatedAt = '2026-10-23T12:00:00.000Z'
  await writer({
    schemaVersion: 1, slot: 1, name: modelBefore.name, sourceName: modelBefore.sourceName,
    sourceAssetName: fileName, width: modelBefore.width, height: modelBefore.height,
    tolerance: modelBefore.tolerance, joints: modelBefore.joints,
    parts: modelBefore.parts.map(({ dataUrl: _dataUrl, ...savedPart }) => ({ ...savedPart, x: savedPart.x + 8 })),
    updatedAt
  }, [])
  const updatedModel = await catalog.loadSlot(1)
  const [liaAfterCatalogEdit, ninaAfterCatalogEdit] = await service.list()
  assert.equal(updatedModel.parts[0].x, part.x + 8, 'a biblioteca do Fabricador recebe a edição de catálogo')
  assert.deepEqual(liaAfterCatalogEdit.customization, savedLia.customization, 'personalizações da Lia permanecem no repositório do Customizador')
  assert.deepEqual(ninaAfterCatalogEdit.customization, savedNina.customization, 'personalizações da Nina permanecem no repositório do Customizador')
  const fitted = fitStudioCharacterToStage({ width: 200, height: 240 }, { width: 60, height: 80 },
    { width: 200, height: 240 }, { width: 60, height: 80 }, 1920, 1080)
  assert.ok(fitted.width > 0 && fitted.height > 0)
})

test('Studio usa o renderizador compartilhado sem compatibilidade exportada pela página Customizador', async () => {
  const studio = await readFile(new URL('../src/renderer/src/features/studio/StudioPage.tsx', import.meta.url), 'utf8')
  const studioFacePreview = await readFile(new URL('../src/renderer/src/features/studio/useStudioFacePreview.ts', import.meta.url), 'utf8')
  const customizer = await readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8')
  const renderer = await readFile(new URL('../src/renderer/src/characters/characterRenderer.ts', import.meta.url), 'utf8')
  assert.equal(studio.includes("import('../customizer/CustomizerPage')"), false)
  assert.match(studio, /import\('\.\.\/\.\.\/characters\/characterRenderer'\)/)
  assert.match(studioFacePreview, /import\('\.\.\/\.\.\/characters\/characterRenderer'\)/)
  assert.doesNotMatch(customizer, /^export \{ renderArtwork, prepareSavedCharacterRenderer, renderSavedCharacter, loadStandardExpressionEffects \} from/m)
  assert.doesNotMatch(customizer, /^export type \{ CatalogArtwork \} from/m)
  assert.match(renderer, /export async function prepareSavedCharacterRenderer/)
})
