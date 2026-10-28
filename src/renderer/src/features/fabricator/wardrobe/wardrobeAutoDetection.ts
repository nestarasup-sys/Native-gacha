import type { FabricatorProject, ModelPart, WardrobeCategory, WardrobeComponent } from '../../../../../shared/fabricator'

export type WardrobeSheetBounds = { x: number; y: number; width: number; height: number }
type PieceGeometry = Pick<WardrobeComponent, 'x' | 'y' | 'width' | 'height'>

/** The incoming sheet convention reserves its upper band for head accessories. */
export const WARDROBE_ACCESSORY_BAND = 0.22

export function wardrobeSheetContentBounds(pieces: PieceGeometry[], imageWidth: number, imageHeight: number): WardrobeSheetBounds {
  const valid = pieces.filter((piece) => [piece.x, piece.y, piece.width, piece.height].every(Number.isFinite) && piece.width > 0 && piece.height > 0)
  if (!valid.length) return { x: 0, y: 0, width: imageWidth, height: imageHeight }
  const x = Math.min(...valid.map((piece) => piece.x))
  const y = Math.min(...valid.map((piece) => piece.y))
  const right = Math.max(...valid.map((piece) => piece.x + piece.width))
  const bottom = Math.max(...valid.map((piece) => piece.y + piece.height))
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

/** Classify by the visible sheet content, so arbitrary image margins do not shift the garment bands. */
export function guessWardrobeCategory(piece: PieceGeometry, bounds: WardrobeSheetBounds): WardrobeCategory {
  const centerX = (piece.x + piece.width / 2 - bounds.x) / bounds.width
  const centerY = (piece.y + piece.height / 2 - bounds.y) / bounds.height
  const aspect = piece.width / Math.max(1, piece.height)
  const relativeHeight = piece.height / bounds.height
  const relativeWidth = piece.width / bounds.width

  if (centerY <= WARDROBE_ACCESSORY_BAND) {
    // Only call a piece glasses when it is unmistakably long and thin. Hats,
    // bows and other wide accessories should remain generic head accessories.
    return aspect >= 2.4 && relativeHeight <= 0.1 ? 'oculos' : 'acessorio-cabeca'
  }

  const centered = centerX >= 0.31 && centerX <= 0.69
  // Position in the bottom band is a stronger clue than the shoe's orientation;
  // many Gacha shoes are tall, angled or nearly vertical.
  if (centerY >= 0.86) return 'sapato'
  if (centerY >= 0.76 && relativeHeight <= 0.18 && aspect < 0.8) return 'meia'

  if (centered) {
    if (centerY >= 0.3 && centerY <= 0.62 && aspect >= 2.4 && relativeHeight <= 0.1) return 'cinto'
    if (centerY < 0.5) return 'camisa'
    if (centerY < 0.66 && aspect >= 1.25 && relativeWidth >= 0.28 && relativeHeight <= 0.2) return 'shorts'
    if (centerX >= 0.4 && centerX <= 0.6 && centerY >= 0.6 && centerY < 0.84 && relativeWidth >= 0.34 && aspect >= 0.55) return 'saia'
    if (centerY < 0.70) return 'calca-coxa'
    return 'calca-canela'
  }

  if (centerY < 0.46) return 'manga-superior'
  if (centerY < 0.68) return 'manga-inferior'
  if (centerY < 0.78) return 'luvas'
  return 'calca-canela'
}

export function guessWardrobeName(category: WardrobeCategory, x: number, width: number): string {
  const side = x < width / 2 ? 'esquerda' : 'direita'
  if (category === 'camisa') return 'Camisa'
  if (category === 'jaqueta') return 'Jaqueta'
  if (category === 'capa') return 'Capa'
  if (category === 'cinto') return 'Cinto'
  if (category === 'oculos') return 'Óculos'
  if (category === 'acessorio-cabeca') return 'Acessório de cabeça'
  if (category === 'saia') return 'Saia'
  if (category === 'shorts') return 'Bermuda'
  if (category === 'meia') return `Meia ${side}`
  if (category === 'sapato') return `Sapato ${x < width / 2 ? 'esquerdo' : 'direito'}`
  if (category === 'luvas') return `Luvas ${side}`
  if (category === 'manga-superior') return `Manga superior ${side}`
  if (category === 'manga-inferior') return `Manga inferior ${side}`
  if (category === 'calca-coxa') return `Calça · coxa ${side}`
  return `Calça · canela ${side}`
}

export function guessWardrobeCategoryForBone(part: Pick<ModelPart, 'name'>, current: WardrobeCategory): WardrobeCategory | null {
  const name = part.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/antebraco|forearm|braco inferior|lower arm/.test(name)) return current === 'luvas' ? current : 'manga-inferior'
  if (/(^|\s)(mao|maos|hand|hands)(\s|$)/.test(name)) return 'luvas'
  if (/braco|upper arm/.test(name)) return current === 'luvas' ? current : 'manga-superior'
  if (/coxa|thigh/.test(name)) return current === 'shorts' ? current : 'calca-coxa'
  if (/canela|panturrilha|calf|shin|perna inferior|lower leg/.test(name)) {
    return current === 'meia' || current === 'sapato' ? current : 'calca-canela'
  }
  if (/(^|\s)(pe|pes|foot|feet)(\s|$)/.test(name)) return current === 'meia' ? current : 'sapato'
  if (/quadril|cintura|hip|waist/.test(name)) {
    return current === 'cinto' || current === 'saia' || current === 'shorts' ? current : 'cinto'
  }
  if (/tronco|corpo|torso|chest|peito/.test(name)) {
    return ['camisa', 'jaqueta', 'capa', 'cinto', 'saia'].includes(current) ? current : 'camisa'
  }
  if (/cabeca|head|face|rosto/.test(name)) {
    return current === 'oculos' || current === 'acessorio-cabeca' ? current : 'acessorio-cabeca'
  }
  return null
}

export function guessWardrobeNameForBone(category: WardrobeCategory, part: Pick<ModelPart, 'name' | 'x' | 'width' | 'sourceTransform'>, model: Pick<FabricatorProject, 'width'>): string {
  const label = part.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const centerX = (part.sourceTransform?.x ?? part.x) + (part.sourceTransform?.width ?? part.width) / 2
  const hasLeftSide = /esquerda|esquerdo|left/.test(label)
  const hasRightSide = /direita|direito|right/.test(label)
  const sideX = hasLeftSide ? 0 : hasRightSide ? model.width : centerX
  return guessWardrobeName(category, sideX, model.width)
}
