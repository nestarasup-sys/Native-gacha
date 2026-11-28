import { describe, expect, it } from 'vitest'
import type { EditorV6Asset } from '../../src/shared/editorV6'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6NativeFramePlan } from '../../src/renderer/src/features/editorV6/editorV6NativeFramePlan'

const scene = (assetId?: string): EditorV6ResolvedScene => ({
  frame: 0,
  background: {
    backgroundColor: 'transparent', backgroundAssetId: null,
    backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
  },
  elements: [{
    id: 'actor', kind: 'character', text: '', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 0,
    ...(assetId ? { assetId } : {})
  }]
})

const canvas = { toDataURL: () => 'data:image/png;base64,AA==' } as HTMLCanvasElement

describe('plano de quadro do renderizador nativo', () => {
  it('marca o raster de cabelo como temporário do quadro', async () => {
    const plan = await createEditorV6NativeFramePlan({
      scene: scene(), assets: [], resolveAssetById: () => undefined,
      rasterCanvases: new Map([['actor', canvas]]), frame: 12, width: 4, height: 2, layer: 'all'
    })

    expect(plan.assets).toEqual([{ id: expect.stringMatching(/^hair-/), dataUrl: canvas.toDataURL(), lifetime: 'frame' }])
  })

  it('mantém imagens reutilizáveis no cache do processo', async () => {
    const body: EditorV6Asset = { id: 'body', name: 'Body', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
    const plan = await createEditorV6NativeFramePlan({
      scene: scene(body.id), assets: [body], resolveAssetById: id => id === body.id ? body : undefined,
      rasterCanvases: new Map(), frame: 12, width: 4, height: 2, layer: 'all'
    })

    expect(plan.assets).toEqual([{ id: body.id, dataUrl: body.dataUrl, lifetime: 'process' }])
  })
})
