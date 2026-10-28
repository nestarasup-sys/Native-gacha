export const skinTonePresets = [
  { id: '#f5ddcb', name: 'Porcelana' },
  { id: '#edc5a5', name: 'Clara' },
  { id: '#dba47d', name: 'Pêssego' },
  { id: '#c88961', name: 'Dourada' },
  { id: '#a96d4c', name: 'Média' },
  { id: '#754a36', name: 'Escura' },
  { id: '#493027', name: 'Retinta' }
] as const

export const customizerSkinTonePresets = [
  skinTonePresets[0], skinTonePresets[1], skinTonePresets[2], skinTonePresets[4], skinTonePresets[6]
] as const

/** Base fixa usada para preencher interiores de pele removida antes do recolorir. */
export const MODEL_SKIN_BASE_TONE = skinTonePresets[0].id

export function isValidSkinTone(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}
