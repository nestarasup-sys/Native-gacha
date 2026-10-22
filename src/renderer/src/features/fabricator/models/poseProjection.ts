/** Seleção de modelos e projeção de montagem para Poses DEV, sem estado React. */
import type { FabricatorPose, FabricatorPoseSummary, FabricatorProject } from '../../../../../shared/fabricator'
import { selectMountedModelSource } from '../../../../../shared/fabricatorModelViews'
import { normalizeLayerOrder } from './rig'

type DraftProject = Omit<FabricatorPose, 'slot'>
const EXPORT_POSE_SLOT_COUNT = 5

export function defaultExportPoseSlots(summaries: FabricatorPoseSummary[], modelSlot: number): Array<number | null> {
  const available = summaries.filter((pose): pose is NonNullable<FabricatorPoseSummary> => Boolean(pose && pose.sourceModelSlot === modelSlot)).sort((a, b) => a.slot - b.slot).slice(0, EXPORT_POSE_SLOT_COUNT)
  return [...available.map((pose) => pose.slot), ...Array.from({ length: EXPORT_POSE_SLOT_COUNT - available.length }, () => null)]
}


export function poseFromModel(model: FabricatorProject): DraftProject {
  // Somente Poses DEV consome a montagem com suas juntas e posições reais.
  const mounted = selectMountedModelSource(model)
  return {
    schemaVersion: 1,
    name: `Pose de ${model.name}`,
    category: 'Parado',
    sourceModelSlot: model.slot,
    sourceModelName: model.name,
    sourceModelUpdatedAt: model.updatedAt,
    width: model.width,
    height: model.height,
    parts: mounted.parts.map((part) => ({
      id: part.id, name: part.name, x: part.x, y: part.y, width: part.width, height: part.height,
      rotation: part.rotation, jointAnchor: part.jointAnchor ? { ...part.jointAnchor } : undefined, sourceTransform: part.sourceTransform ? { ...part.sourceTransform, ...(part.sourceTransform.jointAnchor ? { jointAnchor: { ...part.sourceTransform.jointAnchor } } : {}) } : undefined, dataUrl: part.dataUrl
    })),
    joints: mounted.joints.map((joint) => structuredClone(joint)),
    layerOrder: normalizeLayerOrder(mounted.parts, mounted.layerOrder),
    hiddenPartIds: [...mounted.hiddenPartIds],
    updatedAt: new Date().toISOString()
  }
}

