type ExpressionPresetName = { id: string; name: string; collectionId?: string }
type ExpressionCollectionName = { id: string; name: string }

type ExportExpressionName = { name: string; presetId: string | null }

function filenameSegment(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 72)
    .toLocaleLowerCase('en-US') || 'expressao'
}

/** Preserve the preset collection in filenames while keeping V4-safe asset names. */
export function buildCharacterExportExpressionNames(
  presets: readonly ExpressionPresetName[],
  collections: readonly ExpressionCollectionName[] = [],
): ExportExpressionName[] {
  const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name.trim()]))
  const grouped = new Map<string, ExpressionPresetName[]>()
  for (const preset of presets) {
    const key = preset.collectionId && preset.collectionId !== 'standard' ? preset.collectionId : 'standard'
    const group = grouped.get(key) ?? []
    group.push(preset)
    grouped.set(key, group)
  }

  const groupIds = [...grouped.keys()].sort((left, right) => {
    if (left === 'standard') return -1
    if (right === 'standard') return 1
    return (collectionNames.get(left) ?? '').localeCompare(collectionNames.get(right) ?? '', 'pt-BR')
  })
  if (!groupIds.includes('standard')) groupIds.unshift('standard')

  const result: ExportExpressionName[] = []
  for (const [groupIndex, groupId] of groupIds.entries()) {
    const isStandard = groupId === 'standard'
    const collectionLabel = isStandard ? '' : filenameSegment(collectionNames.get(groupId) || `conjunto-${groupIndex + 1}`)
    const presetsInCollection = grouped.get(groupId) ?? []
    const normalPreset = presetsInCollection.find((preset) => preset.name.trim().toLocaleLowerCase('pt-BR') === 'normal')
    const usedNames = new Set<string>()
    const uniqueName = (rawName: string): string => {
      const baseName = `${collectionLabel ? `${collectionLabel}_` : ''}${rawName.trim() || 'expressao'}`
      let name = baseName
      let suffix = 2
      while (usedNames.has(filenameSegment(name))) {
        const ending = `_${suffix++}`
        name = `${baseName.slice(0, Math.max(1, 72 - ending.length)).trimEnd()}${ending}`
      }
      usedNames.add(filenameSegment(name))
      return name
    }

    if (normalPreset || isStandard) result.push({ name: uniqueName('normal'), presetId: normalPreset?.id ?? null })
    for (const preset of presetsInCollection) {
      if (preset.id === normalPreset?.id) continue
      result.push({ name: uniqueName(preset.name), presetId: preset.id })
    }
  }

  return result
}
