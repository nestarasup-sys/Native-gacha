import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EditorV6Asset, EditorV6SceneElement } from '../../src/shared/editorV6'
import { SceneImageContent } from '../../src/renderer/src/features/editorV6/SceneImageContent'

const asset = (id: string): EditorV6Asset => ({ id, name: id, dataUrl: `data:${id}` } as EditorV6Asset)

function render(elementOverrides: Partial<EditorV6SceneElement> = {}, options: { asset?: EditorV6Asset; mouthAsset?: EditorV6Asset; rasterCanvas?: HTMLCanvasElement } = {}) {
  const element: EditorV6SceneElement = {
    id: 'actor:face', kind: 'character', text: '', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 0,
    ...elementOverrides
  }
  return renderToStaticMarkup(createElement('svg', null, createElement(SceneImageContent, {
    element, width: 200, height: 100, asset: options.asset ?? asset('body'), mouthAsset: options.mouthAsset,
    rasterCanvas: options.rasterCanvas, rasterFrame: 13
  })))
}

describe('conteúdo de imagem da cena do Editor V6', () => {
  it('preserves character sizing, image fitting and horizontal flip', () => {
    const character = render({ flipX: true })
    expect(character).toContain('transform="scale(-1 1)"')
    expect(character).toContain('preserveAspectRatio="none"')

    const image = render({ kind: 'image' })
    expect(image).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('uses the motion sprite crop over the full atlas dimensions', () => {
    const html = render({ motionSprite: { x: 12, y: 18, width: 40, height: 60, atlasWidth: 512, atlasHeight: 768 } })
    expect(html).toContain('viewBox="12 18 40 60"')
    expect(html).toContain('width="512" height="768"')
    expect(html).toContain('href="data:body"')
  })

  it('keeps the replacement mask and mouth atlas overlay in the same local bounds', () => {
    const mouthPatch = {
      assetId: 'mouth', x: 0.2, y: 0.3, width: 0.2, height: 0.2, replace: true,
      replaceBounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      sprite: { x: 3, y: 4, width: 10, height: 12, atlasWidth: 256, atlasHeight: 512 }
    }
    const html = render({ mouthPatch } as Partial<EditorV6SceneElement>, { mouthAsset: asset('mouth') })
    expect(html).toContain('id="v6-face-replacement-actor_face"')
    expect(html).toContain('mask="url(#v6-face-replacement-actor_face)"')
    expect(html).toContain('viewBox="3 4 10 12"')
    expect(html).toContain('x="-60" y="-20" width="40" height="20"')
    expect(html).toContain('href="data:mouth"')
  })

  it('mounts an export raster canvas within the SVG foreign object', () => {
    const canvas = { style: {} } as HTMLCanvasElement
    const html = render({}, { rasterCanvas: canvas })
    expect(html).toContain('<foreignObject')
    expect(html).toContain('<div style="width:100%;height:100%;overflow:hidden"></div>')
  })
})
