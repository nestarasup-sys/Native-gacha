type RenderLayer = 'background' | 'foreground' | undefined
type LayerVisualKeys = { background: string; foreground: string }
type ReuseDecision = 'frame' | 'background' | 'foreground' | null

/** Tracks full-frame and layered-capture reuse without changing render keys or ordering. */
export function createEditorV6ExportFrameReuseState() {
  let previous = ''
  let previousBackground = ''
  let previousForeground = ''

  const decide = (key: string, activeLayer: RenderLayer, layerKeys: LayerVisualKeys): ReuseDecision => {
    if (key === previous) return 'frame'
    if (activeLayer === 'background' && layerKeys.background === previousBackground) return 'background'
    if (activeLayer === 'foreground' && layerKeys.foreground === previousForeground) {
      previous = key
      return 'foreground'
    }
    return null
  }

  const recordRendered = (key: string, layerKeys: LayerVisualKeys, activeLayer: RenderLayer) => {
    if (activeLayer === 'background') previousBackground = layerKeys.background
    else if (activeLayer === 'foreground') { previousForeground = layerKeys.foreground; previous = key }
    else { previousBackground = layerKeys.background; previousForeground = layerKeys.foreground; previous = key }
  }

  return { decide, recordRendered }
}
