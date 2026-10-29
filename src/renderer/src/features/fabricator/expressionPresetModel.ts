import { compilePortableExpression, type ExpressionMetrics } from '../../../../shared/portableExpression.ts'
import type {
  FaceCatalogItem,
  FaceCatalogItemSummary,
  FaceComponentAsset,
  FaceComponentAssetSummary,
  FaceExpressionPreset,
  FaceExpressionSelections,
  FaceExpressionTransforms,
  FaceExpressionWorkspaceDraft,
  FaceExpressionWorkspaceEntry,
  FaceTransform,
  PortableExpressionMotion
} from '../../../../shared/fabricator.ts'

export type ExpressionSide = 'left' | 'right'
export type ExpressionComponentKind = 'eye' | 'pupil' | 'eyebrow'
export type ExpressionComposition = FaceExpressionSelections
export type ComponentOption = { key: string; kind: ExpressionComponentKind; name: string; leftId: string; rightId: string; ids: string[] }
export type CatalogOption = { key: string; item: FaceCatalogItemSummary; ids: string[] }

export const STANDARD_EXPRESSIONS = [
  'Aliviada', 'Animada', 'Apaixonada', 'Cansada', 'Ciumenta', 'Confusa', 'Decepcionada',
  'Desconfiada', 'Envergonhada', 'Impressionada', 'Indignada', 'Irritada', 'Nojo', 'Normal',
  'Orgulhosa', 'Preocupada', 'Séria', 'Sorrindo de canto', 'Sorriso maligno', 'Surpresa', 'Triste/magoada'
] as const

export const emptyExpressionComposition: ExpressionComposition = {
  eyes: { left: null, right: null },
  pupils: { left: null, right: null },
  eyebrows: { left: null, right: null },
  nose: null,
  mouth: null
}

export function isWorkspaceDraftForModel(value: unknown, modelSlot: number): value is FaceExpressionWorkspaceDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<FaceExpressionWorkspaceDraft>
  const validEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as FaceExpressionWorkspaceEntry
    const transformKeys: Array<keyof FaceExpressionTransforms> = ['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'browLeft', 'browRight', 'nose', 'mouth']
    return typeof candidate.id === 'string' && !!candidate.selections && typeof candidate.selections === 'object'
      && !!candidate.transforms && transformKeys.every((key) => {
        const transform = candidate.transforms[key]
        return !!transform && [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite)
      }) && Number.isFinite(candidate.noseOpacity) && candidate.noseOpacity >= 0 && candidate.noseOpacity <= 1
      && !!candidate.effects && typeof candidate.effects === 'object'
  }
  return draft.schemaVersion === 1 && draft.modelSlot === modelSlot && typeof draft.selectedCollectionId === 'string'
    && Number.isInteger(draft.selectedExpressionIndex) && Number(draft.selectedExpressionIndex) >= 0 && Number(draft.selectedExpressionIndex) <= 999
    && validEntry(draft.current) && !!draft.workingCopies && typeof draft.workingCopies === 'object'
    && Object.values(draft.workingCopies).every(validEntry)
    && !!draft.customExpressionNames && typeof draft.customExpressionNames === 'object'
    && Object.values(draft.customExpressionNames).every((name) => typeof name === 'string')
    && typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt))
}

function rebaseTransform(transform: FaceTransform, reference: FaceTransform, nextReference: FaceTransform): FaceTransform {
  const rebased: FaceTransform = {
    ...nextReference,
    x: nextReference.x + transform.x - reference.x,
    y: nextReference.y + transform.y - reference.y,
    scaleX: Math.max(.02, Math.min(20, nextReference.scaleX * transform.scaleX / reference.scaleX)),
    scaleY: Math.max(.02, Math.min(20, nextReference.scaleY * transform.scaleY / reference.scaleY)),
    rotation: nextReference.rotation + transform.rotation - reference.rotation
  }
  if (Boolean(transform.flipX) !== Boolean(reference.flipX)) {
    const flipX = !Boolean(nextReference.flipX)
    if (flipX) rebased.flipX = true
    else delete rebased.flipX
  }
  return rebased
}

