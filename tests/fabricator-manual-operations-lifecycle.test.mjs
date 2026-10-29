import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFabricatorProjectHandlers } from '../electron/domains/fabricator/projectIpc.ts'
import { registerModelSourceDownloadHandlers } from '../electron/domains/fabricator/modelSourceExportIpc.ts'
import { registerFabricatorFaceAnimationExportHandler } from '../electron/domains/fabricator/faceAnimationExportIpc.ts'
import { registerFabricatorDesignSettingsHandlers } from '../electron/domains/fabricator/designSettingsIpc.ts'
import { fabricatorIpcChannels } from '../src/shared/fabricatorIpcChannels.ts'
import { flushDesignSettings, saveDesignSettings } from '../src/renderer/src/ui/designSettings.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

function ipcHarness() {
  const handlers = new Map()
  return { handlers, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
}

const trusted = (event) => {
  if (!event.trusted) throw new Error('Origem inválida.')
}

test('importação de Model Source fica na fila do slot desde o seletor até gravar o PNG', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fabricator-import-pending-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, 'source.png')
  await fs.writeFile(sourcePath, Buffer.from([1, 2, 3]))
  const dialogStarted = deferred()
  const releaseDialog = deferred()
  const { handlers, ipcMain } = ipcHarness()
  const service = registerFabricatorProjectHandlers({
    ipcMain,
    assertTrustedSender: trusted,
    isValidSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    libraryPath: () => root,
    slotPath: (slot) => join(root, `slot-${slot}`),
    writeProject: async () => undefined,
    history: { read: async () => ({ undo: [], redo: [] }), write: async () => undefined },
    openImportDialog: async () => { dialogStarted.resolve(); return releaseDialog.promise },
    normalizeImage: async (bytes) => ({ bytes, bitDepth: 8, width: 1, height: 1 }),
    createId: () => 'abcdef11-2345-4234-8234-123456789abc',
    files: fs
  })

  const importing = handlers.get('fabricator:import-model')({ trusted: true }, 2, 'import')
  await dialogStarted.promise
  assert.equal(service.getPendingWrites().length, 1, 'a operação permanece visível enquanto o seletor nativo está aberto')
  releaseDialog.resolve(sourcePath)
  const result = await importing

  assert.equal(result.sourceName, 'source.png')
  assert.equal(result.sourceDataUrl, 'data:image/png;base64,AQID')
  assert.deepEqual(await fs.readFile(join(root, 'slot-2', result.sourceAssetName)), Buffer.from([1, 2, 3]))
  assert.deepEqual(service.getPendingWrites(), [])
})

test('descarte de importação remove somente fonte sem referência no manifesto ou histórico', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fabricator-import-discard-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const slotDirectory = join(root, 'slot-2')
  const historyDirectory = join(slotDirectory, 'history')
  const sourceAssetName = 'source-abcdef11-2345-4234-8234-123456789abc.png'
  const sourcePath = join(slotDirectory, sourceAssetName)
  await fs.mkdir(slotDirectory, { recursive: true })
  await fs.writeFile(sourcePath, Buffer.from([7, 8, 9]))

  const { handlers, ipcMain } = ipcHarness()
  registerFabricatorProjectHandlers({
    ipcMain,
    assertTrustedSender: trusted,
    isValidSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    libraryPath: () => root,
    slotPath: (slot) => join(root, `slot-${slot}`),
    writeProject: async () => undefined,
    history: { read: async () => ({ undo: [], redo: [] }), write: async () => undefined },
    openImportDialog: async () => null,
    normalizeImage: async (bytes) => ({ bytes, bitDepth: 8, width: 1, height: 1 }),
    createId: () => 'abcdef11-2345-4234-8234-123456789abc',
    files: fs
  })
  const discard = handlers.get(fabricatorIpcChannels.discardImportedFabricatorSource)

  assert.equal(await discard({ trusted: true }, 2, sourceAssetName), true)
  await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' })

  await fs.writeFile(sourcePath, Buffer.from([7, 8, 9]))
  await fs.writeFile(join(slotDirectory, 'project.json'), JSON.stringify({ sourceFile: sourceAssetName }))
  assert.equal(await discard({ trusted: true }, 2, sourceAssetName), false)
  await fs.access(sourcePath)

  await fs.writeFile(join(slotDirectory, 'project.json'), 'null')
  await assert.rejects(discard({ trusted: true }, 2, sourceAssetName), /Manifesto do modelo inválido/)
  await fs.access(sourcePath)

  await fs.writeFile(join(slotDirectory, 'project.json'), JSON.stringify({ sourceFile: 'source-11111111-2222-4333-8444-555555555555.png' }))
  await fs.mkdir(historyDirectory, { recursive: true })
  await fs.writeFile(join(historyDirectory, 'history.json'), JSON.stringify({
    version: 1,
    undo: [{ project: { sourceAssetName } }],
    redo: []
  }))
  assert.equal(await discard({ trusted: true }, 2, sourceAssetName), false)
  await fs.access(sourcePath)

  await fs.writeFile(join(historyDirectory, 'history.json'), JSON.stringify({ version: 1, undo: [], redo: null }))
  await assert.rejects(discard({ trusted: true }, 2, sourceAssetName), /Histórico do modelo inválido/)
  await fs.access(sourcePath)

  await fs.writeFile(join(historyDirectory, 'history.json'), JSON.stringify({ version: 1, undo: [], redo: [] }))
  assert.equal(await discard({ trusted: true }, 2, sourceAssetName), true)
  await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' })
  await assert.rejects(discard({ trusted: true }, 2, '../project.json'), /Imagem temporária de importação inválida/)
  await assert.rejects(discard({ trusted: false }, 2, sourceAssetName), /Origem inválida/)
})

