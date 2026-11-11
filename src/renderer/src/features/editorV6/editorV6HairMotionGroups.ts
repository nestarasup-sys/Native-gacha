import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6HairMotionTarget } from './editorV6HairMotionTargets'

export type EditorV6HairMotionGroup = { character: CustomizerCharacter; targets: EditorV6HairMotionTarget[] }

/** Groups export targets by saved character and effective pose without mutating catalog records. */
export function groupEditorV6HairMotionTargets(
  targets: readonly EditorV6HairMotionTarget[],
  characterById: ReadonlyMap<string, CustomizerCharacter>
): Map<string, EditorV6HairMotionGroup> {
  const groups = new Map<string, EditorV6HairMotionGroup>()
  for (const target of targets) {
    const character = characterById.get(target.state.characterId!)
    if (!character || !character.customization.hairAppearance) continue
    const poseSlot = target.state.poseSlot === undefined ? character.customization.poseSlot : target.state.poseSlot
    const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot } }
    const key = `${character.id}:${poseSlot ?? 'base'}`
    const group = groups.get(key) ?? { character: characterCopy, targets: [] }
    group.targets.push(target)
    groups.set(key, group)
  }
  return groups
}
