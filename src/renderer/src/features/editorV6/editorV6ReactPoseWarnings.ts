import type { CustomizerCharacter } from '../../../../shared/customizer'
import { resolvePoseCategory, type FabricatorPoseSummary } from '../../../../shared/fabricator'
import type { EditorV6ReactImport } from '../../../../shared/editorV6ReactImport'

const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')

/** Warn before import when explicit poses alternate between standing and sitting. */
export function editorV6ReactPoseWarnings(source: EditorV6ReactImport, characters: readonly CustomizerCharacter[], catalogs: ReadonlyMap<number, FabricatorPoseSummary[]>): string[] {
  return source.cast.flatMap((actor) => {
    const matches = characters.filter((character) => character.id.toLowerCase() === actor.character.toLowerCase() || key(character.name) === key(actor.character))
    if (matches.length !== 1) return []
    const character = matches[0]
    const poses = catalogs.get(character.customization.modelSlot ?? 1) ?? []
    const slots = new Set<number>()
    if (typeof actor.poseSlot === 'number') slots.add(actor.poseSlot)
    for (const beat of source.beats) {
      if (typeof beat.poseSlot === 'number' && (beat.character.toLowerCase() === character.id.toLowerCase() || key(beat.character) === key(character.name))) slots.add(beat.poseSlot)
    }
    const used = [...slots].flatMap((slot) => {
      const pose = poses.find((item) => item?.slot === slot && item.sourceModelSlot === (character.customization.modelSlot ?? 1))
      return pose ? [{ slot, category: resolvePoseCategory(pose) }] : []
    })
    const standing = used.filter((pose) => key(pose.category).includes('parad') || key(pose.category) === 'em pe')
    const sitting = used.filter((pose) => key(pose.category).includes('sentad'))
    return standing.length && sitting.length
      ? [`${character.name}: o JSON mistura poses Em pé (slots ${standing.map((pose) => pose.slot).join(', ')}) e Sentado (slots ${sitting.map((pose) => pose.slot).join(', ')}). Confira se deseja essa troca.`]
      : []
  })
}
