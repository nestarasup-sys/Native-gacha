import type { ImageProcessorMessage } from './imageProcessorProtocol'
import {
  createImportedModelProject,
  type ImportedModelMetadata,
  type ImportedModelProjectResult
} from './processedModelProject'

export type ProcessedImageImportOutcome =
  | { kind: 'ready'; imported: ImportedModelProjectResult }
  | { kind: 'failed'; message: string }

export function appendImportCleanupError(message: string, cleanupError: string | null): string {
  return cleanupError
    ? `${message} A imagem temporária também não pôde ser removida: ${cleanupError}`
    : message
}

/** Builds the editor snapshot and cleans up imported source bytes on rejected results. */
export async function createProcessedImageImportResult(
  message: Extract<ImageProcessorMessage, { type: 'complete' }>,
  sourceDataUrl: string,
  tolerance: number,
  metadata: ImportedModelMetadata,
  discardUncommittedSource: () => Promise<string | null>,
  createProject: typeof createImportedModelProject = createImportedModelProject
): Promise<ProcessedImageImportOutcome> {
  if (message.parts.length === 0) {
    const cleanupError = await discardUncommittedSource()
    return {
      kind: 'failed',
      message: appendImportCleanupError('Nenhuma peça foi encontrada. Aumente a tolerância ou escolha outra imagem.', cleanupError)
    }
  }

  try {
    return {
      kind: 'ready',
      imported: createProject(message, sourceDataUrl, tolerance, metadata)
    }
  } catch (reason) {
    const cleanupError = await discardUncommittedSource()
    return {
      kind: 'failed',
      message: appendImportCleanupError(
        reason instanceof Error ? reason.message : 'Não foi possível montar o modelo importado.',
        cleanupError
      )
    }
  }
}
