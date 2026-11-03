import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceExpressionEffects } from '../../../../shared/fabricator'
import type { TrimmedImage } from '../../characters/transparentImageTrim'

// Version 9 rebuilds snapshots made by the refresh path that applied body
// dimensions twice to characters with customized proportions.
export const EDITOR_V6_FACE_RENDER_VERSION = 10
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

async function forEachFaceMode(
  name: string, renderer: PreparedEditorV6FaceRenderer, appearance: CustomizerFaceAppearance | undefined,
  transforms: EditorV6FaceTransforms | undefined, effects: FaceExpressionEffects | undefined,
  baseMode: EditorV6FaceRenderMode, baseRendered: { canvas: HTMLCanvasElement; width: number; height: number } | undefined,
  visit: (mode: EditorV6FaceRenderMode, canvas: HTMLCanvasElement) => void
) {
  let base: { canvas: HTMLCanvasElement; width: number; height: number }
  try { base = baseRendered ?? await renderer.renderToCanvas(appearance, transforms, effects, baseMode) }
  catch { throw new Error(`Não foi possível renderizar a expressão ${baseMode} de ${name}.`) }
  visit(baseMode, base.canvas)
  for (const mode of AUTO_FACE_MODES) {
    if (mode === baseMode) continue
    try {
      const frame = await renderer.renderToCanvas(appearance, transforms, effects, mode)
      visit(mode, frame.canvas)
    } catch (error) {
      const missingBlink = error instanceof Error && error.message.includes('Selecione olhos do catálogo ou assets de Olhos Dev')
      if ((mode === 'blink' || mode === 'talk-blink') && missingBlink) continue
      throw error
    }
  }
}

/** Measure the exact union used by saved face snapshots without encoding each variant. */
export async function measureFaceModeCrop(
  name: string, renderer: PreparedEditorV6FaceRenderer, appearance: CustomizerFaceAppearance | undefined,
  transforms: EditorV6FaceTransforms | undefined, effects: FaceExpressionEffects | undefined,
  baseMode: EditorV6FaceRenderMode, baseRendered?: { canvas: HTMLCanvasElement; width: number; height: number }
): Promise<Pick<TrimmedImage, 'left' | 'top' | 'width' | 'height'> | null> {
  let union: HTMLCanvasElement | undefined
  try {
    await forEachFaceMode(name, renderer, appearance, transforms, effects, baseMode, baseRendered, (_mode, frame) => {
      if (!union || frame.width > union.width || frame.height > union.height) {
        const expanded = document.createElement('canvas')
        expanded.width = Math.max(union?.width ?? 0, frame.width); expanded.height = Math.max(union?.height ?? 0, frame.height)
        if (union) { expanded.getContext('2d')!.drawImage(union, 0, 0); union.width = union.height = 1 }
        union = expanded
      }
      const context = union.getContext('2d')
      if (!context) throw new Error(`Não foi possível medir as variantes de ${name}.`)
      context.drawImage(frame, 0, 0)
    })
    const crop = union ? trimTransparentCanvas(union) : null
    return crop ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height } : null
  } finally { if (union) union.width = union.height = 1 }
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
  // The renderer reuses its canvas. Retain each mode before rendering the next,
  // and use their union so an open mouth or blink cannot be clipped by idle.
  const frames = new Map<EditorV6FaceRenderMode, HTMLCanvasElement>()
  const retain = (mode: EditorV6FaceRenderMode, source: HTMLCanvasElement) => {
    const copy = document.createElement('canvas')
    copy.width = source.width; copy.height = source.height
    const context = copy.getContext('2d')
    if (!context) throw new Error(`Não foi possível preparar as variantes de ${name}.`)
    context.drawImage(source, 0, 0)
    frames.set(mode, copy)
  }
  try {
    await forEachFaceMode(name, renderer, appearance, transforms, effects, baseMode, baseRendered, retain)
    const union = document.createElement('canvas')
    union.width = Math.max(...[...frames.values()].map(frame => frame.width))
    union.height = Math.max(...[...frames.values()].map(frame => frame.height))
    const context = union.getContext('2d')
    if (!context) throw new Error(`Não foi possível medir as variantes de ${name}.`)
    for (const frame of frames.values()) context.drawImage(frame, 0, 0)
    const crop = trimTransparentCanvas(union)
    const dataUrl = cropCharacterCanvas(frames.get(baseMode)!, crop)
    if (crop) crop.dataUrl = dataUrl
    const assetIds: Partial<Record<EditorV6FaceRenderMode, string>> = {}
    const extraAssets: EditorV6Asset[] = []
    for (const [mode, frame] of frames) {
      if (mode === baseMode) continue
      const id = crypto.randomUUID()
      assetIds[mode] = id
      extraAssets.push({ id, category: 'character', name: `${name} · ${mode}`, mimeType: 'image/png', dataUrl: cropCharacterCanvas(frame, crop), timelineSnapshot: true })
    }
    union.width = union.height = 1
    return { dataUrl, crop, assetIds, extraAssets }
  } finally {
    for (const frame of frames.values()) frame.width = frame.height = 1
  }
}
