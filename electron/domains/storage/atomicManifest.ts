/** Protocolo incremental de publicação de manifestos JSON.
 * Mantém o documento anterior até que o rename do temporário seja confirmado.
 * Não faz migrações, não seleciona backups nem conhece caminhos do perfil.
 */
import { dirname, resolve } from 'node:path'
import type * as nodeFs from 'node:fs/promises'

type ManifestFiles = Pick<typeof nodeFs, 'writeFile' | 'rename' | 'unlink'>
export type JsonManifestPublication = {
  files: ManifestFiles
  target: string
  temporary: string
  value: unknown
  indent?: number
  platform?: string
  afterCommit?: () => Promise<void>
  onCleanupError?: (error: unknown) => void
  delay?: (ms: number) => Promise<void>
}
const isMissing = (reason: unknown) => (reason as NodeJS.ErrnoException)?.code === 'ENOENT'

export async function publishJsonManifest(options: JsonManifestPublication): Promise<void> {
  const { files, value, afterCommit, onCleanupError } = options
  const target = resolve(options.target)
  const temporary = resolve(options.temporary)
  if (target === temporary || dirname(target) !== dirname(temporary)) {
    throw new Error('Manifesto temporário fora da pasta de destino.')
  }
  const platform = options.platform ?? process.platform
  const maxAttempts = platform === 'win32' ? 5 : 1
  const delay = options.delay ?? (ms => new Promise<void>(done => setTimeout(done, ms)))
  let staged = false
  try {
    await files.writeFile(temporary, JSON.stringify(value, null, options.indent), 'utf8')
    staged = true
    for (let attempt = 1; ; attempt++) {
      try { await files.rename(temporary, target); break }
      catch (reason) {
        const code = (reason as NodeJS.ErrnoException)?.code
        const retryable = platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')
        if (!retryable || attempt >= maxAttempts) throw reason
        await delay(20 * (2 ** (attempt - 1)))
      }
    }
    await afterCommit?.()
  } finally {
    if (staged) {
      try { await files.unlink(temporary) }
      catch (reason) {
        if (!isMissing(reason)) {
          if (onCleanupError) onCleanupError(reason)
          else throw reason
        }
      }
    }
  }
}
