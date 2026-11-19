import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../../src/shared/editorV6'
import type { EditorV6ExportMouthLoops, EditorV6ExportPart } from '../../../src/shared/editorV6Export'
import type { EditorV6HairMotionBundle, EditorV6HairMotionRig } from '../../../src/shared/editorV6HairMotion'
import { editorV6MotionPlans } from '../../../src/shared/editorV6Motion'
import { compareEditorV6TimelineBlocks } from '../../../src/shared/editorV6TimelineCore'
import type { EditorV6WorkerAssetSources } from './exportWorkerMediaProtocol'

type HairRigKey = `${string}:${string}`

export type EditorV6ExportWorkerData = {
  project: EditorV6Document
  includeSpeechMouth: boolean
  /** Main-process-only image bytes; never returned through worker IPC. */
  assetSources: EditorV6WorkerAssetSources
  hairAnimation?: EditorV6HairMotionBundle
}

function activeBlocks(track: EditorV6TimelineTrack, part: EditorV6ExportPart): EditorV6TimelineBlock[] {
  const blocks = [...track.blocks].sort(compareEditorV6TimelineBlocks)
  if (track.kind === 'character') {
    const previous = blocks.filter(block => block.startFrame <= part.startFrame).at(-1)
    return [...new Map([
      ...(previous ? [[previous.id, previous] as const] : []),
      ...blocks.filter(block => block.startFrame > part.startFrame && block.startFrame < part.endFrame).map(block => [block.id, block] as const)
    ]).values()]
  }
  return blocks.filter(block => block.startFrame < part.endFrame && block.startFrame + block.durationFrames > part.startFrame)
}

function collectStateAssets(state: EditorV6Element | undefined, assetIds: Set<string>) {
  if (!state) return
  if (state.assetId) assetIds.add(state.assetId)
  for (const assetId of Object.values(state.faceModeAssetIds ?? {})) if (assetId) assetIds.add(assetId)
  if (state.mouthPatch?.assetId) assetIds.add(state.mouthPatch.assetId)
}

function collectRigImageIds(rig: EditorV6HairMotionRig, surfaceIds: Set<string>, textureIds: Set<string>) {
  surfaceIds.add(rig.baseSurfaceId)
  surfaceIds.add(rig.faceSurfaceId)
  if (rig.mouthlessFaceSurfaceId) surfaceIds.add(rig.mouthlessFaceSurfaceId)
  if (rig.eyesAboveRearHairSurfaceId) surfaceIds.add(rig.eyesAboveRearHairSurfaceId)
  if (rig.overlaySurfaceId) surfaceIds.add(rig.overlaySurfaceId)
  for (const layer of rig.layers) textureIds.add(layer.textureId)
}

function collectTransitionSurfaceIds(animation: EditorV6HairMotionBundle, elementIds: ReadonlySet<string>, part: EditorV6ExportPart, surfaceIds: Set<string>) {
  for (const transition of animation.motionTransitions ?? []) {
    if (!elementIds.has(transition.elementId) || transition.startFrame >= part.endFrame || transition.endFrame <= part.startFrame) continue
    surfaceIds.add(transition.behindFaceSurfaceId)
    surfaceIds.add(transition.faceSurfaceId)
    if (transition.eyesAboveRearHairSurfaceId) surfaceIds.add(transition.eyesAboveRearHairSurfaceId)
    if (transition.overlaySurfaceId) surfaceIds.add(transition.overlaySurfaceId)
    if (transition.faceAtlasSurfaceId) surfaceIds.add(transition.faceAtlasSurfaceId)
  }
}

/** Build a worker-local snapshot containing only images that can be drawn by this render part.
 * Timeline and rig metadata stay intact for the head-path calculation, which replays from frame 0.
 */
