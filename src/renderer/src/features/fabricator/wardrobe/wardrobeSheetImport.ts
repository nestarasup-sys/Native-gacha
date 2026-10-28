import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { suggestWardrobeBone } from './boneSelection'
import { guessWardrobeCategory, guessWardrobeName, wardrobeSheetContentBounds } from './wardrobeAutoDetection'
import type { WardrobeProcessorPiece } from './wardrobeProcessorProtocol'

function pngDataUrl(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + 0x8000)))
  }
  return `data:image/png;base64,${btoa(binary)}`
}

/** Maps worker crops to editable wardrobe components using the original model as reference. */
export function createWardrobeComponentsFromProcessedSheet(
  pieces: WardrobeProcessorPiece[],
  imageWidth: number,
  imageHeight: number,
  referenceModel: Pick<FabricatorProject, 'width' | 'height' | 'parts'>
): WardrobeComponent[] {
  const contentBounds = wardrobeSheetContentBounds(pieces, imageWidth, imageHeight)
  return pieces.map((piece) => {
    const category = guessWardrobeCategory(piece, contentBounds)
    const contentCenterX = piece.x + piece.width / 2 - contentBounds.x
    const bone = suggestWardrobeBone(category, contentCenterX, contentBounds.width, referenceModel).bone
    const { png, ...metadata } = piece
    const component: WardrobeComponent = {
      ...metadata,
      category,
      attachedPartId: bone?.id ?? '',
      rotation: 0,
      originX: metadata.x,
      originY: metadata.y,
      originWidth: metadata.width,
      originHeight: metadata.height,
      dataUrl: pngDataUrl(png),
      glue: { version: 1, mode: 'loose' },
      binding: undefined
    }
    return { ...component, name: guessWardrobeName(category, contentCenterX, contentBounds.width) }
  })
}
