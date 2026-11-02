import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createProcessedImageImportResult } from '../src/renderer/src/features/fabricator/models/processedImageImportResult.ts'

const metadata = { slot: 2, name: 'Modelo sintético', sourceName: 'sintetico.png', sourceAssetName: 'sintetico-asset.png' }
const emptyMessage = { type: 'complete', id: 1, width: 120, height: 180, parts: [] }

function completeMessage() {
  return {
    type: 'complete', id: 2, width: 120, height: 180,
    parts: [{
      id: 'torso', name: 'Tronco', x: 30, y: 20, width: 40, height: 60,
      png: Uint8Array.of(1, 2, 3).buffer,
      basePng: Uint8Array.of(4, 5, 6).buffer
    }]
  }
}

test('imagem sem peças descarta bytes temporários e devolve mensagem de ajuste', async () => {
  let cleanupCalls = 0
  const outcome = await createProcessedImageImportResult(
    emptyMessage, 'source', 74, metadata,
    async () => { cleanupCalls += 1; return null }
  )

  assert.deepEqual(outcome, {
    kind: 'failed',
    message: 'Nenhuma peça foi encontrada. Aumente a tolerância ou escolha outra imagem.'
  })
  assert.equal(cleanupCalls, 1)
})

test('falha ao montar o projeto permanece visível e informa também falha de limpeza', async () => {
  let cleanupCalls = 0
  const outcome = await createProcessedImageImportResult(
    completeMessage(), 'source', 74, metadata,
    async () => { cleanupCalls += 1; return 'arquivo ainda referenciado' },
    () => { throw new Error('metadado sintético inválido') }
  )

  assert.deepEqual(outcome, {
    kind: 'failed',
    message: 'metadado sintético inválido A imagem temporária também não pôde ser removida: arquivo ainda referenciado'
  })
  assert.equal(cleanupCalls, 1)
})

test('projeto aceito mantém metadados, assets pendentes e não limpa a fonte original', async () => {
  let cleanupCalls = 0
  const outcome = await createProcessedImageImportResult(
    completeMessage(), 'source:data', 68, metadata,
    async () => { cleanupCalls += 1; return null }
  )

  assert.equal(outcome.kind, 'ready')
  assert.equal(outcome.imported.project.slot, 2)
  assert.equal(outcome.imported.project.sourceDataUrl, 'source:data')
  assert.equal(outcome.imported.project.tolerance, 68)
  assert.deepEqual([...outcome.imported.dirtyAssets.keys()], ['torso'])
  assert.deepEqual([...outcome.imported.dirtyChromaBases.keys()], ['torso'])
  assert.equal(cleanupCalls, 0)
})

test('FabricatorPage mantém guarda de geração e delega a decisão do resultado ao domínio', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /id !== requestId\.current\) \{ await discardUncommittedSource\(\); return \}/)
  assert.match(page, /createProcessedImageImportResult\(/)
  assert.match(page, /if \(outcome\.kind === 'failed'\) \{\s*setError\(outcome\.message\)/)
  assert.doesNotMatch(page, /message\.parts\.length === 0/)
})
