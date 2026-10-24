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


/** Projeta a geometria para a folha original sem perder a topologia do rig.
 * Transformações de joints usam os eixos locais da peça, para o Animador DEV
 * não perder articulações ao exibir a referência original.
 */
export function projectForOriginalPreview(project: FabricatorProject | null): FabricatorProject | null {
  if (!project) return null
  const model = project
  type Point = { x: number; y: number }
  const originals = new Map(project.parts.map(part => {
    const source = part.sourceTransform
    return [part.id, source ? {
      x: source.x, y: source.y, width: source.width ?? part.width,
      height: source.height ?? part.height, rotation: source.rotation
    } : { x: part.x, y: part.y, width: part.width, height: part.height, rotation: part.rotation }] as const
  }))
  function transformPoint(partId: string, point: Point): Point {
    const part = model.parts.find(candidate => candidate.id === partId)
    const source = originals.get(partId)
    if (!part || !source) return { ...point }
    const radians = part.rotation * Math.PI / 180
    const srcRadians = source.rotation * Math.PI / 180
    const px = point.x - (part.x + part.width / 2)
    const py = point.y - (part.y + part.height / 2)
    const localX = (px * Math.cos(radians) + py * Math.sin(radians)) * source.width / part.width
    const localY = (-px * Math.sin(radians) + py * Math.cos(radians)) * source.height / part.height
    return {
      x: source.x + source.width / 2 + localX * Math.cos(srcRadians) - localY * Math.sin(srcRadians),
      y: source.y + source.height / 2 + localX * Math.sin(srcRadians) + localY * Math.cos(srcRadians)
    }
  }
  return {
    ...project,
    parts: project.parts.map(part => {
      const original = originals.get(part.id)!
      return { ...part, ...original,
        jointAnchor: part.sourceTransform?.jointAnchor
          ? { ...part.sourceTransform.jointAnchor }
          : part.jointAnchor ? transformPoint(part.id, part.jointAnchor) : undefined }
    }),
    joints: project.joints.map(joint => {
      // Modelos/fixtures antigos podem omitir anchors; preserve sem converter.
      if (!joint.parentAnchor || !joint.childAnchor) return structuredClone(joint)
      const parentAnchor = transformPoint(joint.parentPartId, joint.parentAnchor)
      const childAnchor = transformPoint(joint.childPartId, joint.childAnchor)
      return { ...joint, parentAnchor, childAnchor,
        ...(joint.pivot ? { pivot: {
          x: (parentAnchor.x + childAnchor.x) / 2,
          y: (parentAnchor.y + childAnchor.y) / 2
        } } : {}) }
    }),
    layerOrder: [...(project.layerOrder ?? project.parts.map(part => part.id))],
    hiddenPartIds: [...(project.hiddenPartIds ?? [])]
  }
}
