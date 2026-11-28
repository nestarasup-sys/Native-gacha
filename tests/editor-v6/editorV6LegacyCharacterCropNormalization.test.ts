import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { prepareEditorV6LegacyCharacterCrops } from '../../src/renderer/src/features/editorV6/editorV6LegacyCharacterCropNormalization'
import { editorV6SourceFrameGeometry, EDITOR_V6_SOURCE_FRAME_VERSION } from '../../src/renderer/src/features/editorV6/editorV6SourceFrame'
import { resolveEditorV6MotionElementScales } from '../../src/renderer/src/features/editorV6/motion/motionFrameGeometry'

const project = {
  id: 'project-a', title: 'Project', schemaVersion: 1, color: '#fff', createdAt: '', updatedAt: '',
  backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
  backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
  assets: [
    { id: 'legacy-a', category: 'character', name: 'Legacy A', mimeType: 'image/png', dataUrl: 'legacy-a-bytes' },
    { id: 'legacy-b', category: 'character', name: 'Legacy B', mimeType: 'image/png', dataUrl: 'legacy-b-bytes' },
    { id: 'modern-base', category: 'character', name: 'Modern', mimeType: 'image/png', dataUrl: 'modern-base-bytes' },
    { id: 'modern-talk', category: 'character', name: 'Modern talk', mimeType: 'image/png', dataUrl: 'modern-talk-bytes' },
    { id: 'unused', category: 'character', name: 'Unused', mimeType: 'image/png', dataUrl: 'unused-bytes' },
    { id: 'background', category: 'background', name: 'Background', mimeType: 'image/png', dataUrl: 'background-bytes' }
  ],
  elements: [
    { id: 'legacy-element-a', kind: 'character', characterId: 'a', assetId: 'legacy-a' },
    { id: 'legacy-element-b', kind: 'character', characterId: 'b', assetId: 'legacy-b' },
    { id: 'modern-element', kind: 'character', characterId: 'modern', assetId: 'modern-base', faceModeAssetIds: { idle: 'modern-base', talk: 'modern-talk' } }
  ],
  timeline: { tracks: [] }
} as unknown as EditorV6Document

const crop = (label: string) => ({
  dataUrl: `data:${label}`, width: 8, height: 6, left: 1, top: 2, sourceWidth: 10, sourceHeight: 10
})

describe('preparação de recortes legados do Editor V6', () => {
  it('inclui retratos usados somente por blocos legados da timeline', async () => {
    const saved = {
      ...project, elements: [project.elements[2]],
      timeline: { ...project.timeline, tracks: [{ blocks: [{ state: project.elements[0] }] }] }
    } as EditorV6Document
    const trimImage = vi.fn(async () => crop('a'))
    expect(await prepareEditorV6LegacyCharacterCrops(saved, () => false, trimImage)).toEqual([{ assetId: 'legacy-a', crop: crop('a') }])
    expect(trimImage).toHaveBeenCalledExactlyOnceWith('legacy-a-bytes')
  })

  it('preserva as coordenadas do corpo ao remover o recorte antigo de um personagem espelhado e rotacionado', () => {
    const state = { ...project.elements[0], x: -14, y: 21, width: 20, height: 30, rotation: 23, flipX: true,
      characterScale: 91, characterWidthScale: 70, characterHeightScale: 110 }
    const source = { left: 0, top: 0, width: 1000, height: 900 }
    const oldCrop = { left: 100, top: 120, width: 500, height: 700 }
    const converted = { ...state, ...editorV6SourceFrameGeometry(state, source, oldCrop),
      faceRendererVersion: EDITOR_V6_SOURCE_FRAME_VERSION }
    const scales = resolveEditorV6MotionElementScales(state, converted, oldCrop, source)
    expect(scales.to.x).toBeCloseTo(scales.from.x)
    expect(scales.to.y).toBeCloseTo(scales.from.y)
    const bodyPoint = { x: 320, y: 550 }
    const stagePoint = (element: typeof state, crop: typeof oldCrop, scale: typeof scales.from) => {
      const x = -(bodyPoint.x - crop.left - crop.width / 2) * scale.x
      const y = (bodyPoint.y - crop.top - crop.height / 2) * scale.y
      const angle = state.rotation * Math.PI / 180
      return [element.x * 19.2 + x * Math.cos(angle) - y * Math.sin(angle),
        element.y * 10.8 + x * Math.sin(angle) + y * Math.cos(angle)]
    }
    const originalPoint = stagePoint(state, oldCrop, scales.from)
    stagePoint(converted, source, scales.to).forEach((value, index) => expect(value).toBeCloseTo(originalPoint[index]))
    expect(editorV6SourceFrameGeometry(converted, source, { left: 90, top: 2, width: 620, height: 768 })).toEqual({})
  })
  it('processa somente assets de personagem referenciados por snapshots legados e mantém a ordem', async () => {
    const trimImage = vi.fn(async (dataUrl: string) => {
      await new Promise((resolve) => setTimeout(resolve, dataUrl === 'legacy-a-bytes' ? 5 : 0))
      return dataUrl === 'legacy-a-bytes' ? crop('a') : null
    })

    const result = await prepareEditorV6LegacyCharacterCrops(project, () => false, trimImage)

    expect(trimImage.mock.calls.map(([dataUrl]) => dataUrl)).toEqual(['legacy-a-bytes', 'legacy-b-bytes'])
    expect(result).toEqual([{ assetId: 'legacy-a', crop: crop('a') }])
    expect(project.assets[0].dataUrl).toBe('legacy-a-bytes')
  })

  it('retorna null quando a preparação é cancelada e lista vazia quando não há trabalho', async () => {
    let cancelled = false
    const trimImage = vi.fn(async () => {
      cancelled = true
      return crop('cancelled')
    })

    await expect(prepareEditorV6LegacyCharacterCrops(project, () => cancelled, trimImage)).resolves.toBeNull()

    const noLegacyAssets = {
      ...project,
      elements: [project.elements[2]],
      assets: project.assets.filter((asset) => asset.id !== 'legacy-a' && asset.id !== 'legacy-b')
    } as EditorV6Document
    const unusedTrim = vi.fn(async () => crop('unused'))
    await expect(prepareEditorV6LegacyCharacterCrops(noLegacyAssets, () => false, unusedTrim)).resolves.toEqual([])
    expect(unusedTrim).not.toHaveBeenCalled()
  })
})
