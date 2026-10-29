const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { createReadStream, createWriteStream } = require('node:fs')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { ensureSafeDirectory, hashFile, isWithin, sha256 } = require('./storageFiles.cjs')

function validateExtension(value) {
  // Domain files preserve their original logical filenames. Some existing
  // sidecars use descriptive suffixes such as `.before-head-shape`; CAS object
  // paths are hash-only, so allowing a bounded alphanumeric suffix is safe.
  if (typeof value !== 'string' || !/^\.[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/i.test(value)) throw new Error('Extensão de asset inválida.')
  return value.toLowerCase()
}

class ContentAddressedStore {
  constructor(dataRoot) {
    this.root = path.resolve(dataRoot)
    this.objectsRoot = path.join(this.root, 'media', 'objects', 'sha256')
    this.thumbnailsRoot = path.join(this.root, 'media', 'thumbnails')
    this.tempRoot = path.join(this.root, 'temp')
  }

  async putObject(bytes, { mimeType, extension }) {
    if (!Buffer.isBuffer(bytes) || !mimeType || typeof mimeType !== 'string') throw new Error('Conteúdo de asset inválido.')
    extension = validateExtension(extension)
    const hash = sha256(bytes)
    const folder = path.join(this.objectsRoot, hash.slice(0, 2))
    const destination = path.join(folder, hash)
    if (!isWithin(this.root, destination)) throw new Error('Objeto fora de app-data.')
    await ensureSafeDirectory(this.root, folder)
    if (fs.existsSync(destination)) {
      const existing = await fsp.stat(destination)
      if (existing.size !== bytes.length || await hashFile(destination) !== hash) throw new Error('Objeto existente com hash divergente; gravação interrompida.')
      return { sha256: hash, byteLength: bytes.length, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: true }
    }
    const temporary = path.join(this.tempRoot, `object-${crypto.randomUUID()}.tmp`)
    if (!isWithin(this.root, temporary)) throw new Error('Temporário fora de app-data.')
    await ensureSafeDirectory(this.root, this.tempRoot)
    try {
      const handle = await fsp.open(temporary, 'wx')
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      try { await fsp.rename(temporary, destination) } catch (error) {
        if (!fs.existsSync(destination)) throw error
        const existing = await fsp.stat(destination)
        if (existing.size !== bytes.length || await hashFile(destination) !== hash) throw new Error('Conflito ao publicar objeto de mídia.')
        await fsp.unlink(temporary).catch(() => undefined)
        return { sha256: hash, byteLength: bytes.length, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: true }
      }
    } catch (error) {
      await fsp.unlink(temporary).catch(() => undefined)
      throw error
    }
    return { sha256: hash, byteLength: bytes.length, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: false }
  }

  async putFile(sourcePath, { mimeType, extension }) {
    if (!mimeType || typeof mimeType !== 'string') throw new Error('Tipo de mídia inválido.')
    extension = validateExtension(extension)
    const source = path.resolve(sourcePath)
    const sourceStat = await fsp.stat(source)
    if (!sourceStat.isFile()) throw new Error('A origem da mídia não é um arquivo regular.')
    const folder = this.objectsRoot
    await ensureSafeDirectory(this.root, folder)
    await ensureSafeDirectory(this.root, this.tempRoot)
    const temporary = path.join(this.tempRoot, `object-${crypto.randomUUID()}.tmp`)
    const hash = crypto.createHash('sha256')
    let bytes = 0
    const digestTransform = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk)
        bytes += chunk.length
        callback(null, chunk)
      }
    })
    try {
      await pipeline(createReadStream(source), digestTransform, createWriteStream(temporary, { flags: 'wx' }))
      const digest = hash.digest('hex')
      const destinationFolder = path.join(folder, digest.slice(0, 2))
      const destination = path.join(destinationFolder, digest)
      if (!isWithin(this.root, destination) || !isWithin(this.root, temporary)) throw new Error('Mídia fora de app-data.')
      await ensureSafeDirectory(this.root, destinationFolder)
      if (fs.existsSync(destination)) {
        const targetStat = await fsp.stat(destination)
        if (targetStat.size !== bytes || await hashFile(destination) !== digest) throw new Error('Objeto existente com hash divergente; gravação interrompida.')
        await fsp.unlink(temporary)
        return { sha256: digest, byteLength: bytes, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: true }
      }
      try { await fsp.rename(temporary, destination) } catch (error) {
        if (!fs.existsSync(destination)) throw error
        const targetStat = await fsp.stat(destination)
        if (targetStat.size !== bytes || await hashFile(destination) !== digest) throw new Error('Conflito ao publicar mídia.')
        await fsp.unlink(temporary).catch(() => undefined)
        return { sha256: digest, byteLength: bytes, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: true }
      }
      return { sha256: digest, byteLength: bytes, mimeType, extension: extension.toLowerCase(), relativePath: path.relative(this.root, destination).split(path.sep).join('/'), reused: false }
    } catch (error) {
      await fsp.unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  async createPngThumbnail(bytes, { maxDimension = 384 } = {}) {
    if (!Buffer.isBuffer(bytes) || !Number.isSafeInteger(maxDimension) || maxDimension < 32 || maxDimension > 2048) throw new Error('Pedido de miniatura inválido.')
    const sharp = require('sharp')
    const sourceHash = sha256(bytes)
    const output = await sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' })
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer()
    const thumbnailHash = sha256(output)
    const destination = path.join(this.thumbnailsRoot, `png-v1-${sourceHash}-${maxDimension}.png`)
    if (!isWithin(this.root, destination)) throw new Error('Miniatura fora de app-data.')
    await ensureSafeDirectory(this.root, this.thumbnailsRoot)
    if (fs.existsSync(destination)) {
      const current = await fsp.readFile(destination)
      if (sha256(current) !== thumbnailHash) throw new Error('Miniatura existente divergente; geração interrompida.')
      return { path: path.relative(this.root, destination).split(path.sep).join('/'), sha256: thumbnailHash, byteLength: output.length, reused: true }
    }
    const temporary = path.join(this.tempRoot, `thumbnail-${crypto.randomUUID()}.tmp`)
    await ensureSafeDirectory(this.root, this.tempRoot)
    try {
      await fsp.writeFile(temporary, output, { flag: 'wx' })
      await fsp.rename(temporary, destination)
    } catch (error) {
      await fsp.unlink(temporary).catch(() => undefined)
      if (!fs.existsSync(destination)) throw error
      const current = await fsp.readFile(destination)
      if (sha256(current) !== thumbnailHash) throw new Error('Conflito ao publicar miniatura.')
      return { path: path.relative(this.root, destination).split(path.sep).join('/'), sha256: thumbnailHash, byteLength: current.length, reused: true }
    }
    return { path: path.relative(this.root, destination).split(path.sep).join('/'), sha256: thumbnailHash, byteLength: output.length, reused: false }
  }

  async createPngThumbnailFromFile(sourcePath, { maxDimension = 384 } = {}) {
    if (!Number.isSafeInteger(maxDimension) || maxDimension < 32 || maxDimension > 2048) throw new Error('Pedido de miniatura inválido.')
    const sharp = require('sharp')
    const source = path.resolve(sourcePath)
    const sourceHash = await hashFile(source)
    const destination = path.join(this.thumbnailsRoot, `png-v1-${sourceHash}-${maxDimension}.png`)
    if (!isWithin(this.root, destination)) throw new Error('Miniatura fora de app-data.')
    await ensureSafeDirectory(this.root, this.thumbnailsRoot)
    await ensureSafeDirectory(this.root, this.tempRoot)
    if (fs.existsSync(destination)) {
      const bytes = await fsp.readFile(destination)
      return { path: path.relative(this.root, destination).split(path.sep).join('/'), sha256: sha256(bytes), byteLength: bytes.length, reused: true }
    }
    const temporary = path.join(this.tempRoot, `thumbnail-${crypto.randomUUID()}.tmp`)
    try {
      await sharp(source, { limitInputPixels: 100_000_000, failOn: 'error' })
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toFile(temporary)
      const digest = await hashFile(temporary)
      const stat = await fsp.stat(temporary)
      try { await fsp.rename(temporary, destination) } catch (error) {
        if (!fs.existsSync(destination)) throw error
        if (await hashFile(destination) !== digest) throw new Error('Conflito ao publicar miniatura.')
        await fsp.unlink(temporary).catch(() => undefined)
      }
      return { path: path.relative(this.root, destination).split(path.sep).join('/'), sha256: digest, byteLength: stat.size, reused: false }
    } catch (error) {
      await fsp.unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  async evaluateLosslessPng(bytes) {
    if (!Buffer.isBuffer(bytes)) throw new Error('PNG inválido.')
    const sharp = require('sharp')
    const startedAt = process.hrtime.bigint()
    const source = sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' })
    const metadata = await source.metadata()
    if (metadata.format !== 'png') throw new Error('A avaliação lossless aceita somente PNG.')
    const originalPixels = await sharp(bytes).ensureAlpha().raw().toBuffer()
    const candidate = await sharp(bytes).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer()
    const candidatePixels = await sharp(candidate).ensureAlpha().raw().toBuffer()
    const pixelIdentical = originalPixels.equals(candidatePixels)
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    return { pixelIdentical, originalBytes: bytes.length, candidateBytes: candidate.length, durationMs,
      savedBytes: pixelIdentical ? Math.max(0, bytes.length - candidate.length) : 0,
      candidate, originalSha256: sha256(bytes), candidateSha256: sha256(candidate) }
  }
}

module.exports = ContentAddressedStore
