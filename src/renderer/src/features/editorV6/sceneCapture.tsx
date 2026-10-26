import { renderToStaticMarkup } from 'react-dom/server'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6Timeline'
import { SceneSurface } from './SceneSurface'
import { editorV6VisualKey } from '../../../../shared/editorV6Export'

export function renderEditorV6FrameSvg(document: EditorV6Document, frame: number, width = 1920, height = 1080): string {
  return renderToStaticMarkup(<SceneSurface scene={resolveEditorV6SceneAtFrame(document, frame)} assets={document.assets} outputWidth={width} outputHeight={height} />)
}

/** Capture waits for image preparation. It never advances a real-time playback clock. */
export async function captureEditorV6Frame(project: EditorV6Document, frame: number, width = 1920, height = 1080, mimeType = 'image/png'): Promise<string> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 7680 || height > 4320) throw new Error('Dimensões de captura inválidas.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a captura da cena.')
  const svg = renderEditorV6FrameSvg(project, frame, width, height)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Uma imagem da cena não pôde ser preparada para a captura.'))
      image.src = url
    })
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? .78 : undefined)
  } finally { URL.revokeObjectURL(url) }
}

/** Sequential capture foundation for an encoder: static scenes reuse the prepared image. */
export async function* captureEditorV6Frames(project: EditorV6Document, options: { startFrame?: number; endFrame?: number; width?: number; height?: number; signal?: AbortSignal } = {}): AsyncGenerator<{ frame: number; dataUrl: string }> {
  const start = Math.max(0, Math.round(options.startFrame ?? 0)), end = Math.min(project.timeline.durationFrames, Math.round(options.endFrame ?? project.timeline.durationFrames))
  let previousKey = '', previousImage = ''
  for (let frame = start; frame < end; frame++) {
    options.signal?.throwIfAborted()
    const scene = resolveEditorV6SceneAtFrame(project, frame)
    const key = editorV6VisualKey(scene)
    if (key !== previousKey || !previousImage) {
      previousImage = await captureEditorV6Frame(project, frame, options.width ?? 1920, options.height ?? 1080)
      previousKey = key
    }
    options.signal?.throwIfAborted()
    yield { frame, dataUrl: previousImage }
  }
}
