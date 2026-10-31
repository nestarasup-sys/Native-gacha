import { characterProportionLimits } from '../../../../shared/customizer.ts'

export const CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE_KEY = 'nymi.customizer.newCharacterHeadSize.v1'

export type CustomizerNewCharacterHeadSizePreference = {
  enabled: boolean
  value: number
}

export type CustomizerPreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export const DEFAULT_CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE: CustomizerNewCharacterHeadSizePreference = {
  enabled: false,
  value: 100
}

export function normalizeCustomizerNewCharacterHeadSizePreference(value: unknown): CustomizerNewCharacterHeadSizePreference {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const { min, max } = characterProportionLimits.head
  const size = record.value
  return {
    enabled: record.enabled === true,
    value: typeof size === 'number' && Number.isFinite(size)
      ? Math.min(max, Math.max(min, Math.round(size)))
      : DEFAULT_CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE.value
  }
}

export function readCustomizerNewCharacterHeadSizePreference(storage: CustomizerPreferenceStorage): CustomizerNewCharacterHeadSizePreference {
  try {
    const serialized = storage.getItem(CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE_KEY)
    return serialized ? normalizeCustomizerNewCharacterHeadSizePreference(JSON.parse(serialized)) : { ...DEFAULT_CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE }
  } catch {
    return { ...DEFAULT_CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE }
  }
}

export function writeCustomizerNewCharacterHeadSizePreference(
  storage: CustomizerPreferenceStorage,
  preference: CustomizerNewCharacterHeadSizePreference
): void {
  storage.setItem(CUSTOMIZER_NEW_CHARACTER_HEAD_SIZE_KEY, JSON.stringify(normalizeCustomizerNewCharacterHeadSizePreference(preference)))
}
