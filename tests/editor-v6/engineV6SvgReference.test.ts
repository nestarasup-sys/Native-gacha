import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { resolveEditorV6SceneAtFrame, type EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { materializeEngineV6LegacyFrame, planEngineV6ResolvedScene } from '../../src/engine-v6/v6FrameAdapter'

const { renderOfflineFrame } = createRequire(import.meta.url)('../../scripts/editor-v6/engine-v3/offlineCompositor.cjs') as {
  renderOfflineFrame: (plan: ReturnType<typeof materializeEngineV6LegacyFrame>) => Promise<Buffer>
}

/**
 * Independent SVG reference from the current V6 SceneSurface, rasterized by
 * librsvg/Sharp. This is NOT a Chromium pixel golden, and is deliberately
 * limited to unanimated geometry supported by both paths.
 */
const SIZE = { width: 64, height: 36 }
function at(buffer: Buffer, x: number, y: number): number[] {
  const offset = (y * SIZE.width + x) * 4
  return [...buffer.subarray(offset, offset + 4)]
}
function maxDifference(a: number[], b: number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])))
}
async function png(id: string, pixels: number[], w = 1, h = 1): Promise<EditorV6Asset> {
  const bytes = await sharp(Buffer.from(pixels), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  return { id, category: 'character', name: id, mimeType: 'image/png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
}
function actor(id: string, assetId: string, properties: Partial<EditorV6Element> = {}): EditorV6Element {
  return { id, kind: 'character', characterId: id, assetId, text: id, x: 0, y: 0,
    width: 50, height: 50, zIndex: 1, rotation: 0, ...properties }
}
function doc(elements: EditorV6Element[], assets: EditorV6Asset[]): EditorV6Document {
  return {
    schemaVersion: 1, id: 'svg-reference-v6', title: 'Engine V6 SVG reference',
    color: '#888888', createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
    backgroundColor: '#203040', backgroundAssetId: null, backgroundX: 0,
    backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, assets, elements, timeline: createEditorV6Timeline(elements)
  }
}
async function compareScene(project: EditorV6Document, scene: EditorV6ResolvedScene, layer: 'all' | 'background' | 'foreground' = 'all') {
  const svg = renderToStaticMarkup(createElement(SceneSurface, {
    scene, assets: project.assets, outputWidth: SIZE.width, outputHeight: SIZE.height, renderLayer: layer
  }))
  // Sharp's SVG input uses librsvg here; it is only an independent 2D layout oracle.
  const reference = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(reference.info.width).toBe(SIZE.width)
  expect(reference.info.height).toBe(SIZE.height)
  const ir = planEngineV6ResolvedScene(project, scene, { ...SIZE, layer })
  const output = await renderOfflineFrame(materializeEngineV6LegacyFrame(project, ir))
  expect(output.length).toBe(reference.data.length)
  return { reference: reference.data, output, svg, ir }
}

describe('Engine V6 — independent SceneSurface SVG reference, not Chromium golden', () => {
  it('matches opaque background and character interiors with two authored z-layers', async () => {
    const red = await png('red', [230, 35, 45, 255])
    const green = await png('green', [35, 205, 95, 255])
    const elements = [
      actor('behind', 'red', { width: 65, height: 65, zIndex: 1 }),
      actor('in-front', 'green', { width: 25, height: 25, x: 10, zIndex: 2 })
    ]
    const project = doc(elements, [red, green])
    const { reference, output } = await compareScene(project, resolveEditorV6SceneAtFrame(project, 0))
    for (const [x, y] of [[0, 0], [32, 18], [35, 18], [23, 18], [49, 27]] as const) {
      expect(maxDifference(at(reference, x, y), at(output, x, y))).toBeLessThanOrEqual(2)
    }
    expect(at(output, 0, 0)).toEqual([32, 48, 64, 255])
    expect(at(output, 35, 18)).toEqual([35, 205, 95, 255])
  })

  it('preserves reference alpha for independent foreground-only output', async () => {
    const red = await png('red', [240, 40, 15, 128])
    const project = doc([actor('solo', 'red', { width: 60, height: 60 })], [red])
    const { reference, output, ir } = await compareScene(project, resolveEditorV6SceneAtFrame(project, 0), 'foreground')
    expect(ir.backgroundColor).toBe('transparent')
    expect(maxDifference(at(reference, 32, 18), at(output, 32, 18))).toBeLessThanOrEqual(3)
    expect(at(output, 0, 0)[3]).toBe(0)
    expect(at(output, 32, 18)[3]).toBeGreaterThanOrEqual(127)
  })

  it('honors the same motion atlas crop at the interior of an authored V6 element', async () => {
    const atlas = await png('atlas', [255, 0, 0, 255, 0, 255, 0, 255], 2, 1)
    const project = doc([actor('sprite', 'atlas', { width: 60, height: 60 })], [atlas])
    const scene = resolveEditorV6SceneAtFrame(project, 0)
    const cropped: EditorV6ResolvedScene = { ...scene, elements: [{
      ...scene.elements[0], motionSprite: { x: 1, y: 0, width: 1, height: 1, atlasWidth: 2, atlasHeight: 1 }
    }] }
    const { reference, output } = await compareScene(project, cropped)
    expect(maxDifference(at(reference, 32, 18), at(output, 32, 18))).toBeLessThanOrEqual(3)
    expect(at(output, 32, 18)).toEqual([0, 255, 0, 255])
  })

  it('maintains a stable result for exact seek and split on the same V6 frame', async () => {
    const red = await png('red', [212, 34, 90, 255])
    const project = doc([actor('solo', 'red', { width: 36, height: 50 })], [red])
    const scene = resolveEditorV6SceneAtFrame(project, 20)
    const a = await compareScene(project, scene)
    const b = await compareScene(project, scene)
    expect(a.output.equals(b.output)).toBe(true)
    expect(a.ir).toEqual(b.ir)
  })
})
