import type { CustomizerCharacter } from './customizer'
import type { EditorV6Element } from './editorV6'

/** A rendered Editor V6 snapshot is valid only for the Customizer revision it captured. */
export function editorV6CharacterSnapshotIsCurrent(
  state: Pick<EditorV6Element, 'characterSourceUpdatedAt'>,
  character: Pick<CustomizerCharacter, 'updatedAt'>
): boolean {
  return Boolean(state.characterSourceUpdatedAt && state.characterSourceUpdatedAt === character.updatedAt)
}
