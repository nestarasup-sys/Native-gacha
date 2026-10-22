/** Recupera publicações interrompidas sem apagar backups ou escolher versões ambíguas.
 * Só atua quando o slot oficial está ausente. Nunca sobrescreve um slot existente.
 */
import { dirname, join } from 'node:path'
import type { ModelSourceFiles } from './modelSource'

type RecoveryFiles = Pick<ModelSourceFiles, 'readdir' | 'readFile' | 'rename'>

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

export type ModelSourceRecoveryResult = 'intact' | 'restored' | 'missing'

export async function recoverModelSourceSlot(
  slot: number,
  slotPath: (slot: number) => string,
  files: RecoveryFiles
): Promise<ModelSourceRecoveryResult> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) throw new Error('Slot inválido para recuperação.')
  const official = slotPath(slot)
  const base = dirname(official)
  try {
    // Existência do diretório oficial (mesmo com manifesto inválido) impede restauração destrutiva.
    await files.readdir(official)
    return 'intact'
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
  const selected = expected
    ? valid.find(candidate => candidate === expected)
    : valid.length === 1 ? valid[0] : null
  if (!selected) throw new Error('Há múltiplos backups ou uma publicação pendente inconsistente. Recuperação manual necessária.')
  try {
    await files.rename(selected, official)
    return 'restored'
  } catch (reason) {
    // Outra leitura pode ter recuperado simultaneamente o mesmo slot.
    try { await files.readdir(official); return 'intact' } catch { throw reason }
  }
}
