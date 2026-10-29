import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { flushPendingRendererWrites, registerPendingWriteFlusher } from '../src/renderer/src/ui/pendingPersistence.ts'

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
