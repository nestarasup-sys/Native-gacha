import type { CustomizerCharacter } from './customizer'
import type { EditorV6Document, EditorV6Element } from './editorV6'
import { FABRICATOR_MODEL_SLOT_COUNT, FABRICATOR_POSE_SLOT_COUNT } from './fabricator.ts'
import type { StudioDocument, StudioElement } from './studio'

export type FabricatorPoseReference = {
  modelSlot: number | null
  poseSlot: number
  ownerKey: string
  owner: string
}

type CharacterPoseOwner = Pick<CustomizerCharacter, 'id' | 'name' | 'customization'>
type StudioPoseDocument = Pick<StudioDocument, 'id' | 'title' | 'elements'>
type EditorV6PoseDocument = Pick<EditorV6Document, 'id' | 'title' | 'elements' | 'timeline'>
const sceneElementKinds = new Set(['image', 'character', 'narrator', 'speech', 'thought'])

function isPoseSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FABRICATOR_POSE_SLOT_COUNT
}

function isModelSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FABRICATOR_MODEL_SLOT_COUNT
}

function modelSlotOrUnknown(value: unknown): number | null {
  return isModelSlot(value) ? value : null
}

function uniqueReferences(references: FabricatorPoseReference[]): FabricatorPoseReference[] {
  const unique = new Map<string, FabricatorPoseReference>()
  for (const reference of references) unique.set(fabricatorPoseReferenceKey(reference), reference)
  return [...unique.values()]
}

export function fabricatorPoseReferenceKey(reference: FabricatorPoseReference): string {
  return `${reference.ownerKey}:${reference.modelSlot ?? 'unknown'}:${reference.poseSlot}`
}

export function collectCustomizerPoseReferences(
  characters: readonly CharacterPoseOwner[]
): FabricatorPoseReference[] {
  return characters.flatMap((character) => {
    const poseSlot = character.customization.poseSlot
    if (poseSlot === null || poseSlot === undefined) return []
    if (!isPoseSlot(poseSlot)) throw new Error(`A pose salva do personagem “${character.name}” está inválida.`)
    const savedModelSlot = character.customization.modelSlot
    return [{
      modelSlot: savedModelSlot === null || savedModelSlot === undefined ? 1 : modelSlotOrUnknown(savedModelSlot),
      poseSlot,
      ownerKey: `character:${character.id}`,
      owner: `personagem “${character.name}”`
    }]
  })
}

function sceneElementPoseReference(
  source: 'studio' | 'editor-v6',
  documentId: string,
  documentTitle: string,
  element: Pick<StudioElement | EditorV6Element, 'id' | 'kind' | 'text' | 'characterId' | 'poseSlot' | 'faceAppearance' | 'expressionBase'>,
  charactersById: ReadonlyMap<string, CharacterPoseOwner>,
  ownerKey: string,
  ownerDescription: string,
  characterIdOverride?: string
): FabricatorPoseReference | null {
  if (!sceneElementKinds.has(element.kind)) throw new Error(`O elemento ${ownerDescription || element.text || 'da cena'} tem um tipo inválido.`)
  if (element.kind !== 'character' || element.poseSlot === null || element.poseSlot === undefined) return null
  if (!isPoseSlot(element.poseSlot)) throw new Error(`A pose salva em ${ownerDescription || element.text || 'personagem'} está inválida.`)
  const characterId = element.characterId ?? characterIdOverride
  const character = characterId ? charactersById.get(characterId) : undefined
  const savedModelSlot = element.faceAppearance?.modelSlot ?? element.expressionBase?.appearance.modelSlot
  const modelSlot = character
    ? character.customization.modelSlot === null || character.customization.modelSlot === undefined
      ? 1
      : modelSlotOrUnknown(character.customization.modelSlot)
    : modelSlotOrUnknown(savedModelSlot)
  return {
    modelSlot,
    poseSlot: element.poseSlot,
    ownerKey: `${source}:${documentId}:${ownerKey}`,
    owner: `${source === 'studio' ? 'Studio' : 'Editor V6'} “${documentTitle}” · ${ownerDescription || element.text || 'personagem'}`
  }
}

export function collectStudioPoseReferences(
  documents: readonly StudioPoseDocument[],
  characters: readonly CharacterPoseOwner[]
): FabricatorPoseReference[] {
  const charactersById = new Map(characters.map((character) => [character.id, character]))
  return uniqueReferences(documents.flatMap((document) => document.elements.flatMap((element) => {
    const reference = sceneElementPoseReference(
      'studio', document.id, document.title, element, charactersById,
      `element:${element.id}`, element.text
    )
    return reference ? [reference] : []
  })))
}

export function collectEditorV6PoseReferences(
  documents: readonly EditorV6PoseDocument[],
  characters: readonly CharacterPoseOwner[]
): FabricatorPoseReference[] {
  const charactersById = new Map(characters.map((character) => [character.id, character]))
  const references = documents.flatMap((document) => {
    const elementReferences = document.elements.flatMap((element) => {
      const reference = sceneElementPoseReference(
        'editor-v6', document.id, document.title, element, charactersById,
        `element:${element.id}`, element.text
      )
      return reference ? [reference] : []
    })
    const blockReferences = document.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => {
      if (!block.state) return []
      const reference = sceneElementPoseReference(
        'editor-v6', document.id, document.title, block.state, charactersById,
        `block:${track.id}:${block.id}`, block.label, block.characterId ?? track.characterId
      )
      return reference ? [reference] : []
    }))
    return [...elementReferences, ...blockReferences]
  })
  return uniqueReferences(references)
}

export function addedFabricatorPoseReferences(
  next: readonly FabricatorPoseReference[],
  previous: readonly FabricatorPoseReference[]
): FabricatorPoseReference[] {
  const previousKeys = new Set(previous.map(fabricatorPoseReferenceKey))
  return uniqueReferences(next.filter((reference) => !previousKeys.has(fabricatorPoseReferenceKey(reference))))
}

export function findFabricatorPoseReferenceOwners(
  references: readonly FabricatorPoseReference[],
  modelSlot: number,
  poseSlot: number
): string[] {
  return [...new Set(references.filter((reference) => reference.poseSlot === poseSlot
    && (reference.modelSlot === null || reference.modelSlot === modelSlot))
    .map((reference) => reference.owner))]
}
