'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const { DataPlatform } = require('../electron/dataPlatform.cjs')
const { DomainFileSystem } = require('../electron/domainFileSystem.cjs')
const { createHash } = require('node:crypto')

const videoCasShadow = { sha256File: async (filePath) => createHash('sha256').update(await fs.readFile(filePath)).digest('hex') }

function loadVideoLibrary() {
  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../electron/domains/mediaLibrary/videoLibraryStore.ts'), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  const trackerSource = require('node:fs').readFileSync(path.resolve(__dirname, '../electron/domains/storage/pendingOperationTracker.ts'), 'utf8')
  const trackerCompiled = ts.transpile(trackerSource, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const trackerModule = { exports: {} }
  new Function('require', 'module', 'exports', trackerCompiled)(require, trackerModule, trackerModule.exports)
  const injectedRequire = (name) => name.includes('pendingOperationTracker') ? trackerModule.exports : name.includes('videoCasShadow') ? videoCasShadow : require(name)
  new Function('require', 'module', 'exports', compiled)(injectedRequire, mod, mod.exports)
  return mod.exports
}

test('video imports resolve physical content from active app-data domain storage', async () => {
  // Windows runners may expose TEMP via the 8.3 RUNNER~1 alias. Use the
  // canonical path, matching the production storage boundary's invariant.
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gacha-video-domainfs-')))
  const dataRoot = path.join(root, 'app-data')
  const userData = path.join(root, 'profile')
  const libraryRoot = path.join(userData, 'studios', 'Editor Gacha')
  const source = path.join(root, 'synthetic.mp4')
  const bytes = Buffer.from('synthetic video bytes for the import regression')
  const catalog = new DataPlatform(dataRoot).initialize()
  try {
    catalog.setDomainState('video-studio.media', 'active', { fixture: true })
    const adapter = new DomainFileSystem(catalog, userData)
    const { configureVideoLibraryStorage, VideoLibraryStore } = loadVideoLibrary()
    configureVideoLibraryStorage(adapter)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(source, bytes)

    const library = new VideoLibraryStore(() => libraryRoot)
    const imported = await library.importFile(source)
    assert.equal(imported.durationFrames, null)
    assert.equal(imported.sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.equal(Object.hasOwn(imported, 'studios'), false)
    const listed = await library.list()
    assert.equal(listed[0].available, true)
    assert.equal(Object.hasOwn(listed[0], 'studios'), false)

    const logicalMedia = path.join(libraryRoot, 'media-library', 'videos', `${imported.id}.mp4`)
    const physicalMedia = await adapter.resolvePhysicalPath(logicalMedia)
    assert.ok(physicalMedia?.startsWith(dataRoot))
    assert.deepEqual(await fs.readFile(physicalMedia), bytes)
    await assert.rejects(fs.stat(logicalMedia), { code: 'ENOENT' }, 'active domain media is virtual, not a profile filesystem file')

    const catalogPath = path.join(libraryRoot, 'media-library', 'catalog.json')
    let continueRename
    let onRename
    const renameEntered = new Promise(resolve => { onRename = resolve })
    const renameBlocked = new Promise(resolve => { continueRename = resolve })
    let catalogReads = 0
    const originalRead = adapter.readFile.bind(adapter)
    const originalRename = adapter.rename.bind(adapter)
    adapter.readFile = (file, options) => {
      if (file === catalogPath) catalogReads++
      return originalRead(file, options)
    }
    adapter.rename = async (from, to) => {
      if (to === catalogPath) {
        onRename()
        await renameBlocked
      }
      return originalRename(from, to)
    }
    const finishing = library.finishImport(imported.id, 600)
    await renameEntered
    let timeout
    try {
      const before = catalogReads
      const requests = Array.from({ length: 12 }, () => library.resolveStreamMedia(imported.id))
      const resolved = await Promise.race([
        Promise.all(requests),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Prévia ficou na fila da gravação')), 2000) })
      ])
      assert.equal(catalogReads - before, 1)
      assert.ok(resolved.every(item => item.path === logicalMedia && item.mimeType === 'video/mp4'))
    } finally {
      clearTimeout(timeout)
      continueRename()
      await finishing
      adapter.rename = originalRename
      adapter.readFile = originalRead
    }
    const ready = await finishing
    assert.equal(ready.durationFrames, 600)
    assert.equal(Object.hasOwn(ready, 'studios'), false)

    // Old/unknown catalog properties are kept on disk, but aren't part of the
    // current video-library IPC contract.
    const legacyCatalog = JSON.parse(await adapter.readFile(catalogPath, 'utf8'))
    legacyCatalog.items[0].studios = [{ id: 'legacy', title: 'Legacy' }]
    await adapter.writeFile(catalogPath, JSON.stringify(legacyCatalog, null, 2), 'utf8')
    const afterLegacyRead = await library.list()
    assert.equal(Object.hasOwn(afterLegacyRead[0], 'studios'), false)
    const preservedCatalog = JSON.parse(await adapter.readFile(catalogPath, 'utf8'))
    assert.deepEqual(preservedCatalog.items[0].studios, [{ id: 'legacy', title: 'Legacy' }])
  } finally {
    catalog.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
