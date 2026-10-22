/** Model Source: folha-base oficial e recortes editados antes da montagem. */
import type { FabricatorProject, ModelPart } from '../../../../../shared/fabricator'
import { isHeadPart } from './resize'

export type ModelSourceDimensions = Record<string, { width: number; height: number; x?: number; y?: number }>
export type ModelSourceResult = { sourceDataUrl: string; previewDataUrl: string; parts: ModelPart[]; tolerance: number }

const MAX_DIMENSION = 8192
export const MAX_CHROMA_TOLERANCE = 280

export function sourceRect(part: ModelPart, dimensions?: ModelSourceDimensions[string]) {
  return {
    x: dimensions?.x ?? part.sourceTransform?.x ?? part.x,
    y: dimensions?.y ?? part.sourceTransform?.y ?? part.y,
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
  const originals = project.parts.map(part => sourceRect(part))
  const rects = project.parts.map(part => sourceRect(part, updates[part.id]))
  rects.forEach((rect, index) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
      || rect.width < 1 || rect.height < 1 || rect.width > MAX_DIMENSION || rect.height > MAX_DIMENSION
      || rect.x < 0 || rect.y < 0 || rect.x + rect.width > project.width || rect.y + rect.height > project.height) {
      throw new Error('A peça ' + project.parts[index].name + ' precisa caber dentro da folha original.')
    }
    if (updates[project.parts[index].id] &&
      (rect.x !== originals[index].x || rect.y !== originals[index].y) && !isHeadPart(project.parts[index])) {
      throw new Error('Somente a cabeça pode ser movida na imagem original.')
    }
  })
  const overlap = (a: typeof rects[number], b: typeof rects[number]) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (overlap(rects[i], rects[j]) > overlap(originals[i], originals[j]) + 1) {
      throw new Error('A peça ' + project.parts[i].name + ' invadiria a área de ' + project.parts[j].name + '. Mova-a para um espaço livre.')
    }
  }
}
export function validateModelSourceChroma(tolerance: number): void {
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > MAX_CHROMA_TOLERANCE) {
    throw new Error('O Chroma Key deve ficar entre 0 e 280.')
  }
}
async function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível decodificar uma das peças.'))
    image.src = dataUrl
  })
}
function resizePng(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
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
type SourceChromaResponse =
  | { type: 'complete'; id: number; parts: Array<{ id: string; png: ArrayBuffer }> }
  | { type: 'error'; id: number; message: string }
function bytesToPng(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }
  return 'data:image/png;base64,' + btoa(binary)
}
async function applyChroma(sourceDataUrl: string, tolerance: number, parts: ModelPart[]): Promise<Map<string, string>> {
  const worker = new Worker(new URL('./chromaAdjust.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SourceChromaResponse>) => {
      if (event.data.id !== 1) return
      worker.terminate()
      if (event.data.type === 'error') reject(new Error(event.data.message))
      else resolve(new Map(event.data.parts.map(part => [part.id, bytesToPng(part.png)])))
    }
    worker.onerror = () => { worker.terminate(); reject(new Error('Não foi possível aplicar o Chroma Key.')) }
    worker.postMessage({
      id: 1, sourceDataUrl, tolerance,
      parts: parts.map(part => ({ id: part.id, dataUrl: part.chromaBaseDataUrl ?? part.dataUrl }))
    })
  })
}

/** Renderiza duas folhas: fonte original editada (para reprocessamento) e preview transparente exportável. */
export async function composeModelSource(
  project: FabricatorProject,
  edits: ModelSourceDimensions,
  tolerance: number = project.tolerance
): Promise<ModelSourceResult> {
  validateModelSourceDimensions(project, edits)
  validateModelSourceChroma(tolerance)
  const raw = document.createElement('canvas')
  raw.width = project.width; raw.height = project.height
  const rawContext = raw.getContext('2d')
  if (!rawContext) throw new Error('Canvas indisponível para montar o Model Source.')
  // O PNG oficial mantém o fundo verde para que o Resetar/reprocessar continuem funcionando.
  rawContext.fillStyle = '#00ff00'
  rawContext.fillRect(0, 0, project.width, project.height)
  const resized: ModelPart[] = []
  for (const part of project.parts) {
    const rect = sourceRect(part, edits[part.id])
    const baseline = sourceRect(part)
    const edited = rect.x !== baseline.x || rect.y !== baseline.y
      || rect.width !== baseline.width || rect.height !== baseline.height
    const sourceImage = await imageFromDataUrl(part.chromaBaseDataUrl ?? part.dataUrl)
    const rawPart = resizePng(sourceImage, rect.width, rect.height)
    rawContext.drawImage(rawPart, rect.x, rect.y)
    if (!edited) { resized.push(part); continue }
    const originalImage = await imageFromDataUrl(part.dataUrl)
    const displayPart = resizePng(originalImage, rect.width, rect.height)
    // Preserve a montagem corrente. Só x/y de origem mudam ao mover a cabeça.
    resized.push({
      ...part,
      width: rect.width,
      height: rect.height,
      resizeBase: { width: rect.width, height: rect.height },
      sourceTransform: {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        rotation: part.sourceTransform?.rotation ?? 0,
        anchorVersion: 1,
        ...(part.sourceTransform?.jointAnchor ? { jointAnchor: part.sourceTransform.jointAnchor } : {})
      },
      dataUrl: displayPart.toDataURL('image/png'),
      chromaBaseSaved: true,
      chromaBaseDataUrl: rawPart.toDataURL('image/png')
    })
  }
  const sourceDataUrl = raw.toDataURL('image/png')
  const adjusted = tolerance === project.tolerance ? resized : await (async () => {
    const recolored = await applyChroma(sourceDataUrl, tolerance, resized)
    return resized.map(part => ({
      ...part,
      dataUrl: recolored.get(part.id) ?? part.dataUrl,
      chromaBaseDataUrl: part.chromaBaseDataUrl ?? part.dataUrl,
      chromaBaseSaved: true
    }))
  })()
  const preview = document.createElement('canvas')
  preview.width = project.width; preview.height = project.height
  const view = preview.getContext('2d')
  if (!view) throw new Error('Canvas indisponível para renderizar a prévia.')
  for (const part of adjusted) {
    const rect = sourceRect(part, edits[part.id])
    view.drawImage(await imageFromDataUrl(part.dataUrl), rect.x, rect.y, rect.width, rect.height)
  }
  return { sourceDataUrl, previewDataUrl: preview.toDataURL('image/png'), parts: adjusted, tolerance }
}
