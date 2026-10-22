/** Journal verificável da publicação do Model Source.
 * A versão 1 preserva os campos backup/sourceFile dos marcadores legados.
 * Persistido ANTES da primeira renomeação; a remoção indica commit verificado.
 */
import { basename, join } from 'node:path'
import type { ModelSourceFiles } from './modelSource'

export type ModelSourceTransactionJournal = {
  version: 1
  backup: string
  sourceFile: string
  targetSourceFile: string
  transactionId: string
}
const sourcePattern = /^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export function createModelSourceJournal(
  slot: number, transactionId: string, previousSource: string, nextSource: string
): ModelSourceTransactionJournal {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10
    || !uuidPattern.test(transactionId)
    || !sourcePattern.test(previousSource) || !sourcePattern.test(nextSource)
    || previousSource === nextSource) throw new Error('Transação do Model Source inválida.')
  return {
    version: 1,
    backup: `.model-source-backup-${slot}-${transactionId}`,
    sourceFile: previousSource,
    targetSourceFile: nextSource,
    transactionId
  }
}

export function isModelSourceJournal(value: unknown, slot: number): value is ModelSourceTransactionJournal {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<ModelSourceTransactionJournal>
  return entry.version === 1 && typeof entry.backup === 'string'
    && typeof entry.sourceFile === 'string' && typeof entry.targetSourceFile === 'string'
    && typeof entry.transactionId === 'string'
    && /^source-[a-f0-9-]+\.png$/i.test(entry.sourceFile)
    && sourcePattern.test(entry.targetSourceFile)
    && uuidPattern.test(entry.transactionId)
    && entry.backup === `.model-source-backup-${slot}-${entry.transactionId}`
}

export async function verifyModelSourceCommit(
  folder: string, expectedSource: string,
  files: Pick<ModelSourceFiles, 'readFile'>
): Promise<void> {
  if (!sourcePattern.test(expectedSource) || basename(expectedSource) !== expectedSource) {
    throw new Error('Fonte de publicação inválida.')
  }
  const manifest = JSON.parse(await files.readFile(join(folder, 'project.json'), 'utf8')) as {
    sourceFile?: unknown; parts?: Array<{id?: unknown; chromaBaseSaved?: unknown}>
  }
  if (manifest.sourceFile !== expectedSource || !Array.isArray(manifest.parts) || manifest.parts.length > 500) {
    throw new Error('Publicação do Model Source não corresponde ao manifesto.')
  }
  await files.readFile(join(folder, expectedSource))
  const parts = new Set<string>()
  for (const part of manifest.parts) {
    if (!part || typeof part.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)
      || parts.has(part.id)) throw new Error('Peças da publicação inválidas.')
    parts.add(part.id)
    await files.readFile(join(folder, 'parts', `${part.id}.png`))
    if (part.chromaBaseSaved) await files.readFile(join(folder, 'parts', `${part.id}.base.png`))
  }
}
