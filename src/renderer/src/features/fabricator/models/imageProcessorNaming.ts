export type ImportedModelBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ImportedModelPartNamingInput = {
  partBounds: ImportedModelBounds
  sourceWidth: number
  sourceHeight: number
  foregroundBounds: ImportedModelBounds
  componentPixelCount: number
  foregroundPixelCount: number
}

/** Name automatically separated model parts while keeping small ears out of the head slot. */
export function inferImportedModelPartName(input: ImportedModelPartNamingInput): string {
  const { partBounds, sourceWidth, sourceHeight, foregroundBounds } = input
  const centerX = (partBounds.minX + partBounds.maxX) / 2 / sourceWidth
  const centerY = (partBounds.minY + partBounds.maxY) / 2 / sourceHeight

  if (centerY < 0.27) {
    if (isSmallUpperSideComponent(input)) {
      const foregroundCenterX = (foregroundBounds.minX + foregroundBounds.maxX) / 2
      return `Orelha ${(partBounds.minX + partBounds.maxX) / 2 < foregroundCenterX ? 'esquerda' : 'direita'}`
    }
    return 'Cabeça'
  }
  if (centerY > 0.70) return `Canela ${centerX < 0.5 ? 'esquerda' : 'direita'}`
  if (centerY > 0.52) return `Coxa ${centerX < 0.5 ? 'esquerda' : 'direita'}`
  if (centerY > 0.23 && centerY < 0.52 && centerX > 0.31 && centerX < 0.69) return 'Tronco'
  if (centerX < 0.35 || centerX > 0.65) return centerY < 0.40 ? `Braço ${centerX < 0.5 ? 'esquerdo' : 'direito'}` : `Antebraço ${centerX < 0.5 ? 'esquerdo' : 'direito'}`
  return 'Peça do modelo'
}

function isSmallUpperSideComponent(input: ImportedModelPartNamingInput): boolean {
  const { partBounds, foregroundBounds, componentPixelCount, foregroundPixelCount } = input
  if (foregroundPixelCount <= 0) return false

  const foregroundWidth = Math.max(1, foregroundBounds.maxX - foregroundBounds.minX + 1)
  const foregroundHeight = Math.max(1, foregroundBounds.maxY - foregroundBounds.minY + 1)
  const partWidth = partBounds.maxX - partBounds.minX + 1
  const partHeight = partBounds.maxY - partBounds.minY + 1
  const partCenterX = (partBounds.minX + partBounds.maxX) / 2
  const relativeCenterX = (partCenterX - foregroundBounds.minX) / foregroundWidth

  const isUpperSide = relativeCenterX < 0.42 || relativeCenterX > 0.58
  const isSmall = partWidth / foregroundWidth <= 0.14
    && partHeight / foregroundHeight <= 0.18
    && componentPixelCount / foregroundPixelCount <= 0.025

  return isUpperSide && isSmall
}
