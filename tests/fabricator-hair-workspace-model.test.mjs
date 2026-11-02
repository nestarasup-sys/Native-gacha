import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  categoriesForHairStyle,
  defaultHairCategoriesBySide,
  emptyHairWorkspace,
  hairStyleSides,
  headPart,
  initialTransform,
  preserveHairFit,
  removeHairSide,
  workspaceFromHairGridStyle,
  workspaceFromHairStyle
} from '../src/renderer/src/features/fabricator/hairWorkspaceModel.ts'

const asset = (name, width, height) => ({ dataUrl: `data:${name}`, width, height })
const head = { id: 'head', name: 'Cabeça', x: 0, y: 0, width: 100, height: 120, rotation: 0, visible: true, dataUrl: 'head' }
const hairStyle = (overrides = {}) => ({
  schemaVersion: 1,
  id: 'legacy-workspace',
  modelSlot: 2,
  name: 'Cabelo antigo',
  front: asset('front', 40, 50),
  back: null,
  fringe: asset('fringe', 20, 10),
  transforms: { front: { x: 7, y: 8, scaleX: 2, scaleY: 3, rotation: 4 }, back: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } },
  createdAt: 'created',
  updatedAt: 'updated',
  ...overrides
})

test('localiza a cabeça e calcula encaixe padrão sem alterar as dimensões da fonte', () => {
  const project = { parts: [{ name: 'Braço' }, head] }
  const foundHead = headPart(project)

  assert.equal(foundHead, head)
  assert.equal(headPart({ parts: [{ name: 'Torso' }] }), null)
  assert.deepEqual(initialTransform('front', head, asset('front', 40, 50)), { x: 50, y: 58.8, scaleX: (100 * 1.12) / 40, scaleY: (120 * .92) / 50, rotation: 0 })
  assert.deepEqual(initialTransform('fringe', head, asset('fringe', 20, 10)), { x: 50, y: 34.8, scaleX: 5.25, scaleY: 6.6, rotation: 0 })
  assert.equal(head.width, 100)
})