test('descarte de importação aguarda o seletor e a gravação do mesmo slot', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fabricator-import-discard-queue-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const sourcePath = join(root, 'source.png')
  await fs.writeFile(sourcePath, Buffer.from([1, 2, 3]))
  const dialogStarted = deferred()
  const releaseDialog = deferred()
  const { handlers, ipcMain } = ipcHarness()
  registerFabricatorProjectHandlers({
    ipcMain,
    assertTrustedSender: trusted,
    isValidSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    libraryPath: () => root,
    slotPath: (slot) => join(root, `slot-${slot}`),
    writeProject: async () => undefined,
    history: { read: async () => ({ undo: [], redo: [] }), write: async () => undefined },
    openImportDialog: async () => { dialogStarted.resolve(); return releaseDialog.promise },
    normalizeImage: async (bytes) => ({ bytes, bitDepth: 8, width: 1, height: 1 }),
    createId: () => 'abcdef11-2345-4234-8234-123456789abc',
    files: fs
  })

  const importing = handlers.get('fabricator:import-model')({ trusted: true }, 2, 'import')
  await dialogStarted.promise
  const discarding = handlers.get(fabricatorIpcChannels.discardImportedFabricatorSource)(
    { trusted: true }, 2, 'source-abcdef11-2345-4234-8234-123456789abc.png'
  )
  releaseDialog.resolve(sourcePath)
  const imported = await importing
  assert.equal(imported.sourceAssetName, 'source-abcdef11-2345-4234-8234-123456789abc.png')
  assert.equal(await discarding, true)
  await assert.rejects(fs.access(join(root, 'slot-2', imported.sourceAssetName)), { code: 'ENOENT' })
})

test('descarte enfileirado preserva uma fonte que o salvamento concorrente acabou de referenciar', async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fabricator-import-discard-save-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const slotDirectory = join(root, 'slot-2')
  const sourceAssetName = 'source-abcdef11-2345-4234-8234-123456789abc.png'
  const sourcePath = join(slotDirectory, sourceAssetName)
  await fs.mkdir(slotDirectory, { recursive: true })
  await fs.writeFile(sourcePath, Buffer.from([3, 2, 1]))
  const saveStarted = deferred()
  const releaseSave = deferred()
  const { handlers, ipcMain } = ipcHarness()
  registerFabricatorProjectHandlers({
    ipcMain,
    assertTrustedSender: trusted,
    isValidSlot: (slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    libraryPath: () => root,
    slotPath: (slot) => join(root, `slot-${slot}`),
    writeProject: async (project) => {
      saveStarted.resolve()
      await releaseSave.promise
      await fs.writeFile(join(slotDirectory, 'project.json'), JSON.stringify({ sourceFile: project.sourceAssetName }))
    },
    history: { read: async () => ({ undo: [], redo: [] }), write: async () => undefined },
    openImportDialog: async () => null,
    normalizeImage: async (bytes) => ({ bytes, bitDepth: 8, width: 1, height: 1 }),
    createId: () => 'abcdef11-2345-4234-8234-123456789abc',
    files: fs
  })

  const saving = handlers.get('fabricator:save-project')({ trusted: true }, { slot: 2, sourceAssetName }, [])
  await saveStarted.promise
  let discardCompleted = false
  const discarding = handlers.get(fabricatorIpcChannels.discardImportedFabricatorSource)(
    { trusted: true }, 2, sourceAssetName
  ).then((result) => { discardCompleted = true; return result })
  await Promise.resolve()
  assert.equal(discardCompleted, false, 'o descarte espera a gravação que pode registrar a referência')
  releaseSave.resolve()
  await saving
  assert.equal(await discarding, false)
  await fs.access(sourcePath)
})

