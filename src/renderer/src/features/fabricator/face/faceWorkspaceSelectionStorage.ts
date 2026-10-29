import type { FaceComponentKind, FaceDetailKind } from '../../../../../shared/fabricator'
import type { FacePartId } from './faceComponentImportModel.ts'
import { validFaceImportAnchor, type AlignableFaceKind, type FaceImportAnchor } from './faceImportAlignment.ts'

export const COMPONENT_SELECTION_STORAGE_KEY = 'gacha-nymi:face-dev-component-selections'
export const LEGACY_PUPIL_SELECTION_STORAGE_KEY = 'gacha-nymi:face-dev-pupil-selections'
export const FACE_IMPORT_ANCHORS_STORAGE_KEY = 'gacha-nymi:face-dev-import-anchors'
export const FACE_DETAIL_SELECTION_STORAGE_KEY = 'gacha-nymi:face-dev-detail-selections'

export type ComponentSelection = {
  parts: Partial<Record<FacePartId, string>>
  linked: Partial<Record<FaceComponentKind, boolean>>
  moveTogether?: Partial<Record<FaceComponentKind, boolean>>
}
export type FaceImportAnchors = Record<number, Partial<Record<AlignableFaceKind, FaceImportAnchor>>>
export type FaceDetailSelections = Record<number, Partial<Record<FaceDetailKind, string>>>

export type FaceWorkspaceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}
type StorageProvider = () => FaceWorkspaceStorage

function parseObject(raw: string | null): unknown {
  return JSON.parse(raw ?? '{}')
}

/** Reads current selections and overlays them on legacy pupil-only selections. */
export function readComponentSelections(getStorage: StorageProvider): Record<number, ComponentSelection> {
  try {
    const storage = getStorage()
    const stored = parseObject(storage.getItem(COMPONENT_SELECTION_STORAGE_KEY)) as Record<string, ComponentSelection>
    const legacy = parseObject(storage.getItem(LEGACY_PUPIL_SELECTION_STORAGE_KEY)) as Record<string, { left?: string; right?: string; linked: boolean }>
    const migrated = Object.fromEntries(Object.entries(legacy && typeof legacy === 'object' && !Array.isArray(legacy)
      ? legacy
      : {}).filter(([, selection]) => selection && typeof selection === 'object').map(([slot, selection]) => [slot, {
      parts: { 'pupil-left': selection.left, 'pupil-right': selection.right },
      linked: { pupil: selection.linked }
    }])) as Record<number, ComponentSelection>
    return { ...migrated, ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) }
  } catch {
    return {}
  }
}

export function readFaceDetailSelections(getStorage: StorageProvider): FaceDetailSelections {
  try {
    const stored = parseObject(getStorage().getItem(FACE_DETAIL_SELECTION_STORAGE_KEY)) as Record<string, Partial<Record<FaceDetailKind, string>>>
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([slot, selections]) =>
      /^\d+$/.test(slot) && selections && typeof selections === 'object'
    ).map(([slot, selections]) => [Number(slot), selections]))
  } catch {
    return {}
  }
}

export function readFaceImportAnchors(getStorage: StorageProvider): FaceImportAnchors {
  try {
    const stored = parseObject(getStorage().getItem(FACE_IMPORT_ANCHORS_STORAGE_KEY)) as Record<string, Record<string, unknown>>
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([slot, value]) =>
      /^\d+$/.test(slot) && value && typeof value === 'object'
    ).map(([slot, value]) => [Number(slot), Object.fromEntries(
      (['eye', 'pupil', 'eye-closed'] as const).filter((kind) => validFaceImportAnchor(value[kind])).map((kind) => [kind, value[kind]])
    )])) as FaceImportAnchors
  } catch {
    return {}
  }
}

export function saveComponentSelection(
  getStorage: StorageProvider,
  modelSlot: number,
  selection: ComponentSelection
): void {
  const storage = getStorage()
  const stored = readComponentSelections(() => storage)
  stored[modelSlot] = selection
  storage.setItem(COMPONENT_SELECTION_STORAGE_KEY, JSON.stringify(stored))
}

export function saveFaceImportAnchors(getStorage: StorageProvider, anchors: FaceImportAnchors): void {
  getStorage().setItem(FACE_IMPORT_ANCHORS_STORAGE_KEY, JSON.stringify(anchors))
}

export function saveFaceDetailSelections(getStorage: StorageProvider, selections: FaceDetailSelections): void {
  getStorage().setItem(FACE_DETAIL_SELECTION_STORAGE_KEY, JSON.stringify(selections))
}
