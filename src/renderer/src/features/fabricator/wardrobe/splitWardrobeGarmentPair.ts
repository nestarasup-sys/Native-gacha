import type { FabricatorProject, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import {
  findWardrobeJointCut,
  splitWardrobePixelsAtJoint,
  wardrobeComponentPreviewOffset,
  type WardrobeJointOffsets,
  type WardrobePixelImage,
  type WardrobeSplitSegment
} from './wardrobeJointAssembly'
import { wardrobeJointCutAdjustmentFor, type WardrobeJointCutSettings } from './wardrobeJointCutSettings'

type ReferenceModel = Pick<FabricatorProject, 'parts' | 'joints' | 'width' | 'height'>

export type SplitWardrobeGarmentPairIO = {
  decodePixels(dataUrl: string): Promise<WardrobePixelImage>
  encodeSegment(segment: WardrobeSplitSegment): string
  createId(): string
}

/** Split both sides of a long sleeve or trouser pair without publishing partial edits. */
export async function splitWardrobeGarmentPairAtJoint(
  draft: WardrobeSet,
  selected: WardrobeComponent,
  referenceModel: ReferenceModel,
  bodyOffsets: WardrobeJointOffsets,
  cutSettings: WardrobeJointCutSettings,
  io: SplitWardrobeGarmentPairIO
): Promise<WardrobeComponent[]> {
  if (!selected.sleevePairId) throw new Error('O par da roupa não está completo; nada foi alterado.')
  const pair = draft.components.filter((component) => component.sleevePairId === selected.sleevePairId && component.sleeveSegment === 'whole')
  if (pair.length !== 2) throw new Error('O par da roupa não está completo; nada foi alterado.')

  const replacements: WardrobeComponent[] = []
  for (const component of pair) {
    const bodyOffset = wardrobeComponentPreviewOffset(component, bodyOffsets)
    const previewComponent = { ...component, x: component.x + bodyOffset.x, y: component.y + bodyOffset.y }
    const adjustment = wardrobeJointCutAdjustmentFor(component, cutSettings, referenceModel)
    const cut = findWardrobeJointCut(previewComponent, referenceModel, bodyOffsets, adjustment)
    if (!cut) throw new Error(`Não encontrei uma junta vinculada entre os segmentos desta ${component.sleeveJointSplit === 'leg' || component.category === 'calca-coxa' ? 'calça' : 'manga'}. Confira os vínculos no modelo; nada foi alterado.`)

    const image = await io.decodePixels(component.dataUrl)
    const segments = splitWardrobePixelsAtJoint(image, previewComponent, cut)
    for (const segment of segments) {
      const upper = segment.key === 'upper'
      const isLeg = component.sleeveJointSplit === 'leg' || component.category === 'calca-coxa'
      const category = isLeg
        ? upper ? 'calca-coxa' as const : 'calca-canela' as const
        : upper ? 'manga-superior' as const : 'manga-inferior' as const
      const attachedPartId = upper ? cut.upperPartId : cut.lowerPartId
      const bone = referenceModel.parts.find((part) => part.id === attachedPartId)
      if (!bone) throw new Error('A junta aponta para uma parte ausente do modelo; nada foi alterado.')
      const targetOffset = bodyOffsets[attachedPartId] ?? { x: 0, y: 0 }
      const x = segment.x - targetOffset.x
      const y = segment.y - targetOffset.y
      const suffix = isLeg
        ? upper ? 'coxa' : 'canela'
        : upper ? 'braço superior' : 'antebraço'
      const piece: WardrobeComponent = {
        ...component,
        id: upper ? component.id : io.createId(),
        name: component.name.replace(/ · (esquerda|direita)$/i, '') + ` · ${suffix}`,
        sleeveSegment: segment.key,
        sleeveJointSplit: undefined,
        jointCutOffsetRatio: undefined,
        category,
        attachedPartId,
        x,
        y,
        width: segment.width * component.width / image.width,
        height: segment.height * component.height / image.height,
        originX: x,
        originY: y,
        originWidth: segment.width * component.width / image.width,
        originHeight: segment.height * component.height / image.height,
        binding: undefined,
        glue: { version: 1, mode: 'loose' },
        dataUrl: io.encodeSegment(segment)
      }
      replacements.push(fixWardrobeGlue(piece, bone))
    }
  }
  return replacements
}
