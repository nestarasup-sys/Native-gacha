import { randomUUID } from 'node:crypto'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

export async function prepareExportMotions(project: EditorV6Document, startFrame: number, endFrame: number, deps: {
  signal: AbortSignal; characters: CustomizerCharacter[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
  concurrency?: 1 | 2
}) {
  const began = performance.now(), missing = missingEditorV6Motions(project, startFrame, endFrame)
  const groups = new Map<string, typeof missing>()
  for (const plan of missing) {
    const group = groups.get(plan.key)
    if (group) group.push(plan)
    else groups.set(plan.key, [plan])
  }
  const characters = new Map(deps.characters.map((character) => [character.id, character]))
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const knownMotions = new Map<string, NonNullable<EditorV6Document['timeline']['tracks'][number]['blocks'][number]['incomingMotion']>>()
  for (const track of project.timeline.tracks) for (const block of track.blocks) {
    const motion = block.incomingMotion
    if (!motion || !assets.has(motion.assetId)) continue
    if (!knownMotions.has(motion.key)) knownMotions.set(motion.key, motion)
  }
  const plansByBlock = new Map(editorV6MotionPlans(project).map((plan) => [plan.blockId, plan]))
  const preparedByBlock = new Map<string, Pick<EditorV6MotionBakeResult, 'asset' | 'motion'>>()
  const groupedPlans = [...groups.values()]
  const preparedGroups: Array<{ result: Pick<EditorV6MotionBakeResult, 'asset' | 'motion'>; baked: boolean; milliseconds: number } | undefined> = Array(groupedPlans.length)
  const concurrency = Math.min(deps.concurrency ?? 1, Math.max(1, groupedPlans.length)) as 1 | 2
  let nextGroup = 0, completed = 0, baked = 0, activeBakes = 0, maxConcurrentBakes = 0, failure: unknown
  const controller = new AbortController()
  const abortWithParent = () => controller.abort(deps.signal.reason ?? Error('Preparação de transições cancelada.'))
  deps.signal.addEventListener('abort', abortWithParent, { once: true })
  if (deps.signal.aborted) abortWithParent()
  const prepareNext = async () => {
    while (!controller.signal.aborted) {
      const index = nextGroup++
      if (index >= groupedPlans.length) return
      const plans = groupedPlans[index], plan = plans[0], character = characters.get(plan.characterId)
      if (!character) {
        failure = Error(`Não foi possível preparar a transição: personagem ${plan.from.text} não encontrado.`)
        controller.abort(failure)
        throw failure
      }
      deps.progress(completed, missing.length, plan.from.text)
      const known = knownMotions.get(plan.key)
      const asset = known && assets.get(known.assetId)
      const started = performance.now()
      try {
        let result: Pick<EditorV6MotionBakeResult, 'asset' | 'motion'>
        if (known && asset) result = { asset, motion: known }
        else {
          activeBakes++
          maxConcurrentBakes = Math.max(maxConcurrentBakes, activeBakes)
          try { result = await deps.bake({ id: randomUUID(), plan, character }, controller.signal) }
          finally { activeBakes-- }
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
    const workers = await Promise.allSettled(Array.from({ length: concurrency }, () => prepareNext()))
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
  return { project, stats: { total: missing.length, unique: groupedPlans.length, requested: baked, reused: missing.length - baked, maxConcurrentBakes, milliseconds: performance.now() - began, requestMilliseconds: timings } }
}
