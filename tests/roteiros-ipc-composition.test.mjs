import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

function loadCompositionModule(injected) {
  const path = resolve('electron/application/registerRoteirosIpc.ts')
  const source = readFileSync(path, 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  const requireFromModule = createRequire(path)
  const injectedRequire = (name) => Object.hasOwn(injected, name) ? injected[name] : requireFromModule(name)
  new Function('require', 'exports', 'module', compiled)(injectedRequire, module.exports, module)
  return module.exports
}

test('application composition wires media/Roteiros services and returns export shutdown lifecycle', async () => {
  const calls = []
  const configs = new Map()
  const getDatabase = () => null
  const lifecycle = { drain: async () => {}, resumeAfterFailedShutdown: () => {} }
  const creator = (name) => (config) => {
    calls.push(`create:${name}`)
    configs.set(name, config)
    const service = { name }
    return service
  }
  const registrar = (name) => (config) => {
    calls.push(`register:${name}`)
    assert.equal(config.service?.name, name.replace('handlers:', ''))
    return name === 'handlers:export' ? lifecycle : undefined
  }
  const referenceGuard = (name) => (getDb) => {
    calls.push(`guard:${name}`)
    assert.equal(getDb, getDatabase)
    return () => {}
  }
  const injected = {
    '../domains/mediaLibrary/backgroundLibraryService.ts': { createBackgroundLibraryService: creator('background') },
    '../domains/mediaLibrary/backgroundLibraryIpc.ts': { registerBackgroundLibraryHandlers: registrar('handlers:background') },
    '../domains/mediaLibrary/videoLibraryService.ts': { createVideoLibraryService: creator('video') },
    '../domains/mediaLibrary/videoLibraryIpc.ts': { registerVideoLibraryHandlers: registrar('handlers:video') },
    '../domains/roteiros/assetReferences.ts': {
      createRoteiroBackgroundReferenceGuard: referenceGuard('background'),
      createRoteiroUiGifReferenceGuard: referenceGuard('gif')
    },
    '../domains/roteiros/exportLogsService.ts': { createRoteiroExportLogsService: creator('logs') },
    '../domains/roteiros/exportLogsIpc.ts': { registerRoteiroExportLogsHandlers: registrar('handlers:logs') },
    '../domains/roteiros/exportService.ts': { createRoteiroExportService: creator('export') },
    '../domains/roteiros/exportIpc.ts': { registerRoteiroExportHandlers: registrar('handlers:export') },
    '../domains/roteiros/uiGifsService.ts': { createRoteiroUiGifsService: creator('gif') },
    '../domains/roteiros/uiGifsIpc.ts': { registerRoteiroUiGifsHandlers: registrar('handlers:gif') },
    '../domains/roteiros/service.ts': { createRoteirosDocumentService: creator('documents') },
    '../domains/roteiros/documentIpc.ts': { registerRoteirosDocumentHandlers: registrar('handlers:documents') }
  }
  const { registerRoteirosIpc } = loadCompositionModule(injected)
  const importKinds = []
  const videoLibrary = { resolveMedia: async () => ({ extension: 'mp4', durationFrames: 90, path: '/logical/video' }) }
  const videoBackgroundLibrary = { resolve: async () => ({ path: '/logical/background' }) }
  const roteiroUiGifLibrary = { resolve: async () => '/logical/gif' }
  const resolvePhysicalPath = async (path) => path === '/logical/video' ? '/physical/video' : null
  const enqueueWrite = async (operation) => operation()
  const waitForPendingWrites = async () => {}
  const coordinateVideoReferenceChange = async (operation) => operation()
  const assertNoVideoReferences = async () => {}
  const assertLibraryVideoReferencesAvailable = async () => {}
  const assertLibraryBackgroundReferencesAvailable = async () => {}
  const assertLibraryUiGifReferencesAvailable = async () => {}
  const deps = {
    ipcMain: { handle() {} },
    assertTrustedSender: () => {},
    getDatabase,
    videoLibrary,
    videoBackgroundLibrary,
    roteiroUiGifLibrary,
    getDefaultGifPath: () => undefined,
    getAppDataRoot: () => '/tmp/native-gacha',
    resolvePhysicalPath,
    openImportFile: async (kind) => { importKinds.push(kind); return null },
    openPath: async () => '',
    enqueueWrite,
    waitForPendingWrites,
    coordinateVideoReferenceChange,
    assertNoVideoReferences,
    assertLibraryVideoReferencesAvailable,
    assertLibraryBackgroundReferencesAvailable,
    assertLibraryUiGifReferencesAvailable
  }

  assert.equal(registerRoteirosIpc(deps), lifecycle)
  assert.deepEqual(calls, [
    'create:video', 'register:handlers:video',
    'guard:background', 'create:background', 'register:handlers:background',
    'guard:gif', 'create:gif', 'register:handlers:gif',
    'create:export', 'register:handlers:export',
    'create:documents', 'register:handlers:documents',
    'create:logs', 'register:handlers:logs'
  ])
  assert.equal(configs.get('video').enqueueWrite, enqueueWrite)
  assert.equal(configs.get('background').enqueueWrite, enqueueWrite)
  assert.equal(configs.get('gif').enqueueWrite, enqueueWrite)
  assert.equal(configs.get('documents').waitForPendingWrites, waitForPendingWrites)
  assert.equal(configs.get('documents').assertLibraryVideoReferencesAvailable, assertLibraryVideoReferencesAvailable)
  assert.deepEqual(await Promise.all([
    configs.get('video').openImportDialog(),
    configs.get('background').openImportDialog(),
    configs.get('gif').openImportDialog()
  ]), [null, null, null])
  assert.deepEqual(importKinds, ['video', 'background', 'gif'])
  assert.equal(await configs.get('export').resolveBackground('bg'), '/logical/background')
  assert.equal(await configs.get('export').resolveGif('gif'), '/logical/gif')
  assert.equal(await configs.get('export').resolveVideo({ id: 'v', name: 'clip', extension: 'mp4', durationFrames: 90 }), '/physical/video')
  await assert.rejects(configs.get('export').resolveVideo({ id: 'v', name: 'clip', extension: 'webm', durationFrames: 90 }), /não corresponde ao arquivo/)
})
