import { HAIR_MOTION_PRESET_KEY, normalizeHairMotionPreset, parseHairMotionPresets, type HairMotionPreset } from '../../../../shared/hairMotionEngine'

type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Read the newest slots before saving so editing in the Editor never overwrites
 * another slot that was changed by the Fabricator in the meantime.
 * Invalid storage data is never replaced silently.
 */
export function saveEditorV6HairPresetSlot(storage: PresetStorage, slot: number, value: HairMotionPreset): Array<HairMotionPreset | null> {
  if (!Number.isSafeInteger(slot) || slot < 1 || slot > 5) throw Error('Slot de preset inválido.')
  const preset = normalizeHairMotionPreset(value)
  if (!preset) throw Error('A configuração da animação de cabelo é inválida.')
  const current = parseHairMotionPresets(storage.getItem(HAIR_MOTION_PRESET_KEY))
  const next = current.map((item, index) => index === slot - 1 ? preset : item)
  storage.setItem(HAIR_MOTION_PRESET_KEY, JSON.stringify(next))
  return next
}
