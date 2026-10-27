import type { FabricatorProject, ModelPart, WardrobeCategory } from '../../../../../shared/fabricator'

type Point = { x: number; y: number }
export type WardrobeBoneSelection = {
  bone: ModelPart | null
  confidence: 'estimated' | 'missing'
  reason: string
}

function normalizedPartName(part: ModelPart): string {
  return `${part.name} ${part.id}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ')
}

function referenceCenter(part: ModelPart): Point {
  const frame = part.sourceTransform
  const x = frame?.x ?? part.x
  const y = frame?.y ?? part.y
  const width = frame?.width ?? part.width
  const height = frame?.height ?? part.height
  return { x: x + width / 2, y: y + height / 2 }
}

function isCenterCategory(category: WardrobeCategory): boolean {
  return ['camisa', 'jaqueta', 'capa', 'cinto', 'oculos', 'acessorio-cabeca', 'saia', 'shorts'].includes(category)
}

function semanticPattern(category: WardrobeCategory): RegExp | null {
  if (category === 'oculos' || category === 'acessorio-cabeca') return /cabeca|head|face|rosto/
  if (category === 'camisa' || category === 'jaqueta' || category === 'capa') return /tronco|corpo|torso|chest|peito|body/
  if (category === 'cinto' || category === 'saia' || category === 'shorts') return /quadril|cintura|hip|waist|pelvis|torso|tronco/
  if (category === 'manga-superior') return /braco|arm/ // forearms are excluded below when both are named.
  if (category === 'manga-inferior') return /antebraco|forearm|braco inferior|lower arm/
  if (category === 'luvas') return /mao|hand|antebraco|forearm|braco inferior|lower arm/
  if (category === 'calca-coxa') return /coxa|thigh|upper leg/
  if (category === 'calca-canela') return /canela|panturrilha|calf|shin|perna inferior|lower leg/
  if (category === 'meia') return /(?:^|\s)(?:pe|pes)(?:\s|$)|foot|feet|tornozelo|ankle|canela|shin|panturrilha|calf|lower leg/
  if (category === 'sapato') return /(?:^|\s)(?:pe|pes)(?:\s|$)|foot|feet|tornozelo|ankle/
  return null
}

function isCategoryPart(category: WardrobeCategory, part: ModelPart): boolean {
  const label = normalizedPartName(part)
  const pattern = semanticPattern(category)
  if (!pattern?.test(label)) return false
  if (category === 'manga-superior' && /antebraco|forearm|braco inferior|lower arm/.test(label)) return false
  return true
}

function partSide(part: ModelPart): 'left' | 'right' | null {
  const label = normalizedPartName(part)
  if (/esquerda|esquerdo|left|(^|[\s_-])esq(?=$|[\s_-])|(^|[\s_-])l(?=$|[\s_-])/.test(label)) return 'left'
  if (/direita|direito|right|(^|[\s_-])dir(?=$|[\s_-])|(^|[\s_-])r(?=$|[\s_-])/.test(label)) return 'right'
  return null
}

/**
 * Initial placement is only a suggestion. Prefer named bones for each garment
 * category, use source geometry as a tie-breaker, and never bind to an unrelated
 * part just because it is the nearest remaining item.
 */
export function suggestWardrobeBone(
  category: WardrobeCategory, componentCenterX: number, sheetWidth: number,
  model: Pick<FabricatorProject, 'width' | 'height' | 'parts'>
): WardrobeBoneSelection {
  if (!Number.isFinite(componentCenterX) || !Number.isFinite(sheetWidth)
    || sheetWidth <= 0 || model.width <= 0 || model.height <= 0) {
    return { bone: null, confidence: 'missing', reason: 'invalid-reference-size' }
  }
  const side = componentCenterX < sheetWidth / 2 ? 'left' : 'right'
  const centered = isCenterCategory(category)
  const target = category === 'capa' ? { x: .5, y: .31 }
    : category === 'oculos' || category === 'acessorio-cabeca' ? { x: .5, y: .2 }
      : category === 'cinto' || category === 'saia' ? { x: .5, y: .49 }
        : category === 'camisa' || category === 'jaqueta' ? { x: .5, y: .36 }
          : category === 'shorts' ? { x: .5, y: .48 }
            : category === 'meia' ? { x: side === 'left' ? .43 : .57, y: .83 }
              : category === 'sapato' ? { x: side === 'left' ? .43 : .57, y: .94 }
                : category === 'manga-superior' ? { x: side === 'left' ? .27 : .73, y: .27 }
                  : category === 'manga-inferior' ? { x: side === 'left' ? .22 : .78, y: .45 }
                    : category === 'luvas' ? { x: side === 'left' ? .21 : .79, y: .49 }
                      : category === 'calca-coxa' ? { x: side === 'left' ? .42 : .58, y: .58 }
                        : { x: side === 'left' ? .38 : .62, y: .82 }

  const allParts = model.parts.filter((part) => part.width > 0 && part.height > 0)
  let semanticParts = allParts.filter((part) => isCategoryPart(category, part))
  // Some older models do not have separate foot pieces. A lower-leg bone is a
  // deliberate fallback for footwear only when the model has no named feet.
  if (category === 'sapato' && !semanticParts.length) {
    semanticParts = allParts.filter((part) => /canela|panturrilha|calf|shin|perna inferior|lower leg/.test(normalizedPartName(part)))
  }
  if ((category === 'oculos' || category === 'acessorio-cabeca') && !semanticParts.length) {
    return { bone: null, confidence: 'missing', reason: 'head-bone-not-found' }
  }

  let candidates = semanticParts.length ? semanticParts : allParts
  if (!centered) {
    const explicitlySideNamed = candidates.filter((part) => partSide(part) !== null)
    const correctNamedSide = explicitlySideNamed.filter((part) => partSide(part) === side)
    if (explicitlySideNamed.length && !correctNamedSide.length) {
      return { bone: null, confidence: 'missing', reason: 'requested-side-not-found' }
    }
    const correctSide = (explicitlySideNamed.length ? correctNamedSide : candidates).filter((part) => {
      const namedSide = partSide(part)
      if (namedSide) return namedSide === side
      const center = referenceCenter(part)
      return side === 'left' ? center.x / model.width < .5 : center.x / model.width >= .5
    })
    if (correctSide.length) candidates = correctSide
  }
  if (centered) {
    const centralParts = candidates.filter((part) => {
      const x = referenceCenter(part).x / model.width
      return x > .28 && x < .72
    })
    if (centralParts.length) candidates = centralParts
  }
  if (!candidates.length) return { bone: null, confidence: 'missing', reason: 'no-bone-in-requested-zone' }

  const headCategory = category === 'oculos' || category === 'acessorio-cabeca'
  const scored = candidates.map((part) => {
    const center = referenceCenter(part)
    const dx = center.x / model.width - target.x
    const dy = center.y / model.height - target.y
    const label = normalizedPartName(part)
    const namedSide = partSide(part)
    const sidePenalty = !centered && namedSide && namedSide !== side ? 10 : 0
    const headPenalty = headCategory && !/cabeca|head|face|rosto/.test(label) ? 100 : 0
    return { part, score: dx * dx + dy * dy * 1.5 + sidePenalty + headPenalty }
  }).sort((left, right) => left.score - right.score)
  if (headCategory && scored[0].score >= 100) return { bone: null, confidence: 'missing', reason: 'head-bone-not-found' }
  const maxNormalizedDistanceSquared = 0.20
  if (scored[0].score > maxNormalizedDistanceSquared) {
    return { bone: null, confidence: 'missing', reason: 'bone-too-far-from-garment-zone' }
  }
  return { bone: scored[0].part, confidence: 'estimated', reason: semanticParts.length ? 'matching-body-part' : 'source-sheet-position' }
}