/** Metrics are captured when authoring, never read from the original PNG to apply a preset later. */
export function authoredMetrics(
  composition: ExpressionComposition,
  components: Record<string, FaceComponentAsset>,
  catalogs: Record<string, FaceCatalogItem>
): ExpressionMetrics {
  const metrics: ExpressionMetrics = {}
  for (const side of ['left', 'right'] as const) {
    const suffix = side === 'left' ? 'Left' : 'Right'
    const eye = composition.eyes[side] ? components[composition.eyes[side]!] : undefined
    const brow = composition.eyebrows[side] ? components[composition.eyebrows[side]!] : undefined
    if (eye) {
      metrics[`eye${suffix}`] = { width: eye.width, height: eye.height, mirrored: side === 'right' && !eye.rightSidePositioned }
      // Pupil offsets use eye dimensions but the PUPIL's own mirror orientation.
      const pupilId = composition.pupils[side]
      const pupil = pupilId ? components[pupilId] : undefined
      metrics[`pupil${suffix}`] = { width: eye.width, height: eye.height, mirrored: side === 'right' && !pupil?.rightSidePositioned }
    }
    if (brow) metrics[`brow${suffix}`] = { width: brow.width, height: brow.height, mirrored: side === 'right' && !brow.rightSidePositioned }
  }
  if (composition.nose) {
    const piece = catalogs[composition.nose.catalogId]?.pieces.find((item) => item.sheet === 'nose' && item.index === composition.nose?.index)
    if (piece) metrics.nose = { width: piece.width, height: piece.height }
  }
  if (composition.mouth) {
    const piece = catalogs[composition.mouth.catalogId]?.pieces.find((item) => item.sheet === composition.mouth?.kind && item.index === composition.mouth?.index)
    if (piece) metrics.mouth = { width: piece.width, height: piece.height }
  }
  return metrics
}

export function motionForPublishedPreset(
  transforms: FaceExpressionTransforms,
  reference: FaceExpressionTransforms,
  selection: ExpressionComposition,
  components: Record<string, FaceComponentAsset>,
  catalogs: Record<string, FaceCatalogItem>,
  previous?: FaceExpressionPreset | null
): PortableExpressionMotion | undefined {
  const compiled = compilePortableExpression(transforms, reference, authoredMetrics(selection, components, catalogs))
  const old = previous && JSON.stringify(previous.selections) === JSON.stringify(selection)
    ? previous.portableMotion?.layers : undefined
  const layers = { ...old, ...compiled.layers }
  return Object.keys(layers).length ? { version: 1, layers } : undefined
}

