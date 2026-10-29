const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')
const { normalizeImageBuffer } = require('./imageIngestion.cjs')
const ContentAddressedStore = require('./domains/storage/contentAddressedStore.cjs')
const { assertCanonicalDirectory, ensureSafeDirectory, hashFile, isWithin, sha256 } = require('./domains/storage/storageFiles.cjs')
const { getAppDataUsage } = require('./domains/storage/appDataUsage.cjs')
const { BUILTIN_DOMAINS, CATALOG_SCHEMA_VERSION, initializeCatalogSchema } = require('./domains/storage/catalogSchema.cjs')

function validateDomainId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9.-]{1,79}$/.test(value)) throw new Error('Identificador de domínio inválido.')
}

function validateId(value, label = 'Identificador') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || /[\u0000-\u001f]/.test(value)) throw new Error(`${label} inválido.`)
}

function normalizeDomainPath(value, allowEmpty = false) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Caminho lógico inválido.')
  const normalized = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalized && allowEmpty) return ''
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..' || /^[a-z]:$/i.test(part))) {
    throw new Error('Caminho lógico fora do domínio.')
  }
  return normalized
}

function escapeLike(value) { return value.replace(/[\\%_]/g, '\\$&') }

function mimeFromExtension(extension) {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.json': 'application/json', '.txt': 'text/plain' })[extension] ?? 'application/octet-stream'
}

function normalizeAssetInput(input, now) {
  const { id, domainId, kind, displayName, schemaVersion = 1, metadata = {}, archived = false } = input ?? {}
  validateId(id, 'ID do asset')
  validateDomainId(domainId)
  validateId(kind, 'Tipo do asset')
  if (typeof displayName !== 'string' || displayName.length > 500) throw new Error('Nome do asset inválido.')
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new Error('Versão do asset inválida.')
  if (typeof archived !== 'boolean') throw new Error('Estado de arquivamento inválido.')
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error('Metadados do asset inválidos.')
  return { id, domainId, kind, displayName, schemaVersion, metadata: JSON.stringify(metadata), archived: archived ? 1 : 0, now }
}

function upsertAssetRows(db, rows) {
  const insert = db.prepare(`INSERT INTO assets(id, domain_id, kind, display_name, schema_version, metadata_json, archived, created_at, updated_at)
    VALUES (@id, @domainId, @kind, @displayName, @schemaVersion, @metadata, @archived, @now, @now)
    ON CONFLICT(id) DO UPDATE SET domain_id=excluded.domain_id, kind=excluded.kind, display_name=excluded.display_name,
    schema_version=excluded.schema_version, metadata_json=excluded.metadata_json, archived=excluded.archived, updated_at=excluded.updated_at`)
  db.transaction((items) => items.forEach((item) => insert.run(item)))(rows)
}

class DataPlatform {
  constructor(dataRoot) {
    this.root = path.resolve(dataRoot)
    this.database = null
    this.imageIngestCache = new Map()
  }

  initialize() {
    if (this.database?.open) return this
    assertCanonicalDirectory(this.root, 'Raiz app-data')
    const directories = [
      'database/migrations', 'database/journal', 'libraries', 'characters', 'projects',
      'media/objects/sha256', 'media/thumbnails', 'media/imports-staging', 'cache',
      'temp', 'logs', 'crash-dumps', 'backups', 'manifests'
    ]
    for (const relativePath of directories) {
      const folder = path.join(this.root, relativePath)
      if (!isWithin(this.root, folder)) throw new Error('Diretório de dados fora de app-data.')
      assertCanonicalDirectory(folder, `Diretório ${relativePath}`)
    }

    const dbPath = path.join(this.root, 'database', 'catalog.sqlite')
    if (!isWithin(this.root, dbPath)) throw new Error('Banco fora de app-data.')
    this.database = new Database(dbPath, { timeout: 5000 })
    this.database.pragma('foreign_keys = ON')
    const currentSchema = this.database.pragma('user_version', { simple: true })
    if (currentSchema > CATALOG_SCHEMA_VERSION) {
      this.database.close()
      this.database = null
      throw new Error(`O catálogo usa schema ${currentSchema}, mais novo que esta versão do app.`)
    }
    initializeCatalogSchema(this.database, currentSchema)
    this.migrateRoteirosJson()
    return this
  }

