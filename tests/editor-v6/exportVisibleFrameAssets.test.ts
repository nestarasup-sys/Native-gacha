import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EditorV6Asset, EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
import { SceneSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'
import { composeEditorV6FaceReplacements } from '../../src/renderer/src/features/editorV6/sceneFaceComposition'
import { createEditorV6FrameAssetRegistry, selectEditorV6RenderableAssets } from '../../src/renderer/src/features/editorV6/exportFrameAssets'

const asset = (id: string, category: 'background' | 'character' = 'character'): EditorV6Asset => ({
  id, name: id, category, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true
})
const scene = (): EditorV6ResolvedScene => ({
  frame: 12,
  background: { backgroundColor: '#fff', backgroundAssetId: 'bg', backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 },
  elements: [
    { id: 'actor', kind: 'character', text: 'Actor', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, assetId: 'base',
      mouthPatch: { assetId: 'mouth', x: 0.2, y: 0.3, width: 0.2, height: 0.2,
        sprite: { x: 0, y: 0, width: 10, height: 10, atlasWidth: 10, atlasHeight: 10 } } },
    { id: 'prop', kind: 'image', text: 'Prop', x: 20, y: 0, width: 15, height: 15, rotation: 0, zIndex: 2, assetId: 'prop' }
  ] as EditorV6Element[]
} as EditorV6ResolvedScene)

describe('Editor V6 export visible-asset scope', () => {
  it('renders identical SVG with the complete catalog or only visible assets, for all layers', () => {
    const frame = scene()
    const catalog = [asset('bg', 'background'), asset('base'), asset('mouth'), asset('prop'),
      ...Array.from({ length: 1_500 }, (_, i) => asset('unused-' + i))]
    const registry = createEditorV6FrameAssetRegistry(new Map(catalog.map(item => [item.id, item])), [])
    for (const layer of ['all', 'background', 'foreground'] as const) {
      const visible = selectEditorV6RenderableAssets(frame, layer, registry.resolve)
      const expectedIds = layer === 'background' ? ['bg'] : layer === 'foreground' ? ['base', 'mouth', 'prop'] : ['bg', 'base', 'mouth', 'prop']
      expect(visible.map(item => item.id)).toEqual(expectedIds)
      const full = renderToStaticMarkup(createElement(SceneSurface, { scene: frame, assets: catalog, renderLayer: layer }))
      const scoped = renderToStaticMarkup(createElement(SceneSurface, { scene: frame, assets: visible, renderLayer: layer }))
      expect(scoped).toBe(full)
    }
  })

  it('prefers same-id frame replacement over the original, deduplicates and ignores missing assets', () => {
    const original = asset('base'), replacement = { ...asset('base'), dataUrl: 'data:image/png;base64,AQ==' }
    const stored = new Map([['base', original], ['bg', asset('bg', 'background')]])
    const registry = createEditorV6FrameAssetRegistry(stored, [replacement])
    const frame = scene()
    frame.elements.push({ ...frame.elements[0], id: 'second', mouthPatch: undefined })
    const selected = selectEditorV6RenderableAssets(frame, 'all', registry.resolve)
    expect(selected.map(item => item.id)).toEqual(['bg', 'base'])
    expect(selected[1]).toBe(replacement)
    expect(stored.get('base')).toBe(original)
  })

  it('returns only additions to export workers while keeping the legacy full catalog contract', async () => {
    const catalog = [asset('base'), asset('bg', 'background')]
    const input = { elements: [] as EditorV6Element[] }
    const index = new Map(catalog.map(item => [item.id, item]))
    const lean = await composeEditorV6FaceReplacements(input, catalog, { assetIndex: index, additionsOnly: true })
    const legacy = await composeEditorV6FaceReplacements(input, catalog)
    expect(lean.scene).toBe(input)
    expect(lean.assets).toEqual([])
    expect(legacy.assets).toEqual(catalog)
    expect(catalog.map(item => item.id)).toEqual(['base', 'bg'])
  })
})
