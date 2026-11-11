import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6HairMotionBundle, EditorV6HairMotionRig } from '../../src/shared/editorV6HairMotion'
import { createEditorV6ExportHairMotionPlanIndex } from '../../src/renderer/src/features/editorV6/exportHairMotionPlanIndex'

function project(): EditorV6Document {
  return {
    schemaVersion: 1,
    id: 'project',
    title: 'Projeto sintético',
    color: '#fff',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    backgroundColor: '#fff',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: [],
    timeline: createEditorV6Timeline()
  }
}

function rig(elementId: string, assetId: string, poseSlot: number): EditorV6HairMotionRig {
  return { elementId, assetId, characterId: 'character', poseSlot, baseSurfaceId: 'base', faceSurfaceId: 'face', overlaySurfaceId: null, artworkWidth: 1, artworkHeight: 1, outputWidth: 1, outputHeight: 1, shapeScaleX: 1, shapeScaleY: 1, sourceCrop: { left: 0, top: 0, width: 1, height: 1 }, sourceHead: { width: 1, height: 1 }, targetHead: { x: 0, y: 0, width: 1, height: 1, rotation: 0 }, layers: [] }
}

describe('createEditorV6ExportHairMotionPlanIndex', () => {
  it('builds empty plan indexes when a project has no hair animation', () => {
    const index = createEditorV6ExportHairMotionPlanIndex(project())
    expect(index.hairRigs.size).toBe(0)
    expect(index.hairPoseRigs.size).toBe(0)
    expect(index.expressionOnlyPlansByElement.size).toBe(0)
    expect(index.transitionForFrame('missing', 10)).toBeUndefined()
    expect(index.hairPoseReactionEnds.size).toBe(0)
  })

  it('indexes rigs by asset and pose while preserving pose-first lookup with direct fallback', () => {
    const first = rig('element', 'asset-1', 1)
    const second = rig('element', 'asset-2', 2)
    const bundle = { rigs: [first, second], surfaces: [], textures: [] } as EditorV6HairMotionBundle
    const index = createEditorV6ExportHairMotionPlanIndex(project(), bundle)

    expect(index.hairRigs.get('element:asset-1')).toBe(first)
    expect(index.hairPoseRigs.get('element:2')).toBe(second)
    expect(index.hairRigForElement({ id: 'element', assetId: 'asset-1', poseSlot: 2 })).toBe(second)
    expect(index.hairRigForElement({ id: 'element', assetId: 'asset-1', poseSlot: null })).toBe(first)
  })
})
