'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/features/videoStudio/videoMediaPlayback.ts'), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  const scheduler = class {
    request() { return 1 }
    cancel() {}
    dispose() {}
  }
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name === './videoPreviewSeekScheduler') return { VideoPreviewSeekScheduler: scheduler }
    if (name === '../../../../shared/videoAudio') return { videoAudioOutput: () => ({ volume: 0.5, muted: false }) }
    return require(name)
  }, mod, mod.exports)
  return mod.exports.VideoMediaPlayback
}

function makeMedia(play) {
  return {
    src: 'gacha-video://studio/project/asset',
    currentSrc: 'gacha-video://studio/project/asset',
    currentTime: 0,
    duration: 10,
    readyState: 4,
    networkState: 1,
    paused: true,
    ended: false,
    muted: true,
    volume: 1,
    play,
    pause() { this.paused = true },
  }
}

const state = { clip: { id: 'clip', assetId: 'asset', startFrame: 0, endFrame: 600, sourceStartFrame: 0 }, frame: 0, playing: true }

test('ignores AbortError when switching from project media to its preview proxy and retries the new source', async () => {
  const errors = []
  let rejectFirst
  let calls = 0
  const media = makeMedia(() => {
    calls++
    if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject })
    media.paused = false
    return Promise.resolve()
  })
  const VideoMediaPlayback = load()
  const playback = new VideoMediaPlayback(media, (message) => errors.push(message))

  playback.update(state)
  assert.equal(calls, 1)
  media.src = 'gacha-video://preview-proxy/hash'
  media.currentSrc = media.src
  media.readyState = 1
  media.networkState = 2
  rejectFirst(Object.assign(new Error('The play() request was interrupted by a new load request.'), { name: 'AbortError' }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(errors, [])

  media.readyState = 4
  media.networkState = 1
  playback.refresh()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 2, 'loaded source can start playback again')
  assert.deepEqual(errors, [])
  playback.dispose()
})

test('still reports AbortError when the playback source was not replaced', async () => {
  const errors = []
  const media = makeMedia(() => Promise.reject(Object.assign(new Error('playback was aborted'), { name: 'AbortError' })))
  const VideoMediaPlayback = load()
  const playback = new VideoMediaPlayback(media, (message) => errors.push(message))
  playback.update(state)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /MP4 ou WebM compatível/)
  playback.dispose()
})
