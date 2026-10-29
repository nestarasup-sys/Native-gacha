import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { editorV6IpcChannels } from '../src/shared/editorV6IpcChannels.ts'
import { studioIpcChannels, createStudioInvoker } from '../src/shared/studioIpcChannels.ts'
import { registerEditorV6FileHandlers } from '../electron/domains/editorV6/fileIpc.ts'
import { registerStudioFileHandlers } from '../electron/domains/studio/fileIpc.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

function createStudioFileHarness(overrides = {}) {
  const handlers = new Map()
  const dependencies = {
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Bloqueado') },
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    appDataPath: () => 'app-data', tempPath: () => 'temp',
    studioPath: (id) => `app-data/studio/${id}`,
    dataFileSystem: {
      locate: () => null,
      isLegacyDomain: () => false,
      materializeDirectory: async () => {}
    },
    files: {
      stat: async () => ({ size: 1 }),
      readFile: async () => Buffer.from('source'),
      mkdir: async () => {}, writeFile: async () => {}, rm: async () => {}
    },
    normalizeImage: async (bytes) => ({ bytes }),
    dataUrlBuffer: () => Buffer.from('png'),
    createId: () => '12345678-1234-4234-8234-123456789abc',
    openPath: async () => '',
    ...overrides
  }
  return { handlers, service: registerStudioFileHandlers(dependencies) }
}

function createEditorV6FileHarness(overrides = {}) {
  const handlers = new Map()
  const dependencies = {
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    assertTrustedSender: (event) => { if (!event.trusted) throw new Error('Bloqueado') },
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    libraryPath: () => 'app-data/editor-v6',
    projectPath: (id) => `app-data/editor-v6/projects/${id}`,
    files: {
      stat: async () => ({ size: 1 }),
      readFile: async () => Buffer.from('source'),
      mkdir: async () => {}, writeFile: async () => {}
    },
    normalizeImage: async (bytes) => ({ bytes }),
    dataUrlBuffer: () => Buffer.from('png'),
    createId: () => '12345678-1234-4234-8234-123456789abc',
    openPath: async () => '',
    ...overrides
  }
  return { handlers, service: registerEditorV6FileHandlers(dependencies) }
}

test('Studio mantém prints e materialização no inventário até a operação terminar', async () => {
  const printWriteStarted = deferred(), printWriteGate = deferred()
  const printWrites = []
  const printHarness = createStudioFileHarness({ files: {
    stat: async () => ({ size: 1 }), readFile: async () => Buffer.from('source'),
    mkdir: async () => {}, rm: async () => {},
    writeFile: async (path, bytes) => { printWrites.push({ path, bytes }); printWriteStarted.resolve(); await printWriteGate.promise }
  } })
  const studioId = '00000000-0000-4000-8000-000000000001'
  const savePrint = printHarness.handlers.get('studio:save-print')({ trusted: true }, studioId, 'data:image/png;base64,AA==')
  await printWriteStarted.promise
  assert.equal(printHarness.service.getPendingWrites().length, 1)
  assert.equal(printWrites[0].bytes.toString(), 'png')
  printWriteGate.resolve()
  assert.match(await savePrint, /prints[\\/]print-.*\.png$/)
  assert.deepEqual(printHarness.service.getPendingWrites(), [])

  const materializeStarted = deferred(), materializeGate = deferred(), opened = []
  const openHarness = createStudioFileHarness({
    dataFileSystem: {
      locate: () => ({ domainId: 'studio-native' }),
      isLegacyDomain: () => false,
      materializeDirectory: async (source, destination) => { materializeStarted.resolve({ source, destination }); await materializeGate.promise }
    },
    openPath: async (path) => { opened.push(path); return '' }
  })
  const openPrints = openHarness.handlers.get('studio:open-prints')({ trusted: true }, studioId)
  const locations = await materializeStarted.promise
  assert.equal(openHarness.service.getPendingWrites().length, 1)
  assert.match(locations.source, /prints$/)
  materializeGate.resolve()
  await openPrints
  assert.equal(opened.length, 1)
  assert.deepEqual(openHarness.service.getPendingWrites(), [])
})

