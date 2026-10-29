import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFabricatorProjectHandlers } from '../electron/domains/fabricator/projectIpc.ts'
import { registerModelSourceDownloadHandlers } from '../electron/domains/fabricator/modelSourceExportIpc.ts'
import { registerFabricatorFaceAnimationExportHandler } from '../electron/domains/fabricator/faceAnimationExportIpc.ts'
import { registerFabricatorDesignSettingsHandlers } from '../electron/domains/fabricator/designSettingsIpc.ts'
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
