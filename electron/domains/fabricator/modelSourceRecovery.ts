/** Recupera publicações interrompidas sem apagar backups ou escolher versões ambíguas.
 * Só atua quando o slot oficial está ausente. Nunca sobrescreve um slot existente.
 */
import { dirname, join } from 'node:path'
import type { ModelSourceFiles } from './modelSource'
import { isModelSourceJournal, verifyModelSourceCommit } from './modelSourceJournal.ts'

type RecoveryFiles = Pick<ModelSourceFiles, 'readdir' | 'readFile' | 'rename' | 'rm'>

async function manifestLooksComplete(folder: string, files: RecoveryFiles): Promise<boolean> {
  try {
    const parsed = JSON.parse(await files.readFile(join(folder, 'project.json'), 'utf8')) as {
      sourceFile?: unknown
      parts?: Array<{ id?: unknown; chromaBaseSaved?: unknown }>
    }
    if (typeof parsed.sourceFile !== 'string' || !/^source-[a-f0-9-]+\.(?:png|jpe?g|webp)$/i.test(parsed.sourceFile)
      || !Array.isArray(parsed.parts) || parsed.parts.length > 500) return false
    await files.readFile(join(folder, parsed.sourceFile))
    for (const part of parsed.parts) {
      if (typeof part.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)) return false
      await files.readFile(join(folder, 'parts', part.id + '.png'))
      if (part.chromaBaseSaved) await files.readFile(join(folder, 'parts', part.id + '.base.png'))
    }
    return true
  } catch {
    return false
  }
}

/** Finaliza commit já publicado quando houve queda após promover o staging.
 * Não reescreve manifesto nem força rollback sobre uma versão válida.
 */
async function settleCompletedJournal(
  slot: number, official: string, base: string, files: RecoveryFiles
): Promise<void> {
  const pending = join(base, `.model-source-pending-${slot}.json`)
  let raw: string
  try { raw = await files.readFile(pending, 'utf8') }
  catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return
    throw reason
  }
  let journal: unknown
  try { journal = JSON.parse(raw) } catch { return }
  if (!isModelSourceJournal(journal, slot)) return // Marcadores legados são preservados.
  try {
    await verifyModelSourceCommit(official, journal.targetSourceFile, files)
    await files.rm(pending, { force: true })
  } catch {
    // Versão não corresponde ao journal: não tocar nem no slot nem no backup.
  }
}

export type ModelSourceRecoveryResult = 'intact' | 'restored' | 'missing'

export async function recoverModelSourceSlot(
  slot: number,
  slotPath: (slot: number) => string,
  files: RecoveryFiles
): Promise<ModelSourceRecoveryResult> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) throw new Error('Slot inválido para recuperação.')
  const official = slotPath(slot)
  const base = dirname(official)
  let emptyLogicalSlot = false
  try {
    // O SQLite pode manter um diretório lógico vazio depois do rename.
    // Nunca restaurar sobre conteúdo real, mesmo com manifesto corrompido.
    const entries = await files.readdir(official)
    if (entries.length > 0) {
      await settleCompletedJournal(slot, official, base, files)
      return 'intact'
    }
    try {
      await files.readFile(join(official, 'project.json'), 'utf8')
      await settleCompletedJournal(slot, official, base, files)
      return 'intact'
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') return 'intact'
      emptyLogicalSlot = true
    }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
  }
  let entries: Array<{ name: string; isDirectory(): boolean }>
  try {
    entries = await files.readdir(base, { withFileTypes: true })
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw reason
  }
  const matches = entries
    .filter(entry => entry.isDirectory() && new RegExp('^\\.model-source-backup-' + slot + '-[a-f0-9-]{36}$').test(entry.name))
    .map(entry => join(base, entry.name))
  const valid: string[] = []
  for (const folder of matches) if (await manifestLooksComplete(folder, files)) valid.push(folder)
  if (valid.length === 0) return 'missing'
  let expected: string | null = null
  try {
    const marker = JSON.parse(await files.readFile(join(base, `.model-source-pending-${slot}.json`), 'utf8')) as { version?: unknown; backup?: unknown }
    const prefix = `.model-source-backup-${slot}-`
    // Nome rigidamente validado: nunca aceitar caminhos nem arquivos de outros slots.
    if (marker.version === 1 && typeof marker.backup === 'string'
      && marker.backup.startsWith(prefix) && /^[a-f0-9-]{36}$/.test(marker.backup.slice(prefix.length))) {
      expected = join(base, marker.backup)
    }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Marcador de recuperação do Model Source inválido.')
  }
  // Diretorio lógico vazio só é recuperável com transação pendente explícita.
  if (emptyLogicalSlot && !expected) return 'intact'
  const selected = expected
    ? valid.find(candidate => candidate === expected)
    : valid.length === 1 ? valid[0] : null
  if (!selected) throw new Error('Há múltiplos backups ou uma publicação pendente inconsistente. Recuperação manual necessária.')
  try {
    if (emptyLogicalSlot) {
      // Remove apenas placeholder vazio e somente após validar o marcador e backup.
      if ((await files.readdir(official)).length > 0) return 'intact'
      await files.rm(official, { recursive: true, force: false })
    }
    await files.rename(selected, official)
    return 'restored'
  } catch (reason) {
    // Outra leitura pode ter recuperado simultaneamente o mesmo slot.
    try { await files.readdir(official); return 'intact' } catch { throw reason }
  }
}
