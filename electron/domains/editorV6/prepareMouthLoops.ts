import { createHash, randomUUID } from 'node:crypto'
import type { EditorV6Document, EditorV6Element } from '../../../src/shared/editorV6'
import { hasEditorV6CharacterSpeechOverlap } from '../../../src/shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, type EditorV6ExportMouthLoopState, type EditorV6ExportMouthLoops } from '../../../src/shared/editorV6Export'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

const MAX_ATLAS_BYTES = 64 * 1024 * 1024
const MAX_ATLAS_PIXELS = 32_000_000
const MAX_SINGLE_ATLAS_PIXELS = 8_000_000
type Character = EditorV6MotionBakeRequest['character']
type Candidate = { state: EditorV6Element; character: Character; blockIds: string[]; key: string }

function stateKey(state: EditorV6Element, character: Character): string {
  const visualState = [state.id, state.assetId, state.characterId, state.characterSourceUpdatedAt, state.modelSourceRevision, state.poseSourceRevision, state.poseSlot,
    state.x, state.y, state.width, state.height, state.rotation, state.flipX, state.characterScale, state.characterWidthScale, state.characterHeightScale,
    state.faceAppearance, state.faceTransforms, state.activeExpressionEffects, state.activeExpressionPresetId, state.activeExpressionPresetUpdatedAt,
    character.id, character.updatedAt, character.customization]
  return createHash('sha256').update(JSON.stringify(['editor-v6-mouth-patch-v2', visualState, EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES])).digest('hex')
}

function candidateFor(state: EditorV6Element, blockId: string, character: Character, target: Map<string, Candidate>) {
  if (state.kind !== 'character' || state.visible === false || state.characterId !== character.id) return
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
  const speaksDuring = (characterId: string, start: number, end: number) => hasEditorV6CharacterSpeechOverlap(project.timeline, characterId, start, end)
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
      const relevant = sorted.filter((block) => block.startFrame < endFrame && block.startFrame + block.durationFrames > startFrame)
      for (const block of relevant) {
        const activeStart = Math.max(startFrame, block.startFrame), activeEnd = Math.min(endFrame, block.startFrame + block.durationFrames)
        const state = block.state ?? baseById.get(elementId)
        const characterId = state?.characterId ?? block.characterId ?? track.characterId
        if (!characterId || !speaksDuring(characterId, activeStart, activeEnd)) continue
        if (!state || state.kind !== 'character') throw Error(`Não foi possível preparar a boca de ${characterId}: o estado do personagem não está disponível no trecho falado.`)
        if (state.visible === false) continue
        const character = charactersById.get(characterId)
        if (!character) throw Error(`Não foi possível animar a boca de ${state.text || characterId}: personagem não encontrado no Customizador.`)
        if (state.characterSourceUpdatedAt && state.characterSourceUpdatedAt !== character.updatedAt) { staleStates.add(`${state.id}:${block.id}`); continue }
        candidateFor(state.id === elementId ? state : { ...state, id: elementId }, block.id, character, candidates)
      }
    }
  }
  // Some projects keep a visible character directly on the canvas without a timeline clip.
  for (const state of project.elements) {
    if (state.kind !== 'character' || state.visible === false || managedElementIds.has(state.id) || !state.characterId || !speaksDuring(state.characterId, startFrame, endFrame)) continue
    const character = charactersById.get(state.characterId)
    if (!character) throw Error(`Não foi possível animar a boca de ${state.text || state.characterId}: personagem não encontrado no Customizador.`)
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
    plan: { blockId: randomUUID(), elementId: from.id, characterId: from.characterId!, key: `mouth-loop:${candidate.key}`, startFrame, endFrame, from, to, samples }
  }
}

export async function prepareExportMouthLoops(project: EditorV6Document, startFrame: number, endFrame: number, cycleFrames: number, deps: {
  signal: AbortSignal; characters: Character[]
  bake: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  progress: (completed: number, total: number, name: string) => void
}, phaseStartFrame = startFrame, concurrentParts: 1 | 2 = 1) {
  const began = performance.now()
  const { candidates, skippedStale } = candidatesFor(project, deps.characters, startFrame, endFrame)
  if (skippedStale) throw Error('A animação da boca não pode usar um personagem alterado no Customizador depois de entrar no Editor V6. Atualize o personagem no projeto e tente exportar de novo.')
  if (!candidates.length) return {
    project,
    mouthLoops: { startFrame: phaseStartFrame, cycleFrames, states: [] } satisfies EditorV6ExportMouthLoops,
    stats: { states: 0, characters: 0, skipped: 0, skippedStale: 0, skippedUnsupported: 0, atlasBytes: 0, atlasPixels: 0, errors: [], milliseconds: performance.now() - began }
  }

  const states: EditorV6ExportMouthLoopState[] = []
  let atlasBytes = 0, atlasPixels = 0, projectWithAssets = project
  const errors: string[] = []
  const statePixelBudget = Math.min(MAX_SINGLE_ATLAS_PIXELS, Math.floor(MAX_ATLAS_PIXELS / candidates.length / concurrentParts))
  const stateByteBudget = Math.floor(MAX_ATLAS_BYTES / candidates.length / concurrentParts)
  if (statePixelBudget < 1 || stateByteBudget < 1) throw Error(`A camada facial de ${candidates.length} personagens falando excede o orçamento seguro de memória. Reduza o número de personagens simultâneos neste trecho.`)
  for (const [index, candidate] of candidates.entries()) {
    deps.signal.throwIfAborted()
    deps.progress(index, candidates.length, candidate.state.text || 'Personagem')
    const result = await deps.bake(requestFor(candidate, statePixelBudget), deps.signal)
    deps.signal.throwIfAborted()
    if (result.motion.frames.length !== EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.length || result.motion.frames.some((frame) => !frame.facePatch)) throw Error(`A preparação facial de ${candidate.state.text || candidate.character.id} não produziu os três recortes completos da boca.`)
    if (result.metrics.atlasPixels > statePixelBudget || result.asset.dataUrl.length > stateByteBudget) throw Error(`A camada facial de ${candidate.state.text || candidate.character.id} excede o orçamento seguro em resolução nativa; reduza o número de personagens simultâneos neste trecho.`)
    atlasBytes += result.asset.dataUrl.length
    atlasPixels += result.metrics.atlasPixels
    if (atlasBytes > MAX_ATLAS_BYTES || atlasPixels > MAX_ATLAS_PIXELS) throw Error('As camadas faciais excedem o limite seguro de memória; reduza o número de personagens simultâneos neste trecho.')
    projectWithAssets = { ...projectWithAssets, assets: [...projectWithAssets.assets, result.asset] }
    states.push({ elementId: candidate.state.id, characterId: candidate.character.id, blockIds: candidate.blockIds, assetId: result.asset.id, frames: result.motion.frames })
  }
  deps.progress(candidates.length, candidates.length, 'Animação da boca pronta')
  return {
    project: projectWithAssets,
    mouthLoops: { startFrame: phaseStartFrame, cycleFrames, states } satisfies EditorV6ExportMouthLoops,
    stats: { states: states.length, characters: new Set(states.map((state) => state.characterId)).size, skipped: 0, skippedStale: 0, skippedUnsupported: 0, atlasBytes, atlasPixels, errors, milliseconds: performance.now() - began }
  }
}
