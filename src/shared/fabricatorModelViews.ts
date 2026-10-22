/** Contratos explícitos para consumidores do Fabricador DEV.
 * Poses DEV lê peças montadas e rig; os demais editores que usam a folha
 * recebem coordenadas e pixels da imagem original, nunca da pose.
 */
import type { FabricatorProject, ModelPart } from './fabricator'

export type OriginalModelSource = {
  kind: 'original'
  slot: number
  sourceName: string
  sourceDataUrl: string
  width: number
  height: number
  tolerance: number
  parts: Array<{
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    dataUrl: string
  }>
}

export type MountedModelSource = {
  kind: 'mounted'
  slot: number
  name: string
  updatedAt: string
  width: number
  height: number
  parts: ModelPart[]
  joints: FabricatorProject['joints']
  layerOrder: string[]
  hiddenPartIds: string[]
}

export function selectOriginalModelSource(project: FabricatorProject): OriginalModelSource {
  return {
    kind: 'original',
    slot: project.slot,
    sourceName: project.sourceName,
    sourceDataUrl: project.sourceDataUrl,
    width: project.width,
    height: project.height,
    tolerance: project.tolerance,
    parts: project.parts.map(part => ({
      id: part.id, name: part.name,
      x: part.sourceTransform?.x ?? part.x,
      y: part.sourceTransform?.y ?? part.y,
      width: part.sourceTransform?.width ?? part.width,
      height: part.sourceTransform?.height ?? part.height,
      dataUrl: part.dataUrl
    }))
  }
}
export function selectMountedModelSource(project: FabricatorProject): MountedModelSource {
  return {
    kind: 'mounted',
    slot: project.slot,
    name: project.name,
    updatedAt: project.updatedAt,
    width: project.width,
    height: project.height,
    parts: project.parts.map(part => ({
      ...part,
      jointAnchor: part.jointAnchor ? { ...part.jointAnchor } : undefined,
      sourceTransform: part.sourceTransform ? {
        ...part.sourceTransform,
        jointAnchor: part.sourceTransform.jointAnchor ? { ...part.sourceTransform.jointAnchor } : undefined
      } : undefined
    })),
    joints: project.joints.map(joint => structuredClone(joint)),
    layerOrder: [...(project.layerOrder ?? project.parts.map(part => part.id))],
    hiddenPartIds: [...(project.hiddenPartIds ?? [])]
  }
}
