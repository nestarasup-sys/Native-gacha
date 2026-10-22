/** Exportação direta de PNG para Downloads, sem tocar no catálogo de modelos. */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { writeFile as nativeWriteFile } from 'node:fs/promises'
import { validateModelSourceImage } from './modelSource'

export async function exportModelSourceToDownloads(
  slot: number,
  dataUrl: string,
  downloadsDirectory: string,
  writer: typeof nativeWriteFile = nativeWriteFile
): Promise<string> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) throw new Error('Slot inválido para exportação.')
  if (typeof downloadsDirectory !== 'string' || !downloadsDirectory) throw new Error('Pasta Downloads indisponível.')
  const bytes = validateModelSourceImage(dataUrl)
  const filename = 'Native-Gacha-Modelo-' + String(slot).padStart(2, '0') + '-Model-Source-' + randomUUID() + '.png'
  const destination = join(downloadsDirectory, filename)
  await writer(destination, bytes, { flag: 'wx' })
  return destination
}
