import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditorV6StackedExportSurface } from '../../src/renderer/src/features/editorV6/exportStackedSceneSurface'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'

describe('stacked Editor V6 offscreen scene', () => {
  it('places an opaque background above a transparent foreground at exact frame boundaries', () => {
    const scene = {
      frame: 7,
      background: {
        backgroundColor: '#123456', backgroundAssetId: null,
        backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
      },
      elements: []
    } as EditorV6ResolvedScene
    const html = renderToStaticMarkup(createElement(EditorV6StackedExportSurface, {
      scene, assets: [], outputWidth: 320, outputHeight: 180
    }))
    expect(html).toContain('width:320px;height:360px')
    expect((html.match(/<svg /g) ?? [])).toHaveLength(2)
    expect((html.match(/height:180px/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((html.match(/fill="#123456"/g) ?? [])).toHaveLength(1)
    expect((html.match(/data-frame="7"/g) ?? [])).toHaveLength(2)
  })
})
