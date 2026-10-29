/** Model Source: folha-base oficial e recortes editados antes da montagem. */
import type { FabricatorProject, ModelPart } from '../../../../../shared/fabricator'
import { isHeadPart } from './resize'
import { sourceRect, type ModelSourceDimensions } from './modelSourceGeometry'
import { composeModelSourceImages } from './modelSourceComposer'
import { createModelSourceComposeWorkerRequest, materializeModelSourceResult, type ModelSourceComposeRequest } from './modelSourceComposeProtocol'
import { shouldComposeModelSourceOnMainThread } from './modelSourceExecutionStrategy'
import { startModelSourceComposeWorker } from './runModelSourceComposeWorker'

export type { ModelSourceDimensions } from './modelSourceGeometry'
export { sourceRect } from './modelSourceGeometry'
export type ModelSourceResult = {
  sourceDataUrl: string
  previewDataUrl: string
  parts: ModelPart[]
  tolerance: number
  modelSkinTone?: FabricatorProject['modelSkinTone']
  modelOutlineColor?: FabricatorProject['modelOutlineColor']
  joints: FabricatorProject['joints']
  layerOrder?: FabricatorProject['layerOrder']
  hiddenPartIds?: FabricatorProject['hiddenPartIds']
}

const MAX_DIMENSION = 8192
export const MAX_CHROMA_TOLERANCE = 280

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
      || !Number.isInteger(rect.width) || !Number.isInteger(rect.height)
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
    throw new Error(`O Chroma Key deve ficar entre 0 e ${MAX_CHROMA_TOLERANCE}.`)
  }
}

/** Renderiza duas folhas: fonte original editada (para reprocessamento) e preview transparente exportável. */
let composeRequestId = 0
export async function composeModelSource(
  project: FabricatorProject,
  edits: ModelSourceDimensions,
  tolerance: number = project.tolerance,
  signal?: AbortSignal
): Promise<ModelSourceResult> {
  if (signal?.aborted) {
    const error = new Error('Composição do Model Source cancelada.')
    error.name = 'AbortError'
    throw error
  }
  validateModelSourceDimensions(project, edits)
  validateModelSourceChroma(tolerance)
  const request: ModelSourceComposeRequest = {
    id: ++composeRequestId,
    project,
    edits,
    tolerance
  }
  if (shouldComposeModelSourceOnMainThread(project, edits, tolerance)) {
    const output = await composeModelSourceImages(createModelSourceComposeWorkerRequest(request), signal, 'renderer')
    return materializeModelSourceResult(project, output)
  }
  return startModelSourceComposeWorker(request, undefined, signal).result
}