export function createEditorV6ExportWorkerData(
  project: EditorV6Document,
  part: EditorV6ExportPart,
  mouthLoops?: EditorV6ExportMouthLoops,
  hairAnimation?: EditorV6HairMotionBundle,
  includeSpeechMouth = true
): EditorV6ExportWorkerData {
  const assetIds = new Set<string>()
  const elementById = new Map(project.elements.map(element => [element.id, element]))
  const trackedElementIds = new Set([
    ...(project.timeline.knownElementIds ?? []),
    ...project.timeline.tracks.flatMap(track => track.blocks.flatMap(block => {
      const elementId = block.elementId ?? block.state?.id
      return elementId ? [elementId] : []
    }))
  ])
  const activeCharacterStates: EditorV6Element[] = []
  const relevantCharacterElementIds = new Set<string>()

  if (project.backgroundAssetId) assetIds.add(project.backgroundAssetId)
  // Untracked scene elements remain visible for the entire worker lifetime.
  for (const element of project.elements) {
    if (!trackedElementIds.has(element.id)) collectStateAssets(element, assetIds)
    if (element.kind === 'character' && !trackedElementIds.has(element.id)) {
      activeCharacterStates.push(element)
      relevantCharacterElementIds.add(element.id)
    }
  }

  for (const track of project.timeline.tracks) {
    if (track.hidden || track.muted) continue
    for (const block of activeBlocks(track, part)) {
      const fallback = block.elementId ? elementById.get(block.elementId)
        : track.kind === 'character' && track.characterId ? project.elements.find(element => element.characterId === track.characterId)
          : undefined
      const state = block.state ?? fallback
      collectStateAssets(state, assetIds)
      if (state?.kind === 'character') {
        activeCharacterStates.push(state)
        relevantCharacterElementIds.add(state.id)
      }
      if (block.background?.backgroundAssetId) assetIds.add(block.background.backgroundAssetId)
    }
  }

  // Backgrounds are persistent states. Keep the last one before this part and
  // every change within it; retain earlier scene assets only as small metadata.
  const backgroundBlocks = project.timeline.tracks.filter(track => !track.hidden && !track.muted)
    .flatMap(track => track.blocks.filter(block => block.background && block.startFrame <= part.endFrame))
    .sort(compareEditorV6TimelineBlocks)
  const activeBackground = backgroundBlocks.filter(block => block.startFrame <= part.startFrame).at(-1)
  if (activeBackground?.background?.backgroundAssetId) assetIds.add(activeBackground.background.backgroundAssetId)
  for (const block of backgroundBlocks) {
    if (block.startFrame > part.startFrame && block.startFrame < part.endFrame && block.background?.backgroundAssetId) assetIds.add(block.background.backgroundAssetId)
  }

  const blocksById = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  const activeMotionStates: EditorV6Element[] = []
  for (const plan of editorV6MotionPlans(project, { includeSpeechMouth })) {
    if (plan.startFrame >= part.endFrame || plan.endFrame <= part.startFrame) continue
    activeMotionStates.push(plan.from, plan.to)
    relevantCharacterElementIds.add(plan.elementId)
    const motion = blocksById.get(plan.blockId)?.incomingMotion
    if (motion?.key !== plan.key) continue
    assetIds.add(motion.assetId)
    if (motion.faceAssetId) assetIds.add(motion.faceAssetId)
  }

  for (const state of activeMotionStates) collectStateAssets(state, assetIds)
  for (const state of mouthLoops?.states ?? []) {
    assetIds.add(state.assetId)
    if (state.sourceAssetId) assetIds.add(state.sourceAssetId)
    for (const assetId of Object.values(state.baseAssetIds ?? {})) if (assetId) assetIds.add(assetId)
  }

  const assetSources = new Map<string, { dataUrl: string; mimeType: string }>()
  const urlsByData = new Map<string, string>()
  const snapshotImageUrl = (dataUrl: string, mimeType?: string) => {
    if (!dataUrl.startsWith('data:')) return dataUrl
    const embeddedMimeType = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(dataUrl)?.[1].toLowerCase()
    if (!embeddedMimeType || (mimeType !== undefined && embeddedMimeType !== mimeType.toLowerCase())) {
      throw Error('Imagem de exportação inválida no snapshot do worker.')
    }
    const existing = urlsByData.get(dataUrl)
    if (existing) return existing
    const token = `asset-${assetSources.size}`
    const url = `gacha-editor-media://snapshot/${project.id}/${token}`
    assetSources.set(token, { dataUrl, mimeType: embeddedMimeType })
    urlsByData.set(dataUrl, url)
    return url
  }
  const workerProject: EditorV6Document = {
    ...project,
    assets: project.assets.filter(asset => assetIds.has(asset.id)).map(asset => ({
      ...asset,
      dataUrl: asset.libraryAssetId ? asset.dataUrl : snapshotImageUrl(asset.dataUrl, asset.mimeType)
    }))
  }
  if (!hairAnimation) return { project: workerProject, includeSpeechMouth, assetSources }

  const requiredRigKeys = new Set<HairRigKey>()
  const requiredPoseKeys = new Set<string>()
  for (const state of [...activeCharacterStates, ...activeMotionStates]) {
    if (state.kind !== 'character') continue
    const direct = state.assetId
      ? hairAnimation.rigs.find(rig => rig.elementId === state.id && rig.assetId === state.assetId)
      : undefined
    if (state.assetId) requiredRigKeys.add(`${state.id}:${state.assetId}`)
    const poseSlot = state.poseSlot ?? direct?.poseSlot
    requiredPoseKeys.add(`${state.id}:${poseSlot ?? 'base'}`)
  }

  const rigs = hairAnimation.rigs.filter(rig => relevantCharacterElementIds.has(rig.elementId))
  const activeImageRigs = rigs.filter(rig => requiredRigKeys.has(`${rig.elementId}:${rig.assetId}`)
    || requiredPoseKeys.has(`${rig.elementId}:${rig.poseSlot ?? 'base'}`))
  const surfaceIds = new Set<string>()
  const textureIds = new Set<string>()
  for (const rig of activeImageRigs) collectRigImageIds(rig, surfaceIds, textureIds)
  collectTransitionSurfaceIds(hairAnimation, relevantCharacterElementIds, part, surfaceIds)

  return {
    project: workerProject,
    includeSpeechMouth,
    assetSources,
    hairAnimation: {
      ...hairAnimation,
      rigs,
      surfaces: hairAnimation.surfaces.filter(surface => surfaceIds.has(surface.id)).map(surface => ({
        ...surface, dataUrl: snapshotImageUrl(surface.dataUrl)
      })),
      textures: hairAnimation.textures.filter(texture => textureIds.has(texture.id)).map(texture => ({
        ...texture, dataUrl: snapshotImageUrl(texture.dataUrl)
      })),
      ...(hairAnimation.motionTransitions
        ? { motionTransitions: hairAnimation.motionTransitions.filter(transition => relevantCharacterElementIds.has(transition.elementId)) }
        : {})
    }
  }
}
