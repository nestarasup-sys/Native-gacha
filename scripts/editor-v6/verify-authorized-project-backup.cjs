'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

async function hashFile(filePath) {
  const digest = crypto.createHash('sha256')
  const stream = require('node:fs').createReadStream(filePath)
  for await (const chunk of stream) digest.update(chunk)
  return digest.digest('hex')
}

async function listFiles(root) {
  const results = []
  async function visit(current, relative = '') {
    const info = await fs.lstat(current)
    if (info.isSymbolicLink()) throw Error(`Link simbólico no backup: ${relative || path.basename(current)}`)
    if (info.isDirectory()) {
      for (const child of await fs.readdir(current))
        await visit(path.join(current, child), relative ? `${relative}/${child}` : child)
    } else if (info.isFile()) results.push({ path: relative, bytes: info.size })
    else throw Error(`Tipo de arquivo não suportado no backup: ${relative}`)
  }
  await visit(root)
  return results.sort((left, right) => left.path.localeCompare(right.path))
}

async function verifyBackup(root) {
  const canonicalRoot = await fs.realpath(root)
  const manifest = JSON.parse(await fs.readFile(path.join(canonicalRoot, 'backup-manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.verified !== true || !manifest.project?.id || !manifest.sources) {
    throw Error('O manifesto não declara uma cópia autorizada e verificada.')
  }

  let files = 0
  let bytes = 0
  for (const [sourceName, source] of Object.entries(manifest.sources)) {
    if (!Array.isArray(source.entries)) throw Error(`O inventário de ${sourceName} está ausente.`)
    const sourceRoot = path.join(canonicalRoot, sourceName)
    const actual = await listFiles(sourceRoot)
    const expectedEntries = [...source.entries].sort((left, right) => left.path.localeCompare(right.path))
    if (actual.length !== expectedEntries.length) throw Error(`Quantidade de arquivos divergente em ${sourceName}.`)
    for (let index = 0; index < expectedEntries.length; index++) {
      const expected = expectedEntries[index]
      const segments = expected.path ? expected.path.split('/') : []
      if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
        throw Error(`Caminho inválido no manifesto: ${expected.path}`)
      if (actual[index].path !== expected.path || actual[index].bytes !== expected.bytes)
        throw Error(`Inventário divergente: ${sourceName}/${expected.path}`)
      const target = path.join(sourceRoot, ...segments)
      const info = await fs.lstat(target)
      if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes)
        throw Error(`Tipo ou tamanho divergente: ${sourceName}/${expected.path}`)
      if ((await hashFile(target)) !== expected.sha256)
        throw Error(`SHA-256 divergente: ${sourceName}/${expected.path}`)
      files++
      bytes += info.size
    }
  }
  return { verified: true, project: manifest.project, files, bytes }
}

async function main() {
  const folder = process.argv[2]
  if (!folder) throw Error('Uso: node scripts/editor-v6/verify-authorized-project-backup.cjs <pasta-backup>')
  console.log(JSON.stringify(await verifyBackup(path.resolve(folder)), null, 2))
}

if (require.main === module)
  main().catch((error) => {
    console.error(`[V6 backup verifier] ${error.message}`)
    process.exitCode = 1
  })

module.exports = { verifyBackup }
