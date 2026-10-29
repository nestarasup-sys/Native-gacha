import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { flushPendingRendererWrites, registerPendingWriteFlusher } from '../src/renderer/src/ui/pendingPersistence.ts'
import { createPendingOperationTracker } from '../src/renderer/src/ui/pendingOperations.ts'

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
  const expressions = await readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx', 'utf8')
  assert.match(expressions, /registerPendingWriteFlusher\(flushWorkspaceDraft\)/)
  assert.match(expressions, /const latest = latestWorkspaceDraft\.current[\s\S]*?await persistWorkspaceDraft\(latest\)/)
  assert.match(expressions, /await workspaceSaveQueue\.current/)
  assert.match(expressions, /saveFaceExpressionWorkspaceDraft\(snapshot\.modelSlot, snapshot\)/)
  assert.doesNotMatch(expressions, /void window\.desktop\.fabricator\.saveFaceExpressionWorkspaceDraft\(modelSlot, latest\)\.catch\(\(\) => undefined\)/)
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
  const editor = await readFile('src/renderer/src/features/editorV6/EditorV6Page.tsx', 'utf8')
  const exportPanel = await readFile('src/renderer/src/features/editorV6/EditorV6ExportPanel.tsx', 'utf8')
  assert.match(studio, /registerPendingWriteFlusher\(flushStudioWrites\)/)
  assert.match(studio, /hadPendingTimer \|\| !saved[\s\S]*?saveStudio\(latest\)/)
  assert.match(studio, /await studioPendingOperations\.flush\(\)/)
  assert.match(studio, /await Promise\.allSettled\(\[\.\.\.studioIpcWritesRef\.current\]\)/)
  assert.match(studio, /const importImage =[^\n]*trackStudioOperation\(async \(\) =>/)
  assert.match(studio, /await trackStudioOperation\(async \(\) => \{[\s\S]*?deleteStudio\(target\.id\)/)
  assert.match(studio, /const exportPrint = \(\) => \{[\s\S]*?trackStudioOperation\(async \(\) => \{[\s\S]*?saveStudioPrint/)
  assert.match(studio, /const openPrints = \(\) => trackStudioOperation\(async \(\) =>/)
  assert.match(editor, /registerPendingWriteFlusher\(flushEditorV6Writes\)/)
  assert.match(editor, /hadPendingTimer \|\| !saved[\s\S]*?saveActiveEditorV6Project\(latest\)/)
  assert.match(editor, /await editorV6PendingOperations\.flush\(\)/)
  for (const operation of ['duplicateStudio', 'importImage', 'importTimelineMedia', 'linkVideoLibraryItem']) {
    assert.match(editor, new RegExp(`const ${operation} =[^\\n]*trackEditorV6Operation\\(async \\(\\) =>`), `${operation} deve permanecer pendente até salvar o documento relacionado`)
  }
  assert.match(editor, /const deleteStudio = async \([\s\S]*?trackEditorV6Operation\(async \(\) => \{[\s\S]*?deleteEditorV6Project/)
  assert.match(editor, /const exportPrint = \(\) => \{[\s\S]*?return trackEditorV6Operation\(async \(\) => \{[\s\S]*?flushEditorV6DocumentWrites\(\)[\s\S]*?saveEditorV6Print/)
  assert.match(editor, /const openPrints = \(\) => trackEditorV6Operation\(async \(\) =>/)
  assert.match(exportPanel, /trackOperation\(async \(\) => \{ const clip = await window\.desktop\.editorV6\.importEditorV6ExportAudio/)
  assert.match(exportPanel, /trackOperation\(async \(\) => \{ planEditorV6Export/)
})

test('Base Videos drains every debounced detail write before leaving', async () => {
  const videos = await readFile('src/renderer/src/features/baseVideos/BaseVideosPage.tsx', 'utf8')
  assert.match(videos, /registerPendingWriteFlusher\(flushPendingSaves\)/)
  assert.match(videos, /pendingSaves\.current\.keys\(\), \.\.\.inFlightSaves\.current\.keys\(\)/)
  assert.match(videos, /Promise\.allSettled\(videoIds\.map\(\(videoId\) => persistPendingSave\(videoId\)\)\)/)
  assert.match(videos, /if \(failure\) throw failure\.reason/)
  assert.doesNotMatch(videos, /void persistPendingSave\(videoId, false\)\.catch/)
})

test('Roteiros flushes the latest snapshot and waits for document IPC writes', async () => {
  const roteiros = await readFile('src/renderer/src/features/roteiros/RoteirosPage.tsx', 'utf8')
  assert.match(roteiros, /registerPendingWriteFlusher\(flushRoteirosWrites\)/)
  assert.match(roteiros, /useLayoutEffect\(\(\) => \{ roteirosRef\.current = roteiros \}, \[roteiros\]\)/)
  assert.match(roteiros, /const pending = \[\.\.\.roteiroSaveWrites\.current\][\s\S]*?await Promise\.allSettled\(pending\)/)
  assert.match(roteiros, /await saveRoteirosSnapshot\(latest\)/)
  assert.match(roteiros, /await saveRoteirosSnapshot\(nextRoteiros\)/)
  assert.doesNotMatch(roteiros, /window\.desktop\.roteiros\.saveRoteiros\(roteiros\)/)
})

test('main flushes renderer writes before its IPC inventory and navigation waits for renderer flush', async () => {
  const main = await readFile('electron/main.ts', 'utf8')
  const topBar = await readFile('src/renderer/src/ui/components/TopBar.tsx', 'utf8')
  const fabricatorPage = await readFile('src/renderer/src/features/fabricator/FabricatorPage.tsx', 'utf8')
  const handlerStart = main.indexOf("ipcMain.handle(studioIpcChannels.flushPendingWrites")
  const handlerEnd = main.indexOf('\n  })', handlerStart)
  const handler = main.slice(handlerStart, handlerEnd)

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'main deve registrar o flush IPC')
  assert.ok(handler.indexOf('window.__flushPendingRendererWrites()') < handler.indexOf('flushPendingPersistenceWrites()'), 'renderer deve drenar os timers antes do inventário principal')
  assert.match(topBar, /flushPendingRendererWrites\(\)\.then\(\(\) =>[\s\S]*?navigate\(path\)/)
  assert.match(fabricatorPage, /flushPendingRendererWrites\(\)\.then\(\(\) =>[\s\S]*?setActiveSection\(section\.id\)/)
})
