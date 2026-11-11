import type { EditorV6Asset } from '../../../../../shared/editorV6'
import type { EditorV6MotionAtlas, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { chooseMotionAtlasLayout } from './motionAtlasLayout'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type IsolatedMouthPatch = { canvas: HTMLCanvasElement; crop: MotionPixelCrop }

export type IsolatedMouthAtlasResult = {
  atlas: HTMLCanvasElement
  asset: EditorV6Asset
  motion: EditorV6MotionAtlas
  atlasPixels: number
}

type BuildIsolatedMouthAtlasOptions = {
  patches: IsolatedMouthPatch[]
  sampleOffsets: number[]
  sourceCrop: MotionPixelCrop
  key: string
  rotation: number
  flipX: boolean
  maxAtlasPixels?: number
  createCanvas?: () => HTMLCanvasElement
  createId?: () => string
}

/** Packs isolated mouth samples and writes their normalized face-patch metadata. */
export function buildEditorV6IsolatedMouthAtlas({
  patches,
  sampleOffsets,
  sourceCrop,
  key,
  rotation,
  flipX,
  maxAtlasPixels = 8_000_000,
  createCanvas = () => document.createElement('canvas'),
  createId = () => crypto.randomUUID()
}: BuildIsolatedMouthAtlasOptions): IsolatedMouthAtlasResult {
  const count = sampleOffsets.length, gutter = 2
  const cellWidth = Math.max(...patches.map(patch => patch.canvas.width))
  const cellHeight = Math.max(...patches.map(patch => patch.canvas.height))
  const layout = chooseMotionAtlasLayout(count, cellWidth, cellHeight, 8192, Math.min(8_000_000, maxAtlasPixels))
  if (layout.ratio < 1) throw Error(`A camada facial em resolução nativa precisa de ${layout.pixels.toLocaleString('pt-BR')} pixels e excede o limite seguro; reduza o número de personagens falando simultaneamente neste trecho.`)

  const { columns, width: atlasWidth, height: atlasHeight, pixels: atlasPixels } = layout
  const atlas = createCanvas()
  atlas.width = atlasWidth
  atlas.height = atlasHeight
  try {
    const context = atlas.getContext('2d')!
    const frames: EditorV6MotionFrame[] = []
    for (const [index, offset] of sampleOffsets.entries()) {
      const patch = patches[index]
      if (!patch) throw Error('O ciclo de fala não contém uma amostra isolada da boca.')
      const cellX = index % columns * cellWidth, cellY = Math.floor(index / columns) * cellHeight
      const spriteX = cellX + gutter, spriteY = cellY + gutter
      const mouthCrop = patch.crop
      const x = (mouthCrop.left - sourceCrop.left) / sourceCrop.width, y = (mouthCrop.top - sourceCrop.top) / sourceCrop.height
      const width = mouthCrop.width / sourceCrop.width, height = mouthCrop.height / sourceCrop.height
      if (x < -0.000001 || y < -0.000001 || x + width > 1.000001 || y + height > 1.000001) throw Error('A boca isolada ficou fora do recorte corporal usado pelo personagem.')
      context.drawImage(patch.canvas, cellX, cellY)
      const sprite = { x: spriteX, y: spriteY, width: mouthCrop.width, height: mouthCrop.height, atlasWidth, atlasHeight }
      const normalizedX = Math.max(0, x)
      frames.push({ offset, sprite, x: normalizedX, y: Math.max(0, y), width, height, rotation, flipX, facePatch: { sprite, x: normalizedX, y: Math.max(0, y), width, height } })
    }

    const assetId = createId()
    const asset: EditorV6Asset = {
      id: assetId,
      category: 'character',
      name: 'Atlas isolado da boca',
      mimeType: 'image/png',
      dataUrl: atlas.toDataURL('image/png'),
      timelineSnapshot: true
    }
    return { atlas, asset, motion: { version: 1, key, assetId, frames }, atlasPixels }
  } catch (error) {
    atlas.width = atlas.height = 1
    throw error
  }
}
