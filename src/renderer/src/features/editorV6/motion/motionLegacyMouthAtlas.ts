import type { EditorV6Asset, EditorV6Element, EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionAtlas, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { chooseMotionAtlasLayout } from './motionAtlasLayout'
import { createChangedMotionPixelPatch } from './motionCanvasRegions'
import { normalizedMotionReplacementBounds, type MotionPixelBounds, type MotionPixelCrop } from './motionPixelAnalysis'

export type LegacyMouthFrame = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  dispose: () => void
}

type BuildLegacyMouthAtlasOptions<Frame extends LegacyMouthFrame> = {
  sourceCrop: MotionPixelCrop
  changedBounds: MotionPixelBounds
  samples: Array<{ offset: number; faceMode?: EditorV6FaceRenderMode }>
  scales: number[]
  from: Pick<EditorV6Element, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'>
  key: string
  maxAtlasPixels?: number
  render: (faceMode: EditorV6FaceRenderMode | undefined, mouthScale: number) => Promise<Frame>
  createCanvas?: () => HTMLCanvasElement
  createPatch?: typeof createChangedMotionPixelPatch
  createId?: () => string
}

export type LegacyMouthAtlasResult = {
  atlas: HTMLCanvasElement
  asset: EditorV6Asset
  motion: EditorV6MotionAtlas
  atlasPixels: number
}

/** Builds the legacy changed-pixel mouth atlas and owns its rendered frame patches. */
export async function buildEditorV6LegacyMouthAtlas<Frame extends LegacyMouthFrame>({
  sourceCrop,
  changedBounds,
  samples,
  scales,
  from,
  key,
  maxAtlasPixels = 8_000_000,
  render,
  createCanvas = () => document.createElement('canvas'),
  createPatch = createChangedMotionPixelPatch,
  createId = () => crypto.randomUUID()
}: BuildLegacyMouthAtlasOptions<Frame>): Promise<LegacyMouthAtlasResult> {
  const padding = 3
  const left = Math.max(sourceCrop.left, changedBounds.left - padding), top = Math.max(sourceCrop.top, changedBounds.top - padding)
  const right = Math.min(sourceCrop.left + sourceCrop.width - 1, changedBounds.right + padding), bottom = Math.min(sourceCrop.top + sourceCrop.height - 1, changedBounds.bottom + padding)
  const patchWidth = right - left + 1, patchHeight = bottom - top + 1
  const count = samples.length, gutter = 2
  const cellWidth = patchWidth + gutter * 2, cellHeight = patchHeight + gutter * 2
  const layout = chooseMotionAtlasLayout(count, cellWidth, cellHeight, 8192, Math.min(8_000_000, maxAtlasPixels))
  if (layout.ratio < 1) throw Error(`A camada facial em resolução nativa precisa de ${layout.pixels.toLocaleString('pt-BR')} pixels e excede o limite seguro; reduza o número de personagens falando simultaneamente neste trecho.`)

  const { columns, width: atlasWidth, height: atlasHeight, pixels: atlasPixels } = layout
  const atlas = createCanvas()
  atlas.width = atlasWidth
  atlas.height = atlasHeight
  try {
    const context = atlas.getContext('2d')!
    const x = (left - sourceCrop.left) / sourceCrop.width, y = (top - sourceCrop.top) / sourceCrop.height
    const width = patchWidth / sourceCrop.width, height = patchHeight / sourceCrop.height
    if (x < 0 || y < 0 || x + width > 1.000001 || y + height > 1.000001) throw Error('A região facial não cabe no recorte original do personagem.')
    const frames: EditorV6MotionFrame[] = []
    for (const [index, sample] of samples.entries()) {
      const frame = await render(sample.faceMode, scales[index] ?? 1)
      let patchCanvas: HTMLCanvasElement | undefined
      try {
        const cellX = index % columns * cellWidth, cellY = Math.floor(index / columns) * cellHeight
        const spriteX = cellX + gutter, spriteY = cellY + gutter
        patchCanvas = createPatch(frame.canvas, { left, top, right, bottom })
        context.drawImage(patchCanvas, cellX, cellY)
        const sprite = { x: spriteX, y: spriteY, width: patchWidth, height: patchHeight, atlasWidth, atlasHeight }
        frames.push({
          offset: sample.offset,
          sprite,
          x: from.x,
          y: from.y,
          width: from.width,
          height: from.height,
          rotation: from.rotation,
          flipX: Boolean(from.flipX),
          facePatch: { sprite: { ...sprite }, x, y, width, height, replace: true, replaceBounds: normalizedMotionReplacementBounds(changedBounds, { left, top, right, bottom }) }
        })
      } finally {
        if (patchCanvas) { patchCanvas.width = 1; patchCanvas.height = 1 }
        frame.dispose()
      }
    }

    const assetId = createId()
    const dataUrl = atlas.toDataURL('image/png')
    atlas.width = atlas.height = 1
    const asset: EditorV6Asset = {
      id: assetId,
      category: 'character',
      name: 'Camada facial da boca',
      mimeType: 'image/png',
      dataUrl,
      timelineSnapshot: true
    }
    return { atlas, asset, motion: { version: 1, key, assetId, frames }, atlasPixels }
  } catch (error) {
    atlas.width = atlas.height = 1
    throw error
  }
}
