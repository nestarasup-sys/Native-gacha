import { findFabricatorPoseReferenceOwners, type FabricatorPoseReference } from '../../../src/shared/fabricatorPoseReferences.ts'

export function createPoseReferenceChangeCoordinator() {
  let pending: Promise<void> = Promise.resolve()

  return function coordinate<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = pending.catch(() => undefined).then(operation)
    pending = next.then(() => undefined, () => undefined)
    return next
  }
}

export function assertPoseHasNoReferences(
  references: readonly FabricatorPoseReference[],
  modelSlot: number,
  poseSlot: number
): void {
  const owners = findFabricatorPoseReferenceOwners(references, modelSlot, poseSlot)
  if (!owners.length) return
  throw new Error(`Não é possível excluir a pose do slot ${poseSlot} do modelo ${modelSlot}: está sendo usada por ${owners.slice(0, 5).join(', ')}. Troque ou remova esses vínculos primeiro.`)
}
