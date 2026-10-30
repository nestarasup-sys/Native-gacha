import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverWardrobeSplitBindings } from '../electron/domains/fabricator/wardrobeSplitRecovery.ts'
const previous = [{ id: 'arm', name: 'Braço esquerdo' }, { id: 'torso', name: 'Tronco' }]
const current = [{ id: 'split', name: 'Braço esquerdo - parte' }, previous[1]]
const set = { components: [{ id: 'sleeve', attachedPartId: 'arm', binding: { boneId: 'arm', widthRatio: 1.2 }, glue: { mode: 'fixed' } }] }
test('recupera segmento comprovado pelo histórico sem alterar ajuste ou catálogo', () => {
  const recovered = recoverWardrobeSplitBindings(set, current, [previous])
  assert.equal(recovered.components[0].attachedPartId, 'split')
  assert.equal(recovered.components[0].binding.boneId, 'split')
  assert.equal(recovered.components[0].binding.widthRatio, 1.2)
  assert.equal(recovered.components[0].glue, set.components[0].glue)
  assert.equal(set.components[0].attachedPartId, 'arm')
})
test('recusa outro modelo, duplicatas ou ausência de histórico', () => {
  for (const [parts, history] of [[current, []], [[current[0], { id: 'other', name: 'Tronco' }], [previous]], [[...current, { id: 'duplicate', name: current[0].name }], [previous]]]) {
    assert.equal(recoverWardrobeSplitBindings(set, parts, history).components[0].attachedPartId, 'arm')
  }
})
