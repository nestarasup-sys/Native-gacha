import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { attachEditorV6Motion, editorV6MotionPlan, type EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import type { FaceCatalogItem, FabricatorProject } from '../../src/shared/fabricator'
import { prepareExportMotions } from '../../electron/domains/editorV6/prepareMotions'

const folder = process.argv[2]
app.setPath('userData', join(folder, 'profile'))
app.on('window-all-closed', () => {})
const timeout = setTimeout(() => { console.error('Motion service check timed out'); app.exit(1) }, 600_000)
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
  const source: FabricatorProject = { schemaVersion: 1, slot: 1, name: 'Synthetic', sourceName: 'test', sourceAssetName: 'test', sourceDataUrl: '', width: 100, height: 100, tolerance: 0, updatedAt: stamp, joints: [], layerOrder: ['head', 'hair', 'arm'], parts: [{ id: 'head', name: 'head', x: 35, y: 20, width: 30, height: 60, rotation: 0, dataUrl: png }, { id: 'hair', name: 'hair', x: 30, y: 10, width: 40, height: 20, rotation: 0, dataUrl: png }, { id: 'arm', name: 'arm', x: 10, y: 50, width: 10, height: 10, rotation: 0, dataUrl: png }] }
  const target = { ...source, parts: source.parts.map((part) => part.id === 'arm' ? { ...part, x: 80 } : part) }
  ipcMain.handle('fabricator:load-slot', () => { modelReads++; return source })
  ipcMain.handle('fabricator:poses:load', (_event, _slot, pose) => {
    if (pose === 1) return source
    if (pose === 2) return target
    return { ...source, parts: source.parts.map((part) => part.id === 'arm' ? { ...part, x: 10 + Number(pose) * 4 } : part) }
  })
  const mouthClosed: FaceCatalogItem = { schemaVersion: 1, id: 'mouth-closed-bench', modelSlot: 1, category: 'mouth-closed', name: 'Synthetic mouth', sheet: { kind: 'mouth-closed', name: 'Synthetic mouth', width: 10, height: 10, tolerance: 0, dataUrl: png }, pieces: Array.from({ length: 21 }, (_, index) => ({ id: `mouth-closed-${index}`, sheet: 'mouth-closed' as const, index, crop: { x: 0, y: 0, width: 10, height: 10 }, width: 10, height: 10, dataUrl: png })), transforms: { mouth: { x: 50, y: 55, scaleX: 0.6, scaleY: 0.6, rotation: 0 } }, eyeLinked: true, browLinked: true, selectedNose: 0, selectedExpression: 0, updatedAt: stamp }
  const mouthOpen: FaceCatalogItem = { ...mouthClosed, id: 'mouth-open-bench', category: 'mouth-open', name: 'Synthetic open mouth', sheet: { ...mouthClosed.sheet, kind: 'mouth-open' }, pieces: mouthClosed.pieces.map((piece) => ({ ...piece, id: `mouth-open-${piece.index}`, sheet: 'mouth-open' as const })) }
  for (const name of ['fabricator:hair:styles:load', 'fabricator:wardrobe:load', 'fabricator:face:load', 'fabricator:face-components:load']) ipcMain.handle(name, () => null)
  for (const name of ['fabricator:face-components:list']) ipcMain.handle(name, () => [])
  ipcMain.handle('fabricator:face-catalog:load', (_event, _slot, id) => id === mouthOpen.id ? mouthOpen : id === mouthClosed.id ? mouthClosed : null)
  ipcMain.handle('fabricator:face-catalog:list', () => [mouthClosed, mouthOpen])
  const expressionPresetIds = Array.from({ length: 42 }, (_, index) => `synthetic-expression-${index}`)
  ipcMain.handle('fabricator:expression-presets:list', () => expressionPresetIds.map((id, index) => ({ id, modelSlot: 1, name: id, expressionIndex: index % 21, updatedAt: stamp, collectionId: 'standard' })))
  ipcMain.handle('fabricator:expression-presets:load', (_event, _slot, id) => ({ schemaVersion: 1, id, modelSlot: 1, name: id, expressionIndex: expressionPresetIds.indexOf(id) % 21, selections: {}, transforms: {}, noseOpacity: 1, effects: {}, updatedAt: stamp }))
  const faceAppearance = { modelSlot: 1, mouthClosedCatalogId: mouthClosed.id, mouthOpenCatalogId: mouthOpen.id, eyeState: 0 as const, eyebrows: false, noseIndex: 0, expressionIndex: 0, mouthOpen: false }
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', hair: '#000000', outfit: '#000000', skin: '#ffffff', createdAt: stamp, updatedAt: stamp, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [], faceAppearance } }
  const actor: EditorV6Element = { id: randomUUID(), kind: 'character', characterId: character.id, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: 1, faceAppearance }
  function request(index: number): EditorV6MotionBakeRequest {
    const from = { ...actor, x: index }, to = { ...from, poseSlot: 2 }
    const track: EditorV6TimelineTrack = { id: randomUUID(), kind: 'character', name: 'Alice', muted: false, locked: false, blocks: [{ id: randomUUID(), elementId: actor.id, label: 'A', startFrame: 0, durationFrames: 30, state: from }, { id: randomUUID(), elementId: actor.id, label: 'B', startFrame: 30, durationFrames: 30, state: to }] }
    return { id: randomUUID(), plan: editorV6MotionPlan(track, track.blocks[0], track.blocks[1])!, character }
  }
  function preparationFixture(characterCount: 1 | 3, transitionCount = 42) {
    const characters: CustomizerCharacter[] = Array.from({ length: characterCount }, (_, index) => ({
      ...character, id: `bench-character-${index}`, name: `Benchmark ${index + 1}`, updatedAt: stamp,
      customization: { ...character.customization, faceAppearance: { ...faceAppearance } }
    }))
    const tracks: EditorV6TimelineTrack[] = []
    const actors: EditorV6Element[] = []
    const poseSequences = characters.map(() => {
      const sequence = [1], used = new Set<string>()
      while (sequence.length < Math.floor(transitionCount / characterCount) + (sequence.length <= transitionCount % characterCount ? 2 : 1)) {
        const current = sequence.at(-1)!
        const candidates = Array.from({ length: 12 }, (_, index) => index + 1).filter((next) => next !== current && !used.has(`${current}:${next}`))
        const selected = candidates[(sequence.length * 7 + current * 3) % candidates.length]
        used.add(`${current}:${selected}`)
        sequence.push(selected)
      }
      return sequence
    })
    for (const [characterIndex, current] of characters.entries()) {
      const count = Math.floor(transitionCount / characterCount) + (characterIndex < transitionCount % characterCount ? 1 : 0)
      const actor: EditorV6Element = { ...actorTemplate(current), faceAppearance: { ...faceAppearance }, characterSourceUpdatedAt: stamp }
      actors.push(actor)
      const blocks = Array.from({ length: count + 1 }, (_, stateIndex) => ({
        id: randomUUID(), elementId: actor.id, label: `Pose ${stateIndex + 1}`, startFrame: stateIndex * 30,
        durationFrames: 30,
        state: {
          ...actor,
          poseSlot: poseSequences[characterIndex][stateIndex],
          activeExpressionPresetId: `synthetic-expression-${stateIndex}`,
          activeExpressionPresetUpdatedAt: stamp,
          faceAppearance: { ...faceAppearance, expressionIndex: stateIndex % 21 }
        }
      }))
      tracks.push({ id: randomUUID(), kind: 'character', characterId: current.id, name: current.name, muted: false, locked: false, blocks })
    }
    const speechBlocks = characters.flatMap((current, characterIndex) => {
      const count = Math.floor(transitionCount / characterCount) + (characterIndex < transitionCount % characterCount ? 1 : 0)
      return Array.from({ length: count }, (_, index) => index % 3 === 0 ? ({
        id: randomUUID(), characterId: current.id, label: 'Speech fixture', startFrame: index * 30 + 21, durationFrames: 8
      }) : null).filter((block): block is NonNullable<typeof block> => block !== null)
    })
    tracks.push({ id: randomUUID(), kind: 'speech', name: 'Speech fixture', muted: false, locked: false, blocks: speechBlocks })
    const durationFrames = (Math.max(...tracks.filter(track => track.kind === 'character').map(track => track.blocks.length - 1)) + 1) * 30
    const project = {
      schemaVersion: 1, id: randomUUID(), title: 'Synthetic motion preparation benchmark', color: '#ffffff',
      createdAt: stamp, updatedAt: stamp, backgroundColor: '#ffffff', backgroundAssetId: null,
      backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
      assets: [], elements: actors, timeline: { fps: 30 as const, durationFrames, tracks, knownElementIds: actors.map(actor => actor.id) }
    } as unknown as EditorV6Document
    return { project, characters, durationFrames }
  }
  function actorTemplate(current: CustomizerCharacter): EditorV6Element {
    return { id: randomUUID(), kind: 'character', characterId: current.id, text: current.name, x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1, poseSlot: 1, faceAppearance: { ...faceAppearance }, characterSourceUpdatedAt: stamp }
  }
  async function runPreparationBenchmark(characterCount: 1 | 3, concurrency: 1 | 2 | 3, reuseMode: 'baseline' | 'optimized', round: number) {
    await start(undefined, concurrency)
    const fixture = preparationFixture(characterCount)
    const scope = randomUUID()
    let peakRssBytes = process.memoryUsage().rss, peakElectronWorkingSetBytes = 0, peakGpuWorkingSetBytes = 0
    const sampleMemory = () => {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
      const metrics = app.getAppMetrics()
      peakElectronWorkingSetBytes = Math.max(peakElectronWorkingSetBytes, metrics.reduce((sum, item) => sum + (item.memory?.workingSetSize ?? 0) * 1024, 0))
      for (const metric of metrics) {
        const bytes = (metric.memory?.workingSetSize ?? 0) * 1024
        if (String(metric.type).toLowerCase().includes('gpu')) peakGpuWorkingSetBytes = Math.max(peakGpuWorkingSetBytes, bytes)
      }
    }
    sampleMemory()
    const memoryTimer = setInterval(sampleMemory, 100)
    const began = performance.now()
    try {
      const prepared = await prepareExportMotions(fixture.project, 0, fixture.durationFrames, {
        signal: new AbortController().signal, characters: fixture.characters, concurrency, ignoreExistingMotions: true,
        bake: (input, signal) => service!.bakeForExport({
          ...input, cacheScope: scope,
          ...(reuseMode === 'baseline' ? { diagnosticDisableScopedPreparationReuse: true } : {})
        }, signal),
        progress: () => {}
      })
      const milliseconds = performance.now() - began
      const profile = prepared.stats
      const assets = new Map(prepared.project.assets.map(asset => [asset.id, asset]))
      const rasterHash = createHash('sha256')
      for (const track of prepared.project.timeline.tracks.filter(item => item.kind === 'character')) for (const block of track.blocks) {
        const motion = block.incomingMotion
        if (!motion) continue
        rasterHash.update(JSON.stringify(motion.frames))
        rasterHash.update(assets.get(motion.assetId)?.dataUrl ?? '')
        if (motion.faceAssetId) rasterHash.update(assets.get(motion.faceAssetId)?.dataUrl ?? '')
      }
      const transitionProfiles = profile.transitionProfiles ?? []
      const output = {
        round, characterCount, transitions: profile.unique, samples: transitionProfiles.reduce((sum, item) => sum + (item.profile?.sampleRenderCalls ?? 0), 0),
        reuseMode, configuredConcurrency: profile.configuredConcurrency, characterSequences: profile.characterSequences,
        assignedLanes: profile.assignedLanes, effectiveConcurrency: profile.maxConcurrentBakes,
        serviceCapacity: transitionProfiles[0]?.profile?.servicePoolCapacity ?? 0,
        servicePeakConcurrency: Math.max(0, ...transitionProfiles.map(item => item.profile?.serviceObservedPeakConcurrency ?? 0)),
        milliseconds, rigsBuilt: profile.preparedRigs, rigsReused: profile.reusedRigs, rigRebuilds: profile.rigRebuilds,
        stageSummary: profile.stageSummary, requestMilliseconds: profile.requestMilliseconds,
        providerReads: transitionProfiles.reduce((sum, item) => sum + (item.profile?.providerReadCalls ?? 0), 0),
        providerCacheHits: transitionProfiles.reduce((sum, item) => sum + (item.profile?.providerCacheHits ?? 0), 0),
        providerCacheMisses: transitionProfiles.reduce((sum, item) => sum + (item.profile?.providerCacheMisses ?? 0), 0),
        requestPayloadBytes: transitionProfiles.reduce((sum, item) => sum + (item.profile?.requestPayloadBytes ?? 0), 0),
        resultPayloadBytes: transitionProfiles.reduce((sum, item) => sum + (item.profile?.resultPayloadBytes ?? 0), 0),
        peakRssBytes, peakElectronWorkingSetBytes, peakGpuProcessWorkingSetBytes: peakGpuWorkingSetBytes,
        gpuMemoryAvailable: false, visualDigest: rasterHash.digest('hex')
      }
      assert(profile.unique === 42 && profile.total === 42, `Fixture ${characterCount} actors prepared ${profile.unique}/${profile.total}, esperado 42 transições`)
      assert(profile.configuredConcurrency === concurrency, 'Scheduler did not retain configured concurrency')
      assert(profile.assignedLanes === Math.min(concurrency, characterCount), `Scheduler assigned ${profile.assignedLanes} lanes for ${characterCount} actors at concurrency ${concurrency}`)
      assert(profile.maxConcurrentBakes === Math.min(concurrency, characterCount), `Scheduler reached ${profile.maxConcurrentBakes} concurrent bakes, expected ${Math.min(concurrency, characterCount)}`)
      assert(output.serviceCapacity === concurrency && output.servicePeakConcurrency === output.effectiveConcurrency, 'Motion IPC pool and scheduler did not run at equal measured capacity')
      return output
    } finally {
      clearInterval(memoryTimer)
      sampleMemory()
      service?.releaseIdle()
    }
  }
  async function start(cacheName?: string, concurrency: 1 | 2 | 3 = 1) {
    service?.cancelAll(); await service?.drain()
    for (const channel of channels) ipcMain.removeHandler(channel)
    service = createEditorV6MotionService({ ipcMain: { handle: (channel, listener) => { channels.add(channel); ipcMain.handle(channel, listener) } }, assertTrustedSender: () => {}, html: join(folder, 'index.html'), preload: join(folder, 'preload.cjs'), cacheDirectory: cacheName ? join(folder, cacheName) : undefined, concurrency })
  }
  await start()
  const firstRequest = request(0), first = await service!.bakeForExport(firstRequest, new AbortController().signal)
  const firstWindows = windows
  const second = await service!.bakeForExport(request(1), new AbortController().signal)
  assert.equal(windows, firstWindows, 'Each transition opened a new window')
  assert.equal(modelReads, 1, `The warm worker reloaded the model (reads=${modelReads}, first=${JSON.stringify(first.metrics.profile)}, second=${JSON.stringify(second.metrics.profile)})`)
  assert.equal(first.asset.dataUrl, second.asset.dataUrl, 'Warm resources changed raster output')
  // Identical pose endpoints, different stage coordinates: new rig work must
  // disappear while output atlas bytes remain unchanged.
  assert.equal(second.metrics.preparedRigs, 0,
    `Warm full-pose pool rebuilt rigs for identical interpolated geometry: ${first.metrics.preparedRigs} -> ${second.metrics.preparedRigs}`)
  assert.ok((second.metrics.reusedRigs ?? 0) >= 7,
    'Motion bake did not report reused renderer sessions for seven exact canonical samples')
  assert.ok(first.motion.frames[0].x !== second.motion.frames[0].x,
    'Session reuse accidentally returned the previous actor geometry')
  await writeFile(join(folder, 'client.html'), '<!doctype html><html><body></body></html>')
  await writeFile(join(folder, 'client-preload.cjs'), "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('prepareTest',{prepare:r=>ipcRenderer.invoke('editor-v6:motion:prepare',r),bake:r=>ipcRenderer.invoke('editor-v6:motion:bake',r),cancel:id=>ipcRenderer.invoke('editor-v6:motion:cancel',id)})")
  const client = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, preload: join(folder, 'client-preload.cjs') } })
  try {
    await client.loadFile(join(folder, 'client.html'))
    const response = await client.webContents.executeJavaScript(`window.prepareTest.prepare(${JSON.stringify({ ...firstRequest, id: randomUUID() })})`)
    assert.equal(response, undefined, 'Background preparation sent a PNG atlas to the editor UI')
    const beforePreviewCancellation = windows
    const previewRequests = [request(10), request(11), request(12)]
    const [kept, discarded, following] = await client.webContents.executeJavaScript(`(async () => {
      const [first, obsolete, next] = ${JSON.stringify(previewRequests)}
      const pending = [prepareTest.bake(first), prepareTest.bake(obsolete), prepareTest.bake(next)]
      await prepareTest.cancel(obsolete.id)
      return Promise.all(pending)
    })()`)
    assert.equal(discarded, null, 'Preview cancellation rejected or returned an atlas')
    assert.equal(kept.motion.key, previewRequests[0].plan.key)
    assert.equal(following.motion.key, previewRequests[2].plan.key)
    assert.equal(windows, beforePreviewCancellation, 'Cancelling a queued preview bake retired the warm worker')
    const fixture = preparationFixture(1, 2).project
    const assetId = randomUUID()
    const intro: EditorV6TimelineTrack = { id: randomUUID(), kind: 'intro', name: 'Intro', muted: false, locked: false,
      blocks: [1, 2].map((poseSlot, index) => ({
        id: randomUUID(), label: character.name, startFrame: index * 30, durationFrames: 30,
        intro: { kind: 'character', characterId: character.id, assetId, portraitAspect: 1, poseSlot,
          face: { faceAppearance }, text: 'Olá.', englishText: 'Hello.', flipX: false }
      }))
    }
    fixture.timeline = { ...fixture.timeline, durationFrames: 60, tracks: [intro] }
    const plan = editorV6MotionPlan(intro, intro.blocks[0], intro.blocks[1])!
    const atlas = await client.webContents.executeJavaScript(`window.prepareTest.bake(${JSON.stringify({ id: randomUUID(), plan, character })})`)
    const preview = attachEditorV6Motion(fixture, plan.blockId, atlas)
    assert.ok(resolveEditorV6SceneAtFrame(preview, 26).elements[0].motionSprite, 'Intro preview did not display the offscreen atlas')
    assert.equal(resolveEditorV6SceneAtFrame(preview, 30).elements[0].poseSlot, 2, 'Intro preview did not arrive at the authored pose')
    assert.equal(fixture.timeline.tracks[0].blocks[1].incomingMotion, undefined, 'Preparing the preview modified the saved scene')
  } finally { client.destroy() }
  const beforeScopedExportReads = modelReads, scopedRequest = { ...firstRequest, id: randomUUID(), cacheScope: randomUUID() }
  const scopedExport = await service!.bakeForExport(scopedRequest, new AbortController().signal)
  assert.notEqual(scopedExport.asset.id, first.asset.id, 'A new export reused an atlas from the previous export')
  assert.equal(scopedExport.asset.dataUrl, first.asset.dataUrl, 'Scoped fresh export changed raster pixels')
  assert.equal(modelReads, beforeScopedExportReads + 1, 'A new export reused the previous export worker preparation')
  const scopedWindowCount = windows, scopedRepeat = await service!.bakeForExport({ ...scopedRequest, id: randomUUID() }, new AbortController().signal)
  assert.equal(scopedRepeat.asset.id, scopedExport.asset.id, 'Repeated transition within one export failed to reuse its atlas')
  assert.equal(windows, scopedWindowCount, 'An export-local atlas hit opened a renderer')
  const scopedRepeatMs = scopedRepeat.metrics.milliseconds
  await start('abort')
  const controller = new AbortController()
  const cancelled = service!.bakeForExport(request(2), controller.signal)
  // The optimized path can complete a 100x100 synthetic bake before a 10ms
  // timer fires. Abort synchronously to test cancellation rather than speed.
  controller.abort(Error('Synthetic motion preparation cancelled'))
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
  // Both subscribers are attached before this synchronous abort. A very fast
  // bake must not make a wall-clock timer invalidate the cancellation test.
  sharedCancellation.abort(Error('One subscriber cancelled'))
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
  const serviceCapacityChecks: Array<{ configured: number; windowsCreated: number; measuredPeak: number }> = []
  for (const concurrency of [1, 2, 3] as const) {
    await start(undefined, concurrency)
    const before = windows
    const results = await Promise.all(Array.from({ length: 3 }, (_, index) => service!.bakeForExport(request(300 + concurrency * 10 + index), new AbortController().signal)))
    const windowsCreated = windows - before
    const measuredPeak = Math.max(...results.map(result => result.metrics.profile?.serviceObservedPeakConcurrency ?? 0))
    assert.equal(windowsCreated, concurrency, `Serviço configurado para ${concurrency} lanes abriu ${windowsCreated} janelas`)
    assert.ok(results.every(result => result.metrics.profile?.servicePoolCapacity === concurrency), `Resultados não registraram capacidade ${concurrency}`)
    assert.equal(measuredPeak, concurrency, `Serviço com capacidade ${concurrency} atingiu paralelismo ${measuredPeak}`)
    serviceCapacityChecks.push({ configured: concurrency, windowsCreated, measuredPeak })
  }
  const benchmarkRuns: Array<Record<string, unknown>> = []
  const benchmarkCases = [
    { scenario: 'single-character', characters: 1 as const, concurrency: 1 as const },
    { scenario: 'single-character', characters: 1 as const, concurrency: 2 as const },
    { scenario: 'single-character', characters: 1 as const, concurrency: 3 as const },
    { scenario: 'three-characters', characters: 3 as const, concurrency: 1 as const },
    { scenario: 'three-characters', characters: 3 as const, concurrency: 2 as const },
    { scenario: 'three-characters', characters: 3 as const, concurrency: 3 as const }
  ]
  // Three alternating A/B rounds cover the intended low-concurrency workload
  // and the independent-character workload. The full 1/2/3 capacity matrix is
  // then exercised once in optimized mode so the diagnostic stays bounded.
  for (const testCase of [benchmarkCases[0], benchmarkCases[5]]) {
    for (let round = 0; round < 3; round++) {
      const order = round % 2 === 0 ? ['baseline', 'optimized'] as const : ['optimized', 'baseline'] as const
      for (const reuseMode of order) {
        const result = await runPreparationBenchmark(testCase.characters, testCase.concurrency, reuseMode, round + 1)
        benchmarkRuns.push({ ...result, scenario: testCase.scenario })
      }
    }
  }
  for (const testCase of benchmarkCases) {
    if (testCase === benchmarkCases[0] || testCase === benchmarkCases[5]) continue
    const result = await runPreparationBenchmark(testCase.characters, testCase.concurrency, 'optimized', 1)
    benchmarkRuns.push({ ...result, scenario: testCase.scenario })
  }
  const benchmarkMedian = (values: number[]) => {
    const ordered = [...values].sort((left, right) => left - right)
    return ordered[Math.floor(ordered.length / 2)] ?? 0
  }
  for (const testCase of [benchmarkCases[0], benchmarkCases[5]]) for (let round = 1; round <= 3; round++) {
    const pair = benchmarkRuns.filter((run) => run.scenario === testCase.scenario && run.characterCount === testCase.characters && run.configuredConcurrency === testCase.concurrency && run.round === round)
    assert.equal(pair.length, 2, `A/B pair missing for ${testCase.scenario}, concurrency ${testCase.concurrency}, round ${round}`)
    assert.equal(pair[0].visualDigest, pair[1].visualDigest, `A/B visual digest differs for ${testCase.scenario}, concurrency ${testCase.concurrency}, round ${round}`)
  }
  const benchmarkSummary = benchmarkCases.map((testCase) => {
    const subset = benchmarkRuns.filter((run) => run.scenario === testCase.scenario && run.characterCount === testCase.characters && run.configuredConcurrency === testCase.concurrency)
    const hasBaseline = subset.some((run) => run.reuseMode === 'baseline')
    const medianFor = (mode: string, key: string) => benchmarkMedian(subset.filter((run) => run.reuseMode === mode).map((run) => Number(run[key]) || 0))
    const baseline = medianFor('baseline', 'milliseconds'), optimized = medianFor('optimized', 'milliseconds')
    return {
      ...testCase,
      baselineMedianMs: hasBaseline ? baseline : null,
      optimizedMedianMs: optimized,
      changePercent: hasBaseline && baseline ? Number(((optimized - baseline) / baseline * 100).toFixed(2)) : null,
      effectiveConcurrencyBaseline: hasBaseline ? medianFor('baseline', 'effectiveConcurrency') : null,
      effectiveConcurrencyOptimized: medianFor('optimized', 'effectiveConcurrency'),
      baselineStageP50Ms: subset.find((run) => run.reuseMode === 'baseline')?.stageSummary,
      optimizedStageP50Ms: subset.find((run) => run.reuseMode === 'optimized')?.stageSummary,
      baselinePeakRssBytes: hasBaseline ? medianFor('baseline', 'peakRssBytes') : null,
      optimizedPeakRssBytes: medianFor('optimized', 'peakRssBytes'),
      baselinePeakElectronWorkingSetBytes: hasBaseline ? medianFor('baseline', 'peakElectronWorkingSetBytes') : null,
      optimizedPeakElectronWorkingSetBytes: medianFor('optimized', 'peakElectronWorkingSetBytes'),
      baselinePeakGpuProcessWorkingSetBytes: hasBaseline ? medianFor('baseline', 'peakGpuProcessWorkingSetBytes') : null,
      optimizedPeakGpuProcessWorkingSetBytes: medianFor('optimized', 'peakGpuProcessWorkingSetBytes'),
      baselineRigBuilds: hasBaseline ? medianFor('baseline', 'rigsBuilt') : null,
      optimizedRigBuilds: medianFor('optimized', 'rigsBuilt')
    }
  })
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
  const result = { passed: true, fixture: 'deterministic synthetic 100x100; 42 unique transitions per run, varied across 12 stored pose geometries and 42 expression presets, hair layer and speech intervals; export-local scope for every run. Hair swing physics/reaction is not represented by this source fixture.', scopedRepeatMs, crossExportReusePrevented: true, sameExportReusePreserved: true, rasterSha256: createHash('sha256').update(first.asset.dataUrl).digest('hex'), windowsReused: true, sourceCacheReused: true, cancellationRecovered: true, background, rounds, serviceCapacityChecks, motionPreparationBenchmark: { runs: benchmarkRuns, summary: benchmarkSummary, visualParity: true } }
  await writeFile(join(folder, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  clearTimeout(timeout); app.exit(0)
}
main().catch(async (error) => { console.error(error); service?.cancelAll(); await service?.drain(); clearTimeout(timeout); app.exit(1) })
