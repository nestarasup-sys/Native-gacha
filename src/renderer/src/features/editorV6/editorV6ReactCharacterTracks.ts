import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element, EditorV6TimelineTrack } from '../../../../shared/editorV6'
import { EDITOR_V6_REACT_CHARACTER_SCALE, type EditorV6ReactImportPlan } from '../../../../shared/editorV6ReactImport'
import { EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets'

export type EditorV6ReactRenderedCharacterState = {
  base: EditorV6Asset
  extras: EditorV6Asset[]
  faceModeAssetIds: EditorV6Element['faceModeAssetIds']
  width: number
  height: number
  characterCanvasWidth: number
  appearance: EditorV6Element['faceAppearance']
  transforms: EditorV6Element['faceTransforms']
  effects: EditorV6Element['activeExpressionEffects']
  presetUpdatedAt?: string
}

type Options = {
  actors: EditorV6ReactImportPlan['cast']
  beats: EditorV6ReactImportPlan['beats']
  durationFrames: number
  characters: readonly CustomizerCharacter[]
  poseRevisions: ReadonlyMap<string, ReadonlyMap<number, string>>
  renderState: (
    actor: EditorV6ReactImportPlan['cast'][number],
    poseSlot: number | null,
    expression: string | undefined,
    gaze: 'left' | 'right'
  ) => Promise<EditorV6ReactRenderedCharacterState>
  onProgress?: (message: string) => void
  createId?: () => string
}

const createTrack = (id: string, name: string, characterId: string): EditorV6TimelineTrack => ({
  id, kind: 'character', name, characterId, muted: false, locked: false, blocks: []
})

/** Materialize planned character beats as immutable scene states and timeline blocks. */
export async function compileEditorV6ReactCharacterTracks({
  actors,
  beats,
  durationFrames,
  characters,
  poseRevisions,
  renderState,
  onProgress = () => {},
  createId = () => crypto.randomUUID()
}: Options): Promise<{ elements: EditorV6Element[]; tracks: EditorV6TimelineTrack[] }> {
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const elements: EditorV6Element[] = []
  const tracks: EditorV6TimelineTrack[] = []

  for (const actor of actors) {
    const actorBeats = beats.filter((item) => item.characterId === actor.characterId)
      .sort((a, b) => a.startFrame - b.startFrame)
    const initial = actorBeats.find((item) => item.startFrame === 0)
    if (!initial) throw new Error('Personagem sem estado inicial: ' + actor.name)

    let poseSlot: number | null = initial.poseSlot === undefined ? null : initial.poseSlot
    let expression = initial.expression
    let gaze: 'left' | 'right' = initial.gaze ?? 'right'
    const elementId = createId()
    const character = characterById.get(actor.characterId)
    if (!character) throw new Error('Personagem não encontrado durante a compilação: ' + actor.name)

    const baseGeometry = {
      id: elementId,
      kind: 'character' as const,
      characterId: actor.characterId,
      characterSourceUpdatedAt: character.updatedAt,
      faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
      activeFaceMode: 'idle' as const,
      activeExpressionCollectionId: 'standard',
      text: actor.name,
      x: actor.x,
      y: actor.y,
      rotation: 0,
      zIndex: elements.length + 1,
      characterScale: actor.scale ?? EDITOR_V6_REACT_CHARACTER_SCALE,
      characterWidthScale: 100,
      characterHeightScale: 100,
      flipX: actor.flipX ?? false
    }
    const lane = createTrack(createId(), actor.name, actor.characterId)
    tracks.push(lane)

    for (let index = 0; index < actorBeats.length; index++) {
      const beat = actorBeats[index]
      if (beat.poseSlot !== undefined) poseSlot = beat.poseSlot
      if (beat.expression !== undefined) expression = beat.expression
      if (beat.gaze !== undefined) gaze = beat.gaze
      onProgress('Preparando ' + actor.name + ': estado ' + (index + 1) + '/' + actorBeats.length)

      const rendered = await renderState(actor, poseSlot, expression, gaze)
      const poseRevision = poseSlot === null
        ? undefined
        : poseRevisions.get(actor.characterId)?.get(poseSlot) ?? 'missing'
      const state: EditorV6Element = {
        ...baseGeometry,
        assetId: rendered.base.id,
        faceModeAssetIds: rendered.faceModeAssetIds,
        poseSlot,
        ...(poseRevision ? { poseSourceRevision: poseRevision } : {}),
        ...(rendered.appearance ? {
          faceAppearance: rendered.appearance,
          expressionBase: {
            appearance: structuredClone(character.customization.faceAppearance ?? rendered.appearance),
            transforms: {}
          }
        } : {}),
        faceTransforms: rendered.transforms,
        activeExpressionEffects: rendered.effects,
        activeExpressionPresetId: expression ?? null,
        activeExpressionPresetUpdatedAt: rendered.presetUpdatedAt,
        activeExpressionGaze: gaze,
        characterCanvasWidth: rendered.characterCanvasWidth,
        width: rendered.width,
        height: rendered.height
      }
      const nextStartFrame = actorBeats[index + 1]?.startFrame ?? durationFrames
      if (nextStartFrame <= beat.startFrame) continue
      lane.blocks.push({
        id: createId(), elementId, state, label: actor.name,
        startFrame: beat.startFrame, durationFrames: nextStartFrame - beat.startFrame
      })
      if (index === 0) elements.push(state)
    }

    if (!lane.blocks.length) throw new Error('Personagem sem imagens visuais: ' + actor.name)
    // If a duplicate zero-time beat exists, use the first visible block as the base state.
    const baseIndex = elements.findIndex((element) => element.id === elementId)
    if (baseIndex >= 0) elements[baseIndex] = lane.blocks[0].state!
  }

  return { elements, tracks }
}
