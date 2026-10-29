import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mapConcurrentItems } from '../src/renderer/src/ui/mapConcurrentItems.ts'

test('limita leituras de imagens e preserva a ordem dos resultados', async () => {
  const items = Array.from({ length: 12 }, (_, index) => index)
  let active = 0
  let peak = 0
  const result = await mapConcurrentItems(items, async (item) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    return item * 10
  }, () => false, 3)

  assert.equal(peak, 3)
  assert.deepEqual(result, items.map((item) => item * 10))
})

test('cancelar uma área impede que a fila inicie novos itens', async () => {
  let cancelled = false
  const started = []
  const releases = []
  const work = mapConcurrentItems(Array.from({ length: 8 }, (_, index) => index), async (item) => {
    started.push(item)
    await new Promise((resolve) => releases.push(resolve))
    return item
  }, () => cancelled, 2)

  assert.deepEqual(started, [0, 1])
  cancelled = true
  releases.splice(0).forEach((release) => release())

  assert.deepEqual(await work, [])
  assert.deepEqual(started, [0, 1])
})

test('uma falha interrompe a fila e aguarda leituras já iniciadas', async () => {
  const started = []
  let releaseInFlight
  const work = mapConcurrentItems([0, 1, 2, 3], async (item) => {
    started.push(item)
    if (item === 0) throw new Error('asset ausente')
    await new Promise((resolve) => { releaseInFlight = resolve })
    return item
  }, () => false, 2)

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(started, [0, 1])
  releaseInFlight()
  await assert.rejects(work, /asset ausente/)
  assert.deepEqual(started, [0, 1])
})

test('Studio usa a fila limitada para imagens faciais e miniaturas de pose', async () => {
  const page = await readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8')
  assert.equal((page.match(/mapConcurrentItems\(/g) ?? []).length, 2)
  assert.doesNotMatch(page, /Promise\.all\(studioPoseSlots\.map/)
  assert.doesNotMatch(page, /Promise\.all\(summaries\.map\(async \(summary\).*loadFaceCatalogItem/)
  assert.match(page, /\[studioPoseSlots, selectedStudioCharacterModelSlot\]/)
  assert.match(page, /studioPoseSlots\.filter\(\(pose\) => pose\.sourceModelSlot === modelSlot\)/)
})

test('Editor V6 limita pose e recorte de personagens e interrompe trabalho obsoleto', async () => {
  const page = await readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8')
  assert.equal((page.match(/mapConcurrentItems\(/g) ?? []).length, 2)
  assert.doesNotMatch(page, /Promise\.all\(editorV6PoseSlots\.map/)
  assert.doesNotMatch(page, /Promise\.all\(characterAssets\.map/)
  assert.match(page, /editorV6PoseSlots\.filter\(\(pose\) => pose\.sourceModelSlot === modelSlot\)/)
  assert.match(page, /\[editorV6PoseSlots, selectedEditorV6CharacterModelSlot\]/)
})
