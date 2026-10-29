import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import ts from 'typescript'

function loadTypeScriptModule(relativePath, injected = {}) {
  const path = resolve(relativePath)
  const source = readFileSync(path, 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  const requireFromModule = createRequire(path)
  const injectedRequire = (name) => Object.hasOwn(injected, name) ? injected[name] : requireFromModule(name)
  new Function('require', 'exports', 'module', compiled)(injectedRequire, module.exports, module)
  return module.exports
}

function deferred() {
  let resolvePromise
  const promise = new Promise((resolve) => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

function gatedStorage(started, gate) {
  return {
    access: fs.access,
    copyFile: fs.copyFile,
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    readdir: fs.readdir,
    rename: fs.rename,
    stat: fs.stat,
    unlink: fs.unlink,
    writeFile: async (path, ...args) => {
      if (String(path).includes('catalog-') && String(path).endsWith('.tmp')) {
        started.resolve()
        await gate.promise
      }
      return fs.writeFile(path, ...args)
    }
  }
}

async function withTempDirectory(operation) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-gacha-media-pending-'))
  try { await operation(root) } finally { await fs.rm(root, { recursive: true, force: true }) }
}

async function assertStoreTracksDelete({ makeStore, catalogPath, catalog, assetPath }) {
  await withTempDirectory(async (root) => {
    const started = deferred(), gate = deferred()
    const store = makeStore(root, gatedStorage(started, gate))
    await fs.mkdir(join(root, catalogPath, '..'), { recursive: true })
    await fs.writeFile(join(root, catalogPath), JSON.stringify(catalog))
    await fs.mkdir(join(root, assetPath, '..'), { recursive: true })
    await fs.writeFile(join(root, assetPath), Buffer.from('asset'))

    const deleting = store.delete(catalog.items[0].id)
    await started.promise
    assert.equal(store.getPendingWrites().length, 1)
    gate.resolve()
    await deleting
    assert.deepEqual(store.getPendingWrites(), [])
  })
}

test('bibliotecas compartilhadas mantêm mutações ativas no inventário até concluir', async () => {
  const tracker = loadTypeScriptModule('electron/domains/storage/pendingOperationTracker.ts')
  const videoId = '00000000-0000-4000-8000-000000000001'
  const video = loadTypeScriptModule('electron/domains/mediaLibrary/videoLibraryStore.ts', {
    '../storage/pendingOperationTracker.ts': tracker,
    './videoCasShadow': { sha256File: async () => '0'.repeat(64) }
  })
  const background = loadTypeScriptModule('electron/backgroundLibrary.ts', {
    './domains/storage/pendingOperationTracker.ts': tracker,
    './imageIngestion.cjs': { normalizeImageBuffer: async (bytes) => ({ bytes }) }
  })
  const gif = loadTypeScriptModule('electron/roteiroUiGifLibrary.ts', {
    './domains/storage/pendingOperationTracker.ts': tracker
  })

  await assertStoreTracksDelete({
    makeStore: (root, storage) => { video.configureVideoLibraryStorage(storage); return new video.VideoLibraryStore(() => root) },
    catalogPath: 'media-library/catalog.json',
    catalog: { schemaVersion: 1, items: [{ id: videoId, name: 'clip.mp4', extension: 'mp4', mimeType: 'video/mp4', size: 5, durationFrames: 60, createdAt: new Date().toISOString() }], deleted: [] },
    assetPath: `media-library/videos/${videoId}.mp4`
  })
  await assertStoreTracksDelete({
    makeStore: (root, storage) => { background.configureBackgroundLibraryStorage(storage); return new background.VideoBackgroundLibraryStore(() => root) },
    catalogPath: 'background-library/catalog.json',
    catalog: { schemaVersion: 1, items: [{ id: videoId, name: 'fundo.png', extension: 'png', mimeType: 'image/png', size: 5, createdAt: new Date().toISOString() }], deleted: [] },
    assetPath: `background-library/images/${videoId}.png`
  })
  await assertStoreTracksDelete({
    makeStore: (root, storage) => { gif.configureRoteiroUiGifStorage(storage); return new gif.RoteiroUiGifLibraryStore(() => root) },
    catalogPath: 'roteiro-ui-gif-library/catalog.json',
    catalog: { schemaVersion: 1, initialized: true, items: [{ id: videoId, name: 'efeito.gif', size: 5, createdAt: new Date().toISOString() }] },
    assetPath: `roteiro-ui-gif-library/gifs/${videoId}.gif`
  })
})

test('main inclui as três bibliotecas no inventário central de gravações', () => {
  const main = readFileSync('electron/main.ts', 'utf8')
  assert.match(main, /videoLibrary\.getPendingWrites\(\)/)
  assert.match(main, /videoBackgroundLibrary\.getPendingWrites\(\)/)
  assert.match(main, /roteiroUiGifLibrary\.getPendingWrites\(\)/)
})
