import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { editorV6MotionPlan, type EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Element, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import type { FabricatorProject } from '../../src/shared/fabricator'

const folder = process.argv[2]
app.setPath('userData', join(folder, 'profile'))
app.on('window-all-closed', () => {})
const timeout = setTimeout(() => { console.error('Motion service check timed out'); app.exit(1) }, 120_000)
let service: ReturnType<typeof createEditorV6MotionService> | undefined
const channels = new Set<string>()
let windows = 0, modelReads = 0
app.on('browser-window-created', () => { windows++ })
async function main() {
  await app.whenReady()
  const pixels = Buffer.alloc(10 * 10 * 4)
  for (let index = 0; index < pixels.length; index += 4) { pixels[index + 2] = 255; pixels[index + 3] = 255 }
  const png = nativeImage.createFromBitmap(pixels, { width: 10, height: 10 }).toDataURL()
  const stamp = new Date().toISOString()
  const source: FabricatorProject = { schemaVersion: 1, slot: 1, name: 'Synthetic', sourceName: 'test', sourceAssetName: 'test', sourceDataUrl: '', width: 100, height: 100, tolerance: 0, updatedAt: stamp, joints: [], layerOrder: ['head', 'arm'], parts: [{ id: 'head', name: 'head', x: 35, y: 20, width: 30, height: 60, rotation: 0, dataUrl: png }, { id: 'arm', name: 'arm', x: 10, y: 50, width: 10, height: 10, rotation: 0, dataUrl: png }] }
  const target = { ...source, parts: source.parts.map((part) => part.id === 'arm' ? { ...part, x: 80 } : part) }
  ipcMain.handle('fabricator:load-slot', () => { modelReads++; return source })
  ipcMain.handle('fabricator:poses:load', (_event, _slot, pose) => pose === 1 ? source : target)
  for (const name of ['fabricator:hair:styles:load', 'fabricator:wardrobe:load', 'fabricator:face:load', 'fabricator:face-catalog:load', 'fabricator:expression-presets:load', 'fabricator:face-components:load']) ipcMain.handle(name, () => null)
  for (const name of ['fabricator:face-catalog:list', 'fabricator:expression-presets:list', 'fabricator:face-components:list']) ipcMain.handle(name, () => [])
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', hair: '#000000', outfit: '#000000', skin: '#ffffff', createdAt: stamp, updatedAt: stamp, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: character.id, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: 1 }
  function request(index: number): EditorV6MotionBakeRequest {
    const from = { ...actor, x: index }, to = { ...from, poseSlot: 2 }
    const track: EditorV6TimelineTrack = { id: randomUUID(), kind: 'character', name: 'Alice', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId: actor.id, label: 'A', startFrame: 0, durationFrames: 30, state: from }, { id: randomUUID(), elementId: actor.id, label: 'B', startFrame: 30, durationFrames: 30, state: to }] }
    return { id: randomUUID(), plan: editorV6MotionPlan(track, track.blocks[0], track.blocks[1])!, character }
  }
  async function start(cacheName?: string, concurrency: 1 | 2 = 1) {
    service?.cancelAll(); await service?.drain()
    for (const channel of channels) ipcMain.removeHandler(channel)
    service = createEditorV6MotionService({ ipcMain: { handle: (channel, listener) => { channels.add(channel); ipcMain.handle(channel, listener) } }, assertTrustedSender: () => {}, html: join(folder, 'index.html'), preload: join(folder, 'preload.cjs'), cacheDirectory: cacheName ? join(folder, cacheName) : undefined, concurrency })
  }
  await start('persistent')
  const firstRequest = request(0), first = await service!.bakeForExport(firstRequest, new AbortController().signal)
  const firstWindows = windows
  const second = await service!.bakeForExport(request(1), new AbortController().signal)
  assert.equal(windows, firstWindows, 'Each transition opened a new window')
  assert.equal(modelReads, 1, 'The warm worker reloaded the model')
  assert.equal(first.asset.dataUrl, second.asset.dataUrl, 'Warm resources changed raster output')
  await writeFile(join(folder, 'client.html'), '<!doctype html><html><body></body></html>')
  await writeFile(join(folder, 'client-preload.cjs'), "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('prepareTest',{prepare:r=>ipcRenderer.invoke('editor-v6:motion:prepare',r)})")
  const client = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, preload: join(folder, 'client-preload.cjs') } })
  try {
    await client.loadFile(join(folder, 'client.html'))
    const response = await client.webContents.executeJavaScript(`window.prepareTest.prepare(${JSON.stringify({ ...firstRequest, id: randomUUID() })})`)
    assert.equal(response, undefined, 'Background preparation sent a PNG atlas to the editor UI')
  } finally { client.destroy() }
  service!.releaseIdle()
  assert.equal(BrowserWindow.getAllWindows().length, 0, 'Idle workers would keep the app alive after closing the editor')
  await start('persistent')
  const beforeCacheWindows = windows, cacheBegan = performance.now()
  const restored = await service!.bakeForExport(firstRequest, new AbortController().signal)
  const diskHitMs = performance.now() - cacheBegan
  assert.equal(restored.asset.id, first.asset.id, 'Restart did not recover the cached atlas')
  assert.equal(windows, beforeCacheWindows, 'A disk hit opened a renderer')
  await start('abort')
  const controller = new AbortController()
  const cancelled = service!.bakeForExport(request(2), controller.signal)
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(cancelled)
  await service!.bakeForExport(request(3), new AbortController().signal)
  await start(undefined, 2)
  const duplicate = request(100), beforeSharedBake = windows
  const [sharedFirst, sharedSecond] = await Promise.all([
    service!.bakeForExport(duplicate, new AbortController().signal),
    service!.bakeForExport({ ...duplicate, id: randomUUID() }, new AbortController().signal)
  ])
  assert.equal(sharedFirst.asset.id, sharedSecond.asset.id, 'Concurrent duplicate requests baked separate atlases')
  assert.equal(windows - beforeSharedBake, 1, 'Concurrent duplicate requests occupied more than one worker lane')
  const sharedCancellation = new AbortController(), survivingRequest = request(101)
  const cancelledSubscriber = service!.bakeForExport(survivingRequest, sharedCancellation.signal)
  const survivingSubscriber = service!.bakeForExport({ ...survivingRequest, id: randomUUID() }, new AbortController().signal)
  setTimeout(() => sharedCancellation.abort(), 10)
  await assert.rejects(cancelledSubscriber)
  assert.ok((await survivingSubscriber).asset.dataUrl.startsWith('data:image/png;base64,'), 'One subscriber cancellation interrupted another subscriber')
  const rounds: Array<{ mode: string; workers: number; round: number; milliseconds: number; windows: number }> = []
  for (let round = 0; round < 3; round++) for (const mode of round % 2 ? ['two', 'reuse', 'fresh'] : ['fresh', 'reuse', 'two']) {
    const concurrency = mode === 'two' ? 2 : 1
    await start(undefined, concurrency)
    const before = windows, began = performance.now()
    if (mode === 'fresh') for (const index of [0, 1, 2, 3]) {
      if (index > 0) await start()
      await service!.bakeForExport(request(index + 10), new AbortController().signal)
    }
    else await Promise.all([0, 1, 2, 3].map((index) => service!.bakeForExport(request(index + 10), new AbortController().signal)))
    rounds.push({ mode, workers: concurrency, round, milliseconds: performance.now() - began, windows: windows - before })
  }
  service!.cancelAll(); await service!.drain()
  assert.equal(BrowserWindow.getAllWindows().length, 0, 'Preparation left orphan windows')
  await writeFile(join(folder, 'background.html'), '<!doctype html><html><body></body></html>')
  const backgroundWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true } })
  let background
  try {
    await backgroundWindow.loadFile(join(folder, 'background.html'))
    await backgroundWindow.webContents.executeJavaScript(await readFile(join(folder, 'background.js'), 'utf8'))
    background = await backgroundWindow.webContents.executeJavaScript('globalThis.runBackgroundCheck()')
  } finally { backgroundWindow.destroy() }
  const result = { passed: true, fixture: 'synthetic 100x100; four unique transitions per round; cold worker/cache', diskHitMs, rasterSha256: createHash('sha256').update(first.asset.dataUrl).digest('hex'), windowsReused: true, sourceCacheReused: true, cancellationRecovered: true, background, rounds }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  clearTimeout(timeout); app.exit(0)
}
main().catch(async (error) => { console.error(error); service?.cancelAll(); await service?.drain(); clearTimeout(timeout); app.exit(1) })
