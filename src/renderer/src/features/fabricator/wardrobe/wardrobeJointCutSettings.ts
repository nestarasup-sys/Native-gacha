import type { WardrobeComponent } from '../../../../../shared/fabricator'

export type WardrobeJointCutKind = 'sleeve' | 'pants'
export type WardrobeJointCutAdjustment = { offsetRatio: number; rotationDegrees: number }
export type WardrobeJointCutSettings = Partial<Record<WardrobeJointCutKind, WardrobeJointCutAdjustment>>

const STORAGE_KEY = 'gacha-nymi:wardrobe-joint-cut-settings:v1'
const kinds: WardrobeJointCutKind[] = ['sleeve', 'pants']

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function normalizeAdjustment(value: unknown): WardrobeJointCutAdjustment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<WardrobeJointCutAdjustment>
  return {
    offsetRatio: clamp(raw.offsetRatio, 0, -1, 1),
    rotationDegrees: clamp(raw.rotationDegrees, 0, -45, 45)
  }
}

export function normalizeWardrobeJointCutSettings(value: unknown): WardrobeJointCutSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Partial<Record<WardrobeJointCutKind, unknown>>
  return Object.fromEntries(kinds.flatMap((kind) => {
    const adjustment = normalizeAdjustment(source[kind])
    return adjustment ? [[kind, adjustment]] : []
  })) as WardrobeJointCutSettings
}

export function loadWardrobeJointCutSettings(): WardrobeJointCutSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? normalizeWardrobeJointCutSettings(JSON.parse(stored) as unknown) : {}
  } catch {
    return {}
  }
}

export function saveWardrobeJointCutSettings(value: WardrobeJointCutSettings): WardrobeJointCutSettings {
  const normalized = normalizeWardrobeJointCutSettings(value)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function wardrobeJointCutKind(component: WardrobeComponent): WardrobeJointCutKind {
  if (component.sleeveJointSplit === 'leg' || component.category === 'calca-coxa' || component.category === 'calca-canela'
    || /^calça longa\b/i.test(component.name)) return 'pants'
  return 'sleeve'
}

/** Uses a global setting when present and reads the old per-piece value only as a one-time migration source. */
export function wardrobeJointCutAdjustmentFor(
  component: WardrobeComponent,
  settings: WardrobeJointCutSettings
): WardrobeJointCutAdjustment {
  const global = settings[wardrobeJointCutKind(component)]
  if (global) return global
  return { offsetRatio: clamp(component.jointCutOffsetRatio, 0, -1, 1), rotationDegrees: 0 }
}
