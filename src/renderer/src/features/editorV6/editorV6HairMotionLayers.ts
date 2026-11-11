import type { CharacterColorOverrides, CustomizerCharacter, HairPartId } from '../../../../shared/customizer'
import type { HairStyle } from '../../../../shared/fabricator'
import type { EditorV6HairMotionLayer } from '../../../../shared/editorV6HairMotion'
import type { hairAppearanceStyleIds } from '../../../../shared/hairCategories'

export type EditorV6HairMotionLayerReference = ReturnType<typeof hairAppearanceStyleIds>[number]

export type EditorV6HairMotionTextureRequest = {
  modelSlot: number
  styleId: string
  side: EditorV6HairMotionLayerReference['side']
  part: HairPartId
  colors: CharacterColorOverrides
  dataUrl: string
}

/** Builds export-only hair layer descriptors while keeping texture preparation owned by the caller. */
export async function prepareEditorV6HairMotionLayers({
  character, references, styles, sourceHead, targetHead, resolveColors, prepareTexture, addTexture
}: {
  character: Pick<CustomizerCharacter, 'id' | 'name' | 'customization'>
  references: readonly EditorV6HairMotionLayerReference[]
  styles: ReadonlyMap<string, HairStyle | null>
  sourceHead: { width: number; height: number }
  targetHead: { width: number; height: number }
  resolveColors: (part: HairPartId) => CharacterColorOverrides
  prepareTexture: (request: EditorV6HairMotionTextureRequest) => Promise<string>
  addTexture: (key: string, dataUrl: string) => string
}): Promise<EditorV6HairMotionLayer[]> {
  const descriptors: EditorV6HairMotionLayer[] = []
  for (const [index, reference] of references.entries()) {
    const style = styles.get(reference.id)
    const original = style?.[reference.side]
    const baseTransform = style?.transforms[reference.side]
    if (!original || !baseTransform) throw Error(`Não foi possível carregar a peça ${reference.part} do cabelo de ${character.name}.`)
    const override = character.customization.partOverrides?.[`head:${reference.part}`]
    if (override?.hidden) continue
    const transform = override ? {
      ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0),
      scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1),
      rotation: baseTransform.rotation + (override.rotation ?? 0)
    } : baseTransform
    const dataUrl = await prepareTexture({
      modelSlot: character.customization.hairAppearance!.modelSlot,
      styleId: reference.id,
      side: reference.side,
      part: reference.part,
      colors: resolveColors(reference.part),
      dataUrl: original.dataUrl
    })
    descriptors.push({
      id: `${reference.part}:${index}`,
      textureId: addTexture(`${character.id}:${reference.id}:${reference.side}:${reference.part}`, dataUrl),
      side: reference.side, width: original.width, height: original.height,
      x: transform.x * targetHead.width / sourceHead.width - targetHead.width / 2,
      y: transform.y * targetHead.height / sourceHead.height - targetHead.height / 2,
      scaleX: transform.scaleX * targetHead.width / sourceHead.width,
      scaleY: transform.scaleY * targetHead.height / sourceHead.height,
      rotation: transform.rotation, flipX: Boolean(transform.flipX),
      phase: index * 1.2 + (reference.side === 'back' ? 0 : 1.2)
    })
  }
  return descriptors
}
