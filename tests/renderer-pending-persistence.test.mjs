import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { flushPendingRendererWrites, registerPendingWriteFlusher } from '../src/renderer/src/ui/pendingPersistence.ts'
import { createPendingOperationTracker } from '../src/renderer/src/ui/pendingOperations.ts'
import { cancelEditorV6ExportCommand, runEditorV6ExportCommand } from '../src/renderer/src/features/editorV6/editorV6ExportCommands.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

test('pending operation flush shares callers and keeps draining actions added during a close', async () => {
  const tracker = createPendingOperationTracker()
  const firstGate = deferred(), firstStarted = deferred()
  const secondGate = deferred(), secondStarted = deferred()
  const first = tracker.track(async () => { firstStarted.resolve(); await firstGate.promise })
  await firstStarted.promise
  const flushing = tracker.flush()
  assert.equal(tracker.flush(), flushing)
  const second = tracker.track(async () => { secondStarted.resolve(); await secondGate.promise })
  await secondStarted.promise
  firstGate.resolve()
  await first
  let flushFinished = false
  void flushing.then(() => { flushFinished = true })
  await Promise.resolve()
  assert.equal(flushFinished, false, 'o flush não esperou a ação iniciada enquanto a primeira estava pendente')
  secondGate.resolve()
  await second
  await flushing
  assert.equal(flushFinished, true)
})

test('renderer flush waits for every registered writer and shares concurrent flush requests', async () => {
  const events = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const unregisterFirst = registerPendingWriteFlusher(async () => { events.push('first:start'); await gate; events.push('first:end') })
  const unregisterSecond = registerPendingWriteFlusher(async () => { events.push('second') })

  const first = flushPendingRendererWrites()
  const concurrent = flushPendingRendererWrites()
  assert.equal(first, concurrent)
  await Promise.resolve()
  assert.deepEqual(events, ['first:start', 'second'])
  release()
  await first
  assert.deepEqual(events, ['first:start', 'second', 'first:end'])

  unregisterFirst()
  unregisterSecond()
  await flushPendingRendererWrites()
})

test('renderer flush waits for all writers before reporting a persistence failure', async () => {
  const events = []
  const unregisterFailure = registerPendingWriteFlusher(async () => { events.push('failure'); throw new Error('falha sintética') })
  const unregisterSlow = registerPendingWriteFlusher(async () => { await Promise.resolve(); events.push('slow:done') })

  await assert.rejects(flushPendingRendererWrites(), /falha sintética/)
  assert.deepEqual(events, ['failure', 'slow:done'])

  unregisterFailure()
  unregisterSlow()
  await flushPendingRendererWrites()
})

test('entrypoint exposes the renderer flush registry for the Electron main process', async () => {
  const entry = await readFile('src/renderer/src/main.tsx', 'utf8')
  const types = await readFile('src/renderer/src/desktop.d.ts', 'utf8')
  assert.match(entry, /window\.__flushPendingRendererWrites\s*=\s*flushPendingRendererWrites/)
  assert.match(types, /__flushPendingRendererWrites:\s*\(\)\s*=>\s*Promise<void>/)
})

test('Animator drafts register a synchronous flush and leave unmount cleanup free of fire-and-forget writes', async () => {
  const animator = await readFile('src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', 'utf8')
  assert.match(animator, /registerPendingWriteFlusher\(\(\) => draftFlushRef\.current\(\)\)/)
  assert.match(animator, /const flushDraftAndQueue = async \(\) =>/)
  assert.match(animator, /await persistDraftNow\(active, active\.slot, current, false\)/)
  assert.doesNotMatch(animator, /saveAnimatorDraft\(active\.sourceModelSlot, serialized, assets\)\.catch\(\(\) => undefined\)/)
})

