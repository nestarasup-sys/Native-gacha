import type { AnimatorFrame, AnimatorFrameTransform, FabricatorProject } from '../../../../../shared/fabricator'
import { orderedParts } from '../../../../../shared/modelRig.ts'
import { loadAnimatorImage } from './animatorImageCache.ts'
import { transformsFromProject } from './animatorFrameModel.ts'

export async function renderAnimatorThumbnail(
  project: FabricatorProject,
  transforms: Record<string, AnimatorFrameTransform> = transformsFromProject(project),
  loadImage: (source: string) => Promise<HTMLImageElement> = loadAnimatorImage
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = Math.max(100, Math.round(120 * project.height / Math.max(1, project.width)))
  const context = canvas.getContext('2d')
  if (!context) return ''

  const scale = Math.min(canvas.width / project.width, canvas.height / project.height)
  const hidden = new Set(project.hiddenPartIds ?? [])
  for (const part of orderedParts(project.parts, project.layerOrder)) {
    if (hidden.has(part.id)) continue
    const transform = transforms[part.id] ?? { x: part.x, y: part.y, rotation: part.rotation }
    try {
      const image = await loadImage(part.dataUrl)
      context.save()
      try {
        const width = transform.width ?? part.width
        const height = transform.height ?? part.height
        context.translate((transform.x + width / 2) * scale, (transform.y + height / 2) * scale)
        context.rotate(transform.rotation * Math.PI / 180)
        context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale)
      } finally {
        context.restore()
      }
    } catch {
      // Uma miniatura parcial não impede a edição.
    }
  }
  return canvas.toDataURL('image/png')
}

export function refreshAnimatorThumbnails(project: FabricatorProject, frames: AnimatorFrame[]): Promise<AnimatorFrame[]> {
  return Promise.all(frames.map(async (frame) => ({
    ...frame,
    thumbnailDataUrl: await renderAnimatorThumbnail(project, frame.transforms)
  })))
}
