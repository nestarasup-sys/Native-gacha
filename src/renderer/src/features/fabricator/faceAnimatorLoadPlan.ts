import type { FaceExpressionPreset, FaceExpressionPresetSummary } from '../../../../shared/fabricator'

/** The animator only displays presets from its published standard collection. */
export function standardFaceAnimatorPresetIds(summaries: readonly FaceExpressionPresetSummary[]): string[] {
  return summaries.filter((preset) => preset.collectionId === 'standard').map((preset) => preset.id)
}

/** Finds the unique assets referenced by standard presets, which also power sequence export. */
export function faceAnimatorAssetRequirements(presets: readonly FaceExpressionPreset[]) {
  const componentIds = new Set<string>()
  const catalogIds = new Set<string>()

  for (const preset of presets) {
    if (preset.collectionId !== 'standard') continue
    const selections = preset.selections
    for (const id of [
      ...Object.values(selections.eyes),
      ...Object.values(selections.pupils),
      ...Object.values(selections.eyebrows ?? {})
    ]) {
      if (id) componentIds.add(id)
    }
    if (selections.nose?.catalogId) catalogIds.add(selections.nose.catalogId)
    if (selections.mouth?.catalogId) catalogIds.add(selections.mouth.catalogId)
  }

  return { componentIds: [...componentIds], catalogIds: [...catalogIds] }
}