export function rebaseExpressionTransforms(
  transforms: FaceExpressionTransforms,
  reference: FaceExpressionTransforms,
  nextReference: FaceExpressionTransforms
): FaceExpressionTransforms {
  const keys: Array<keyof FaceExpressionTransforms> = ['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'browLeft', 'browRight', 'nose', 'mouth']
  return Object.fromEntries(keys.map((key) => [key, rebaseTransform(transforms[key], reference[key], nextReference[key])])) as FaceExpressionTransforms
}

export function compositionForExpression(
  composition: ExpressionComposition,
  index: number,
  catalogs: Record<string, FaceCatalogItem>
): ExpressionComposition {
  const next = structuredClone(composition)
  if (next.nose) {
    const nose = catalogs[next.nose.catalogId]
    if (nose && !nose.pieces.some((piece) => piece.index === next.nose!.index)) next.nose.index = nose.pieces[0]?.index ?? 0
  }
  if (next.mouth) {
    const mouth = catalogs[next.mouth.catalogId]
    if (mouth?.pieces.some((piece) => piece.index === index)) next.mouth.index = index
    else if (mouth && !mouth.pieces.some((piece) => piece.index === next.mouth!.index)) next.mouth.index = mouth.pieces[0]?.index ?? 0
  }
  return next
}

function componentSide(asset: FaceComponentAssetSummary): ExpressionSide {
  return asset.rightSidePositioned || /direit[oa]$/i.test(asset.name) ? 'right' : 'left'
}

export function findPairedAsset(asset: FaceComponentAssetSummary, assets: FaceComponentAssetSummary[]): FaceComponentAssetSummary | undefined {
  return assets.find((candidate) => candidate.id !== asset.id && candidate.kind === asset.kind && componentSide(candidate) === 'right'
    && Boolean(asset.pairId && candidate.pairId === asset.pairId))
    ?? assets.find((candidate) => candidate.id !== asset.id && candidate.kind === asset.kind && componentSide(candidate) === 'right'
    && candidate.name.replace(/\s*[·-]\s*(?:Olho|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, '') === asset.name.replace(/\s*[·-]\s*(?:Olho|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, ''))
}

function componentBaseName(name: string): string {
  return name.replace(/\s*[·-]\s*(?:Olho(?: aberto| fechado)?|Pupila|Sobrancelha)\s*(?:esquerd[oa]|direit[oa])$/i, '').trim()
}

export function buildComponentOptions(
  kind: ExpressionComponentKind,
  summaries: FaceComponentAssetSummary[],
  details: Record<string, FaceComponentAsset>
): ComponentOption[] {
  const remaining = summaries.filter((asset) => asset.kind === kind)
  const groups: FaceComponentAssetSummary[][] = []
  while (remaining.length) {
    const group = [remaining.shift()!]
    let expanded = true
    while (expanded) {
      expanded = false
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index]
        const connected = group.some((member) => {
          const memberDetail = details[member.id]
          const candidateDetail = details[candidate.id]
          const sharedPair = Boolean(member.pairId && candidate.pairId && member.pairId === candidate.pairId)
          const sameImage = Boolean(memberDetail?.dataUrl && candidateDetail?.dataUrl && memberDetail.dataUrl === candidateDetail.dataUrl)
          const pairedNames = componentSide(member) !== componentSide(candidate) && componentBaseName(member.name) === componentBaseName(candidate.name)
          return sharedPair || sameImage || pairedNames
        })
        if (connected) { group.push(remaining.splice(index, 1)[0]); expanded = true }
      }
    }
    groups.push(group)
  }

  return groups.map((group) => {
    const right = group.find((asset) => componentSide(asset) === 'right')
    const left = group.find((asset) => componentSide(asset) === 'left') ?? group.find((asset) => asset.id !== right?.id) ?? right!
    const rightAsset = right ?? left
    const uniqueName = componentBaseName(left.name) || componentBaseName(rightAsset.name) || left.name
    return { key: group.map((asset) => asset.id).sort().join(':'), kind, name: uniqueName, leftId: left.id, rightId: rightAsset.id, ids: group.map((asset) => asset.id) }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function buildCatalogOptions(summaries: FaceCatalogItemSummary[], items: Record<string, FaceCatalogItem>): CatalogOption[] {
  const groups: Array<{ key: string; item: FaceCatalogItemSummary; ids: string[]; detail?: FaceCatalogItem }> = []
  for (const summary of summaries) {
    const item = items[summary.id]
    const sortedPieces = item?.pieces.slice().sort((a, b) => a.index - b.index)
    const duplicate = item && sortedPieces ? groups.find((group) => {
      const otherPieces = group.detail?.pieces.slice().sort((a, b) => a.index - b.index)
      return group.detail?.category === item.category && Boolean(otherPieces && otherPieces.length === sortedPieces.length
        && otherPieces.every((piece, index) => piece.dataUrl === sortedPieces[index].dataUrl))
    }) : undefined
    const key = `${summary.category}:${summary.id}`
    if (duplicate) duplicate.ids.push(summary.id)
    else groups.push({ key, item: summary, ids: [summary.id], detail: item })
  }
  return groups.map(({ key, item, ids }) => ({ key, item, ids })).sort((a, b) => a.item.name.localeCompare(b.item.name, 'pt-BR'))
}
