'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '../src/renderer/src/features/videoStudio')
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8') }

test('playback chooses actual Canvas rig interpolated by production compositor, never endpoint cross-dissolve', () => {
  const hook = read('useCharacterTransitions.ts')
  const renderer = read('transitionRenderer.ts')
  const editor = read('VideoStudioEditor.tsx')
  const dom = read('VideoStudioDomElement.tsx')
  assert.match(hook, /session\.getBestAvailable\(span, frame, character\)/)
  assert.match(hook, /session\.prepareAhead\(spans, frame, characters, 'interactive'\)/)
  assert.doesNotMatch(hook, /evaluateRealtimeTransitionFallback/)
  assert.doesNotMatch(dom, /transitionFallback|video-studio-character-blend/)
  assert.doesNotMatch(editor, /transitionFallback/)
  assert.match(renderer, /mixPoseArtwork\(fromPose, toPose, t\)/)
  assert.match(renderer, /mixStudioTransforms\(normalized\.left, normalized\.right, t\)/)
  assert.match(renderer, /mixAppearance\(aa, ba, t\)/)
  assert.match(renderer, /renderer\.renderToCanvas\(appearance, transforms, effects, mode\)/)
})

test('player remains responsive without await-on-Play and never prepares a full transition synchronously', () => {
  const hook = read('useCharacterTransitions.ts')
  const editor = read('VideoStudioEditor.tsx')
  const queue = read('previewTransitionSession.ts')
  assert.doesNotMatch(editor, /await characterAnimation\.preparePlayback/)
  assert.match(hook, /void session\.prepareAhead/)
  assert.match(queue, /await new Promise<void>\(resolve => setTimeout\(resolve, 0\)\)/)
  assert.match(queue, /const anchors = all\.filter/)
})
