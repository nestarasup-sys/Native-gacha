import test from 'node:test'
import assert from 'node:assert/strict'
import { saveWardrobeSetDraft } from '../src/renderer/src/features/fabricator/wardrobe/saveWardrobeSetDraft.ts'

const draft = {
  schemaVersion: 1,
  id: 'set-1',
  modelSlot: 1,
  modelName: 'Nome antigo',
  name: 'Acessórios',
  width: 200,
  height: 240,
  updatedAt: '2026-10-01T00:00:00.000Z',
  previewGender: 'male',
  components: [
    {
      id: 'glasses', name: 'Óculos', category: 'oculos', attachedPartId: 'head',
      x: 2, y: 3, width: 40, height: 20, rotation: 0,
      renderAboveHair: true, dataUrl: 'data:image/png;base64,Y3VycmVudA==',
      hasDeformationOriginal: true,
      deformationOriginalDataUrl: 'data:image/png;base64,b3JpZ2luYWw='
    },
    {
      id: 'shirt', name: 'Camisa', category: 'camisa', attachedPartId: 'torso',
      x: 2, y: 3, width: 40, height: 50, rotation: 0,
      renderAboveHair: true, dataUrl: 'data:image/png;base64,c2hpcnQ='
    }
  ]
}

test('comando salva metadados enxutos e todas as imagens atuais do conjunto', async () => {
  const calls = []
  const result = await saveWardrobeSetDraft(draft, 4, 'Modelo atualizado', {
    saveWardrobeSet: async (...args) => calls.push(['save', ...args]),
    notifyAssetsUpdated: () => calls.push(['assets-updated']),
    listWardrobeSets: async (slot) => {
      calls.push(['list', slot])
      return [{ id: 'set-1', modelSlot: slot, modelName: 'Modelo atualizado', name: 'Acessórios', updatedAt: '2026-10-24T00:00:00.000Z', edition: 1, componentCount: 2 }]
    }
  }, '2026-10-24T00:00:00.000Z')

  assert.equal(result.set.modelSlot, 4)
  assert.equal(result.set.modelName, 'Modelo atualizado')
  assert.equal(result.set.edition, 1)
  assert.equal(result.set.updatedAt, '2026-10-24T00:00:00.000Z')
  assert.equal(result.set.previewGender, 'male')
  assert.equal(result.set.components[0].dataUrl, draft.components[0].dataUrl)
  assert.equal(calls[0][0], 'save')
  const [, slot, metadata, assets] = calls[0]
  assert.equal(slot, 4)
  assert.equal(metadata.components[0].dataUrl, undefined)
  assert.equal(metadata.components[0].deformationOriginalDataUrl, undefined)
  assert.equal(metadata.components[0].renderAboveHair, true)
  assert.equal(metadata.components[1].renderAboveHair, false)
  assert.deepEqual(assets.map(({ id }) => id), ['glasses', 'glasses_deform_original', 'shirt'])
  assert.deepEqual(assets.map(({ dataUrl }) => dataUrl), [
    draft.components[0].dataUrl,
    draft.components[0].deformationOriginalDataUrl,
    draft.components[1].dataUrl
  ])
  assert.deepEqual(calls.slice(1), [['assets-updated'], ['list', 4]])
  assert.equal(result.sets[0].componentCount, 2)
})

test('falha de gravação não anuncia assets novos nem atualiza a lista', async () => {
  const calls = []
  await assert.rejects(saveWardrobeSetDraft(draft, 1, undefined, {
    saveWardrobeSet: async () => { calls.push('save'); throw new Error('disco cheio') },
    notifyAssetsUpdated: () => calls.push('assets-updated'),
    listWardrobeSets: async () => { calls.push('list'); return [] }
  }), /disco cheio/)
  assert.deepEqual(calls, ['save'])
})
