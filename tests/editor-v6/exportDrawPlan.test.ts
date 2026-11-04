import { describe, expect, it } from 'vitest'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6ExperimentalDrawPlan } from '../../src/shared/editorV6ExportDrawPlan'

const background = {
  backgroundColor: '#203040', backgroundAssetId: null,
  backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
}
function scene(frame: number, elements: unknown[], extras: Record<string, unknown> = {}): EditorV6ResolvedScene {
  return { frame, background, elements, ...extras } as unknown as EditorV6ResolvedScene
}
function character(frame = 0) {
  return {
    id: 'actor-1', kind: 'character', characterId: 'hero', assetId: 'hero-png', text: 'Hero',
    x: frame - 14, y: 3, width: 10, height: 20, rotation: frame * 2,
    characterScale: 200, characterWidthScale: 150, characterHeightScale: 50,
    zIndex: 1, flipX: frame % 2 === 1
  }
}
describe('V6 experimental draw plan — geometry only, never active export', () => {
  it('preserves SVG stage geometry, order, scaling and flip without mutating input', () => {
    const img = { id: 'background-prop', kind: 'image', assetId: 'prop', text: '', x: 3, y: -4, width: 8, height: 5, rotation: 0, zIndex: 2 }
    const source = scene(0, [character(), img])
    const before = JSON.stringify(source)
    const plan = createEditorV6ExperimentalDrawPlan(source, { animatedHair: false })
    expect(plan).toMatchObject({ schemaVersion: 1, frame: 0, backgroundColor: '#203040', geometryOnlyCandidate: true, unsupported: [] })
    expect(plan.commands.map(command => command.assetId)).toEqual(['hero-png', 'prop'])
    expect(plan.commands[0]).toMatchObject({
      centerX: 36 * 19.2, centerY: 53 * 10.8, width: 10 * 2 * 1.5 * 19.2,
      height: 20 * 2 * .5 * 10.8, rotationDegrees: 0, flipX: false
    })
    expect(JSON.stringify(source)).toBe(before)
  })
  it('refuses hair, video, dynamic mouth/sprites, text, missing assets and invalid geometry', () => {
    const result = createEditorV6ExperimentalDrawPlan(scene(0, [
      { ...character(), mouthPatch: { assetId: 'mouth' } },
      { ...character(), id: 'sprite', kind: 'image', motionSprite: { x: 0 } },
      { ...character(), id: 'missing', assetId: undefined },
      { ...character(), id: 'invalid', width: 0 },
      { id: 'speech', kind: 'speech', text: 'Olá' }
    ], { mediaVideo: { mediaId: 'clip' }, background: { ...background, backgroundAssetId: 'bg' } }), { animatedHair: true })
    expect(result.geometryOnlyCandidate).toBe(false)
    expect(result.unsupported.map(x => x.feature)).toEqual([
      'animated-hair', 'video', 'background-image', 'mouth-patch',
      'motion-sprite', 'missing-asset', 'invalid-geometry', 'unsupported-element'
    ])
  })
  it('produces 30 distinct frame commands with deterministic independent snapshots', () => {
    const outputs = Array.from({ length: 30 }, (_, frame) =>
      createEditorV6ExperimentalDrawPlan(scene(frame, [character(frame)]), { animatedHair: false }))
    expect(outputs).toHaveLength(30)
    expect(new Set(outputs.map(output => JSON.stringify(output.commands))).size).toBe(30)
    expect(outputs.every(output => output.geometryOnlyCandidate && output.commands.length === 1)).toBe(true)
    expect(outputs[29].commands[0].flipX).toBe(true)
    expect(outputs[0].commands[0].centerX).not.toBe(outputs[29].commands[0].centerX)
  })
  it('maps seven motion atlas samples to the same source rect and destination geometry', () => {
    const samples = Array.from({ length: 7 }, (_, index) => {
      const frame = index - 7
      const motionSprite = { x: 12 + index * 3, y: 20 + index, width: 80 + index, height: 120 - index, atlasWidth: 512, atlasHeight: 256 }
      const item = { ...character(frame), motionSprite, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
      const command = createEditorV6ExperimentalDrawPlan(scene(frame, [item]), { animatedHair: false }).commands[0]
      expect(command).toMatchObject({
        centerX: (50 + item.x) * 19.2, centerY: (50 + item.y) * 10.8,
        width: item.width * 19.2, height: item.height * 10.8,
        rotationDegrees: item.rotation, flipX: item.flipX, sourceRect: motionSprite
      })
      return JSON.stringify(command)
    })
    expect(new Set(samples).size).toBe(7)
  })
  it('keeps 30 distinct motion frames deterministic across repeated planning', () => {
    for (let frame = 0; frame < 30; frame++) {
      const actor = { ...character(frame), characterScale: 100, characterWidthScale: 100, characterHeightScale: 100,
        motionSprite: { x: frame * 2, y: frame, width: 48, height: 72, atlasWidth: 512, atlasHeight: 256 } }
      const source = scene(frame, [actor])
      const first = createEditorV6ExperimentalDrawPlan(source, { animatedHair: false })
      const second = createEditorV6ExperimentalDrawPlan(source, { animatedHair: false })
      expect(first).toEqual(second)
      expect(first.commands[0].sourceRect).toEqual(actor.motionSprite)
      expect(first.geometryOnlyCandidate).toBe(true)
    }
  })
})
