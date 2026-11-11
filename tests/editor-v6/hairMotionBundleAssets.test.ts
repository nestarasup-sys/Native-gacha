import { describe, expect, it } from 'vitest'
import type { EditorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6MotionLayerAtlasCapture } from '../../src/renderer/src/features/editorV6/motion/motionLayerAtlasCapture'
import { createEditorV6HairMotionBundleAssets, type EditorV6SerializedMotionLayerAtlas } from '../../src/renderer/src/features/editorV6/editorV6HairMotionBundleAssets'

function plan(): EditorV6MotionPlan {
  return { elementId: 'actor', key: 'transition-key', startFrame: 10, endFrame: 20 } as EditorV6MotionPlan
}

function capture(overrides: Partial<EditorV6SerializedMotionLayerAtlas> = {}): EditorV6SerializedMotionLayerAtlas {
  return {
    frames: [] as EditorV6MotionLayerAtlasCapture['frames'], behindFaceDataUrl: 'data:behind', faceDataUrl: 'data:face',
    eyesAboveRearHairDataUrl: 'data:eyes', inFrontOfFaceDataUrl: 'data:overlay', ...overrides
  }
}

describe('createEditorV6HairMotionBundleAssets', () => {
  it('assigns deterministic IDs, deduplicates by key and preserves transition layer references', () => {
    const assets = createEditorV6HairMotionBundleAssets()
    expect(assets.addSurface('base', 'data:base')).toBe('surface-1')
    expect(assets.addSurface('base', 'data:replacement-is-ignored')).toBe('surface-1')
    expect(assets.addTexture('strand', 'data:strand')).toBe('texture-1')
    expect(assets.addTexture('strand', 'data:replacement-is-ignored')).toBe('texture-1')

    assets.captureTransitionLayers(plan(), { faceAsset: { dataUrl: 'data:face-atlas' } } as never, capture())

    expect(assets.surfaces).toEqual([
      { id: 'surface-1', dataUrl: 'data:base' },
      { id: 'surface-2', dataUrl: 'data:behind' },
      { id: 'surface-3', dataUrl: 'data:face' },
      { id: 'surface-4', dataUrl: 'data:eyes' },
      { id: 'surface-5', dataUrl: 'data:overlay' },
      { id: 'surface-6', dataUrl: 'data:face-atlas' }
    ])
    expect(assets.textures).toEqual([{ id: 'texture-1', dataUrl: 'data:strand' }])
    expect(assets.motionTransitions).toEqual([{
      elementId: 'actor', key: 'transition-key', startFrame: 10, endFrame: 20,
      behindFaceSurfaceId: 'surface-2', faceSurfaceId: 'surface-3', eyesAboveRearHairSurfaceId: 'surface-4',
      overlaySurfaceId: 'surface-5', faceAtlasSurfaceId: 'surface-6', frames: []
    }])
  })

  it('keeps absent optional layers and face atlases null without allocating IDs', () => {
    const assets = createEditorV6HairMotionBundleAssets()
    assets.captureTransitionLayers(plan(), {}, capture({ eyesAboveRearHairDataUrl: null, inFrontOfFaceDataUrl: null }))

    expect(assets.surfaces).toEqual([
      { id: 'surface-1', dataUrl: 'data:behind' },
      { id: 'surface-2', dataUrl: 'data:face' }
    ])
    expect(assets.motionTransitions[0]).toMatchObject({
      behindFaceSurfaceId: 'surface-1', faceSurfaceId: 'surface-2',
      eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null, faceAtlasSurfaceId: null
    })
  })
})
