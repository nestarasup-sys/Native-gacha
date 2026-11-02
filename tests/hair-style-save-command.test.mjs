import test from 'node:test'
import assert from 'node:assert/strict'
import { saveHairStyleDraft } from '../src/renderer/src/features/fabricator/hairStyleSaveCommand.ts'

const transform = { x: 50, y: 42, scaleX: 1, scaleY: 1, rotation: 0 }

function workspace(overrides = {}) {
  return {
    schemaVersion: 1,
    modelSlot: 2,
    front: {
      dataUrl: 'data:image/png;base64,front', width: 80, height: 50,
      hasDeformationOriginal: true, deformationOriginalWidth: 70, deformationOriginalHeight: 60,
      deformationOriginalTransform: { x: 3, y: 4, scaleX: 1, scaleY: 1, rotation: 0 },
      deformationOriginalDataUrl: 'data:image/png;base64,front-original'
    },
    back: { dataUrl: 'data:image/png;base64,back', width: 90, height: 60 },
    fringe: null,
    transforms: { front: transform, back: transform, fringe: transform },
    categoryBySide: { front: 'frontHair' },
    sourceImageDataUrl: 'data:image/png;base64,source',
    sourceAppliesToDraft: false,
    chromaTolerance: 64,
    chromaMode: 'green',
    updatedAt: '2026-10-31T00:00:00.000Z',
    ...overrides
  }
}

test('salva metadados e binários separados, preservando IDs, datas e opções existentes', async () => {
  const calls = []
  const detail = await saveHairStyleDraft({
    workspace: workspace(), modelSlot: 2, styleName: '  Teste capilar  ',
    existing: { id: 'style-stored', createdAt: '2026-01-01T00:00:00.000Z' }
  }, {
    saveHairStyle: async (...args) => calls.push(args),
    createId: () => 'new-style-id',
    now: () => '2026-11-01T12:00:00.000Z'
  })

  assert.equal(calls.length, 1)
  const [savedSlot, saved, assets] = calls[0]
  assert.equal(savedSlot, 2)
  assert.equal(saved.id, 'style-stored')
  assert.equal(saved.name, 'Teste capilar')
  assert.equal(saved.createdAt, '2026-01-01T00:00:00.000Z')
  assert.equal(saved.updatedAt, '2026-11-01T12:00:00.000Z')
  assert.deepEqual(saved.categoryBySide, { front: 'frontHair', back: 'backHair' })
  assert.equal(saved.front.dataUrl, undefined)
  assert.equal(saved.front.hasDeformationOriginal, true)
  assert.equal(saved.sourceImageSaved, true)
  assert.equal(saved.sourceAppliesToDraft, false)
  assert.equal(saved.chromaTolerance, 64)
  assert.equal(saved.chromaMode, 'green')
  assert.deepEqual(assets.map(({ id }) => id), ['front', 'front-deform-original', 'back', 'source'])
  assert.equal(detail.front.dataUrl, 'data:image/png;base64,front')
  assert.equal(detail.back.dataUrl, 'data:image/png;base64,back')
  assert.equal(detail.sourceImageDataUrl, 'data:image/png;base64,source')
})

test('usa valores legados padrão e um ID novo quando o conjunto ainda não existe', async () => {
  let saved
  await saveHairStyleDraft({
    workspace: workspace({ front: null, back: null, sourceImageDataUrl: undefined, chromaTolerance: undefined, chromaMode: undefined }),
    modelSlot: 3, styleName: 'Novo'
  }, {
    saveHairStyle: async (_slot, style) => { saved = style },
    createId: () => 'created-style',
    now: () => '2026-11-01T12:00:00.000Z'
  })

  assert.equal(saved.id, 'created-style')
  assert.equal(saved.chromaTolerance, 70)
  assert.equal(saved.chromaMode, 'auto')
  assert.equal(saved.createdAt, '2026-11-01T12:00:00.000Z')
  assert.deepEqual(saved.categoryBySide, {})
  assert.equal(saved.sourceImageSaved, false)
})

test('cópia original ausente é bloqueada antes de chamar o repositório', async () => {
  let writes = 0
  await assert.rejects(saveHairStyleDraft({
    workspace: workspace({ front: { dataUrl: 'data:image/png;base64,front', width: 80, height: 50, hasDeformationOriginal: true } }),
    modelSlot: 2, styleName: 'Inválido'
  }, {
    saveHairStyle: async () => { writes += 1 },
    createId: () => 'style',
    now: () => '2026-11-01T12:00:00.000Z'
  }), /Cópia original ausente/)
  assert.equal(writes, 0)
})

test('falha do repositório é propagada sem publicar um detalhe como salvo', async () => {
  await assert.rejects(saveHairStyleDraft({ workspace: workspace(), modelSlot: 2, styleName: 'Teste' }, {
    saveHairStyle: async () => { throw new Error('Falha sintética de persistência') },
    createId: () => 'style',
    now: () => '2026-11-01T12:00:00.000Z'
  }), /Falha sintética de persistência/)
})
