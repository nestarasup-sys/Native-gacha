import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  STANDARD_EXPRESSIONS,
  authoredMetrics,
  buildCatalogOptions,
  buildComponentOptions,
  compositionForExpression,
  findPairedAsset,
  isWorkspaceDraftForModel,
  motionForPublishedPreset,
  rebaseExpressionTransforms
} from '../src/renderer/src/features/fabricator/expressionPresetModel.ts'

const layerKeys = ['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'browLeft', 'browRight', 'nose', 'mouth']
const transform = (patch = {}) => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...patch })
const transforms = () => Object.fromEntries(layerKeys.map((key) => [key, transform()]))
const composition = () => ({
  eyes: { left: null, right: null }, pupils: { left: null, right: null },
  eyebrows: { left: null, right: null }, nose: null, mouth: null
})

function componentSummary(id, name, options = {}) {
  return {
    schemaVersion: 1, id, modelSlot: 1, kind: 'eye', name, width: 50, height: 25,
    updatedAt: '2026-01-01T00:00:00.000Z', ...options
  }
}

function componentDetail(summary, dataUrl = `png:${summary.id}`) {
  return { ...summary, defaultTransform: transform(), dataUrl }
}

function catalogItem(id, category, pieces, name = id) {
  return {
    schemaVersion: 1, id, modelSlot: 1, category, name,
    sheet: { kind: category, name, width: 100, height: 100, tolerance: 0, dataUrl: `sheet:${id}` },
    pieces, transforms: {}, eyeLinked: false, browLinked: false, selectedNose: 0,
    selectedExpression: 0, updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function catalogPiece(index, sheet, dataUrl) {
  return { id: `${sheet}-${index}`, sheet, index, crop: { x: 0, y: 0, width: 10, height: 10 }, width: 10, height: 10, dataUrl }
}

test('rebase preserva deltas de posição, proporção, rotação e inversão com limites de escala', () => {
  const reference = transforms()
  reference.eyeLeft = transform({ x: 10, y: 20, scaleX: 2, scaleY: 4, rotation: 10, flipX: true })
  const edited = transforms()
  edited.eyeLeft = transform({ x: 13, y: 18, scaleX: 3, scaleY: 2, rotation: 25 })
  const nextBase = transforms()
  nextBase.eyeLeft = transform({ x: 100, y: 200, scaleX: 4, scaleY: 8, rotation: -5 })
  nextBase.eyeRight = transform({ scaleX: 100, scaleY: 0.001 })

  const rebased = rebaseExpressionTransforms(edited, reference, nextBase)
  assert.deepEqual(rebased.eyeLeft, { x: 103, y: 198, scaleX: 6, scaleY: 4, rotation: 10, flipX: true })
  assert.equal(rebased.eyeRight.scaleX, 20)
  assert.equal(rebased.eyeRight.scaleY, 0.02)
  assert.deepEqual(edited.eyeLeft, { x: 13, y: 18, scaleX: 3, scaleY: 2, rotation: 25 })
})

test('métricas de expressão usam dimensões e orientação dos assets selecionados', () => {
  const selected = composition()
  selected.eyes.left = 'eye-l'
  selected.eyes.right = 'eye-r'
  selected.pupils.right = 'pupil-r'
  selected.eyebrows.right = 'brow-r'
  selected.nose = { catalogId: 'nose', index: 2 }
  selected.mouth = { catalogId: 'mouth', kind: 'mouth-open', index: 3 }
  const components = {
    'eye-l': { width: 60, height: 30, rightSidePositioned: false },
    'eye-r': { width: 80, height: 40, rightSidePositioned: true },
    'pupil-r': { width: 12, height: 12, rightSidePositioned: false },
    'brow-r': { width: 32, height: 9, rightSidePositioned: false }
  }
  const catalogs = {
    nose: { pieces: [catalogPiece(2, 'nose', 'nose-2')] },
    mouth: { pieces: [catalogPiece(3, 'mouth-open', 'mouth-3')] }
  }

  assert.deepEqual(authoredMetrics(selected, components, catalogs), {
    eyeLeft: { width: 60, height: 30, mirrored: false },
    pupilLeft: { width: 60, height: 30, mirrored: false },
    eyeRight: { width: 80, height: 40, mirrored: false },
    pupilRight: { width: 80, height: 40, mirrored: true },
    browRight: { width: 32, height: 9, mirrored: true },
    nose: { width: 10, height: 10 },
    mouth: { width: 10, height: 10 }
  })
})

test('movimento publicado preserva camadas antigas apenas para a mesma seleção de assets', () => {
  const selected = composition()
  selected.eyes.left = 'eye'
  const next = transforms()
  next.eyeLeft.x = 10
  const base = transforms()
  const components = { eye: { width: 100, height: 40 }, other: { width: 100, height: 40 } }
  const oldLayer = { dx: 0, dy: 0, sx: 1, sy: 1, rotation: 7, flip: false }
  const previous = { selections: selected, portableMotion: { version: 1, layers: { mouth: oldLayer } } }

  const preserved = motionForPublishedPreset(next, base, selected, components, {}, previous)
  const zeroPupilLayer = { dx: 0, dy: 0, sx: 1, sy: 1, rotation: 0, flip: false, sourceMirrored: false }
  assert.deepEqual(preserved, { version: 1, layers: { mouth: oldLayer, eyeLeft: { dx: 0.1, dy: 0, sx: 1, sy: 1, rotation: 0, flip: false, sourceMirrored: false }, pupilLeft: zeroPupilLayer } })
  const changed = motionForPublishedPreset(next, base, { ...selected, eyes: { left: 'other', right: null } }, components, {}, previous)
  assert.deepEqual(changed?.layers, { eyeLeft: { dx: 0.1, dy: 0, sx: 1, sy: 1, rotation: 0, flip: false, sourceMirrored: false }, pupilLeft: zeroPupilLayer })
})

test('composição ajusta índices removidos e usa o quadro da expressão quando disponível sem mutar origem', () => {
  const input = composition()
  input.nose = { catalogId: 'nose', index: 99 }
  input.mouth = { catalogId: 'mouth', kind: 'mouth-closed', index: 0 }
  const catalogs = {
    nose: { pieces: [catalogPiece(2, 'nose', 'nose-2')] },
    mouth: { pieces: [catalogPiece(0, 'mouth-closed', 'mouth-0'), catalogPiece(3, 'mouth-closed', 'mouth-3')] }
  }

  const next = compositionForExpression(input, 3, catalogs)
  assert.deepEqual(next.nose, { catalogId: 'nose', index: 2 })
  assert.deepEqual(next.mouth, { catalogId: 'mouth', kind: 'mouth-closed', index: 3 })
  assert.deepEqual(input.nose, { catalogId: 'nose', index: 99 })
  assert.deepEqual(input.mouth, { catalogId: 'mouth', kind: 'mouth-closed', index: 0 })
})

test('agrupamento de peças pareadas aceita pairId e identidade de PNG, com fallback por nome', () => {
  const left = componentSummary('eye-l', 'Verde · Olho esquerdo', { pairId: 'eyes-1' })
  const right = componentSummary('eye-r', 'Verde · Olho direito', { pairId: 'eyes-1', rightSidePositioned: true })
  const copyLeft = componentSummary('copy-l', 'Estrela · Olho esquerdo')
  const copyRight = componentSummary('copy-r', 'Cópia · Olho direito', { rightSidePositioned: true })
  const unpaired = componentSummary('solo', 'Solo · Olho esquerdo')
  const options = buildComponentOptions('eye', [left, right, copyLeft, copyRight, unpaired], {
    'eye-l': componentDetail(left), 'eye-r': componentDetail(right),
    'copy-l': componentDetail(copyLeft, 'shared-png'), 'copy-r': componentDetail(copyRight, 'shared-png'),
    solo: componentDetail(unpaired)
  })

  assert.equal(options.length, 3)
  assert.deepEqual(options.find((option) => option.leftId === 'eye-l'), { key: 'eye-l:eye-r', kind: 'eye', name: 'Verde', leftId: 'eye-l', rightId: 'eye-r', ids: ['eye-l', 'eye-r'] })
  assert.equal(options.find((option) => option.leftId === 'copy-l')?.name, 'Estrela')
  assert.deepEqual(options.find((option) => option.leftId === 'copy-l')?.ids, ['copy-l', 'copy-r'])
  assert.deepEqual(options.find((option) => option.leftId === 'solo')?.ids, ['solo'])
})

test('pareamento por ID ou nome escolhe o asset direito e catalogos iguais colapsam por conteúdo', () => {
  const left = componentSummary('left', 'Olho · Olho esquerdo', { pairId: 'pair' })
  const wrongRight = componentSummary('wrong', 'Olho · Olho direito', { rightSidePositioned: true })
  const pairedRight = componentSummary('paired', 'Outro · Olho direito', { rightSidePositioned: true, pairId: 'pair' })
  assert.equal(findPairedAsset(left, [wrongRight, pairedRight]), pairedRight)
  assert.equal(findPairedAsset(left, [wrongRight]), wrongRight)

  const a = catalogItem('a', 'nose', [catalogPiece(2, 'nose', 'two'), catalogPiece(1, 'nose', 'one')], 'A')
  const b = catalogItem('b', 'nose', [catalogPiece(1, 'nose', 'one'), catalogPiece(2, 'nose', 'two')], 'B')
  const c = catalogItem('c', 'mouth-closed', [catalogPiece(1, 'mouth-closed', 'one')], 'C')
  const summaries = [a, b, c].map((item) => ({ id: item.id, modelSlot: 1, category: item.category, name: item.name, updatedAt: item.updatedAt, pieceCount: item.pieces.length }))
  const grouped = buildCatalogOptions(summaries, { a, b, c })
  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped[0].ids, ['a', 'b'])
  assert.equal(grouped[0].item.name, 'A')
  assert.deepEqual(grouped[1].ids, ['c'])
})

test('validação de rascunho mantém versão, modelo, transforms finitos e data exigidos', () => {
  const entry = {
    id: 'working', selections: composition(), transforms: transforms(), noseOpacity: 1, effects: {}
  }
  const draft = {
    schemaVersion: 1, modelSlot: 2, selectedCollectionId: 'standard', selectedExpressionIndex: 20,
    current: entry, workingCopies: { 'standard:20': entry }, customExpressionNames: { 'standard:21': 'Nova' },
    updatedAt: '2026-01-01T00:00:00.000Z'
  }

  assert.equal(isWorkspaceDraftForModel(draft, 2), true)
  assert.equal(isWorkspaceDraftForModel(draft, 1), false)
  assert.equal(isWorkspaceDraftForModel({ ...draft, selectedExpressionIndex: 1000 }, 2), false)
  assert.equal(isWorkspaceDraftForModel({ ...draft, current: { ...entry, transforms: { ...entry.transforms, mouth: transform({ x: Number.NaN }) } } }, 2), false)
  assert.equal(isWorkspaceDraftForModel({ ...draft, updatedAt: 'data inválida' }, 2), false)
  assert.equal(STANDARD_EXPRESSIONS.length, 21)
})

test('a tela usa o módulo puro de presets sem manter as regras duplicadas dentro do componente', async () => {
  const source = await readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx', 'utf8')
  assert.match(source, /from '\.\/expressionPresetModel'/)
  assert.doesNotMatch(source, /function (rebaseTransform|authoredMetrics|buildComponentOptions|buildCatalogOptions)\(/)
})
