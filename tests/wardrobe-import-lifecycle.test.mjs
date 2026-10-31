import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsWardrobeWorkerResponse } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeImportGuard.ts'
import { assertWardrobeImportFile, assertWardrobeBitmapBounds, MAX_WARDROBE_IMPORT_FILE_BYTES, MAX_WARDROBE_IMPORT_PIXELS } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeImportLimits.ts'
import { readFile } from 'node:fs/promises'

test('a resposta só pode publicar peças se vier do worker e da seleção atuais', () => {
  assert.equal(acceptsWardrobeWorkerResponse(12, 12, 12, true), true)
  assert.equal(acceptsWardrobeWorkerResponse(12, 13, 12, true), false, 'novo modelo invalida importação anterior')
  assert.equal(acceptsWardrobeWorkerResponse(12, 12, 11, true), false, 'resposta antiga não atualiza draft')
  assert.equal(acceptsWardrobeWorkerResponse(12, 12, 12, false), false, 'worker substituído não publica')
})

test('operações de importação protegem callbacks e liberam bitmaps após criar as peças', async () => {
  const code = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/wardrobeImportOperations.ts', import.meta.url), 'utf8')
  assert.match(code, /requestAtStart !== requestRef\.current/)
  assert.match(code, /acceptsWardrobeWorkerResponse\(id, requestRef\.current, message\.id, workerRef\.current === worker\)/)
  assert.match(code, /worker\.onerror = \(\) => \{\s*if \(requestRef\.current !== id \|\| workerRef\.current !== worker\) return/)
  assert.equal((code.match(/image\.close\(\)/g) ?? []).length, 2)
  assert.equal((code.match(/if \(requestAtStart !== requestRef\.current\) return/g) ?? []).length, 3,
    'leitura e decodificação assíncronas não devem publicar draft após troca de modelo')
  assert.match(code, /if \(importWorker \? workerRef\.current !== importWorker : requestRef\.current !== requestAtStart\) return/)
  assert.match(code, /catch \(reason\) \{\s*setError\(reason instanceof Error \? reason\.message : 'Não foi possível preparar as peças importadas\.'\)/)
})

test('grades importadas rejeitam arquivos e dimensões fora dos limites antes de criar peças', () => {
  assert.doesNotThrow(() => assertWardrobeImportFile({ size: 1 }))
  assert.doesNotThrow(() => assertWardrobeImportFile({ size: MAX_WARDROBE_IMPORT_FILE_BYTES }))
  for (const size of [0, -1, NaN, Infinity, MAX_WARDROBE_IMPORT_FILE_BYTES + 1]) {
    assert.throws(() => assertWardrobeImportFile({ size }), /50 MB/)
  }
  assert.doesNotThrow(() => assertWardrobeBitmapBounds({ width: 8000, height: 4000 }))
  assert.equal(8000 * 4000, MAX_WARDROBE_IMPORT_PIXELS)
  for (const bounds of [{ width: 0, height: 3 }, { width: 1, height: NaN }, { width: 50000, height: 50000 }, { width: -1, height: 22 }]) {
    assert.throws(() => assertWardrobeBitmapBounds(bounds), /32 milhões de pixels/)
  }
})