test('Editor V6 mantém prints e criação de pasta no inventário até a operação terminar', async () => {
  const printWriteStarted = deferred(), printWriteGate = deferred(), printWrites = []
  const printHarness = createEditorV6FileHarness({ files: {
    stat: async () => ({ size: 1 }), readFile: async () => Buffer.from('source'), mkdir: async () => {},
    writeFile: async (path, bytes) => { printWrites.push({ path, bytes }); printWriteStarted.resolve(); await printWriteGate.promise }
  } })
  const projectId = '00000000-0000-4000-8000-000000000001'
  const savePrint = printHarness.handlers.get(editorV6IpcChannels.saveEditorV6Print)({ trusted: true }, projectId, 'data:image/png;base64,AA==')
  await printWriteStarted.promise
  assert.equal(printHarness.service.getPendingWrites().length, 1)
  assert.equal(printWrites[0].bytes.toString(), 'png')
  printWriteGate.resolve()
  assert.match(await savePrint, /prints[\\/]print-.*\.png$/)
  assert.deepEqual(printHarness.service.getPendingWrites(), [])

  const folderStarted = deferred(), folderGate = deferred(), opened = []
  const openHarness = createEditorV6FileHarness({ files: {
    stat: async () => ({ size: 1 }), readFile: async () => Buffer.from('source'), writeFile: async () => {},
    mkdir: async () => { folderStarted.resolve(); await folderGate.promise }
  }, openPath: async (path) => { opened.push(path); return '' } })
  const openPrints = openHarness.handlers.get(editorV6IpcChannels.openEditorV6Prints)({ trusted: true }, projectId)
  await folderStarted.promise
  assert.equal(openHarness.service.getPendingWrites().length, 1)
  folderGate.resolve()
  await openPrints
  assert.equal(opened.length, 1)
  assert.deepEqual(openHarness.service.getPendingWrites(), [])
})

test('oito canais do Studio permanecem únicos e compatíveis com legado', () => {
  assert.deepEqual(studioIpcChannels,{
    flushPendingWrites:'app:flush-pending-writes',
    listStudios:'studio:list',saveStudio:'studio:save',deleteStudio:'studio:delete',
    getStudioFolder:'studio:folder',importStudioImage:'studio:import-image',
    saveStudioPrint:'studio:save-print',openStudioPrints:'studio:open-prints'
  })
  assert.equal(new Set(Object.values(studioIpcChannels)).size,8)
})
test('invocador Studio respeita a correspondência de métodos e argumentos',async()=>{
  const calls=[]
  const invoke=createStudioInvoker({invoke:async (...args)=>{calls.push(args);return args.length}})
  assert.equal(await invoke('saveStudio',{id:'scene-id'}),2)
  assert.equal(await invoke('saveStudioPrint','id','data:image/png;base64,AA=='),3)
  assert.equal(await invoke('getStudioFolder'),1)
  assert.deepEqual(calls,[
    ['studio:save',{id:'scene-id'}],
    ['studio:save-print','id','data:image/png;base64,AA=='],
    ['studio:folder']
  ])
})
test('preload e handlers do Studio não duplicam strings IPC fora do contrato',async()=>{
  const [preload,main,domain,fileDomain,editorFileDomain]=await Promise.all([
    readFile('electron/preload.ts','utf8'),
    readFile('electron/main.ts','utf8'),
    readFile('electron/domains/studio/primaryIpc.ts','utf8'),
    readFile('electron/domains/studio/fileIpc.ts','utf8'),
    readFile('electron/domains/editorV6/fileIpc.ts','utf8')
  ])
  assert.match(preload,/createStudioInvoker/)
  assert.match(preload,/invokeStudio\('saveStudio'/)
  assert.match(main,/studioIpcChannels\.flushPendingWrites/)
  assert.match(domain,/studioIpcChannels\.deleteStudio/)
  assert.match(domain,/studioIpcChannels\.saveStudio/)
  assert.match(domain,/studioIpcChannels\.listStudios/)
  assert.match(main,/studioFileIpc\?\.getPendingWrites\(\)/)
  assert.match(main,/editorV6FileIpc\?\.getPendingWrites\(\)/)
  assert.match(fileDomain,/trackWrite\(async \(\) => \{[\s\S]*?writeFile\(printPath, bytes\)/)
  assert.match(fileDomain,/trackWrite\(async \(\) => \{[\s\S]*?materializeDirectory\(printsFolder, folderToOpen\)/)
  assert.match(editorFileDomain,/trackWrite\(async \(\) => \{[\s\S]*?writeFile\(printPath, bytes\)/)
})
test('Roteiros e Customizador mantêm UI separada dos componentes centrais',async()=>{
  const [page,workspace,editor,customizer,roster]=await Promise.all([
    readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx','utf8'),
    readFile('src/renderer/src/features/roteiros/RoteiroWorkspace.tsx','utf8'),
    readFile('src/renderer/src/features/roteiros/RoteiroSectionEditor.tsx','utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerCharacterRoster.ts','utf8')
  ])
  assert.doesNotMatch(page,/function RoteiroSectionEditor/)
  assert.match(editor,/export function RoteiroSectionEditor/)
  assert.match(workspace,/from '\.\/RoteiroSectionEditor'/)
  assert.match(customizer,/useCustomizerCharacterRoster\(\)/)
  assert.doesNotMatch(customizer,/useEffect\(\(\) => \{\n    let cancelled = false\n    void window\.desktop\.listCustomizerCharacters\(\)/)
  assert.match(roster,/window\.desktop\.customizer\.listCustomizerCharacters\(\)/)
})