test('rascunho vazio mantém categorias e transforms padrão com relógio injetável', () => {
  const workspace = emptyHairWorkspace(4, () => 'synthetic-time')

  assert.equal(workspace.modelSlot, 4)
  assert.equal(workspace.updatedAt, 'synthetic-time')
  assert.deepEqual(workspace.categoryBySide, { front: 'rearHair', back: 'backHair', fringe: 'frontHair' })
  assert.deepEqual(workspace.categoryBySide, defaultHairCategoriesBySide)
  assert.deepEqual(workspace.transforms.front, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
})

test('resolve categorias legadas por peça e deixa os overrides individuais vencerem', () => {
  assert.deepEqual(categoriesForHairStyle({ category: 'ahoge', categoryBySide: { fringe: 'frontHair', back: 'ponytail' } }), {
    front: 'rearHair', back: 'ponytail', fringe: 'frontHair'
  })
  assert.deepEqual(categoriesForHairStyle({ categoryBySide: { back: 'backHair' } }), {
    front: 'rearHair', back: 'backHair', fringe: 'frontHair'
  })
})

test('lista os lados na ordem do workspace e remove somente a peça pedida, sua fonte e seu encaixe', () => {
  const style = hairStyle({ back: asset('back', 30, 30) })
  assert.deepEqual(hairStyleSides(style), ['front', 'back', 'fringe'])
  assert.deepEqual(hairStyleSides({ front: null, back: null, fringe: null }), [])

  const source = { ...emptyHairWorkspace(2, () => 'old'), ...style, modelSlot: 2, sourceImageDataUrl: 'sheet', sourceImageSaved: true, sourceAppliesToDraft: true, categoryBySide: { front: 'ahoge', back: 'ponytail', fringe: 'frontHair' } }
  const next = removeHairSide(source, 'front', () => 'removed')

  assert.equal(next.front, null)
  assert.equal(next.back, source.back)
  assert.equal(next.fringe, source.fringe)
  assert.equal('sourceImageDataUrl' in next, false)
  assert.equal(next.sourceImageSaved, false)
  assert.equal(next.sourceAppliesToDraft, false)
  assert.equal(next.categoryBySide.front, defaultHairCategoriesBySide.front)
  assert.equal(next.categoryBySide.back, 'ponytail')
  assert.deepEqual(next.transforms.front, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
  assert.equal(next.updatedAt, 'removed')
})

test('preserva o tamanho aparente ao substituir uma peça por arte com outras dimensões', () => {
  const previous = { x: 9, y: 12, scaleX: 2, scaleY: 3, rotation: 18, flipX: true }
  assert.equal(preserveHairFit(previous, null, asset('new', 20, 10)), previous)
  assert.deepEqual(preserveHairFit(previous, asset('old', 40, 30), asset('new', 20, 60)), { x: 9, y: 12, scaleX: 4, scaleY: 1.5, rotation: 18, flipX: true })
})

test('monta o rascunho de uma grade com a origem original e encaixes proporcionais', () => {
  const style = { front: asset('front', 40, 50), back: asset('back', 50, 40), sourceImageDataUrl: 'sheet', rowBoundary: [100, 200] }
  const workspace = workspaceFromHairGridStyle(3, head, style, 65, 'green', () => 'grid-time')

  assert.equal(workspace.modelSlot, 3)
  assert.equal(workspace.front, style.front)
  assert.equal(workspace.back, style.back)
  assert.equal(workspace.sourceImageDataUrl, 'sheet')
  assert.equal(workspace.sourceImageSaved, true)
  assert.equal(workspace.sourceAppliesToDraft, true)
  assert.equal(workspace.chromaTolerance, 65)
  assert.equal(workspace.chromaMode, 'green')
  assert.equal(workspace.updatedAt, 'grid-time')
  assert.deepEqual(workspace.transforms.front, initialTransform('front', head, style.front))
  assert.deepEqual(workspace.transforms.back, initialTransform('back', head, style.back))
})

test('abre estilo salvo com fallback legado e sem compartilhar transforms/objetos de assets', () => {
  const style = hairStyle({ sourceAppliesToDraft: undefined, chromaTolerance: undefined, chromaMode: undefined })
  const legacy = { ...emptyHairWorkspace(2), sourceImageDataUrl: 'legacy-sheet', sourceAppliesToDraft: false, chromaTolerance: 88, chromaMode: 'checker' }
  let timestamp = 0
  const workspace = workspaceFromHairStyle(2, head, style, legacy, () => `time-${++timestamp}`)

  assert.equal(workspace.sourceImageDataUrl, 'legacy-sheet')
  assert.equal(workspace.sourceImageSaved, true)
  assert.equal(workspace.sourceAppliesToDraft, false)
  assert.equal(workspace.chromaTolerance, 88)
  assert.equal(workspace.chromaMode, 'checker')
  assert.equal(workspace.updatedAt, 'time-2')
  assert.notEqual(workspace.front, style.front)
  assert.notEqual(workspace.transforms.front, style.transforms.front)
  assert.deepEqual(workspace.transforms.fringe, initialTransform('fringe', head, style.fringe))
  assert.equal(style.transforms.fringe, undefined)
})

test('valores atuais explícitos de source/chroma vencem os defaults da sessão legada', () => {
  const style = hairStyle({ sourceImageDataUrl: 'current-sheet', sourceAppliesToDraft: false, chromaTolerance: 0, chromaMode: 'auto' })
  const legacy = { sourceImageDataUrl: 'legacy-sheet', sourceAppliesToDraft: true, chromaTolerance: 95, chromaMode: 'green' }
  const workspace = workspaceFromHairStyle(2, head, style, legacy, () => 'now')

  assert.equal(workspace.sourceImageDataUrl, 'current-sheet')
  assert.equal(workspace.sourceAppliesToDraft, false)
  assert.equal(workspace.chromaTolerance, 0)
  assert.equal(workspace.chromaMode, 'auto')
})

test('HairWorkspace delega conversões de modelos de cabelo sem carregar regras puras no componente', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/HairWorkspace.tsx', import.meta.url), 'utf8')
  const saveCommand = await readFile(new URL('../src/renderer/src/features/fabricator/hairStyleSaveCommand.ts', import.meta.url), 'utf8')

  assert.match(page, /from '\.\/hairWorkspaceModel'/)
  assert.match(page, /workspaceFromHairStyle\(requestedModelSlot, head, style, legacyWorkspaceRef\.current\)/)
  assert.match(saveCommand, /import \{ defaultHairCategoriesBySide \} from '\.\/hairWorkspaceModel'/)
  assert.doesNotMatch(page, /function initialTransform\(/)
  assert.doesNotMatch(page, /function removeHairSide\(/)
})
