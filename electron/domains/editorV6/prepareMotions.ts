import { randomUUID } from 'node:crypto'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

export async function prepareExportMotions(project: EditorV6Document, startFrame: number, endFrame: number, deps: {
  signal: AbortSignal; characters: CustomizerCharacter[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
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
  let completed = 0, baked = 0
  const timings: number[] = []
  for (const plans of groups.values()) {
    deps.signal.throwIfAborted()
    const plan = plans[0], character = characters.get(plan.characterId)
    if (!character) throw Error(`Não foi possível preparar a transição: personagem ${plan.from.text} não encontrado.`)
    deps.progress(completed, missing.length, plan.from.text)
    const known = knownMotions.get(plan.key)
    const asset = known && assets.get(known.assetId)
    const started = performance.now()
    const result = known && asset ? { asset, motion: known }
      : await deps.bake({ id: randomUUID(), plan, character }, deps.signal)
    deps.signal.throwIfAborted()
    if (!known || !asset) baked++
    timings.push(performance.now() - started)
    assets.set(result.asset.id, result.asset)
    for (const repeated of plans) preparedByBlock.set(repeated.blockId, result)
    completed += plans.length
    deps.progress(completed, missing.length, plan.from.text)
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
  return { project, stats: { total: missing.length, unique: groups.size, requested: baked, reused: missing.length - baked, milliseconds: performance.now() - began, requestMilliseconds: timings } }
}
