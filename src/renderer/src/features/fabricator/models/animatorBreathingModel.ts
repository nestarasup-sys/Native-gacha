import { defaultCharacterBodyDimensions, type CustomizerCharacter } from '../../../../../shared/customizer.ts'
import { resolvePoseCategory, type AnimatorAnimation, type AnimatorFrame, type AnimatorFrameTransform, type FabricatorPose, type FabricatorProject, type JointLink, type PosePart } from '../../../../../shared/fabricator.ts'
import { applyCharacterBodyShape } from '../../../../../shared/bodyShape.ts'
import { normalizeLayerOrder } from './rig.ts'
import { centerProjectOnCanvas, makePoseProject, transformsFromProject } from './animatorFrameModel.ts'

export const breathingVariations = [
  { key: 'suave', name: 'Suave', cycleMs: 4200, torsoWidth: 100.7, torsoHeight: 102.0 },
  { key: 'calma', name: 'Calma', cycleMs: 3600, torsoWidth: 101.1, torsoHeight: 103.0 },
  { key: 'profunda', name: 'Profunda', cycleMs: 5200, torsoWidth: 101.8, torsoHeight: 104.2 },
  { key: 'ritmada', name: 'Ritmada', cycleMs: 3000, torsoWidth: 101.2, torsoHeight: 102.6 }
] as const

export type BreathingVariation = (typeof breathingVariations)[number]

type ThumbnailRenderer = (
  project: FabricatorProject,
  transforms: Record<string, AnimatorFrameTransform>
) => Promise<string>

function keepPinnedJointAnchors(
  shapedJoints: JointLink[],
  originalJoints: JointLink[],
  pinnedPartIds: ReadonlySet<string>
): JointLink[] {
  const originalById = new Map(originalJoints.map((joint) => [joint.id, joint]))
  return shapedJoints.map((joint) => {
    const original = originalById.get(joint.id)
    if (!original) return joint
    const parentAnchor = pinnedPartIds.has(joint.parentPartId) ? original.parentAnchor : joint.parentAnchor
    const childAnchor = pinnedPartIds.has(joint.childPartId) ? original.childAnchor : joint.childAnchor
    return {
      ...joint,
      parentAnchor,
      childAnchor,
      pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 }
    }
  })
}

/** Builds the two inhale frames while keeping lower-body parts and their rig anchors fixed. */
export async function createBreathingAnimation(
  source: FabricatorProject,
  pose: FabricatorPose,
  slot: number,
  characterId: CustomizerCharacter['id'] | null,
  variation: BreathingVariation,
  renderThumbnail: ThumbnailRenderer
): Promise<AnimatorAnimation> {
  const poseProject = makePoseProject(source, pose)
  const torso = poseProject.parts.find((part) => /tronco|torso|peito|chest/i.test(part.name))
  if (!torso) throw new Error(`A pose ${pose.name} não possui uma peça de tronco identificável.`)

  const inhaleRaw = applyCharacterBodyShape(poseProject, {
    ...defaultCharacterBodyDimensions,
    torsoWidth: variation.torsoWidth,
    torsoHeight: variation.torsoHeight,
    balance: 0
  })

  const lowerRoots = poseProject.joints
    .filter((joint) => joint.fixed && joint.parentPartId === torso.id)
    .map((joint) => poseProject.parts.find((part) => part.id === joint.childPartId))
    .filter((part): part is PosePart => Boolean(part && (/(coxa|perna|canela|panturrilha|joelho|thigh|shin|calf)/i.test(part.name) || part.y + part.height / 2 > torso.y + torso.height * .8)))
  const pinnedPartIds = new Set(lowerRoots.map((part) => part.id))
  let changed = true
  while (changed) {
    changed = false
    for (const joint of poseProject.joints) {
      if (joint.fixed && pinnedPartIds.has(joint.parentPartId) && !pinnedPartIds.has(joint.childPartId)) {
        pinnedPartIds.add(joint.childPartId)
        changed = true
      }
    }
  }

  const expandedTorso = inhaleRaw.parts.find((part) => part.id === torso.id)!
  const breathHeight = Math.max(0, expandedTorso.height - torso.height)
  const inhaleParts = inhaleRaw.parts.map((part) => {
    const original = poseProject.parts.find((candidate) => candidate.id === part.id)!
    if (pinnedPartIds.has(part.id)) return original
    if (/cabe[çc]a|head/i.test(part.name)) return { ...part, y: original.y + Math.min(0, expandedTorso.y - torso.y) }
    if (/bra[cç]o|arm/i.test(part.name)) return { ...part, y: original.y - breathHeight * .25 }
    return part
  })
  const inhaleJoints = keepPinnedJointAnchors(inhaleRaw.joints, poseProject.joints, pinnedPartIds)
  const inhaleProject = { ...inhaleRaw, parts: inhaleParts, joints: inhaleJoints }
  const canvasWidth = Math.max(poseProject.width, inhaleRaw.width)
  const canvasHeight = Math.max(poseProject.height, inhaleRaw.height)
  const base = centerProjectOnCanvas(poseProject, canvasWidth, canvasHeight)
  const inhale = centerProjectOnCanvas(inhaleProject, canvasWidth, canvasHeight)
  const makeFrame = async (project: FabricatorProject, durationMs: number): Promise<AnimatorFrame> => {
    const transforms = transformsFromProject(project)
    return {
      id: crypto.randomUUID(),
      durationMs,
      transforms,
      joints: structuredClone(project.joints),
      thumbnailDataUrl: await renderThumbnail(base, transforms)
    }
  }
  const cycle = variation.cycleMs
  const frames = [
    await makeFrame(base, Math.round(cycle * .36)),
    await makeFrame(inhale, Math.round(cycle * .1)),
    await makeFrame(inhale, Math.round(cycle * .38)),
    await makeFrame(base, Math.round(cycle * .16))
  ]

  return {
    schemaVersion: 1,
    slot,
    name: `Respiração · ${resolvePoseCategory(pose)} · ${variation.name}`,
    sourceModelSlot: source.slot,
    sourceModelName: source.name,
    sourceModelUpdatedAt: source.updatedAt,
    sourceModelPartCount: source.parts.length,
    basePoseSlot: pose.slot,
    characterId,
    width: canvasWidth,
    height: canvasHeight,
    parts: structuredClone(base.parts),
    joints: structuredClone(base.joints),
    layerOrder: normalizeLayerOrder(base.parts, base.layerOrder),
    hiddenPartIds: [...(base.hiddenPartIds ?? [])],
    frames,
    interpolation: 'smooth',
    loopMode: 'loop',
    speed: 1,
    thumbnailDataUrl: frames[0].thumbnailDataUrl,
    updatedAt: new Date().toISOString()
  }
}
