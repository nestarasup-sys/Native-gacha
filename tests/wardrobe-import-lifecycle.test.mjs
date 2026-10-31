import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsWardrobeWorkerResponse } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeImportGuard.ts'
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
