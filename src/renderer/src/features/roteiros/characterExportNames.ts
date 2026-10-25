type ExpressionPresetName = { id: string; name: string }

type ExportExpressionName = { name: string; presetId: string | null }

function filenameKey(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '-')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .toLocaleLowerCase('en-US') || 'expressao'
}

/** Give duplicate preset names a readable suffix that remains distinct on disk. */
export function buildCharacterExportExpressionNames(presets: readonly ExpressionPresetName[]): ExportExpressionName[] {
  const normalPreset = presets.find((preset) => preset.name.trim().toLocaleLowerCase('pt-BR') === 'normal')
  const result: ExportExpressionName[] = [{ name: 'normal', presetId: normalPreset?.id ?? null }]
  const usedNames = new Set([filenameKey('normal')])

  for (const preset of presets) {
    if (preset.id === normalPreset?.id) continue
    const baseName = preset.name.trim() || 'expressao'
    let name = baseName
    let suffix = 2
    while (usedNames.has(filenameKey(name))) {
      const ending = ` ${suffix++}`
      name = `${baseName.slice(0, Math.max(1, 72 - ending.length)).trimEnd()}${ending}`
    }
    usedNames.add(filenameKey(name))
    result.push({ name, presetId: preset.id })
  }

  return result
}
