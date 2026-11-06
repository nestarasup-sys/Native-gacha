import { createCanvas2dFrameSurface } from './canvas2dFrameSurface'
import { createReactSvgFrameSurface } from './reactSvgFrameSurface'
import type { EditorV6FrameSurface, EditorV6FrameSurfaceRequest, EditorV6FrameSurfaceTimings } from '../engine/frameSurface'

function makeLayer(width: number, height: number): HTMLDivElement {
  const layer = document.createElement('div')
  Object.assign(layer.style, { position: 'absolute', inset: '0', display: 'none', width: `${width}px`, height: `${height}px`, overflow: 'hidden' })
  return layer
}

/** Cold-benchmark adapter: use Canvas2D when it can represent the frame and SVG for embedded video. */
export function createCanvas2dWithSvgFallbackFrameSurface(rootElement: HTMLElement, width: number, height: number): EditorV6FrameSurface {
  Object.assign(rootElement.style, { position: 'relative', width: `${width}px`, height: `${height}px`, overflow: 'hidden' })
  const svgLayer = makeLayer(width, height)
  const canvasLayer = makeLayer(width, height)
  rootElement.replaceChildren(svgLayer, canvasLayer)

  const svgSurface = createReactSvgFrameSurface(svgLayer, width, height)
  const canvasSurface = createCanvas2dFrameSurface(canvasLayer, width, height)
  svgSurface.setActive(false)
  canvasSurface.setActive(false)

  let disposed = false
  let active = true
  let inFlight = false

  return {
    async present(request: EditorV6FrameSurfaceRequest): Promise<EditorV6FrameSurfaceTimings> {
      if (disposed) throw Error('A superfície adaptativa de cena já foi liberada.')
      if (!active) throw Error('A superfície adaptativa de cena está inativa.')
      if (inFlight) throw Error('A superfície adaptativa recebeu quadros concorrentes.')
      inFlight = true
      const useSvgFallback = Boolean(request.scene.mediaVideo)
      const selectedSurface = useSvgFallback ? svgSurface : canvasSurface
      svgLayer.style.display = useSvgFallback ? 'block' : 'none'
      canvasLayer.style.display = useSvgFallback ? 'none' : 'block'
      svgSurface.setActive(useSvgFallback)
      canvasSurface.setActive(!useSvgFallback)
      try {
        const timings = await selectedSurface.present(request)
        return { ...timings, surfaceMode: useSvgFallback ? 'svg-fallback' : 'canvas2d' }
      } finally {
        inFlight = false
      }
    },
    setActive(nextActive) {
      active = nextActive
      if (!active) {
        svgLayer.style.display = 'none'
        canvasLayer.style.display = 'none'
        svgSurface.setActive(false)
        canvasSurface.setActive(false)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      svgSurface.dispose()
      canvasSurface.dispose()
      rootElement.replaceChildren()
    }
  }
}
