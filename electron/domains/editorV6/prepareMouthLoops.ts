import { createHash, randomUUID } from 'node:crypto'
import type { EditorV6Document, EditorV6Element } from '../../../src/shared/editorV6'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, type EditorV6ExportMouthLoopState, type EditorV6ExportMouthLoops } from '../../../src/shared/editorV6Export'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

const MAX_UNIQUE_STATES = 12
const MAX_ATLAS_BYTES = 64 * 1024 * 1024
const MAX_ATLAS_PIXELS = 32_000_000
const MAX_SINGLE_ATLAS_PIXELS = 8_000_000
const MIN_SINGLE_ATLAS_PIXELS = 1_000_000
const MAX_ATLAS_ATTEMPTS = 3
class MouthLoopResourceLimitError extends Error {}
type Character = EditorV6MotionBakeRequest['character']
type Candidate = { state: EditorV6Element; character: Character; blockIds: string[]; key: string }

function stateKey(state: EditorV6Element, character: Character): string {
  const visualState = [state.id, state.assetId, state.characterId, state.characterSourceUpdatedAt, state.poseSourceRevision, state.poseSlot,
    state.x, state.y, state.width, state.height, state.rotation, state.flipX, state.characterScale, state.characterWidthScale, state.characterHeightScale,
    state.faceAppearance, state.faceTransforms, state.activeExpressionEffects, state.activeExpressionPresetId, state.activeExpressionPresetUpdatedAt,
    character.id, character.updatedAt, character.customization]
  return createHash('sha256').update(JSON.stringify(['editor-v6-mouth-loop-v1', visualState, EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES])).digest('hex')
}

function candidateFor(state: EditorV6Element | undefined, blockId: string, character: Character, target: Map<string, Candidate>) {
  if (!state || state.kind !== 'character' || state.visible === false || state.characterId !== character.id) return
  const key = stateKey(state, character)
  const existing = target.get(key)
  if (existing) { if (!existing.blockIds.includes(blockId)) existing.blockIds.push(blockId); return }
  target.set(key, { state, character, blockIds: [blockId], key })
}

function candidatesFor(project: EditorV6Document, characters: readonly Character[], startFrame: number, endFrame: number) {
  const charactersById = new Map(characters.map((character) => [character.id, character]))
  const baseById = new Map(project.elements.map((element) => [element.id, element]))
  const candidates = new Map<string, Candidate>()
  const staleStates = new Set<string>()
  const managedElementIds = new Set(project.timeline.knownElementIds ?? [])
  for (const track of project.timeline.tracks) for (const block of track.blocks) if (block.elementId) managedElementIds.add(block.elementId)
  for (const track of project.timeline.tracks) {
    if (track.kind !== 'character' || track.hidden || track.muted) continue
    const byElement = new Map<string, typeof track.blocks>()
    for (const block of track.blocks) if (block.elementId) {
      const blocks = byElement.get(block.elementId) ?? []
      blocks.push(block); byElement.set(block.elementId, blocks)
    }
    for (const [elementId, blocks] of byElement) {
      const sorted = [...blocks].sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))
      const preceding = sorted.filter((block) => block.startFrame <= startFrame).at(-1)
      const during = sorted.filter((block) => block.startFrame > startFrame && block.startFrame < endFrame)
      const relevant = [...new Map([...(preceding ? [preceding] : []), ...during].map((block) => [block.id, block])).values()]
      for (const block of relevant) {
        const state = block.state ?? baseById.get(elementId)
        if (!state?.characterId) continue
        const character = charactersById.get(state.characterId)
        if (!character) continue
        if (state.characterSourceUpdatedAt && state.characterSourceUpdatedAt !== character.updatedAt) { staleStates.add(`${state.id}:${block.id}`); continue }
        candidateFor(state.id === elementId ? state : { ...state, id: elementId }, block.id, character, candidates)
      }
    }
  }
  // Some projects keep a visible character directly on the canvas without a timeline clip.
  for (const state of project.elements) {
    if (state.kind !== 'character' || managedElementIds.has(state.id) || !state.characterId) continue
    const character = charactersById.get(state.characterId)
    if (!character) continue
    if (state.characterSourceUpdatedAt && state.characterSourceUpdatedAt !== character.updatedAt) { staleStates.add(`${state.id}:${state.id}`); continue }
    candidateFor(state, state.id, character, candidates)
  }
  return { candidates: [...candidates.values()], skippedStale: staleStates.size }
}

