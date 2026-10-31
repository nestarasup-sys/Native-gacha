import type { FabricatorProject, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { suggestWardrobeBone } from './boneSelection'
import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'

/** Split a mirrored pair into upper/lower raster pieces without mutating the source set.
 * The caller owns persistence, history and UI state. Existing upper IDs are retained.
 */
export async function splitWardrobeSleevePair(
  draft: WardrobeSet,
  selected: WardrobeComponent,
  model: FabricatorProject,
  referenceModel: FabricatorProject | null,
  cutAngle: number,
  sleeveCutPercent: number,
  createId: () => string = () => crypto.randomUUID()
): Promise<WardrobeComponent[]> {
      const pair = draft.components.filter((component) => component.sleevePairId === selected.sleevePairId && component.sleeveSegment === 'whole')
      if (pair.length !== 2) throw new Error('O par da manga não está completo; nada foi alterado.')
      const replacements: WardrobeComponent[] = []
      for (const component of pair) {
        const image = new Image(); image.src = component.dataUrl; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const split = Math.max(1, Math.min(canvas.height - 1, Math.round(canvas.height * sleeveCutPercent / 100)))
        for (const segment of [{ key: 'upper' as const, y: 0, height: split, category: component.category === 'calca-coxa' ? 'calca-coxa' as const : 'manga-superior' as const }, { key: 'lower' as const, y: split, height: canvas.height - split, category: component.category === 'calca-coxa' ? 'calca-canela' as const : 'manga-inferior' as const }]) {
          const partCanvas = document.createElement('canvas'); partCanvas.width = canvas.width; partCanvas.height = canvas.height
          const ctx = partCanvas.getContext('2d')!; const partPixels = ctx.createImageData(canvas.width, canvas.height)
          const slope = Math.tan(cutAngle * Math.PI / 180) * (component.sleeveSide === selected.sleeveSide ? 1 : -1)
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const upper = y + .5 < split + slope * (x + .5 - canvas.width / 2)
            if (upper !== (segment.key === 'upper')) continue
            const at = (y * canvas.width + x) * 4
            partPixels.data.set(pixels.data.subarray(at, at + 4), at)
          }
          let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            if (!partPixels.data[(y * canvas.width + x) * 4 + 3]) continue
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
          }
          if (maxX < minX) throw new Error('O corte deixa uma parte vazia. Ajuste a altura ou o ângulo.')
          partCanvas.width = maxX - minX + 1; partCanvas.height = maxY - minY + 1
          ctx.putImageData(partPixels, -minX, -minY)
          const partWidth = partCanvas.width * component.width / canvas.width
          const partHeight = partCanvas.height * component.height / canvas.height
          const dx = (minX + partCanvas.width / 2) * component.width / canvas.width - component.width / 2
          const dy = (minY + partCanvas.height / 2) * component.height / canvas.height - component.height / 2
          const radians = component.rotation * Math.PI / 180
          const sideX = component.sleeveSide === 'left' ? model!.width * .27 : model!.width * .73
          const bone = suggestWardrobeBone(segment.category, sideX, model!.width, referenceModel ?? model!).bone
          const x = component.x + component.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians) - partWidth / 2
          const y = component.y + component.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians) - partHeight / 2
          const piece: WardrobeComponent = { ...component, id: segment.key === 'upper' ? component.id : createId(), name: component.name.replace(/ · (esquerda|direita)$/i, ` · ${component.category === 'calca-coxa' ? segment.key === 'upper' ? 'coxa' : 'canela' : segment.key === 'upper' ? 'braço superior' : 'antebraço'}`), sleeveSegment: segment.key, category: segment.category, ...(bone ? { attachedPartId: bone.id, x, y, binding: undefined, glue: { version: 1 as const, mode: 'loose' as const } } : {}), x, y, width: partWidth, height: partHeight, originX: x, originY: y, originWidth: partWidth, originHeight: partHeight, dataUrl: partCanvas.toDataURL('image/png') }
          replacements.push(bone ? fixWardrobeGlue(piece, bone) : piece)
        }
      }
      return replacements
}
