import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6HairMotionGroupSurfaceDependencies } from '../../src/renderer/src/features/editorV6/editorV6HairMotionGroupSurfaces'
import type { EditorV6HairMotionTarget } from '../../src/renderer/src/features/editorV6/editorV6HairMotionTargets'
import type { PreparedEditorV6HairMotionCharacterGroup } from '../../src/renderer/src/features/editorV6/editorV6HairMotionCharacterGroup'
import { prepareEditorV6HairMotionGroupSurfaces } from '../../src/renderer/src/features/editorV6/editorV6HairMotionGroupSurfaces'

const faceAppearance = { modelSlot: 1, setId: 'face-a' }
const character = {
  id: 'character-a', name: 'Ayla', updatedAt: 'character-rev',
  customization: { modelSlot: 1, poseSlot: 2, hairAppearance: { modelSlot: 1 }, faceAppearance, partOverrides: {} }
} as unknown as CustomizerCharacter
const crop = { left: 5, top: 10, width: 80, height: 160 }

function makeTarget(elementId: string, assetId: string, faceMode: 'idle' | 'talk'): EditorV6HairMotionTarget {
  return {
    elementId, assetId, faceMode,
    state: { id: elementId, kind: 'character', characterId: character.id, assetId, poseSlot: 2, faceAppearance, faceTransforms: {}, activeFaceMode: faceMode } as never
  }
}

function fixture(overrides: Partial<EditorV6HairMotionGroupSurfaceDependencies> = {}) {
  const originalCanvas = { label: 'original' } as HTMLCanvasElement
  const canvas = (label: string) => ({ label }) as HTMLCanvasElement
  const originalRenderer = { renderToCanvas: vi.fn(async () => ({ canvas: originalCanvas, width: 100, height: 200 })) }
  const hairlessRenderer = {
    canIsolateMouth: vi.fn(() => true),
    renderLayersToCanvas: vi.fn(async (...args: unknown[]) => {
      const mode = String(args[3])
      return {
        behindFace: canvas(`${mode}-base`), face: canvas(`${mode}-face`),
        inFrontOfFace: canvas(`${mode}-overlay`), eyesAboveRearHair: canvas(`${mode}-eyes`),
        width: 100, height: 200, outputWidth: 1920, outputHeight: 1080, shapeScaleX: 1, shapeScaleY: 1
      }
    })
  }
  const group = {
    groupKey: 'character-a:2', character, appearance: character.customization.faceAppearance,
    sourceHeadPart: { id: 'head', name: 'Cabeça', width: 100, height: 200 },
    targetHeadPart: { id: 'head', x: 20, y: 30, width: 100, height: 200, rotation: 0 },
    originalRenderer, hairlessRenderer
  } as unknown as PreparedEditorV6HairMotionCharacterGroup
  const addedSurfaces: Array<{ key: string; dataUrl: string }> = []
  const dependencies = {
    group, targets: [], layers: [], mouthLoop: true, encodeFaceCropPng: true,
    addSurface: vi.fn((key: string, dataUrl: string) => {
      addedSurfaces.push({ key, dataUrl })
      return `surface:${key}`
    }),
    encodeCanvas: vi.fn((value: HTMLCanvasElement) => `encoded:${(value as unknown as { label: string }).label}`),
    measureFaceModeCrop: vi.fn(async () => crop),
    reportStage: vi.fn(), isCancelled: () => false,
    ...overrides
  } as unknown as EditorV6HairMotionGroupSurfaceDependencies
  return { dependencies, originalRenderer, hairlessRenderer, addedSurfaces }
}

describe('superfícies faciais dos grupos de movimento de cabelo', () => {
  it('reutiliza superfícies por rosto e pose, mede o crop uma vez e isola boca falada no loop', async () => {
    const fx = fixture({ targets: [
      makeTarget('element-idle', 'asset-idle', 'idle'),
      makeTarget('element-idle-copy', 'asset-idle-copy', 'idle'),
      makeTarget('element-talk', 'asset-talk', 'talk')
    ] })

    const rigs = await prepareEditorV6HairMotionGroupSurfaces(fx.dependencies)

    expect(rigs).toHaveLength(3)
    expect(rigs[0].baseSurfaceId).toBe(rigs[1].baseSurfaceId)
    expect(rigs[0].faceSurfaceId).toBe(rigs[1].faceSurfaceId)
    expect(rigs[0].faceSurfaceId).not.toBe(rigs[2].faceSurfaceId)
    expect(rigs[0].sourceCrop).toEqual(crop)
    expect(rigs[2].sourceCrop).toEqual(crop)
    expect(rigs[0].eyesAboveRearHairSurfaceId).toContain('raised-eyes')
    expect(rigs[0].overlaySurfaceId).toContain('overlay')
    expect(fx.originalRenderer.renderToCanvas).toHaveBeenCalledOnce()
    expect(fx.hairlessRenderer.renderLayersToCanvas).toHaveBeenCalledTimes(2)
    expect(fx.hairlessRenderer.renderLayersToCanvas.mock.calls[1]?.[4]).toEqual({ mouthLayer: 'without-mouth' })
    expect(fx.dependencies.measureFaceModeCrop).toHaveBeenCalledOnce()
    expect(fx.dependencies.measureFaceModeCrop).toHaveBeenCalledWith(
      character.name, fx.dependencies.group.originalRenderer, faceAppearance, {}, undefined,
      'idle', expect.objectContaining({ width: 100, height: 200 }), true
    )
  })

  it('cancela entre targets sem iniciar render adicional', async () => {
    const isCancelled = vi.fn(() => true)
    const fx = fixture({ targets: [makeTarget('element', 'asset', 'idle')], isCancelled })

    await expect(prepareEditorV6HairMotionGroupSurfaces(fx.dependencies)).rejects.toThrow('Preparação da animação de cabelo cancelada.')
    expect(fx.originalRenderer.renderToCanvas).not.toHaveBeenCalled()
    expect(fx.hairlessRenderer.renderLayersToCanvas).not.toHaveBeenCalled()
    expect(fx.dependencies.addSurface).not.toHaveBeenCalled()
  })
})
