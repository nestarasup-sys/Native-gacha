import { randomUUID } from 'node:crypto'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { attachEditorV6Motion, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

export async function prepareExportMotions(project: EditorV6Document, startFrame: number, endFrame: number, deps: {
  signal: AbortSignal; characters: CustomizerCharacter[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
}) {
  const began = performance.now(), missing = missingEditorV6Motions(project, startFrame, endFrame)
  const groups = new Map<string, typeof missing>()
  for (const plan of missing) groups.set(plan.key, [...(groups.get(plan.key) ?? []), plan])
  const characters = new Map(deps.characters.map((character) => [character.id, character]))
  let completed = 0, baked = 0
  const timings: number[] = []
  for (const plans of groups.values()) {
    deps.signal.throwIfAborted()
    const plan = plans[0], character = characters.get(plan.characterId)
    if (!character) throw Error(`Não foi possível preparar a transição: personagem ${plan.from.text} não encontrado.`)
    deps.progress(completed, missing.length, plan.from.text)
    const known = project.timeline.tracks.flatMap((track) => track.blocks).find((block) => block.incomingMotion?.key === plan.key && project.assets.some((asset) => asset.id === block.incomingMotion?.assetId))?.incomingMotion
    const asset = known && project.assets.find((item) => item.id === known.assetId)
    const started = performance.now()
    const result = known && asset ? { asset, motion: known }
      : await deps.bake({ id: randomUUID(), plan, character }, deps.signal)
    deps.signal.throwIfAborted()
    if (!known || !asset) baked++
    timings.push(performance.now() - started)
    for (const repeated of plans) project = attachEditorV6Motion(project, repeated.blockId, result)
    completed += plans.length
    deps.progress(completed, missing.length, plan.from.text)
  }
  return { project, stats: { total: missing.length, unique: groups.size, requested: baked, reused: missing.length - baked, milliseconds: performance.now() - began, requestMilliseconds: timings } }
}