  migrateRoteirosJson() {
    const db = this.assertReady()
    const migrationKey = 'roteiros-json-to-sqlite-v1'
    if (db.prepare('SELECT 1 FROM app_metadata WHERE key=?').get(migrationKey)) return
    const source = path.join(this.root, 'projects', 'roteiros', 'library.json')
    let documents = []
    let sourceSha256 = null
    if (fs.existsSync(source)) {
      const contents = fs.readFileSync(source, 'utf8')
      sourceSha256 = sha256(contents)
      let parsed
      try { parsed = JSON.parse(contents) }
      catch { throw new Error('O arquivo antigo de roteiros não contém JSON válido; ele foi preservado sem alterações.') }
      if (!Array.isArray(parsed) || parsed.length > 2000) {
        throw new Error('O arquivo antigo de roteiros tem formato ou quantidade inválida; ele foi preservado sem alterações.')
      }
      const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      const isText = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100
      documents = parsed.map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? { ...entry, tiktoks: entry.tiktoks ?? [] }
        : entry)
      const routeIds = new Set()
      const tiktokIds = new Set()
      for (const roteiro of documents) {
        if (!roteiro || typeof roteiro !== 'object' || !isUuid(roteiro.id) || !isText(roteiro.title) || !isText(roteiro.videoTitle)
          || !Array.isArray(roteiro.characterIds) || roteiro.characterIds.length > 500 || !roteiro.characterIds.every(isUuid)
          || !Array.isArray(roteiro.tiktoks) || roteiro.tiktoks.length > 500 || routeIds.has(roteiro.id)) {
          throw new Error('Foram encontrados dados inválidos ou IDs repetidos no arquivo antigo de roteiros; ele foi preservado sem alterações.')
        }
        routeIds.add(roteiro.id)
        for (const tiktok of roteiro.tiktoks) {
          if (!tiktok || !isUuid(tiktok.id) || !isText(tiktok.title) || !isText(tiktok.videoTitle) || tiktokIds.has(tiktok.id)) {
            throw new Error('Foram encontrados TikToks inválidos ou IDs repetidos no arquivo antigo; ele foi preservado sem alterações.')
          }
          tiktokIds.add(tiktok.id)
        }
      }
    }

