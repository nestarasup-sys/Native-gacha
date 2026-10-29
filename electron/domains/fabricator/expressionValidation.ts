import type {
  FaceExpressionPreset,
  FaceExpressionTransforms,
  FaceExpressionWorkspaceDraft,
  FaceTransform
} from '../../../src/shared/fabricator.ts'
import { isPortableExpressionMotion, isPtPupilOverrides, isPtPupilMotion } from '../../../src/shared/portableExpression.ts'
import { isSceneFaceExpressionEffects } from '../../../src/shared/sceneFaceValidation.ts'

export function createFabricatorExpressionValidators(isValidModelSlot: (slot: number) => boolean) {
  const isValidWardrobeId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)
  const isValidFaceCatalogId = (id: string) => /^[a-zA-Z0-9_-]{1,120}$/.test(id)
  function validFaceExpressionPreset(modelSlot: number, preset: FaceExpressionPreset): boolean {
    const validTransform = (transform: unknown) => {
      if (!transform || typeof transform !== 'object') return false
      const candidate = transform as FaceTransform
      return [candidate.x, candidate.y, candidate.scaleX, candidate.scaleY, candidate.rotation].every(Number.isFinite)
        && candidate.scaleX > 0 && candidate.scaleX <= 20 && candidate.scaleY > 0 && candidate.scaleY <= 20
        && (candidate.flipX === undefined || typeof candidate.flipX === 'boolean')
    }
    const selections = preset?.selections
    const validSideSelections = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const candidate = value as Record<string, unknown>
      return ['left', 'right'].every((side) => candidate[side] === null || typeof candidate[side] === 'string' && isValidWardrobeId(candidate[side] as string))
    }
    const validCatalogSelection = (value: unknown, kinds: string[]) => {
      if (value === null) return true
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const candidate = value as Record<string, unknown>
      return typeof candidate.catalogId === 'string' && isValidFaceCatalogId(candidate.catalogId)
        && Number.isInteger(candidate.index) && (candidate.index as number) >= 0 && (candidate.index as number) <= 20
        && (candidate.kind === undefined || kinds.includes(String(candidate.kind)))
    }
    return isValidModelSlot(modelSlot) && !!preset && preset.schemaVersion === 1 && preset.modelSlot === modelSlot
      && isValidWardrobeId(preset.id) && typeof preset.name === 'string' && Boolean(preset.name.trim()) && preset.name.length <= 80
      && ((preset.collectionId === undefined && preset.expressionIndex === undefined)
        || (typeof preset.collectionId === 'string' && isValidWardrobeId(preset.collectionId)
          && Number.isInteger(preset.expressionIndex) && (preset.expressionIndex as number) >= 0 && (preset.expressionIndex as number) <= 999))
      && typeof preset.updatedAt === 'string' && Number.isFinite(Date.parse(preset.updatedAt))
      && !!selections && validSideSelections(selections.eyes) && validSideSelections(selections.pupils)
      && (selections.eyebrows === undefined || validSideSelections(selections.eyebrows))
      && validCatalogSelection(selections.nose, ['nose'])
      && validCatalogSelection(selections.mouth, ['mouth-closed', 'mouth-open'])
      && !!preset.transforms && (['eyeLeft', 'eyeRight', 'pupilLeft', 'pupilRight', 'nose', 'mouth'] as Array<keyof FaceExpressionTransforms>).every((key) => validTransform(preset.transforms[key]))
      && (preset.transforms.browLeft === undefined || validTransform(preset.transforms.browLeft))
      && (preset.transforms.browRight === undefined || validTransform(preset.transforms.browRight))
      && (preset.referenceTransforms === undefined || Object.values(preset.referenceTransforms).every(validTransform))
      && (preset.portableMotion === undefined || isPortableExpressionMotion(preset.portableMotion))
      && (preset.ptPupils === undefined || isPtPupilOverrides(preset.ptPupils))
      && (preset.ptPupilMotion === undefined || isPtPupilMotion(preset.ptPupilMotion))
      && Number.isFinite(preset.noseOpacity) && preset.noseOpacity >= 0 && preset.noseOpacity <= 1
      && (preset.effects === undefined || isSceneFaceExpressionEffects(preset.effects))
  }

  function validFaceExpressionWorkspaceDraft(modelSlot: number, draft: FaceExpressionWorkspaceDraft): boolean {
    if (!isValidModelSlot(modelSlot) || !draft || draft.schemaVersion !== 1 || draft.modelSlot !== modelSlot
      || !(draft.selectedCollectionId === 'standard' || isValidWardrobeId(draft.selectedCollectionId))
      || !Number.isInteger(draft.selectedExpressionIndex) || draft.selectedExpressionIndex < 0 || draft.selectedExpressionIndex > 999
      || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt))) return false
    const validEntry = (entry: FaceExpressionWorkspaceDraft['current'], collectionId: string, expressionIndex: number): boolean => {
      if (!entry || typeof entry !== 'object') return false
      return validFaceExpressionPreset(modelSlot, {
        schemaVersion: 1, id: entry.id, modelSlot, name: 'Rascunho', collectionId,
        expressionIndex, selections: entry.selections, transforms: entry.transforms, ptPupils: entry.ptPupils,
        noseOpacity: entry.noseOpacity, effects: entry.effects, updatedAt: draft.updatedAt
      })
    }
    if (!validEntry(draft.current, draft.selectedCollectionId, draft.selectedExpressionIndex) || !draft.workingCopies || typeof draft.workingCopies !== 'object' || Array.isArray(draft.workingCopies)
      || Object.keys(draft.workingCopies).length > 1000 || !draft.customExpressionNames || typeof draft.customExpressionNames !== 'object'
      || Array.isArray(draft.customExpressionNames) || Object.keys(draft.customExpressionNames).length > 1000) return false
    for (const [key, entry] of Object.entries(draft.workingCopies)) {
      const separator = key.lastIndexOf(':')
      const collectionId = key.slice(0, separator)
      const index = Number(key.slice(separator + 1))
      if (separator < 1 || !(collectionId === 'standard' || isValidWardrobeId(collectionId)) || !Number.isInteger(index) || index < 0 || index > 999) return false
      if (!validEntry(entry, collectionId, index)) return false
    }
    for (const [key, name] of Object.entries(draft.customExpressionNames)) {
      if (!/^.{1,80}:\d{1,3}$/.test(key) || typeof name !== 'string' || !name.trim() || name.length > 80) return false
    }
    return true
  }

  return { isValidWardrobeId, isValidFaceCatalogId, validFaceExpressionPreset, validFaceExpressionWorkspaceDraft }
}
