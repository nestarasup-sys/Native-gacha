import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { modelRigSide } from '../../../../../shared/modelRig'

export type WardrobeJointCutKind = 'sleeve' | 'pants'
export type WardrobeJointCutSide = 'left' | 'right'
export type WardrobeJointCutTarget = 'sleeve-left' | 'sleeve-right' | 'pants-left' | 'pants-right'
export type WardrobeJointCutAdjustment = { offsetRatio: number; rotationDegrees: number }
export type WardrobeJointCutSettings = Partial<Record<WardrobeJointCutTarget, WardrobeJointCutAdjustment>>

const STORAGE_KEY = 'gacha-nymi:wardrobe-joint-cut-settings:v2'
const LEGACY_STORAGE_KEY = 'gacha-nymi:wardrobe-joint-cut-settings:v1'
const targets: WardrobeJointCutTarget[] = ['sleeve-left', 'sleeve-right', 'pants-left', 'pants-right']
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
  const source = value as Partial<Record<WardrobeJointCutTarget, unknown>>
  return Object.fromEntries(targets.flatMap((target) => {
    const adjustment = normalizeAdjustment(source[target])
    return adjustment ? [[target, adjustment]] : []
  })) as WardrobeJointCutSettings
}

function migrateLegacyGlobalSettings(value: unknown): WardrobeJointCutSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Partial<Record<WardrobeJointCutKind, unknown>>
  const settings: WardrobeJointCutSettings = {}
  for (const kind of kinds) {
    const adjustment = normalizeAdjustment(source[kind])
    if (!adjustment) continue
    settings[`${kind}-left`] = adjustment
    settings[`${kind}-right`] = adjustment
  }
  return settings
}

export function loadWardrobeJointCutSettings(): WardrobeJointCutSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return normalizeWardrobeJointCutSettings(JSON.parse(stored) as unknown)
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    return legacy ? migrateLegacyGlobalSettings(JSON.parse(legacy) as unknown) : {}
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

export function wardrobeJointCutTarget(
  component: WardrobeComponent,
  project?: Pick<FabricatorProject, 'parts' | 'width'> | null
): WardrobeJointCutTarget {
  const kind = wardrobeJointCutKind(component)
  let side: WardrobeJointCutSide | null = component.sleeveSide ?? null
  if (!side) {
    const attachedPart = project?.parts.find((part) => part.id === component.attachedPartId)
    side = modelRigSide(attachedPart?.name ?? '') ?? modelRigSide(component.name)
  }
  if (!side && project) side = component.x + component.width / 2 < project.width / 2 ? 'left' : 'right'
  return `${kind}-${side ?? 'left'}` as WardrobeJointCutTarget
}

/** Uses a side-wide setting when present and reads a legacy per-piece value only as a migration source. */
export function wardrobeJointCutAdjustmentFor(
  component: WardrobeComponent,
  settings: WardrobeJointCutSettings,
  project?: Pick<FabricatorProject, 'parts' | 'width'> | null
): WardrobeJointCutAdjustment {
  const global = settings[wardrobeJointCutTarget(component, project)]
  if (global) return global
  return { offsetRatio: clamp(component.jointCutOffsetRatio, 0, -1, 1), rotationDegrees: 0 }
}