    const now = new Date().toISOString()
    const insertRoteiro = db.prepare('INSERT OR IGNORE INTO roteiros(id, title, video_title, character_ids_json, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insertTikTok = db.prepare('INSERT OR IGNORE INTO roteiro_tiktoks(id, roteiro_id, title, video_title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const migrate = db.transaction(() => {
      documents.forEach((roteiro, position) => {
        const inserted = insertRoteiro.run(roteiro.id, roteiro.title.trim(), roteiro.videoTitle.trim(), JSON.stringify(roteiro.characterIds), position, now, now).changes
        if (!inserted) return
        roteiro.tiktoks.forEach((tiktok, tiktokPosition) => {
          insertTikTok.run(tiktok.id, roteiro.id, tiktok.title.trim(), tiktok.videoTitle.trim(), tiktokPosition, now, now)
        })
      })
      db.prepare('INSERT INTO app_metadata(key, value) VALUES (?, ?)')
        .run(migrationKey, JSON.stringify({ migratedAt: now, sourceSha256, roteiroCount: documents.length }))
    })
    migrate()
  }

  assertReady() {
    if (!this.database || !this.database.open) throw new Error('Catálogo de dados não inicializado.')
    return this.database
  }

  registerDomain({ id, schemaVersion, manifest = {}, migrate }) {
    validateDomainId(id)
    if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new Error('Versão de schema inválida.')
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw new Error('Manifesto de domínio inválido.')
    const db = this.assertReady()
    const current = db.prepare('SELECT schema_version FROM domains WHERE domain_id = ?').get(id)
    if (current && schemaVersion < current.schema_version) throw new Error('Downgrade de schema de domínio recusado.')
    const now = new Date().toISOString()
    if (!current) {
      db.prepare('INSERT INTO domains(domain_id, schema_version, manifest_json, updated_at) VALUES (?, ?, ?, ?)')
        .run(id, schemaVersion, JSON.stringify(manifest), now)
      return
    }
    if (schemaVersion > current.schema_version) {
      if (typeof migrate !== 'function') throw new Error('Atualização de domínio exige uma migração explícita.')
      const migrationId = `${current.schema_version}-to-${schemaVersion}`
      const migration = db.transaction(() => {
        const result = migrate(db)
        if (result && typeof result.then === 'function') throw new Error('Migrações de domínio devem ser síncronas e transacionais.')
        db.prepare('UPDATE domains SET schema_version=?, manifest_json=?, updated_at=? WHERE domain_id=?')
          .run(schemaVersion, JSON.stringify(manifest), now, id)
        db.prepare('INSERT INTO domain_migrations(domain_id, from_version, to_version, migration_id, applied_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, current.schema_version, schemaVersion, migrationId, now)
      })
      migration()
      return
    }
    db.prepare('UPDATE domains SET manifest_json=?, updated_at=? WHERE domain_id=?').run(JSON.stringify(manifest), now, id)
  }

  upsertAsset(input) {
    const db = this.assertReady()
    const row = normalizeAssetInput(input, new Date().toISOString())
    if (!db.prepare('SELECT 1 FROM domains WHERE domain_id = ?').get(row.domainId)) throw new Error(`Domínio não registrado: ${row.domainId}`)
    upsertAssetRows(db, [row])
  }

  upsertAssets(inputs) {
    if (!Array.isArray(inputs) || inputs.length > 20000) throw new Error('Lote de assets inválido ou acima do limite.')
    if (!inputs.length) return
    const db = this.assertReady()
    const now = new Date().toISOString()
    const rows = inputs.map((input) => normalizeAssetInput(input, now))
    const hasDomain = db.prepare('SELECT 1 FROM domains WHERE domain_id = ?')
    const missingDomains = [...new Set(rows.map((row) => row.domainId))].filter((domainId) => !hasDomain.get(domainId))
    if (missingDomains.length) throw new Error(`Domínio não registrado: ${missingDomains.join(', ')}`)
    upsertAssetRows(db, rows)
  }

  linkObject({ assetId, sha256: hash, role = 'original' }) {
    validateId(assetId, 'ID do asset')
    validateId(role, 'Função do objeto')
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('SHA-256 inválido.')
    this.assertReady().prepare(`INSERT INTO asset_objects(asset_id, sha256, role) VALUES (?, ?, ?)
      ON CONFLICT(asset_id, role) DO UPDATE SET sha256=excluded.sha256`).run(assetId, hash, role)
  }

  addReference({ sourceDomain, sourceId, targetDomain, targetId, relation }) {
    validateDomainId(sourceDomain); validateId(sourceId, 'ID de origem')
    validateDomainId(targetDomain); validateId(targetId, 'ID de destino'); validateId(relation, 'Relação')
    const db = this.assertReady()
    const hasDomain = db.prepare('SELECT 1 FROM domains WHERE domain_id = ?')
    if (!hasDomain.get(sourceDomain) || !hasDomain.get(targetDomain)) throw new Error('Referência usa domínio ainda não registrado.')
    db.prepare(`INSERT OR IGNORE INTO entity_references(source_domain, source_id, target_domain, target_id, relation)
      VALUES (?, ?, ?, ?, ?)`).run(sourceDomain, sourceId, targetDomain, targetId, relation)
  }

  setDomainState(domainId, state, manifest = {}) {
    validateDomainId(domainId)
    if (!['legacy', 'migrating', 'active', 'verified'].includes(state)) throw new Error('Estado de armazenamento inválido.')
    const db = this.assertReady()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO domain_storage_state(domain_id, state, manifest_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(domain_id) DO UPDATE SET state=excluded.state, manifest_json=excluded.manifest_json, updated_at=excluded.updated_at`)
      .run(domainId, state, JSON.stringify(manifest), now)
  }

  getDomainState(domainId) {
    validateDomainId(domainId)
    const row = this.assertReady().prepare('SELECT state, manifest_json, updated_at FROM domain_storage_state WHERE domain_id=?').get(domainId)
    return row ? { state: row.state, manifest: JSON.parse(row.manifest_json), updatedAt: row.updated_at } : { state: 'legacy', manifest: {}, updatedAt: null }
  }

  beginMigration({ id, manifest }) {
    validateId(id, 'ID de migração')
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw new Error('Manifesto de migração inválido.')
    const now = new Date().toISOString()
    this.assertReady().prepare(`INSERT INTO migration_runs(id, state, manifest_json, error_text, created_at, updated_at)
      VALUES (?, 'prepared', ?, NULL, ?, ?)`).run(id, JSON.stringify(manifest), now, now)
  }

  updateMigration(id, { state, manifest, error = null }) {
    validateId(id, 'ID de migração')
    if (!['prepared', 'copying', 'copied', 'verified', 'cutover', 'complete', 'failed'].includes(state)) throw new Error('Estado de migração inválido.')
    const db = this.assertReady()
    const current = db.prepare('SELECT manifest_json FROM migration_runs WHERE id=?').get(id)
    if (!current) throw new Error('Migração não encontrada.')
    db.prepare('UPDATE migration_runs SET state=?, manifest_json=?, error_text=?, updated_at=? WHERE id=?')
      .run(state, JSON.stringify(manifest ?? JSON.parse(current.manifest_json)), typeof error === 'string' ? error.slice(0, 2000) : null, new Date().toISOString(), id)
  }

  getMigration(id) {
    validateId(id, 'ID de migração')
    const row = this.assertReady().prepare('SELECT * FROM migration_runs WHERE id=?').get(id)
    return row ? { id: row.id, state: row.state, manifest: JSON.parse(row.manifest_json), error: row.error_text, createdAt: row.created_at, updatedAt: row.updated_at } : null
  }

  migrationSummary() {
    const db = this.assertReady()
    return db.prepare(`SELECT d.domain_id AS domainId, coalesce(s.state, 'legacy') AS state, coalesce(s.manifest_json, '{}') AS manifest
      FROM domains d LEFT JOIN domain_storage_state s ON s.domain_id=d.domain_id ORDER BY d.domain_id`).all()
      .map((row) => ({ domainId: row.domainId, state: row.state, manifest: JSON.parse(row.manifest) }))
  }

  ensureDomainDirectory(domainId, relativePath = '') {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath, true)
    const db = this.assertReady()
    const now = new Date().toISOString()
    const segments = normalized ? normalized.split('/') : []
    const insert = db.prepare('INSERT OR IGNORE INTO domain_directories(domain_id, relative_path, updated_at) VALUES (?, ?, ?)')
    const txn = db.transaction(() => {
      insert.run(domainId, '', now)
      let current = ''
      for (const segment of segments) { current = current ? `${current}/${segment}` : segment; insert.run(domainId, current, now) }
    })
    txn()
  }

  hasDomainDirectory(domainId, relativePath = '') {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath, true)
    return Boolean(this.assertReady().prepare('SELECT 1 FROM domain_directories WHERE domain_id=? AND relative_path=?').get(domainId, normalized))
  }

  async writeDomainFile(domainId, relativePath, bytes, { text = false, imageRefs = [] } = {}) {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath)
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    const digest = sha256(buffer)
    let objectHash = null
    let contentText = null
    if (text) {
      contentText = buffer.toString('utf8')
      if (!Buffer.from(contentText, 'utf8').equals(buffer)) throw new Error('Arquivo textual não preserva bytes UTF-8.')
    } else {
      const extension = path.extname(normalized).toLowerCase() || '.bin'
      const object = await new ContentAddressedStore(this.root).putObject(buffer, { mimeType: mimeFromExtension(extension), extension })
      objectHash = object.sha256
      const db = this.assertReady()
      db.prepare(`INSERT OR IGNORE INTO objects(sha256, byte_length, mime_type, extension, relative_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(object.sha256, object.byteLength, object.mimeType, object.extension, object.relativePath, new Date().toISOString())
    }
    const db = this.assertReady()
    const now = new Date().toISOString()
    if (!Array.isArray(imageRefs) || imageRefs.some((ref) => !ref || typeof ref.pointer !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256))) throw new Error('Referências de imagem inválidas.')
    const txn = db.transaction(() => {
      this.ensureDomainDirectory(domainId, path.posix.dirname(normalized) === '.' ? '' : path.posix.dirname(normalized))
      db.prepare(`INSERT INTO domain_files(domain_id, relative_path, content_text, object_sha256, byte_length, content_sha256, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(domain_id, relative_path) DO UPDATE SET content_text=excluded.content_text,
        object_sha256=excluded.object_sha256, byte_length=excluded.byte_length, content_sha256=excluded.content_sha256, updated_at=excluded.updated_at`)
        .run(domainId, normalized, contentText, objectHash, buffer.length, digest, now)
      db.prepare('DELETE FROM domain_image_refs WHERE domain_id=? AND relative_path=?').run(domainId, normalized)
      const insertImageRef = db.prepare('INSERT INTO domain_image_refs(domain_id, relative_path, json_pointer, object_sha256) VALUES (?, ?, ?, ?)')
      for (const ref of imageRefs) insertImageRef.run(domainId, normalized, ref.pointer, ref.sha256)
    })
    txn()
    return { relativePath: normalized, byteLength: buffer.length, sha256: digest, objectSha256: objectHash }
  }

  async readDomainFile(domainId, relativePath) {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath)
    const row = this.assertReady().prepare('SELECT * FROM domain_files WHERE domain_id=? AND relative_path=?').get(domainId, normalized)
    if (!row) return null
    let bytes
    if (row.content_text !== null) bytes = Buffer.from(row.content_text, 'utf8')
    else {
      const object = this.assertReady().prepare('SELECT relative_path FROM objects WHERE sha256=?').get(row.object_sha256)
      if (!object) throw new Error(`Objeto do arquivo ausente: ${normalized}`)
      const absolute = path.resolve(this.root, object.relative_path)
      if (!isWithin(this.root, absolute)) throw new Error('Objeto armazenado fora de app-data.')
      bytes = await fsp.readFile(absolute)
    }
    if (bytes.length !== row.byte_length || sha256(bytes) !== row.content_sha256) throw new Error(`Integridade do arquivo falhou: ${normalized}`)
    return bytes
  }

  async ingestImage(bytes) {
    const sourceHash = sha256(bytes)
    const cached = this.imageIngestCache.get(sourceHash)
    if (cached) return { ...cached, reused: true }
    const normalized = await normalizeImageBuffer(bytes)
    const object = await new ContentAddressedStore(this.root).putObject(normalized.bytes, { mimeType: 'image/png', extension: '.png' })
    this.assertReady().prepare(`INSERT OR IGNORE INTO objects(sha256, byte_length, mime_type, extension, relative_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(object.sha256, object.byteLength, object.mimeType, object.extension, object.relativePath, new Date().toISOString())
    const result = { ...normalized, sha256: object.sha256, reused: object.reused }
    this.imageIngestCache.set(sourceHash, result)
    if (this.imageIngestCache.size > 512) this.imageIngestCache.delete(this.imageIngestCache.keys().next().value)
    return result
  }

  async storeGeneratedImage(bytes) {
    const sharp = require('sharp')
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])
    if (!buffer.length || buffer.length > 50 * 1024 * 1024) throw new Error('Imagem gerada vazia ou acima do limite permitido.')
    let metadata
    try { metadata = await sharp(buffer, { limitInputPixels: 32_000_000, failOn: 'error', animated: true }).metadata() }
    catch (reason) { throw new Error(`Imagem gerada inválida ou corrompida: ${reason?.message ?? 'erro de decodificação'}`) }
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height
      || metadata.width * metadata.height > 32_000_000) throw new Error('A saída gerada precisa ser PNG estático dentro do limite de pixels.')
    let png = buffer
    if (metadata.format !== 'png') {
      png = await sharp(buffer, { limitInputPixels: 32_000_000, failOn: 'error' }).rotate().toColourspace('srgb')
        .ensureAlpha().png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer()
      if (png.length > 50 * 1024 * 1024) throw new Error('O PNG gerado excede o limite permitido.')
    }
    const object = await new ContentAddressedStore(this.root).putObject(png, { mimeType: 'image/png', extension: '.png' })
    this.assertReady().prepare(`INSERT OR IGNORE INTO objects(sha256, byte_length, mime_type, extension, relative_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(object.sha256, object.byteLength, object.mimeType, object.extension, object.relativePath, new Date().toISOString())
    const output = await sharp(png, { limitInputPixels: 32_000_000, failOn: 'error' }).metadata()
    return { sha256: object.sha256, byteLength: object.byteLength, width: output.width, height: output.height, reused: object.reused }
  }

  async readObject(hash) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Hash de imagem inválido.')
    const row = this.assertReady().prepare('SELECT relative_path, byte_length FROM objects WHERE sha256=?').get(hash)
    if (!row) throw new Error('Imagem referenciada não encontrada no catálogo.')
    const absolute = path.resolve(this.root, row.relative_path)
    if (!isWithin(this.root, absolute)) throw new Error('Imagem referenciada fora de app-data.')
    const bytes = await fsp.readFile(absolute)
    if (bytes.length !== row.byte_length || sha256(bytes) !== hash) throw new Error('A imagem canônica falhou na verificação de integridade.')
    return bytes
  }

  listDomainFiles(domainId, prefix = '') {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(prefix, true)
    const rows = normalized
      ? this.assertReady().prepare(`SELECT relative_path, byte_length, content_sha256, object_sha256 FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\') ORDER BY relative_path`)
        .all(domainId, normalized, `${escapeLike(normalized)}/%`)
      : this.assertReady().prepare('SELECT relative_path, byte_length, content_sha256, object_sha256 FROM domain_files WHERE domain_id=? ORDER BY relative_path').all(domainId)
    return rows.map((row) => ({ relativePath: row.relative_path, byteLength: row.byte_length, sha256: row.content_sha256, objectSha256: row.object_sha256 }))
  }

  listDomainDirectory(domainId, relativePath = '') {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath, true)
    const prefix = normalized ? `${normalized}/` : ''
    const rows = this.listDomainFiles(domainId, normalized)
    const names = new Map()
    for (const row of rows) {
      const rest = row.relativePath.startsWith(prefix) ? row.relativePath.slice(prefix.length) : ''
      if (!rest) continue
      const [name, ...tail] = rest.split('/')
      if (!names.has(name)) names.set(name, { name, directory: tail.length > 0, file: tail.length === 0 })
      else if (tail.length > 0) names.get(name).directory = true
    }
    const dirRows = this.assertReady().prepare('SELECT relative_path FROM domain_directories WHERE domain_id=? AND relative_path LIKE ? ESCAPE \'\\\' ORDER BY relative_path')
      .all(domainId, `${escapeLike(prefix)}%`)
    for (const row of dirRows) {
      const rest = row.relative_path.startsWith(prefix) ? row.relative_path.slice(prefix.length) : ''
      if (!rest) continue
      const [name] = rest.split('/')
      if (!names.has(name)) names.set(name, { name, directory: true, file: false })
      else names.get(name).directory = true
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  removeDomainPath(domainId, relativePath, recursive = false) {
    validateDomainId(domainId)
    const normalized = normalizeDomainPath(relativePath, true)
    if (!normalized) throw new Error('Não é permitido remover a raiz de um domínio.')
    const db = this.assertReady()
    const prefix = `${escapeLike(normalized)}/%`
    const objectHashes = new Set()
    const txn = db.transaction(() => {
      const files = db.prepare(`SELECT relative_path, object_sha256 FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`)
        .all(domainId, normalized, prefix)
      const dirs = db.prepare(`SELECT relative_path FROM domain_directories WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`)
        .all(domainId, normalized, prefix)
      if (!recursive && (files.some((row) => row.relative_path !== normalized) || dirs.some((row) => row.relative_path !== normalized))) throw new Error('Diretório não está vazio.')
      const imageRefs = db.prepare(`SELECT object_sha256 FROM domain_image_refs WHERE domain_id=? AND relative_path IN (
        SELECT relative_path FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\'))`)
        .all(domainId, domainId, normalized, prefix)
      for (const row of files) if (row.object_sha256) objectHashes.add(row.object_sha256)
      for (const row of imageRefs) objectHashes.add(row.object_sha256)
      db.prepare(`DELETE FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`).run(domainId, normalized, prefix)
      db.prepare(`DELETE FROM domain_directories WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`).run(domainId, normalized, prefix)
    })
    txn()
    for (const hash of objectHashes) this.removeUnreferencedObject(hash)
  }

  removeUnreferencedObject(hash) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Hash de objeto inválido.')
    const db = this.assertReady()
    const row = db.prepare('SELECT relative_path FROM objects WHERE sha256=?').get(hash)
    if (!row) return
    const isReferenced = db.prepare(`SELECT 1 FROM asset_objects WHERE sha256=?
      UNION SELECT 1 FROM domain_files WHERE object_sha256=?
      UNION SELECT 1 FROM domain_image_refs WHERE object_sha256=? LIMIT 1`).get(hash, hash, hash)
    if (isReferenced) return
    const objectRoot = path.join(this.root, 'media', 'objects', 'sha256')
    const absolute = path.resolve(this.root, row.relative_path)
    if (!isWithin(objectRoot, absolute)) throw new Error('Objeto fora do armazenamento canônico.')
    try {
      const parent = path.dirname(absolute)
      const realParent = fs.realpathSync(parent)
      if (!isWithin(objectRoot, realParent)) throw new Error('Pasta do objeto fora do armazenamento canônico.')
      fs.unlinkSync(absolute)
    }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    db.prepare(`DELETE FROM objects WHERE sha256=?
      AND NOT EXISTS (SELECT 1 FROM asset_objects WHERE sha256=?)
      AND NOT EXISTS (SELECT 1 FROM domain_files WHERE object_sha256=?)
      AND NOT EXISTS (SELECT 1 FROM domain_image_refs WHERE object_sha256=?)`).run(hash, hash, hash, hash)
    // Empty hash shards are harmless and can be reused by the next image write.
    try { fs.rmdirSync(path.dirname(absolute)) } catch { /* keep the shard if it cannot be removed */ }
  }

  renameDomainPath(domainId, fromPath, toPath) {
    validateDomainId(domainId)
    const from = normalizeDomainPath(fromPath, true); const to = normalizeDomainPath(toPath)
    if (!from) throw new Error('Não é permitido renomear a raiz de um domínio.')
    const db = this.assertReady(); const fromPrefix = `${escapeLike(from)}/%`; const toPrefix = `${to}/`
    const txn = db.transaction(() => {
      const files = db.prepare(`SELECT * FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\') ORDER BY relative_path`).all(domainId, from, fromPrefix)
      const refsByPath = new Map(files.map((row) => [row.relative_path,
        db.prepare('SELECT json_pointer, object_sha256 FROM domain_image_refs WHERE domain_id=? AND relative_path=?').all(domainId, row.relative_path)]))
      const dirs = db.prepare(`SELECT relative_path FROM domain_directories WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\') ORDER BY relative_path`).all(domainId, from, fromPrefix)
      if (!files.length && !dirs.length) throw new Error('Origem não encontrada.')
      const insertFile = db.prepare(`INSERT INTO domain_files(domain_id, relative_path, content_text, object_sha256, byte_length, content_sha256, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(domain_id, relative_path) DO UPDATE SET content_text=excluded.content_text, object_sha256=excluded.object_sha256,
        byte_length=excluded.byte_length, content_sha256=excluded.content_sha256, updated_at=excluded.updated_at`)
      const now = new Date().toISOString()
      for (const row of files) {
        const target = row.relative_path === from ? to : `${toPrefix}${row.relative_path.slice(from.length + 1)}`
        insertFile.run(domainId, target, row.content_text, row.object_sha256, row.byte_length, row.content_sha256, now)
        db.prepare('DELETE FROM domain_image_refs WHERE domain_id=? AND relative_path=?').run(domainId, target)
        const insertRef = db.prepare('INSERT INTO domain_image_refs(domain_id, relative_path, json_pointer, object_sha256) VALUES (?, ?, ?, ?)')
        for (const ref of refsByPath.get(row.relative_path) ?? []) insertRef.run(domainId, target, ref.json_pointer, ref.object_sha256)
      }
      for (const row of dirs) {
        const target = row.relative_path === from ? to : `${toPrefix}${row.relative_path.slice(from.length + 1)}`
        db.prepare('INSERT OR IGNORE INTO domain_directories(domain_id, relative_path, updated_at) VALUES (?, ?, ?)').run(domainId, target, now)
      }
      db.prepare(`DELETE FROM domain_files WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`).run(domainId, from, fromPrefix)
      db.prepare(`DELETE FROM domain_directories WHERE domain_id=? AND (relative_path=? OR relative_path LIKE ? ESCAPE '\\')`).run(domainId, from, fromPrefix)
    })
    txn()
  }

  search({ query = '', domainId, kind, limit = 100, offset = 0 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Paginação inválida.')
    if (domainId !== undefined) validateDomainId(domainId)
    if (kind !== undefined) validateId(kind, 'Tipo do asset')
    const db = this.assertReady()
    if (query.trim()) {
      const terms = query.trim().replace(/["*:^(){}\[\]]/g, ' ').split(/\s+/).filter(Boolean)
      if (!terms.length) return []
      const expression = terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(' AND ')
      const rows = db.prepare(`SELECT a.* FROM asset_search s JOIN assets a ON a.id=s.asset_id
        WHERE asset_search MATCH ? AND a.archived=0 ${domainId ? 'AND a.domain_id=?' : ''} ${kind ? 'AND a.kind=?' : ''}
        ORDER BY bm25(asset_search), a.display_name COLLATE NOCASE, a.id LIMIT ? OFFSET ?`)
      return rows.all(...[expression, ...(domainId ? [domainId] : []), ...(kind ? [kind] : []), limit, offset]).map(parseAssetRow)
    }
    const clauses = ['archived=0']; const params = []
    if (domainId) { validateDomainId(domainId); clauses.push('domain_id=?'); params.push(domainId) }
    if (kind) { validateId(kind, 'Tipo do asset'); clauses.push('kind=?'); params.push(kind) }
    return db.prepare(`SELECT * FROM assets WHERE ${clauses.join(' AND ')} ORDER BY display_name COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .all(...params, limit, offset).map(parseAssetRow)
  }

  storageSummary() {
    const db = this.assertReady()
    return {
      assets: db.prepare('SELECT count(*) AS count FROM assets WHERE archived=0').get().count,
      archivedAssets: db.prepare('SELECT count(*) AS count FROM assets WHERE archived=1').get().count,
      uniqueObjects: db.prepare('SELECT count(*) AS count FROM objects').get().count,
      referencedObjects: db.prepare(`SELECT count(DISTINCT sha256) AS count FROM (
        SELECT sha256 FROM asset_objects UNION SELECT object_sha256 AS sha256 FROM domain_files WHERE object_sha256 IS NOT NULL
        UNION SELECT object_sha256 AS sha256 FROM domain_image_refs)`).get().count,
      objectBytes: db.prepare('SELECT coalesce(sum(byte_length), 0) AS bytes FROM objects').get().bytes,
      unreferencedObjects: db.prepare(`SELECT count(*) AS count FROM objects o WHERE
        NOT EXISTS (SELECT 1 FROM asset_objects ao WHERE ao.sha256=o.sha256)
        AND NOT EXISTS (SELECT 1 FROM domain_files df WHERE df.object_sha256=o.sha256)
        AND NOT EXISTS (SELECT 1 FROM domain_image_refs ir WHERE ir.object_sha256=o.sha256)`).get().count
    }
  }

  close() {
    if (this.database?.open) {
      this.database.pragma('wal_checkpoint(TRUNCATE)')
      this.database.close()
    }
  }
}

function parseAssetRow(row) {
  return { id: row.id, domainId: row.domain_id, kind: row.kind, displayName: row.display_name,
    schemaVersion: row.schema_version, metadata: JSON.parse(row.metadata_json), archived: Boolean(row.archived),
    createdAt: row.created_at, updatedAt: row.updated_at }
}


async function registerObjectMetadata(catalog, assetId, object, role = 'original') {
  const db = catalog.assertReady()
  const relative = object.relativePath
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Caminho relativo de objeto inválido.')
  const absolute = path.resolve(catalog.root, relative)
  if (!isWithin(catalog.root, absolute)) throw new Error('Referência de objeto fora de app-data.')
  if (absolute !== await fsp.realpath(absolute)) throw new Error('Referência de objeto não canônica recusada.')
  const stat = await fsp.stat(absolute)
  if (!stat.isFile() || stat.size !== object.byteLength || await hashFile(absolute) !== object.sha256) throw new Error('Objeto não passou na validação de tamanho e SHA-256.')
  db.prepare(`INSERT OR IGNORE INTO objects(sha256, byte_length, mime_type, extension, relative_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(object.sha256, object.byteLength, object.mimeType, object.extension ?? path.extname(relative), relative, new Date().toISOString())
  catalog.linkObject({ assetId, sha256: object.sha256, role })
}

async function createDatabaseSnapshot(catalog, destination) {
  const db = catalog.assertReady()
  const absolute = path.resolve(destination)
  if (!isWithin(path.join(catalog.root, 'backups'), absolute)) throw new Error('Snapshot precisa ficar dentro de app-data/backups.')
  await ensureSafeDirectory(catalog.root, path.dirname(absolute))
  if (fs.existsSync(absolute)) throw new Error('Snapshot existente não será sobrescrito.')
  const temporary = `${absolute}.${crypto.randomUUID()}.tmp`
  try {
    await db.backup(temporary)
    const verify = new Database(temporary, { readonly: true })
    try {
      if (verify.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Snapshot SQLite falhou na verificação de integridade.')
    } finally { verify.close() }
    await fsp.rename(temporary, absolute)
  } catch (error) {
    await fsp.unlink(temporary).catch(() => undefined)
    throw error
  }
  const snapshotStat = await fsp.stat(absolute)
  return { path: path.relative(catalog.root, absolute).split(path.sep).join('/'), byteLength: snapshotStat.size, sha256: await hashFile(absolute) }
}

module.exports = { BUILTIN_DOMAINS, ContentAddressedStore, DataPlatform, createDatabaseSnapshot, getAppDataUsage, registerObjectMetadata, sha256 }