function requestFor(candidate: Candidate, maxAtlasPixels: number): EditorV6MotionBakeRequest {
  const from = { ...candidate.state, activeFaceMode: 'talk' as const }
  const to = { ...from }
  const startFrame = 0.5, endFrame = 8
  const samples = EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.map((_, index) => {
    const offset = index - EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.length
    return { offset, progress: (endFrame + offset - startFrame) / (endFrame - startFrame), faceMode: 'talk' as const }
  })
  return {
    id: randomUUID(), character: candidate.character, mouthScaleSamples: [...EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES], maxAtlasPixels,
    plan: { blockId: randomUUID(), elementId: from.id, characterId: from.characterId!, key: `mouth-loop:${candidate.key}:${maxAtlasPixels}`, startFrame, endFrame, from, to, samples }
  }
}

export async function prepareExportMouthLoops(project: EditorV6Document, startFrame: number, endFrame: number, cycleFrames: number, deps: {
  signal: AbortSignal; characters: Character[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
}) {
  const began = performance.now()
  const { candidates, skippedStale } = candidatesFor(project, deps.characters, startFrame, endFrame)
  if (!candidates.length) {
    if (skippedStale) throw Error('A animação da boca foi ignorada porque o personagem foi alterado no Customizador depois de entrar no Editor V6. Atualize o personagem no projeto e tente exportar de novo.')
    throw Error('Não encontrei personagens visíveis com estados de pose dentro do intervalo de exportação.')
  }
  if (candidates.length > MAX_UNIQUE_STATES) throw Error(`A animação de boca precisa preparar ${candidates.length} estados de personagem. Para manter o uso de memória seguro, o limite é ${MAX_UNIQUE_STATES}; divida o intervalo de exportação.`)
  const states: EditorV6ExportMouthLoopState[] = []
  let atlasBytes = 0, atlasPixels = 0, projectWithAssets = project, skippedUnsupported = 0
  const errors: string[] = []
  const statePixelBudget = Math.floor(MAX_ATLAS_PIXELS / candidates.length)
  const stateByteBudget = Math.floor(MAX_ATLAS_BYTES / candidates.length)
  for (const [index, candidate] of candidates.entries()) {
    deps.signal.throwIfAborted()
    deps.progress(index, candidates.length, candidate.state.text || 'Personagem')
    try {
      let pixelLimit = Math.min(MAX_SINGLE_ATLAS_PIXELS, statePixelBudget)
      let result: EditorV6MotionBakeResult | undefined
      for (let attempt = 0; attempt < MAX_ATLAS_ATTEMPTS; attempt++) {
        result = await deps.bake(requestFor(candidate, pixelLimit), deps.signal)
        deps.signal.throwIfAborted()
        if (result.motion.frames.length !== EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.length) throw Error('O renderizador não preparou todos os tamanhos da boca.')
        if (result.metrics.atlasPixels <= statePixelBudget && result.asset.dataUrl.length <= stateByteBudget) break
        if (attempt === MAX_ATLAS_ATTEMPTS - 1 || pixelLimit <= MIN_SINGLE_ATLAS_PIXELS) {
          throw new MouthLoopResourceLimitError('O loop da boca ainda excede a memória disponível mesmo com imagens simplificadas. Reduza o trecho ou desative o loop da boca.')
        }
        const pixelRatio = Math.min(statePixelBudget / Math.max(1, result.metrics.atlasPixels), stateByteBudget / Math.max(1, result.asset.dataUrl.length), 0.8)
        pixelLimit = Math.max(MIN_SINGLE_ATLAS_PIXELS, Math.min(pixelLimit - 1, Math.floor(result.metrics.atlasPixels * pixelRatio * 0.85)))
      }
      if (!result) throw Error('O renderizador não preparou a animação da boca.')
      atlasBytes += result.asset.dataUrl.length
      atlasPixels += result.metrics.atlasPixels
      if (atlasBytes > MAX_ATLAS_BYTES || atlasPixels > MAX_ATLAS_PIXELS) throw new MouthLoopResourceLimitError('Os atlases da animação excederam o limite seguro de memória. Reduza o intervalo ou desative o loop da boca.')
      projectWithAssets = { ...projectWithAssets, assets: [...projectWithAssets.assets, result.asset] }
      states.push({ elementId: candidate.state.id, characterId: candidate.character.id, blockIds: candidate.blockIds, assetId: result.asset.id, frames: result.motion.frames })
    } catch (error) {
      deps.signal.throwIfAborted()
      if (error instanceof MouthLoopResourceLimitError) throw error
      skippedUnsupported++
      if (errors.length < 3) errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!states.length) throw Error(`Não foi possível preparar uma boca aberta para os personagens do intervalo. ${errors[0] ?? ''}`.trim())
  deps.progress(candidates.length, candidates.length, 'Animação da boca pronta')
  return {
    project: projectWithAssets,
    mouthLoops: { startFrame, cycleFrames, states } satisfies EditorV6ExportMouthLoops,
    stats: { states: states.length, characters: new Set(states.map((state) => state.characterId)).size, skipped: skippedStale + skippedUnsupported, skippedStale, skippedUnsupported, atlasBytes, atlasPixels, errors, milliseconds: performance.now() - began }
  }
}
