const { lstat, rm } = require('node:fs/promises')
const { basename, dirname, resolve } = require('node:path')
const { tmpdir } = require('node:os')

async function removeEditorV6TemporaryFixture(folder, expectedPrefix) {
  const resolvedFolder = resolve(folder)
  const temporaryRoot = resolve(tmpdir())
  if (dirname(resolvedFolder).toLowerCase() !== temporaryRoot.toLowerCase()) {
    throw Error('A pasta do fixture não é uma filha direta da pasta temporária do sistema.')
  }
  if (!expectedPrefix || !basename(resolvedFolder).startsWith(expectedPrefix)) {
    throw Error('O nome da pasta não corresponde ao prefixo deste fixture do Editor V6.')
  }

  const entry = await lstat(resolvedFolder)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw Error('A pasta temporária do fixture não é um diretório seguro para remoção.')
  }
  await rm(resolvedFolder, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 })
}

module.exports = { removeEditorV6TemporaryFixture }
