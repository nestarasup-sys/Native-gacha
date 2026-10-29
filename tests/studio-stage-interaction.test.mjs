import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { moveStudioStageDrag, studioStageDragPosition } from '../src/renderer/src/features/studio/studioStageInteractionModel.ts'

function studio() {
  return {
    schemaVersion: 1,
    id: 'studio-test',
    title: 'Teste',
    color: '#d7b5cd',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    backgroundColor: '#ffffff',
    backgroundAssetId: 'bg-1',
    backgroundX: 4,
    backgroundY: -3,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: [
      { id: 'actor-1', kind: 'character', characterId: 'alice', assetId: 'actor-image', text: 'Alice', x: 8, y: 12, width: 25, height: 40, rotation: 13, zIndex: 1 },
      { id: 'text-1', kind: 'speech', text: 'Olá', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex: 2 }
    ]
  }
}

function drag(id, size = { width: 200, height: 100 }) {
  return { id, pointerId: 7, startX: 100, startY: 50, originalX: 4, originalY: -3, ...size }
}

test('arraste converte pixels do palco em percentuais da cena', () => {
  assert.deepEqual(studioStageDragPosition(drag('actor-1'), 150, 25), { x: 29, y: -28 })
  assert.deepEqual(studioStageDragPosition(drag('actor-1'), 100, 50), { x: 4, y: -3 })
})

test('dimensões inválidas e coordenadas não finitas não chegam ao documento', () => {
  assert.equal(studioStageDragPosition(drag('actor-1', { width: 0, height: 100 }), 150, 25), null)
  assert.equal(studioStageDragPosition(drag('actor-1', { width: 200, height: 0 }), 150, 25), null)
  assert.equal(studioStageDragPosition(drag('actor-1', { width: Number.POSITIVE_INFINITY, height: 100 }), 150, 25), null)
  assert.equal(studioStageDragPosition(drag('actor-1'), Number.NaN, 25), null)
})

test('arraste da imagem de fundo altera somente sua posição e preserva o snapshot', () => {
  const before = studio()
  const next = moveStudioStageDrag(before, drag('background'), { x: 29, y: -28 }, '2026-02-01T00:00:00.000Z')

  assert.deepEqual([next.backgroundX, next.backgroundY], [29, -28])
  assert.equal(next.backgroundRotation, 0)
  assert.equal(next.backgroundAssetId, 'bg-1')
  assert.equal(next.elements, before.elements)
  assert.deepEqual([before.backgroundX, before.backgroundY], [4, -3])
  assert.equal(next.updatedAt, '2026-02-01T00:00:00.000Z')
})

test('arraste de elemento altera somente x e y do alvo sem mutar outros elementos', () => {
  const before = studio()
  const next = moveStudioStageDrag(before, drag('actor-1'), { x: 29, y: -28 }, '2026-02-01T00:00:00.000Z')

  assert.deepEqual(next.elements[0], { ...before.elements[0], x: 29, y: -28 })
  assert.equal(next.elements[1], before.elements[1])
  assert.equal(next.backgroundX, before.backgroundX)
  assert.deepEqual([before.elements[0].x, before.elements[0].y], [8, 12])
})

test('StudioPage delega o arraste ao hook sem duplicar a captura e atualização no componente', async () => {
  const [page, hook] = await Promise.all([
    readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/studio/useStudioStageInteraction.ts', 'utf8')
  ])
  assert.match(page, /useStudioStageInteraction\(/)
  assert.doesNotMatch(page, /const (startDrag|moveDrag|endDrag)\s*=/)
  assert.match(hook, /setPointerCapture\(event\.pointerId\)/)
  assert.match(hook, /positionLocked/)
  assert.match(hook, /recordHistory\(\)/)
  assert.match(hook, /patchStudio\(/)
})