test('Pose drafts register a flush for the latest project and wait for queued writes', async () => {
  const poses = await readFile('src/renderer/src/features/fabricator/PoseWorkspace.tsx', 'utf8')
  assert.match(poses, /registerPendingWriteFlusher\(flushDraftWrites\)/)
  assert.match(poses, /if \(snapshot && dirtyRef\.current\) await writeDraft\(snapshot, editingSlotRef\.current\)/)
  assert.match(poses, /await writeQueue\.current/)
  assert.doesNotMatch(poses, /void writeDraft\(snapshot, editingSlotRef\.current\)\.catch\(\(\) => undefined\)/)
  assert.match(poses, /await flushDraftWrites\(\)[\s\S]*?saveFabricatorPose\(/)
})

test('Fabricator model projects register a flusher while secondary appearance previews stay read-only', async () => {
  const fabricator = await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx', 'utf8')
  const persistence = await readFile('src/renderer/src/features/fabricator/projectSaveCoordinator.ts', 'utf8')
  const appearance = await readFile('src/renderer/src/features/fabricator/useFabricatorModelAppearance.ts', 'utf8')
  assert.match(fabricator, /registerPendingWriteFlusher\(flushProjectWrites\)/)
  assert.match(fabricator, /projectSaveCoordinator\.scheduleSave\(project\)/)
  assert.match(persistence, /if \(hadPendingTimer && deps\.projectRef\.current\) await persistProject\(deps\.projectRef\.current\)/)
  assert.match(persistence, /await writeQueue/)
  assert.match(persistence, /waitForProjectWrites = \(\) => writeQueue\.catch\(\(\) => undefined\)/)
  assert.match(appearance, /loadFabricatorSlot\(visibleAppearanceSlot\)/)
  assert.match(appearance, /setAppearanceLoadError/)
  assert.doesNotMatch(appearance, /registerPendingWriteFlusher|saveFabricatorProject|appearanceSaveQueue/)
})

test('Expression workspace drafts register, serialize and await the latest disk snapshot', async () => {
  const [expressions, persistence, queue] = await Promise.all([
    readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/useExpressionWorkspaceDraftPersistence.ts', 'utf8'),
    readFile('src/renderer/src/features/fabricator/expressionWorkspaceDraftQueue.ts', 'utf8')
  ])
  assert.match(expressions, /useExpressionWorkspaceDraftPersistence\(/)
  assert.doesNotMatch(expressions, /registerPendingWriteFlusher|saveFaceExpressionWorkspaceDraft\(/)
  assert.match(persistence, /registerPendingWriteFlusher\(flush\)/)
  assert.match(persistence, /localStorage\.setItem\(expressionWorkspaceDraftStorageKey\(modelSlot\), JSON\.stringify\(snapshot\)\)/)
  assert.match(persistence, /queue\.reset\(\)/)
  assert.match(queue, /async flush\(modelSlot\)[\s\S]*?const latest = latestDraft[\s\S]*?await persist\(latest\)[\s\S]*?await writeQueue/)
  assert.match(persistence, /saveFaceExpressionWorkspaceDraft\(draft\.modelSlot, draft\)/)
  assert.match(queue, /writeQueue = tracked/)
  assert.doesNotMatch(persistence, /void window\.desktop\.fabricator\.saveFaceExpressionWorkspaceDraft\(modelSlot, latest\)\.catch\(\(\) => undefined\)/)
})

test('Face component debounces and catalog saves drain through the renderer registry', async () => {
  const faces = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  const queue = await readFile('src/renderer/src/features/fabricator/face/faceSaveQueue.ts', 'utf8')
  assert.match(faces, /registerPendingWriteFlusher\(flushAllSaves\)/)
  assert.match(faces, /createFaceSaveQueue/)
  assert.match(queue, /debounceMs \?\? 180/)
  assert.match(queue, /\.catch\(\(\) => undefined\)\.then\(run\)/)
  assert.match(queue, /Promise\.allSettled\(keys\.map\(flushSave\)\)/)
  assert.match(queue, /await current[\s\S]*?const retry = saveRuns\.get\(key\)/)
  assert.match(queue, /if \(failure\) throw failure\.reason/)
})

test('Studio and Editor V6 flush debounced documents and wait for renderer IPC writes', async () => {
  const studio = await readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8')
  const studioPrintCommands = await readFile('src/renderer/src/features/studio/studioPrintCommands.ts', 'utf8')
  const studioPersistence = await readFile('src/renderer/src/features/studio/useStudioDocumentPersistence.ts', 'utf8')
  const studioImageImport = await readFile('src/renderer/src/features/studio/useStudioImageImport.ts', 'utf8')
  const editor = await readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8')
  const editorCreation = await readFile('src/renderer/src/features/editorV6/editorV6ProjectCreation.ts', 'utf8')
  const editorCreationHook = await readFile('src/renderer/src/features/editorV6/useEditorV6ProjectCreation.ts', 'utf8')
  const editorCreationGuard = await readFile('src/renderer/src/features/editorV6/editorV6ProjectCreationGuard.ts', 'utf8')
  const editorDeletion = await readFile('src/renderer/src/features/editorV6/editorV6ProjectDeletion.ts', 'utf8')
  const editorPrintCommands = await readFile('src/renderer/src/features/editorV6/editorV6PrintCommands.ts', 'utf8')
  const editorMedia = await readFile('src/renderer/src/features/editorV6/editorV6MediaCommands.ts', 'utf8')
  const editorPersistence = await readFile('src/renderer/src/features/editorV6/useEditorV6DocumentPersistence.ts', 'utf8')
  const exportPanel = await readFile('src/renderer/src/features/editorV6/EditorV6ExportPanel.tsx', 'utf8')
  assert.match(studio, /useStudioDocumentPersistence\(/)
  assert.match(studio, /useStudioAutosave\(/)
  assert.match(studioPersistence, /registerPendingWriteFlusher\(flushWrites\)/)
  assert.match(studioPersistence, /export function useStudioAutosave/)
  assert.match(studioPersistence, /}, 650\)/)
  assert.match(studioPersistence, /hadPendingTimer \|\| !saved[\s\S]*?saveActiveStudio\(latest\)/)
  assert.match(studioPersistence, /await pendingOperations\.flush\(\)/)
  assert.match(studioPersistence, /await Promise\.allSettled\(\[\.\.\.ipcWritesRef\.current\]\)/)
  assert.match(studio, /useStudioImageImport\(/)
  assert.match(studioImageImport, /return useCallback\(\(category: 'background' \| 'object'\) => trackOperation\(async \(\) =>/)
  assert.match(studioImageImport, /await writeInOrder\(nextStudio\)/)
  assert.match(studio, /await trackStudioOperation\(async \(\) => \{[\s\S]*?deleteStudio\(target\.id\)/)
  assert.match(studio, /createStudioPrintCommands\(/)
  assert.match(studio, /const exportPrint = \(\) => studioPrintCommands\.exportPrint\(activeStudio\)/)
  assert.match(studio, /const openPrints = \(\) => studioPrintCommands\.openPrints\(activeStudio\?\.id \?\? null\)/)
  assert.match(studioPrintCommands, /dependencies\.flushDocumentWrites\(\)[\s\S]*?dependencies\.renderPrint\(studio\)[\s\S]*?dependencies\.trackIpcWrite\(dependencies\.savePrint\(studio\.id, image\)\)/)
  assert.match(studioPrintCommands, /dependencies\.openPrints\(studioId\)/)
  assert.match(editor, /useEditorV6DocumentPersistence\(/)
  assert.match(editorPersistence, /registerPendingWriteFlusher\(flushWrites\)/)
  assert.match(editorPersistence, /hadPendingTimer \|\| !saved[\s\S]*?saveActiveProject\(latest\)/)
  assert.match(editorPersistence, /await pendingOperations\.flush\(\)[\s\S]*?await flushDocumentWrites\(\)/)
  assert.match(editorPersistence, /const inFlightSave = savePromiseRef\.current/)
  assert.match(editor, /createEditorV6MediaCommands\([\s\S]*?trackOperation: trackEditorV6Operation/)
  for (const operation of ['importImage', 'importTimelineMedia', 'linkVideoLibraryItem']) {
    assert.match(editorMedia, new RegExp(`const ${operation} = .*dependencies\\.trackOperation\\(async \\(\\) =>`), `${operation} deve permanecer pendente até salvar o documento relacionado`)
  }
  assert.match(editor, /useEditorV6ProjectCreation\(/)
  assert.match(editorCreationHook, /createEditorV6ProjectCreationCommands\(dependencies\)/)
  assert.match(editorCreationHook, /runEditorV6ProjectCreationOnce\(/)
  assert.match(editorCreationGuard, /if \(guard\.current\) return/)
  assert.match(editorCreation, /const duplicateStudio = \(sourceSummary: EditorV6ProjectSummary \| null\) => dependencies\.trackOperation\(async \(\) =>/)
  assert.match(editor, /createEditorV6ProjectDeletionCommand\(/)
  assert.match(editorDeletion, /dependencies\.trackOperation\(async \(\) => \{[\s\S]*?await dependencies\.flushDocumentWrites\(\)[\s\S]*?await dependencies\.deleteProject\(target\.id\)/)
  assert.match(editor, /createEditorV6PrintCommands\(/)
  assert.match(editorPrintCommands, /dependencies\.flushDocumentWrites\(\)[\s\S]*?dependencies\.captureFrame\([\s\S]*?dependencies\.savePrint\(project\.id, image\)/)
  assert.match(editorPrintCommands, /const openPrints = \(projectId: string \| null\) => dependencies\.trackOperation\(async \(\) =>/)
  assert.match(exportPanel, /trackOperation\(async \(\) => \{ const clip = await window\.desktop\.editorV6\.linkEditorV6LibraryExportAudio/)
  assert.match(exportPanel, /trackOperation\(\(\) => runEditorV6ExportCommand\(/)
  assert.match(exportPanel, /trackOperation\(\(\) => cancelEditorV6ExportCommand\(/)
})

test('Editor V6 renderer flush waits for hair preparation and the real export IPC result', async () => {
  const tracker = createPendingOperationTracker()
  const unregister = registerPendingWriteFlusher(() => tracker.flush())
  const preparation = deferred(), preparationStarted = deferred()
  const exportGate = deferred(), exportStarted = deferred()
  const project = { id: 'synthetic-project', timeline: { durationFrames: 90 } }
  const options = { startFrame: 0, endFrame: 60, width: 1920, height: 1080, turbo: true, encoder: 'auto', mouthLoop: true }
  const preset = { name: 'synthetic-hair-preset' }
  const hairMotion = { presetSlot: 2, preset, surfaces: [], textures: [], rigs: [] }
  const expectedStatus = { id: 'synthetic-job', state: 'queued', message: 'synthetic export queued' }
  const events = []
  let receivedOptions
  let flushFinished = false

  const operation = tracker.track(() => runEditorV6ExportCommand({
    project,
    options,
    hairPresetSlot: 2,
    hairPreset: preset,
    prepareHair: async (...args) => { events.push(['prepare', ...args]); preparationStarted.resolve(); return preparation.promise },
    startExport: async (...args) => { events.push(['start', ...args]); receivedOptions = args[1]; exportStarted.resolve(); return exportGate.promise },
    onPreparingHair: (value) => events.push(['preparing', value]),
    onStatus: (value) => events.push(['status', value])
  }))

  await preparationStarted.promise
  const flushing = flushPendingRendererWrites().then(() => { flushFinished = true })
  await Promise.resolve()
  assert.equal(flushFinished, false, 'o flush terminou enquanto a preparação do cabelo ainda estava pendente')
  assert.deepEqual(events.map(([name]) => name), ['preparing', 'prepare'])

  preparation.resolve(hairMotion)
  await exportStarted.promise
  assert.equal(receivedOptions.hairAnimationPresetSlot, 2)
  await Promise.resolve()
  assert.equal(flushFinished, false, 'o flush terminou antes de a chamada IPC de exportação devolver o resultado')

  exportGate.resolve(expectedStatus)
  assert.equal(await operation, expectedStatus)
  await flushing
  assert.equal(flushFinished, true)
  assert.deepEqual(events.filter(([name]) => name === 'preparing').map(([, value]) => value), [true, false])
  assert.deepEqual(events.find(([name]) => name === 'start')[3], hairMotion)
  assert.deepEqual(events.find(([name]) => name === 'status')[1], expectedStatus)
  unregister()
})

test('Editor V6 export cancellation stays tracked through the final status IPC', async () => {
  const tracker = createPendingOperationTracker()
  const unregister = registerPendingWriteFlusher(() => tracker.flush())
  const cancelGate = deferred(), cancelStarted = deferred(), statusStarted = deferred()
  const finalStatus = { id: 'synthetic-job', state: 'cancelled', message: 'synthetic export cancelled' }
  const events = []
  let flushFinished = false
  const operation = tracker.track(() => cancelEditorV6ExportCommand({
    job: { id: 'synthetic-job', state: 'rendering', message: 'rendering' },
    cancel: async (jobId) => { events.push(['cancel', jobId]); cancelStarted.resolve(); await cancelGate.promise },
    getStatus: async (jobId) => { events.push(['status-request', jobId]); statusStarted.resolve(); return finalStatus },
    onStatus: (value) => events.push(['status', value])
  }))

  await cancelStarted.promise
  const flushing = flushPendingRendererWrites().then(() => { flushFinished = true })
  cancelGate.resolve()
  await statusStarted.promise
  assert.equal(flushFinished, false, 'o flush terminou antes da confirmação IPC do cancelamento')
  assert.equal(await operation, finalStatus)
  await flushing
  assert.equal(flushFinished, true)
  assert.deepEqual(events.map(([name]) => name), ['cancel', 'status-request', 'status'])
  unregister()
})

test('Base Videos drains every debounced detail write before leaving', async () => {
  const videos = await readFile('src/renderer/src/features/baseVideos/BaseVideosPage.tsx', 'utf8')
  const queue = await readFile('src/renderer/src/features/baseVideos/baseVideoDetailsSaveQueue.ts', 'utf8')
  assert.match(videos, /registerPendingWriteFlusher\(saveQueue\.flushPendingSaves\)/)
  assert.match(videos, /saveQueue\.flushPendingSave\(videoId\)/)
  assert.match(queue, /pendingSaves\.keys\(\), \.\.\.inFlightSaves\.keys\(\)/)
  assert.match(queue, /Promise\.allSettled\(videoIds\.map\(\(videoId\) => persistPendingSave\(videoId\)\)\)/)
  assert.match(queue, /if \(failure\) throw failure\.reason/)
  assert.match(queue, /pendingSaves\.set\(details\.videoId, details\)/)
  assert.doesNotMatch(videos, /pendingSaves\.current|inFlightSaves\.current|saveTimers\.current/)
})

test('Roteiros flushes the latest snapshot and waits for document IPC writes', async () => {
  const roteiros = await readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx', 'utf8')
  const persistence = await readFile('src/renderer/src/features/roteiros/roteiroSnapshotPersistence.ts', 'utf8')
  assert.match(roteiros, /registerPendingWriteFlusher\(flushRoteirosWrites\)/)
  assert.match(roteiros, /useLayoutEffect\(\(\) => \{ roteirosRef\.current = roteiros \}, \[roteiros\]\)/)
  assert.match(roteiros, /flushPendingWrites\(roteirosLoaded, \(\) => roteirosRef\.current\)/)
  assert.match(persistence, /const writes = new Set<Promise<void>>\(\)/)
  assert.match(persistence, /await Promise\.allSettled\(pending\)/)
  assert.match(persistence, /await saveSnapshot\(latest\)/)
  assert.match(roteiros, /await saveRoteirosSnapshot\(nextRoteiros\)/)
  assert.doesNotMatch(roteiros, /window\.desktop\.roteiros\.saveRoteiros\(roteiros\)/)
})

test('main flushes renderer writes before its IPC inventory and navigation waits for renderer flush', async () => {
  const main = await readFile('electron/main.ts', 'utf8')
  const flushIpc = await readFile('electron/domains/storage/pendingPersistenceIpc.ts', 'utf8')
  const topBar = await readFile('src/renderer/src/ui/components/TopBar.tsx', 'utf8')
  const fabricatorPage = await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx', 'utf8')

  assert.match(main, /registerPendingPersistenceFlushIpc\(/, 'main deve compor o registro do flush IPC')
  assert.match(main, /flushRendererWrites: async \(event\) => \{[\s\S]*?window\.__flushPendingRendererWrites\(\)/)
  assert.match(main, /flushMainWrites: flushPendingPersistenceWrites/)
  assert.match(flushIpc, /ipcMain\.handle\(studioIpcChannels\.flushPendingWrites/)
  assert.match(flushIpc, /await flushRendererWrites\(event\)[\s\S]*?await flushMainWrites\(\)/, 'renderer deve drenar os timers antes do inventário principal')
  assert.match(topBar, /flushPendingRendererWrites\(\)\.then\(\(\) =>[\s\S]*?navigate\(path\)/)
  assert.match(fabricatorPage, /flushPendingRendererWrites\(\)\.then\(\(\) =>[\s\S]*?setActiveSection\(section\)/)
})

test('Fabricator discards obsolete import results and guards cleanup against saved references', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx', 'utf8')
  const ipc = await readFile('electron/domains/fabricator/projectIpc.ts', 'utf8')
  const channels = await readFile('src/shared/fabricatorIpcChannels.ts', 'utf8')

  assert.match(page, /selectionGeneration !== slotSelectionGeneration\.current\)[\s\S]*?await discardImportedSource\(slot, selected\.sourceAssetName/)
  assert.match(page, /id !== requestId\.current\)[\s\S]*?await discardUncommittedSource\(\)/)
  assert.match(page, /runProcessor\(selected\.sourceDataUrl,[\s\S]*?generation: selectionGeneration/)
  assert.match(channels, /discardImportedFabricatorSource: 'fabricator:discard-imported-source'/)
  assert.match(ipc, /ipcMain\.handle\(fabricatorIpcChannels\.discardImportedFabricatorSource/)
  assert.match(ipc, /queueWrite\(slot, async \(\) => \{[\s\S]*?isImportedSourceReferenced\(slot, sourceAssetName, deps\)/)
})