test('exportação do Model Source permanece pendente até o arquivo ser publicado', async () => {
  const { handlers, ipcMain } = ipcHarness()
  const started = deferred()
  const release = deferred()
  const service = registerModelSourceDownloadHandlers(ipcMain, trusted, () => 'synthetic-downloads', async (slot, image, directory) => {
    assert.equal(slot, 3)
    assert.equal(image, 'data:image/png;base64,fixture')
    assert.equal(directory, 'synthetic-downloads')
    started.resolve()
    return release.promise
  })

  const exporting = handlers.get('fabricator:model-source:download')({ trusted: true }, 3, 'data:image/png;base64,fixture')
  await started.promise
  assert.equal(service.getPendingWrites().length, 1)
  release.resolve('synthetic-downloads/model.png')
  assert.equal(await exporting, 'synthetic-downloads/model.png')
  assert.deepEqual(service.getPendingWrites(), [])
})

test('exportação de animação facial cobre o diálogo e a escrita no inventário', async () => {
  const { handlers, ipcMain } = ipcHarness()
  const dialogStarted = deferred()
  const releaseDialog = deferred()
  const writeStarted = deferred()
  const releaseWrite = deferred()
  let writtenPath = ''
  let writtenBytes
  const service = registerFabricatorFaceAnimationExportHandler({
    ipcMain,
    assertTrustedSender: trusted,
    isValidModelSlot: (slot) => slot >= 1 && slot <= 10,
    showSaveDialog: async (sender, options) => {
      assert.equal(sender.id, 'synthetic-sender')
      assert.equal(options.defaultPath, 'animador-rosto-modelo-04.webm')
      dialogStarted.resolve()
      return releaseDialog.promise
    },
    writeFile: async (path, bytes) => {
      writtenPath = path
      writtenBytes = bytes
      writeStarted.resolve()
      await releaseWrite.promise
    }
  })

  const animation = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2])
  const exporting = handlers.get('fabricator:face-animation:export')({ trusted: true, sender: { id: 'synthetic-sender' } }, 4, animation)
  await dialogStarted.promise
  assert.equal(service.getPendingWrites().length, 1)
  releaseDialog.resolve({ canceled: false, filePath: 'C:/synthetic/face-animation' })
  await writeStarted.promise
  assert.equal(service.getPendingWrites().length, 1, 'a transição do diálogo para a escrita não abre uma janela sem rastreamento')
  assert.equal(writtenPath, 'C:/synthetic/face-animation.webm')
  assert.deepEqual([...writtenBytes], [...animation])
  releaseWrite.resolve()
  assert.equal(await exporting, true)
  assert.deepEqual(service.getPendingWrites(), [])
})

test('salvamento de Design Dev é drenado pelo flush do renderer e pelo IPC principal', async () => {
  const { handlers, ipcMain } = ipcHarness()
  const started = deferred()
  const release = deferred()
  const mainService = registerFabricatorDesignSettingsHandlers({
    ipcMain,
    assertTrustedSender: trusted,
    service: { load: async () => null, save: async () => { started.resolve(); await release.promise } }
  })

  const ipcSave = handlers.get('fabricator:design-settings:save')({ trusted: true }, { bannerSlides: [] })
  await started.promise
  assert.equal(mainService.getPendingWrites().length, 1)
  release.resolve()
  await ipcSave
  assert.deepEqual(mainService.getPendingWrites(), [])

  const rendererWriteStarted = deferred()
  const releaseRendererWrite = deferred()
  const fakeWindow = Object.assign(new EventTarget(), {
    desktop: { fabricator: {
      loadFabricatorDesignSettings: async () => ({ bannerSlides: [{ id: 'first', title: 'A', subtitle: 'B', imageDataUrl: null }] }),
      saveFabricatorDesignSettings: async (settings) => { rendererWriteStarted.resolve(settings); await releaseRendererWrite.promise }
    } },
    localStorage: { getItem: () => null, removeItem: () => undefined }
  })
  globalThis.window = fakeWindow
  saveDesignSettings({ bannerSlides: [{ id: 'latest', title: 'Último', subtitle: 'Rascunho', imageDataUrl: null }] })
  const flushing = flushDesignSettings()
  const latest = await rendererWriteStarted.promise
  assert.equal(latest.bannerSlides[0].id, 'latest')
  let completed = false
  void flushing.then(() => { completed = true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(completed, false)
  releaseRendererWrite.resolve()
  await flushing
  assert.equal(completed, true)
})
