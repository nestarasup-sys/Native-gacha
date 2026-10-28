import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createImportedModelProject } from '../src/renderer/src/features/fabricator/models/processedModelProject.ts'

const imageBuffer = value => Uint8Array.of(value).buffer

test('monta o projeto importado com bases, ordem, juntas e assets pendentes preservados', () => {
  const result = createImportedModelProject({
    type: 'complete',
    id: 7,
    width: 120,
    height: 180,
    parts: [
      { id: 'head', name: 'Cabeça', x: 40, y: 5, width: 30, height: 30, png: imageBuffer(1), basePng: imageBuffer(2) },
      { id: 'torso', name: 'Tronco', x: 35, y: 35, width: 40, height: 60, png: imageBuffer(3), basePng: imageBuffer(4) }
    ]
  }, 'data:image/png;base64,SOURCE', 74, {
    slot: 2,
    name: 'Modelo teste',
    sourceName: 'origem.png',
    sourceAssetName: 'source-test.png'
  })

  assert.equal(result.project.schemaVersion, 1)
  assert.equal(result.project.chromaVersion, 2)
  assert.equal(result.project.chromaBaseTolerance, 0)
  assert.equal(result.project.slot, 2)
  assert.equal(result.project.sourceDataUrl, 'data:image/png;base64,SOURCE')
  assert.equal(result.project.width, 120)
  assert.equal(result.project.height, 180)
  assert.equal(result.project.tolerance, 74)
  assert.deepEqual(result.project.layerOrder, ['head', 'torso'])
  assert.deepEqual(result.project.hiddenPartIds, [])

  const head = result.project.parts.find(part => part.id === 'head')
  assert.equal(head.rotation, 0)
  assert.equal(head.chromaBaseSaved, true)
  assert.equal(head.dataUrl, 'data:image/png;base64,AQ==')
  assert.equal(head.chromaBaseDataUrl, 'data:image/png;base64,Ag==')
  assert.deepEqual(head.sourceTransform.jointAnchor, head.jointAnchor)
  assert.equal(result.project.joints.length, 1)
  assert.equal(result.project.joints[0].parentPartId, 'torso')
  assert.equal(result.project.joints[0].childPartId, 'head')
  assert.equal(result.dirtyAssets.get('head'), head.dataUrl)
  assert.equal(result.dirtyChromaBases.get('head'), head.chromaBaseDataUrl)
  assert.equal(result.dirtyAssets.size, 2)
  assert.equal(result.dirtyChromaBases.size, 2)
})

test('página e workers compartilham os contratos de mensagem definidos pelo domínio', async () => {
  const [page, imageWorker, chromaWorker] = await Promise.all([
    readFile(new URL('../src/renderer/src/features/fabricator/FabricatorPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/imageProcessor.worker.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/src/features/fabricator/models/chromaAdjust.worker.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /MessageEvent<ImageProcessorMessage>/)
  assert.match(page, /satisfies ImageProcessorRequest/)
  assert.match(imageWorker, /MessageEvent<ImageProcessorRequest>/)
  assert.match(page, /MessageEvent<ChromaAdjustMessage>/)
  assert.match(page, /satisfies ChromaAdjustRequest/)
  assert.match(chromaWorker, /MessageEvent<ChromaAdjustRequest>/)
})
