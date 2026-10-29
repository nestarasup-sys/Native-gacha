import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceExpressionEffects } from '../../../../shared/fabricator'
import type { TrimmedImage } from '../../characters/characterGeometry'

export const EDITOR_V6_FACE_RENDER_VERSION = 8
const AUTO_FACE_MODES: EditorV6FaceRenderMode[] = ['idle', 'blink', 'talk', 'talk-blink']
export type PreparedEditorV6FaceRenderer = Awaited<ReturnType<typeof import('../../characters/editorV6CharacterRenderer').prepareSavedCharacterRenderer>>

export { sceneFaceModeForElement as editorV6FaceModeForElement } from '../../characters/sceneFaceMode.ts'

export function trimTransparentCanvas(source: HTMLCanvasElement): TrimmedImage | null {
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context || !source.width || !source.height) return null
  let pixels: Uint8ClampedArray
  try { pixels = context.getImageData(0, 0, source.width, source.height).data } catch { return null }
  let left = source.width, top = source.height, right = -1, bottom = -1
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    if (pixels[(y * source.width + x) * 4 + 3] <= 8) continue
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
  if (right < left || bottom < top) return null
  const width = right - left + 1
  const height = bottom - top + 1
  if (left === 0 && top === 0 && width === source.width && height === source.height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context2d = canvas.getContext('2d')
  if (!context2d) return null
  context2d.drawImage(source, left, top, width, height, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/png'), width, height, left, top, sourceWidth: source.width, sourceHeight: source.height }
}

function cropCharacterCanvas(source: HTMLCanvasElement, crop: TrimmedImage | null): string {
  if (!crop) return source.toDataURL('image/png')
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar uma imagem facial para o Editor V6.')
  context.drawImage(source, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return canvas.toDataURL('image/png')
}

/** Render each face variant directly from the reusable Canvas, avoiding full-size PNG decode/re-encode passes. */
export async function bakeFaceModeAssets(
  name: string,
  renderer: PreparedEditorV6FaceRenderer,
  appearance: CustomizerFaceAppearance | undefined,
  transforms: EditorV6FaceTransforms | undefined,
  effects: FaceExpressionEffects | undefined,
  baseMode: EditorV6FaceRenderMode,
  baseRendered?: { canvas: HTMLCanvasElement; width: number; height: number }
): Promise<{ dataUrl: string; crop: TrimmedImage | null; assetIds: Partial<Record<EditorV6FaceRenderMode, string>>; extraAssets: EditorV6Asset[] }> {
  let base: { canvas: HTMLCanvasElement; width: number; height: number }
  try { base = baseRendered ?? await renderer.renderToCanvas(appearance, transforms, effects, baseMode) }
  catch { throw new Error(`Não foi possível renderizar a expressão ${baseMode} de ${name}.`) }
  const crop = trimTransparentCanvas(base.canvas)
  const dataUrl = crop?.dataUrl ?? base.canvas.toDataURL('image/png')
  const assetIds: Partial<Record<EditorV6FaceRenderMode, string>> = {}
  const extraAssets: EditorV6Asset[] = []
  for (const mode of AUTO_FACE_MODES) {
    if (mode === baseMode) continue
    try {
      const frame = await renderer.renderToCanvas(appearance, transforms, effects, mode)
      const id = crypto.randomUUID()
      assetIds[mode] = id
      extraAssets.push({ id, category: 'character', name: `${name} · ${mode}`, mimeType: 'image/png', dataUrl: cropCharacterCanvas(frame.canvas, crop), timelineSnapshot: true })
    } catch { /* The character may not have a compatible blink or open-mouth asset. */ }
  }
  return { dataUrl, crop, assetIds, extraAssets }
}
