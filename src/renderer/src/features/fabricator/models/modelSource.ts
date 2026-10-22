/** Modelo-fonte canônico: folha editada antes da montagem e independência do React. */
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'

export type ModelSourceDimensions = Record<string, { width: number; height: number }>
export type ModelSourceResult = { sourceDataUrl: string; parts: ModelPart[] }

const MAX_DIMENSION = 8192

export function sourceRect(part: ModelPart, dimensions?: { width: number; height: number }) {
  return {
    x: part.sourceTransform?.x ?? part.x,
    y: part.sourceTransform?.y ?? part.y,
    width: dimensions?.width ?? part.sourceTransform?.width ?? part.width,
    height: dimensions?.height ?? part.sourceTransform?.height ?? part.height
  }
}

export function validateModelSourceDimensions(project: FabricatorProject, updates: ModelSourceDimensions): void {
  if (project.width < 1 || project.height < 1 || project.width * project.height > 32_000_000) {
    throw new Error('A folha original excede o limite de 32 milhões de pixels.')
  }
  const ids = new Set(project.parts.map(part => part.id))
  if (Object.keys(updates).some(id => !ids.has(id))) throw new Error('Uma das peças não pertence ao modelo.')
  const originalRects = project.parts.map(part => sourceRect(part))
  const rects = project.parts.map(part => sourceRect(part, updates[part.id]))
  rects.forEach((rect, index) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || !Number.isInteger(rect.width) || !Number.isInteger(rect.height)
      || rect.width < 1 || rect.height < 1 || rect.width > MAX_DIMENSION || rect.height > MAX_DIMENSION
      || rect.x < 0 || rect.y < 0 || rect.x + rect.width > project.width || rect.y + rect.height > project.height) {
      throw new Error('A peça ' + project.parts[index].name + ' precisa caber dentro da folha original.')
    }
  })
  // Recortes antigos podem conter margens sobrepostas; nunca aumentar uma sobreposição.
  const overlap = (a: typeof rects[number], b: typeof rects[number]) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (overlap(rects[i], rects[j]) > overlap(originalRects[i], originalRects[j]) + 1) {
      throw new Error('A peça ' + project.parts[i].name + ' invadiria a área de ' + project.parts[j].name + '. Reduza as dimensões.')
    }
  }
}

function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível decodificar uma das peças.'))
    image.src = dataUrl
  })
}

function resizedCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para edição da fonte.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

/** Recompõe a folha original editada; não utiliza posições da montagem atual. */
export async function composeModelSource(project: FabricatorProject, dimensions: ModelSourceDimensions): Promise<ModelSourceResult> {
  validateModelSourceDimensions(project, dimensions)
  const sheet = document.createElement('canvas')
  sheet.width = project.width
  sheet.height = project.height
  const context = sheet.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para montar o Model Source.')
  // Fundo verde mantém a identificação do chroma key e a função Resetar existente.
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, project.width, project.height)
  const parts: ModelPart[] = []
  for (const part of project.parts) {
    const rect = sourceRect(part, dimensions[part.id])
    const edited = Boolean(dimensions[part.id])
    const image = await imageFromDataUrl(part.dataUrl)
    const preview = resizedCanvas(image, Math.round(rect.width), Math.round(rect.height))
    context.drawImage(preview, rect.x, rect.y, rect.width, rect.height)
    if (!edited) { parts.push(part); continue }
    const baseImage = await imageFromDataUrl(part.chromaBaseDataUrl ?? part.dataUrl)
    const base = resizedCanvas(baseImage, rect.width, rect.height)
    parts.push({
      ...part,
      width: rect.width,
      height: rect.height,
      resizeBase: { width: rect.width, height: rect.height },
      // O encaixe corrente permanece no lugar; Poses DEV lê o modelo montado.
      sourceTransform: {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        rotation: part.sourceTransform?.rotation ?? 0, anchorVersion: 1,
        ...(part.sourceTransform?.jointAnchor ? { jointAnchor: part.sourceTransform.jointAnchor } : {})
      },
      dataUrl: preview.toDataURL('image/png'),
      chromaBaseSaved: true,
      chromaBaseDataUrl: base.toDataURL('image/png')
    })
  }
  return { sourceDataUrl: sheet.toDataURL('image/png'), parts }
}
