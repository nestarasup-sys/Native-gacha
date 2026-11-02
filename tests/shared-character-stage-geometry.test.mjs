import test from 'node:test'
import assert from 'node:assert/strict'
import { fitCharacterToStage } from '../src/shared/characterStageGeometry.ts'
import { fitEditorV6CharacterToStage } from '../src/shared/editorV6CharacterGeometry.ts'
import { fitStudioCharacterToStage } from '../src/shared/studioCharacterGeometry.ts'

test('Studio e Editor V6 preservam a mesma regra de escala-base para pose neutra, poses articuladas e dimensões inválidas', () => {
  const fixtures = [
    {
      referenceRendered: { width: 1000, height: 1000 },
      referenceCrop: { width: 300, height: 800 },
      rendered: { width: 1000, height: 1000 },
      crop: { width: 300, height: 800 },
      stageWidth: 1920,
      stageHeight: 1080
    },
    {
      referenceRendered: { width: 1000, height: 1000 },
      referenceCrop: { width: 300, height: 800 },
      rendered: { width: 1200, height: 1000 },
      crop: { width: 450, height: 600 },
      stageWidth: 1280,
      stageHeight: 720
    },
    {
      referenceRendered: { width: 0, height: 0 },
      referenceCrop: { width: 0, height: 0 },
      rendered: { width: 0, height: 0 },
      crop: { width: 0, height: 0 },
      stageWidth: 0,
      stageHeight: 0
    }
  ]

  for (const fixture of fixtures) {
    const args = [
      fixture.referenceRendered,
      fixture.referenceCrop,
      fixture.rendered,
      fixture.crop,
      fixture.stageWidth,
      fixture.stageHeight
    ]
    const expected = fitCharacterToStage(...args)
    assert.deepEqual(fitStudioCharacterToStage(...args), expected)
    assert.deepEqual(fitEditorV6CharacterToStage(...args), expected)
    for (const value of Object.values(expected)) assert.equal(Number.isFinite(value), true)
  }
})
