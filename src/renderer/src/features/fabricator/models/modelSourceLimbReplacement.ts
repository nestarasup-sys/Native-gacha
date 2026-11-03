import type { ModelPart } from '../../../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide } from '../../../../../shared/modelRig.ts'
import { loadImageFromDataUrl } from './imageData.ts'

type LimbFamily = 'arm' | 'leg'
type LimbDescriptor = { family: LimbFamily; segment: string; side: 'left' | 'right' }

function normalizedName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ')
}

function limbDescriptor(part: ModelPart): LimbDescriptor | null {
  const side = modelRigSide(part.name)
  if (!side) return null
  const kind = modelRigSegmentKind(part.name)
  if (kind === 'upper-arm' || kind === 'forearm') return { family: 'arm', segment: kind, side }
  if (kind === 'thigh' || kind === 'lower-leg') return { family: 'leg', segment: kind, side }
  if (kind === 'hand' || kind === 'foot' || kind === 'head') return null

  const name = normalizedName(part.name)
  if (/\b(perna|leg)\b/.test(name)) return { family: 'leg', segment: 'whole-leg', side }
  if (/\b(braco|arm)\b/.test(name)) return { family: 'arm', segment: 'upper-arm', side }
  return null
}

/** Return only a unique opposite-side piece of the same anatomical segment. */
export function findLimbReplacementTarget(parts: ModelPart[], source: ModelPart): ModelPart | null {
  const sourceLimb = limbDescriptor(source)
  if (!sourceLimb || !parts.some((part) => part.id === source.id)) return null
  const targetSide = sourceLimb.side === 'left' ? 'right' : 'left'
  const matches = parts.filter((part) => {
    if (part.id === source.id) return false
    const target = limbDescriptor(part)
    return target?.family === sourceLimb.family
      && target.segment === sourceLimb.segment
      && target.side === targetSide
  })
  return matches.length === 1 ? matches[0] : null
}

function mirroredImageDataUrl(image: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para copiar o membro para o lado oposto.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.translate(width, 0)
  context.scale(-1, 1)
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function mirroredContours(part: ModelPart): NonNullable<ModelPart['fakeSkinContours']> {
  return (part.fakeSkinContours ?? []).map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ x: 1 - point.x, y: point.y }))
  }))
}

export function applyMirroredLimbAssets(source: ModelPart, target: ModelPart, dataUrl: string, chromaBaseDataUrl: string): ModelPart {
  return {
    ...target,
    dataUrl,
    chromaBaseDataUrl,
    chromaBaseSaved: true,
    fakeSkinContours: mirroredContours(source)
  }
}

/** Copy the source pixels into the existing opposite-side frame, mirroring only the artwork. */
export async function replaceLimbPixelsFromOpposite(source: ModelPart, target: ModelPart): Promise<ModelPart> {
  if (findLimbReplacementTarget([source, target], source)?.id !== target.id) {
    throw new Error('As peças precisam ser o mesmo segmento anatômico em lados opostos.')
  }
  const [display, base] = await Promise.all([
    loadImageFromDataUrl(source.dataUrl, 'Não foi possível abrir a peça de origem.'),
    loadImageFromDataUrl(source.chromaBaseDataUrl ?? source.dataUrl, 'Não foi possível abrir a base de Chroma da peça de origem.')
  ])
  return applyMirroredLimbAssets(
    source,
    target,
    mirroredImageDataUrl(display, target.width, target.height),
    mirroredImageDataUrl(base, target.width, target.height)
  )
}
