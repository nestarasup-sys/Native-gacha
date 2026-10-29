import type { FabricatorProject, JointLink } from '../../../../../shared/fabricator'

export type AnimatorRigDiagnostic = {
  id: string
  parent: string
  child: string
  fixed: JointLink['fixed']
  exists: boolean
}

/** Builds the rig panel rows with one part index instead of rescanning the model per joint. */
export function buildAnimatorRigDiagnostics(
  project: Pick<FabricatorProject, 'parts' | 'joints'> | null
): AnimatorRigDiagnostic[] {
  if (!project) return []

  const partsById = new Map<string, FabricatorProject['parts'][number]>()
  for (const part of project.parts) {
    if (!partsById.has(part.id)) partsById.set(part.id, part)
  }

  const usedParts = new Set<string>()
  const diagnostics = project.joints.map((joint) => {
    const parent = partsById.get(joint.parentPartId)
    const child = partsById.get(joint.childPartId)
    usedParts.add(joint.parentPartId)
    usedParts.add(joint.childPartId)
    return {
      id: joint.id,
      parent: parent?.name ?? 'Peça ausente',
      child: child?.name ?? 'Peça ausente',
      fixed: joint.fixed,
      exists: Boolean(parent && child)
    }
  })

  diagnostics.push(...project.parts
    .filter((part) => !usedParts.has(part.id))
    .map((part) => ({ id: part.id, parent: '—', child: part.name, fixed: false, exists: true })))

  return diagnostics
}
