import { randomUUID } from 'node:crypto'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { editorV6CharacterSnapshotIsCurrent } from '../../../src/shared/editorV6CharacterSource.ts'
import { editorV6MotionHasAvailableAssets, editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { editorV6MotionBakeLaneAssignments } from './motionBakeSchedule'

export async function prepareExportMotions(project: EditorV6Document, startFrame: number, endFrame: number, deps: {
  signal: AbortSignal; characters: CustomizerCharacter[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
  includeSpeechMouth?: boolean
  mouthLoop?: { startFrame: number; cycleFrames: number }
  concurrency?: 1 | 2 | 3
  /** Export-only fresh render: ignore atlas snapshots attached by previous runs. */
  ignoreExistingMotions?: boolean
}) {
  const began = performance.now()
  const characters = new Map(deps.characters.map((character) => [character.id, character]))
  const characterStates = [
    ...project.elements,
    ...project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => block.state ? [block.state] : []))
  ]
  for (const state of characterStates) {
    if (state.kind !== 'character' || !state.characterId) continue
    const character = characters.get(state.characterId)
    // Older projects may not carry a source revision yet. The renderer refreshes
    // those snapshots before export; only reject a known, mismatched revision here.
    if (!character || !state.characterSourceUpdatedAt || editorV6CharacterSnapshotIsCurrent(state, character)) continue
    throw Error(`A aparência salva de ${state.text || character.name} está desatualizada em relação ao Customizador. Aguarde a atualização automática no Editor V6 antes de exportar novamente.`)
  }

  const motionOptions = { includeSpeechMouth: deps.includeSpeechMouth !== false }
  const plans = editorV6MotionPlans(project, motionOptions)
  // The editor can reuse attached atlases for interactive previews. The
  // isolated export instead starts with fresh pixels so previous exports
  // cannot affect measurements or visually stale motion samples.
  const missingIds = deps.ignoreExistingMotions
    ? undefined
    : new Set(missingEditorV6Motions(project, startFrame, endFrame, motionOptions).map((plan) => plan.blockId))
  const missing = plans.filter((plan) => plan.startFrame < endFrame && plan.endFrame > startFrame
    && (!missingIds || missingIds.has(plan.blockId)))
  const groups = new Map<string, typeof missing>()
  for (const plan of missing) {
    const group = groups.get(plan.key)
    if (group) group.push(plan)
    else groups.set(plan.key, [plan])
  }
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const knownMotions = new Map<string, NonNullable<EditorV6Document['timeline']['tracks'][number]['blocks'][number]['incomingMotion']>>()
  if (!deps.ignoreExistingMotions) for (const track of project.timeline.tracks) for (const block of track.blocks) {
    const motion = block.incomingMotion
    if (!motion || !editorV6MotionHasAvailableAssets(motion, assets)) continue
    if (!knownMotions.has(motion.key)) knownMotions.set(motion.key, motion)
  }
  const plansByBlock = new Map(plans.map((plan) => [plan.blockId, plan]))
  const preparedByBlock = new Map<string, Pick<EditorV6MotionBakeResult, 'asset' | 'faceAsset' | 'motion'>>()
  const transitionProfiles: Array<{ milliseconds: number; preparedRigs: number; reusedRigs: number; profile?: EditorV6MotionBakeResult['metrics']['profile'] }> = []
  const groupedPlans = [...groups.values()]
  const preparedGroups: Array<{ result: Pick<EditorV6MotionBakeResult, 'asset' | 'faceAsset' | 'motion'>; baked: boolean; milliseconds: number } | undefined> = Array(groupedPlans.length)
  const concurrency = deps.concurrency ?? 1
  const schedulableLaneCount = Math.min(concurrency, Math.max(1, groupedPlans.length)) as 1 | 2 | 3
  // Keep a character's sequence on one stable bake loop. A shared work-stealing
  // queue can send consecutive requests to separate Electron sessions and lose
  // endpoint-renderer reuse even when the groups are adjacent.
  const laneAssignments = editorV6MotionBakeLaneAssignments(groupedPlans, schedulableLaneCount)
  let completed = 0, baked = 0, preparedRigs = 0, reusedRigs = 0, rigKeyLookups = 0, rigRebuilds = 0, rigBuildMilliseconds = 0, activeBakes = 0, maxConcurrentBakes = 0, failure: unknown
  const controller = new AbortController()
  const abortWithParent = () => controller.abort(deps.signal.reason ?? Error('Preparação de transições cancelada.'))
  deps.signal.addEventListener('abort', abortWithParent, { once: true })
  if (deps.signal.aborted) abortWithParent()
  const prepareLane = async (indices: readonly number[]) => {
    for (const index of indices) {
      if (controller.signal.aborted) return
      const plans = groupedPlans[index], plan = plans[0], character = characters.get(plan.characterId)
      if (!character) {
        failure = Error(`Não foi possível preparar a transição: personagem ${plan.from.text} não encontrado.`)
        controller.abort(failure)
        throw failure
      }
      deps.progress(completed, missing.length, plan.from.text)
      // One static talk face accompanies pose/expression interpolation.
      // The separate speech loop must not force a valid motion to re-bake.
      const known = knownMotions.get(plan.key)
      const asset = known && assets.get(known.assetId)
      const started = performance.now()
      try {
        let result: Pick<EditorV6MotionBakeResult, 'asset' | 'faceAsset' | 'motion'>
        if (known && asset) result = { asset, ...(known.faceAssetId ? { faceAsset: assets.get(known.faceAssetId) } : {}), motion: known }
        else {
          activeBakes++
          maxConcurrentBakes = Math.max(maxConcurrentBakes, activeBakes)
          try {
            const bakedResult = await deps.bake({ id: randomUUID(), plan, character }, controller.signal)
            preparedRigs += bakedResult.metrics.preparedRigs
            reusedRigs += bakedResult.metrics.reusedRigs ?? 0
            rigKeyLookups += bakedResult.metrics.rigKeyLookups ?? 0
            rigRebuilds += bakedResult.metrics.rigRebuilds ?? 0
            rigBuildMilliseconds += bakedResult.metrics.rigBuildMilliseconds ?? 0
            transitionProfiles.push({ milliseconds: bakedResult.metrics.milliseconds, preparedRigs: bakedResult.metrics.preparedRigs, reusedRigs: bakedResult.metrics.reusedRigs ?? 0, profile: bakedResult.metrics.profile })
            result = bakedResult
          } finally { activeBakes-- }
        }
        controller.signal.throwIfAborted()
        preparedGroups[index] = { result, baked: !known || !asset, milliseconds: performance.now() - started }
        completed += plans.length
        deps.progress(completed, missing.length, plan.from.text)
      } catch (error) {
        if (failure === undefined) failure = error
        controller.abort(error)
        throw error
      }
    }
  }
  try {
    const workers = await Promise.allSettled(laneAssignments.map((indices) => prepareLane(indices)))
    if (failure !== undefined) throw failure
    const failedWorker = workers.find((worker) => worker.status === 'rejected')
    if (failedWorker?.status === 'rejected') throw failedWorker.reason
    deps.signal.throwIfAborted()
  } finally { deps.signal.removeEventListener('abort', abortWithParent) }
  const timings: number[] = []
  for (let index = 0; index < preparedGroups.length; index++) {
    const prepared = preparedGroups[index]
    if (!prepared) throw Error('A preparação não concluiu todas as transições solicitadas.')
    if (prepared.baked) baked++
    timings.push(prepared.milliseconds)
    assets.set(prepared.result.asset.id, prepared.result.asset)
    if (prepared.result.faceAsset) assets.set(prepared.result.faceAsset.id, prepared.result.faceAsset)
    for (const repeated of groupedPlans[index]) preparedByBlock.set(repeated.blockId, prepared.result)
  }
  if (preparedByBlock.size) {
    const blocksWithPlans = new Set(plansByBlock.keys())
    project = {
      ...project,
      assets: [...assets.values()],
      timeline: {
        ...project.timeline,
        tracks: project.timeline.tracks.map((track) => ({
          ...track,
          blocks: track.blocks.map((block) => {
            if (!blocksWithPlans.has(block.id)) return block
            const result = preparedByBlock.get(block.id)
            const plan = plansByBlock.get(block.id)
            return result && plan?.key === result.motion.key ? { ...block, incomingMotion: result.motion } : block
          })
        }))
      }
    }
  }
  const percentile = (values: number[], fraction: number) => {
    if (!values.length) return 0
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
  }
  const stageNames = ['assetLoadingMs', 'poseResolutionMs', 'facePreparationMs', 'endpointGeometryMs', 'rigBuildMs', 'sampleRenderingMs', 'cropDetectionMs', 'facePatchPreparationMs', 'atlasAssemblyMs', 'faceAtlasMs', 'atlasEncodingMs', 'ipcRoundTripMs', 'ipcOverheadMs'] as const
  const stageSummary = Object.fromEntries(stageNames.map((stage) => {
    const values = transitionProfiles.map((item) => item.profile?.[stage]).filter((value): value is number => typeof value === 'number')
    return [stage, { samples: values.length, totalMs: values.reduce((sum, value) => sum + value, 0), p50Ms: percentile(values, .5), p95Ms: percentile(values, .95) }]
  }))
  const endpointGeometryCacheHits = transitionProfiles.reduce((sum, item) => sum + (item.profile?.endpointGeometryCacheHits ?? 0), 0)
  const endpointGeometryCacheMisses = transitionProfiles.reduce((sum, item) => sum + (item.profile?.endpointGeometryCacheMisses ?? 0), 0)
  const characterSequences = new Set(groupedPlans.map((group) => group[0]?.characterId).filter((id): id is string => Boolean(id))).size
  const assignedLanes = laneAssignments.filter((lane) => lane.length > 0).length
  return { project, stats: {
    total: missing.length, unique: groupedPlans.length, requested: baked, reused: missing.length - baked,
    preparedRigs, reusedRigs, rigKeyLookups, rigRebuilds, rigBuildMilliseconds, maxConcurrentBakes,
    configuredConcurrency: concurrency, characterSequences, assignedLanes,
    endpointGeometryCacheHits, endpointGeometryCacheMisses,
    milliseconds: performance.now() - began, requestMilliseconds: timings,
    stageSummary,
    transitionProfiles: transitionProfiles.map(({ milliseconds, preparedRigs, reusedRigs, profile }) => ({ milliseconds, preparedRigs, reusedRigs, profile }))
  } }
}
