const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { createReadStream } = require('node:fs')

function isWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function assertCanonicalDirectory(root, label) {
  fs.mkdirSync(root, { recursive: true })
  const stat = fs.lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(root) !== fs.realpathSync(root)) {
    throw new Error(`${label} precisa ser uma pasta real e canônica.`)
  }
}

async function ensureSafeDirectory(root, target) {
  const canonicalRoot = path.resolve(root)
  const absolute = path.resolve(target)
  if (!isWithin(canonicalRoot, absolute)) throw new Error('Tentativa de gravação fora de app-data.')
  assertCanonicalDirectory(canonicalRoot, 'Raiz app-data')
  const relativePath = path.relative(canonicalRoot, absolute)
  let current = canonicalRoot
  for (const segment of relativePath ? relativePath.split(path.sep) : []) {
    current = path.join(current, segment)
    await fsp.mkdir(current, { recursive: false }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
    const stat = await fsp.lstat(current)
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(current) !== await fsp.realpath(current)) {
      throw new Error(`Diretório de dados não canônico: ${current}`)
    }
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

module.exports = { assertCanonicalDirectory, ensureSafeDirectory, hashFile, isWithin, sha256 }
