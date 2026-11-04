import { describe, expect, it } from 'vitest'
import type { FabricatorProject, ModelPart } from '../../src/shared/fabricator'
import { interpolateEditorV6Pose, motionEase } from '../../src/shared/editorV6MotionInterpolation'
import { compileEditorV6PartMotionPrototype } from '../../src/shared/editorV6PartMotionPrototype'

const makePart = (id: string, x: number, rotation = 0): ModelPart => ({
  id, name: id, x, y: 10, width: 20, height: 40, rotation,
  dataUrl: 'data:image/png;base64,AA==',
  jointAnchor: { x: 10, y: 20 }
})
type Artwork = Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'layerOrder' | 'hiddenPartIds' | 'joints'>
const from: Artwork = {
  width: 120, height: 80, parts: [makePart('head', 5), makePart('arm', 25, 170)],
  layerOrder: ['arm', 'head', 'arm'], hiddenPartIds: ['head'], joints: []
}
const to: Artwork = {
  ...from, parts: [makePart('head', 17, 20), makePart('arm', 40, -170)],
  layerOrder: ['head', 'arm'], hiddenPartIds: []
}

describe('R31 experimental per-part draw-list (NOT wired to MP4)', () => {
  it('matches authoritative joint/pivot geometry in all seven motion samples', () => {
    const prototype = compileEditorV6PartMotionPrototype(from, to)
    expect(prototype.exportReady).toBe(false)
    expect(prototype.unimplementedVisualOperators).toContain('rgba-alpha-and-crop-parity')
    for (let index = 0; index < 7; index++) {
      const progress = index / 6, expected = interpolateEditorV6Pose(from, to, motionEase(progress))
      const sample = prototype.frame(progress)
      for (const part of sample.parts) {
        const e = expected.parts.find(x => x.id === part.id)!
        expect([part.x, part.y, part.width, part.height, part.rotation, part.sourceDataUrl])
          .toEqual([e.x, e.y, e.width, e.height, e.rotation, e.dataUrl])
      }
    }
  })
  it('retains original renderer order/visibility switches and 30 distinct frames', () => {
    const prototype = compileEditorV6PartMotionPrototype(from, to)
    const frames = Array.from({ length: 30 }, (_, i) => prototype.frame(i / 29))
    expect(new Set(frames.map(frame => frame.parts.find(x => x.id === 'arm')!.x.toFixed(8))).size).toBe(30)
    expect(frames[0].parts.map(p => p.id)).toEqual(['arm','head'])
    expect(frames[29].parts.map(p => p.id)).toEqual(['head','arm'])
    expect(frames[0].parts.find(p => p.id === 'head')!.visible).toBe(false)
    expect(frames[29].parts.find(p => p.id === 'head')!.visible).toBe(true)
  })
  it('is repeatable and retains source identity while geometry changes', () => {
    const prototype = compileEditorV6PartMotionPrototype(from, to)
    const first = prototype.frame(0.5)
    expect(prototype.frame(0.5)).toEqual(first)
    expect(first.parts.map(part => part.sourceDataUrl)).toEqual([from.parts[1].dataUrl, from.parts[0].dataUrl])
    expect(first.parts.map(part => part.order)).toEqual([0, 1])
    expect(prototype.exportReady).toBe(false)
    expect(prototype.unimplementedVisualOperators).toContain('joint-bridges')
    expect(prototype.unimplementedVisualOperators).toContain('wardrobe-and-accessory-layering')
  })
  it('rejects impossible rigs and invalid frame values without touching saved poses', () => {
    const before = JSON.stringify([from,to])
    expect(() => compileEditorV6PartMotionPrototype(from, {...to,width:121})).toThrow(/mesmo rig/)
    const p = compileEditorV6PartMotionPrototype(from,to)
    expect(() => p.frame(NaN)).toThrow(/Progresso/)
    expect(() => p.frame(-1)).toThrow(/Progresso/)
    expect(() => p.frame(2)).toThrow(/Progresso/)
    expect(JSON.stringify([from,to])).toBe(before)
  })
})
