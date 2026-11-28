import { expect, it } from 'vitest'
import { editorV6ReactPoseWarnings } from '../../src/renderer/src/features/editorV6/editorV6ReactPoseWarnings'
import { parseEditorV6ReactImport } from '../../src/shared/editorV6ReactImport'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { FabricatorPoseSummary } from '../../src/shared/fabricator'

it('avisa antes da importação quando os slots reais misturam categorias, sem mudar o JSON', () => {
  const characters = [{ id: 'actor', name: 'Ágata', customization: { modelSlot: 1 } }] as CustomizerCharacter[]
  const catalogs = new Map([[1, [
    { slot: 1, sourceModelSlot: 1, name: 'Pose', category: 'Parado' },
    { slot: 2, sourceModelSlot: 1, name: 'Pose', category: 'Sentado' },
    { slot: 3, sourceModelSlot: 1, name: 'Pose', category: 'Parado' }
  ] as FabricatorPoseSummary[]]])
  const source = parseEditorV6ReactImport({ format: 'NYMI_EDITOR_V6_REACT_V1', title: 'Teste', cast: [{ character: 'actor', x: 0, y: 0, poseSlot: 1 }], videos: [], lines: [], beats: [{ character: 'Agata', startSeconds: 2, poseSlot: 2 }] })
  expect(editorV6ReactPoseWarnings(source, characters, catalogs)).toEqual([expect.stringMatching(/Ágata.*Em pé \(slots 1\).*Sentado \(slots 2\)/)])
  expect(source.beats[0].poseSlot).toBe(2)
  source.beats[0].poseSlot = 3
  expect(editorV6ReactPoseWarnings(source, characters, catalogs)).toEqual([])
})
