/** Integração do Customizador em filesystem sintético; nunca toca no perfil Electron. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rename, unlink, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isCustomizerCharacter, isValidCustomizerFaceAppearance } from '../electron/domains/customizer/validation.ts'
import { normalizeCustomizerCharacter } from '../electron/domains/customizer/compatibility.ts'
import { CustomizerCharacterRepository } from '../electron/domains/customizer/repository.ts'
import { CustomizerCharacterService } from '../electron/domains/customizer/service.ts'
import { registerCustomizerCharacterHandlers } from '../electron/domains/customizer/ipc.ts'
import { starterCharacters } from '../electron/domains/customizer/starterCharacters.ts'

const NOW = '2026-10-22T12:00:00.000Z'
const valid = (id = 'test-1') => ({
  id, name: 'Lia', hair: '#123456', outfit: '#abcdef', skin: '#ffffff',
  customization: { modelSlot: 1, poseSlot: 1, partOverrides: {}, layerOrder: [] },
  createdAt: NOW, updatedAt: NOW
})

async function fixture(t, seeds = [], options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'gv5-customizer-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const target = join(dir, 'customizer', 'characters', 'characters.json')
  let sequence = 0
  const newId = () => `synthetic-${++sequence}`
  const repo = new CustomizerCharacterRepository(() => target, { access, readFile, writeFile, rename, unlink, mkdir }, seeds, newId, () => NOW)
  const service = new CustomizerCharacterService(repo, newId, () => NOW, {
    assertWardrobeGroupsAvailable: options.assertWardrobeGroupsAvailable,
    assertHairStylesAvailable: options.assertHairStylesAvailable,
    assertFaceAssetsAvailable: options.assertFaceAssetsAvailable
  })
  return { dir, target, repo, service }
}

test('as duas telas do Customizador usam uma única superfície de prévia', async () => {
  const [page, surface] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPreviewSurface.tsx', import.meta.url), 'utf8')
  ])
  assert.equal((page.match(/<CustomizerPreviewSurface\b/g) ?? []).length, 2)
  assert.doesNotMatch(page, /className="customizer-preview-controls"/)
  assert.equal((surface.match(/className="customizer-preview-controls"/g) ?? []).length, 1)
  assert.match(page, /backButton=\{\{ label: 'Voltar ao Customizar'/)
  assert.match(page, /identity=\{/)
  assert.match(page, /emptyArtworkMessage=/)
  assert.match(surface, /stageRef\.current/)
  assert.match(surface, /document\.fullscreenElement === stage/)

  const layers = [
    'customizer-selected-artwork', 'customizer-wardrobe-overlay', 'customizer-face-overlay',
    'customizer-front-hair-overlay', 'customizer-wardrobe-above-hair-overlay'
  ]
  const layerOffsets = layers.map((layer) => surface.indexOf(layer))
  assert.ok(layerOffsets.every((offset) => offset >= 0))
  assert.deepEqual(layerOffsets, [...layerOffsets].sort((left, right) => left - right))
})

test('workspace facial de catálogo fica isolado da página e gravação via callbacks', async () => {
  const [page, workspace] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerFaceCatalogWorkspace.tsx', import.meta.url), 'utf8')
  ])
  assert.match(page, /<CustomizerFaceCatalogWorkspace\b/)
  assert.match(page, /onChooseCatalogItem=\{chooseFaceCatalogItem\}/)
  assert.match(page, /onMouthBlushChange=\{setMouthBlush\}/)
  assert.doesNotMatch(page, /renderFaceCatalogCard|renderFaceCatalogLibrary|renderFaceCatalogCustomizer/)
  assert.doesNotMatch(workspace, /window\.desktop|localStorage/)
  assert.match(workspace, /onSelectPage/)
  assert.match(workspace, /onNoseOpacityChange/)
  assert.match(workspace, /customizer-face-layout-catalog/)
})

test('workspace de cabelos fica isolado e recebe dados e ações pela página', async () => {
  const [page, workspace] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerHairWorkspace.tsx', import.meta.url), 'utf8')
  ])
  assert.match(page, /<CustomizerHairWorkspace\b/)
  assert.doesNotMatch(page, /renderHairCustomizer|renderHairLibrary/)
  assert.match(page, /onChooseStyle=\{chooseHairPartStyle\}/)
  assert.match(page, /onSetPartColor=\{setHairPartColor\}/)
  assert.doesNotMatch(workspace, /window\.desktop|localStorage/)
  assert.match(workspace, /onApplyPalette/)
  assert.match(workspace, /libraryPageView/)
})

test('catálogo de roupas fica isolado e recebe seleção, cores e reparos por callbacks', async () => {
  const [page, workspace] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/customizer/CustomizerWardrobeCatalogWorkspace.tsx', import.meta.url), 'utf8')
  ])
  assert.equal((page.match(/<CustomizerWardrobeCatalogWorkspace\b/g) ?? []).length, 2)
  assert.doesNotMatch(page, /renderUpperWardrobeLibrary|renderUpperWardrobePanels|renderWardrobeCatalog/)
  assert.match(page, /onApplyPanel: applyUpperWardrobePanel/)
  assert.match(page, /onSetPieceColor: setWardrobePieceColor/)
  assert.doesNotMatch(workspace, /window\.desktop|localStorage/)
  assert.match(workspace, /onRemoveUnavailableLinks/)
  assert.match(workspace, /onApplyPalette/)
  assert.match(workspace, /onResetPieceColors/)
  assert.match(workspace, /isWardrobePanelCandidateSelected/)
  assert.match(workspace, /customizer-upper-wardrobe-layout/)
})

test('validador aceita formato atual e rejeita id, slot, cor ou pose inválidos', () => {
  assert.equal(isCustomizerCharacter(valid()), true)
  assert.equal(isCustomizerCharacter({ ...valid(), customization: { ...valid().customization, faceAppearance: null } }), false)
  assert.equal(isValidCustomizerFaceAppearance(null), false)
  assert.equal(isCustomizerCharacter({ ...valid(), id: '../../escape' }), false)
  assert.equal(isCustomizerCharacter({ ...valid(), hair: 'red' }), false)
  assert.equal(isCustomizerCharacter({ ...valid(), customization: { ...valid().customization, modelSlot: 11 } }), false)
  assert.equal(isCustomizerCharacter({ ...valid(), customization: { ...valid().customization, poseSlot: 13 } }), false)
  assert.equal(isCustomizerCharacter({ ...valid(), customization: { ...valid().customization, wardrobeGroups: [{modelSlot:1,setId:'x',category:'camisa',offsetX:0,offsetY:0,scaleX:0,scaleY:1,rotation:0}] } }), false)
})

test('normalização legada mantém seleção e cores individuais sem alterar entrada', () => {
  const character = { ...valid(), customization: { ...valid().customization,
    wardrobeColors: { base: '#123456' },
    wardrobeGroups: [{ modelSlot: 1, setId: 'set-1', category: 'cinto-saia-1', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }]
  } }
  assert.equal(isCustomizerCharacter(character), true)
  const migrated = normalizeCustomizerCharacter(character)
  assert.equal(migrated.customization.wardrobeGroups[0].category, 'cinto')
  assert.deepEqual(migrated.customization.wardrobeGroups[0].colors, { base: '#123456' })
  assert.equal(migrated.customization.wardrobeColors, undefined)
  assert.equal(character.customization.wardrobeGroups[0].category, 'cinto-saia-1')
})

test('primeira execução mantém os dez personagens pré-carregados', async (t) => {
  const { service, target } = await fixture(t, starterCharacters)
  const listed = await service.list()
  assert.equal(listed.length, 10)
  assert.equal(listed[0].name, 'Chloe')
  assert.equal(listed.at(-1).name, 'Ayla')
  assert.equal(JSON.parse(await readFile(target, 'utf8')).length, 10)
})

test('criar, editar e excluir conserva formato e campos existentes', async (t) => {
  const { service, target } = await fixture(t)
  const created = await service.create('  Luma  ')
  assert.equal(created.name, 'Luma')
  assert.equal(created.customization.modelSlot, 1)
  await service.save({ ...created, name: '  Luma Nova  ', customization: { ...created.customization, hairAppearance: { modelSlot: 1, styleId: 'cabelo-1' } } })
  assert.equal((await service.list())[0].name, 'Luma Nova')
  assert.equal(JSON.parse(await readFile(target, 'utf8'))[0].customization.hairAppearance.styleId, 'cabelo-1')
  await service.delete(created.id)
  assert.deepEqual(await service.list(), [])
})

test('salvar um novo cabelo consulta o catálogo antes de gravar o vínculo', async (t) => {
  const { service } = await fixture(t, [], {
    assertHairStylesAvailable: async references => {
      assert.deepEqual(references, [{ modelSlot: 1, id: 'cabelo-ausente' }])
      throw new Error('cabelo ausente')
    }
  })
  const character = await service.create('Lia')
  await assert.rejects(service.save({
    ...character,
    customization: { ...character.customization, hairAppearance: { modelSlot: 1, styleId: 'cabelo-ausente' } }
  }), /cabelo ausente/)
  assert.equal((await service.list())[0].customization.hairAppearance, undefined)
})

test('salvar novas referências faciais valida cada tipo de asset no Fabricador', async (t) => {
  const expected = [
    { assetType: 'face-catalog', modelSlot: 1, id: 'nose-catalog', category: 'nose' },
    { assetType: 'face-component', modelSlot: 1, id: 'blush-asset', kind: 'blush' }
  ]
  const { service } = await fixture(t, [], {
    assertFaceAssetsAvailable: async references => {
      assert.deepEqual(references, expected)
      throw new Error('asset facial ausente')
    }
  })
  const character = await service.create('Lia')
  await assert.rejects(service.save({
    ...character,
    customization: {
      ...character.customization,
      faceAppearance: {
        modelSlot: 1, setId: 'face-legacy', noseCatalogId: 'nose-catalog', faceDetails: { blush: 'blush-asset' },
        eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
      }
    }
  }), /asset facial ausente/)
  assert.equal((await service.list())[0].customization.faceAppearance, undefined)
})

test('referência legada já existente não impede editar outros dados do personagem', async (t) => {
  let validationCalls = 0
  const { repo, service: initialService } = await fixture(t)
  const created = await initialService.create('Lia')
  const linked = {
    ...created,
    customization: { ...created.customization, hairAppearance: { modelSlot: 1, styleId: 'cabelo-removido' } }
  }
  await initialService.save(linked)
  const service = new CustomizerCharacterService(repo, () => 'unused-id', () => NOW, {
    assertHairStylesAvailable: async references => { validationCalls += 1; assert.deepEqual(references, []) }
  })
  await service.save({ ...linked, name: 'Lia editada' })
  assert.equal((await service.list())[0].name, 'Lia editada')
  assert.equal(validationCalls, 1)
})

test('gravação sequencial e listagem aguarda gravações pendentes', async (t) => {
  const { service } = await fixture(t)
  const [first, second, third] = await Promise.all([service.create('A'), service.create('B'), service.create('C')])
  assert.equal((await service.list()).length, 3)
  await Promise.all([service.save({ ...first, name: 'A2' }), service.save({ ...second, name: 'B2' }), service.delete(third.id)])
  assert.deepEqual((await service.list()).map((c) => c.name), ['A2', 'B2'])
  await service.pendingWrites
})

test('rejeição de gravação não envenena a fila', async (t) => {
  const { service } = await fixture(t)
  await assert.rejects(service.delete('nao-existe'), /não encontrado/)
  const created = await service.create('Salvo depois')
  assert.equal((await service.list())[0].id, created.id)
})

test('repositório restaura .backup após interrupção de gravação', async (t) => {
  const { repo, target } = await fixture(t)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(`${target}.backup`, JSON.stringify([valid()]), 'utf8')
  assert.deepEqual((await repo.list()).map((character) => character.id), ['test-1'])
  await access(target)
})

test('manifesto inválido não é apagado nem substituído automaticamente', async (t) => {
  const { repo, target } = await fixture(t)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, '{broken-json', 'utf8')
  await assert.rejects(repo.list(), SyntaxError)
  assert.equal(await readFile(target, 'utf8'), '{broken-json')
})

test('repositório rejeita id duplicado antes de persistir', async (t) => {
  const { repo, target } = await fixture(t)
  await assert.rejects(repo.save([valid(), valid()]), /identificadores repetidos/)
  await assert.rejects(access(target), { code: 'ENOENT' })
})

test('IPC usa canais preexistentes e nunca passa por autenticação indevida', async () => {
  const handlers = new Map()
  let authorized = 0, calls = 0
  const service = {
    list: async () => { calls++; return [] }, save: async () => { calls++ }, create: async () => { calls++; return valid() }, delete: async () => { calls++ }
  }
  registerCustomizerCharacterHandlers({ handle: (channel, cb) => handlers.set(channel, cb) }, (event) => {
    if (!event.trusted) throw new Error('Origem IPC não confiável')
    authorized++
  }, service, async (_channel, operation) => operation())
  assert.deepEqual([...handlers.keys()].sort(), ['customizer:characters:create','customizer:characters:delete','customizer:characters:list','customizer:characters:save'])
  for (const callback of handlers.values()) await assert.rejects(callback({ trusted: false }, valid()), /não confiável/)
  assert.equal(calls, 0)
  for (const [channel, callback] of handlers) {
    await callback({ trusted: true }, channel.endsWith('create') ? 'Nina' : valid())
  }
  assert.equal(calls, 4)
  assert.equal(authorized, 4)
})


test('falha na publicação restaura o manifesto anterior', async t => {
  const { target, dir } = await fixture(t)
  let failNextCommit = false
  const io = { access, readFile, writeFile, unlink, mkdir,
    rename: async (from, to) => {
      if (failNextCommit && from.endsWith('.tmp') && to === target) {
        failNextCommit = false
        throw new Error('FALHA SINTÉTICA AO PUBLICAR')
      }
      await rename(from, to)
    }
  }
  const repo = new CustomizerCharacterRepository(() => target, io, [], () => 'test', () => NOW)
  await repo.save([valid('original')])
  failNextCommit = true
  await assert.rejects(repo.save([valid('novo')]), /FALHA SINTÉTICA/)
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')).map(item => item.id), ['original'])
  assert.deepEqual((await repo.list()).map(item => item.id), ['original'])
})
