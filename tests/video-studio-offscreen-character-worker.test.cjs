'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createAnimatedGachaCharacterFixture } = require('../scripts/video-studio/animated-gacha-character-fixture.cjs')
const { configureGachaStressScenario, scenarios } = require('../scripts/video-studio/gacha-video-stress-scenario.cjs')

function loadPureTs(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name in dependencies) return dependencies[name]
    if (name.endsWith('/fabricator')) return {}
    throw new Error(`Import inesperado no módulo puro: ${name}`)
  }, module, module.exports)
  return module.exports
}

test('fixture Gacha completa mantém referências de modelos, poses, roupas, cabelo e rosto válidas', async () => {
  const fixture = await createAnimatedGachaCharacterFixture({ durationFrames: 10_800 })
  const assets = loadPureTs('../src/shared/videoCharacterRenderAssets.ts')
  const snapshot = assets.createVideoCharacterRenderAssetSnapshot(fixture.characterAssets.entries)
  const provider = assets.createVideoCharacterRenderSnapshotProvider(snapshot)
  assert.equal((await provider.loadFabricatorSlot(1)).slot, 1)
  assert.equal((await provider.loadFabricatorPose(1, 2)).sourceModelSlot, 1)
  assert.equal((await provider.loadHairStyle(1, 'stress-hair')).id, 'stress-hair')
  assert.equal((await provider.loadWardrobeSet(1, 'stress-outfit')).id, 'stress-outfit')
  for (const id of ['stress-pupil-left', 'stress-pupil-right', 'stress-brow-left', 'stress-brow-right']) {
    assert.equal((await provider.loadFaceComponentAsset(1, id)).id, id)
  }
  assert.equal(fixture.renderVariant, 'animated')
  assert.ok(fixture.characters.characters[0].customization.hairAppearance)
  assert.equal(fixture.characters.characters[0].customization.wardrobeGroups.length, 3)
})

test('cenários progressivos de estresse usam os mesmos atores Gacha e transições determinísticas', async () => {
  const fixture = await createAnimatedGachaCharacterFixture({ durationFrames: 10_800 })
  const expected = { basic: 1, intermediate: 2, heavy: 4, extreme: 8, mixed: 4 }
  for (const [scenario, count] of Object.entries(expected)) {
    const bootstrap = structuredClone(fixture)
    const profile = configureGachaStressScenario(bootstrap, {
      scenario,
      durationFrames: 10_800,
      audio: scenario === 'mixed',
      videoPath: scenario === 'mixed' ? 'fixture.mp4' : undefined,
      transitionSpacing: 30,
    })
    assert.equal(profile.counts.characters, count)
    assert.equal(profile.counts.transitions, count * 359)
    assert.equal(profile.counts.transitionsPerCharacter, 359)
    assert.equal(bootstrap.snapshot.timeline.frameRate, 60)
    assert.equal(bootstrap.snapshot.timeline.durationFrames, 10_800)
    assert.equal(bootstrap.renderVariant, 'animated')
    assert.equal(bootstrap.snapshot.studio.elements.filter(element => element.kind === 'character').length, count)
    for (const key of bootstrap.snapshot.timeline.characterKeys) {
      assert.ok(bootstrap.snapshot.timeline.characterBases[key.elementId], `base ausente: ${key.elementId}`)
      assert.equal(key.state.element.characterId, fixture.characters.characters[0].id)
    }
    assert.equal(profile.counts.videoClips, scenario === 'mixed' ? 1 : 0)
    assert.equal(profile.counts.audio, scenario === 'mixed')
    assert.equal(profile.sourceByAssetId.size, scenario === 'mixed' ? 1 : 0)
  }
  assert.deepEqual(Object.keys(scenarios), Object.keys(expected))
})

test('perfil misto gera um plano AAC ativo a partir da mídia importada e do áudio por clipe', async () => {
  const bootstrap = await createAnimatedGachaCharacterFixture({ durationFrames: 300 })
  const profile = configureGachaStressScenario(bootstrap, {
    scenario: 'mixed', durationFrames: 300, audio: true, videoPath: 'fixture.mp4', transitionSpacing: 30,
  })
  const audio = loadPureTs('../src/shared/videoAudio.ts')
  const planModule = loadPureTs('../src/shared/videoStudioAudioPlan.ts', { './videoAudio': audio })
  const plan = planModule.buildVideoStudioAudioPlan(bootstrap.snapshot.timeline,
    new Map([['gacha-stress-video', { path: profile.sourceByAssetId.get('gacha-stress-video'), hasAudio: true }]]), 1)
  assert.equal(plan.enabled, true)
  assert.equal(plan.sourceCount, 1)
  assert.ok(plan.inputArgs.includes('fixture.mp4'))
  assert.match(plan.filterComplex, /aresample=48000/)
  assert.ok(plan.outputArgs.includes('-b:a') && plan.outputArgs.includes('192k'))
  assert.ok(plan.outputArgs.includes('-ar') && plan.outputArgs.includes('48000'))
  assert.ok(plan.outputArgs.includes('-ac') && plan.outputArgs.includes('2'))
})

test('harness A/B exige Canvas tradicional como oracle e valida fallback e paridade exata', () => {
  const benchmark = fs.readFileSync(path.resolve(__dirname, '../scripts/video-studio/offscreen-character-worker-benchmark.cjs'), 'utf8')
  const worker = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/features/videoStudio/videoCharacterFrameRender.worker.ts'), 'utf8')
  const client = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/features/videoStudio/videoCharacterFrameRenderWorkerClient.ts'), 'utf8')
  const surface = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/features/videoStudio/VideoExportSurfacePage.tsx'), 'utf8')
  assert.match(benchmark, /createHash\('sha256'\)/)
  assert.match(benchmark, /warmup/)
  assert.match(benchmark, /parity|pixels|RGBA/i)
  assert.match(benchmark, /workerFallbacks/)
  assert.match(worker, /new VideoCharacterFrameRenderer/)
  assert.match(worker, /createImageBitmap/)
  assert.match(worker, /VideoStudioResourceBudget/)
  assert.match(client, /new Worker\(/)
  assert.match(client, /AbortSignal/)
  assert.match(surface, /get\('characterWorker'\)/)
  assert.match(surface, /fallback/i)
})
