'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const source = p => fs.readFileSync(path.join(root, p), 'utf8')

test('video route mounts the rebuilt editor, not the retired legacy component', () => {
  const app = source('src/renderer/src/ui/App.tsx')
  assert.match(app, /features\/videoStudioRebuild\/VideoStudioRebuildPage/)
  assert.doesNotMatch(app, /features\/videoStudio\/VideoStudioPage/)
  assert.equal(fs.existsSync(path.join(root,'src/renderer/src/features/videoStudio/VideoStudioEditor.tsx')),false)
  assert.equal(fs.existsSync(path.join(root,'src/renderer/src/features/videoStudio/VideoStudioPage.tsx')),false)
})

test('visual export oracle still owns the CSS shared with old snapshot tools', () => {
  const oracle=source('src/renderer/src/features/videoStudio/VideoPreviewOraclePage.tsx')
  assert.match(oracle, /import '\.\/VideoStudioEditor\.css'/)
  assert.equal(fs.existsSync(path.join(root,'src/renderer/src/features/videoStudio/VideoStudioEditor.css')),true)
  assert.equal(fs.existsSync(path.join(root,'src/renderer/src/features/videoStudio/VideoExportSurfacePage.tsx')),true)
})

test('legacy editor was removed from mandatory architecture inventory',()=>{
  const audit=source('scripts/architecture/performance-audit.cjs')
  assert.match(audit,/src\/renderer\/src\/features\/videoStudioRebuild\/VideoStudioRebuildPage\.tsx/)
  assert.doesNotMatch(audit,/src\/renderer\/src\/features\/videoStudio\/VideoStudioEditor\.tsx/)
})

test('rebuilt inspector exposes keyframe, clip text, source-preserving reposition and audio edits',()=>{
  const file=source('src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx')
  assert.match(file,/setTextClipContent\(/)
  assert.match(file,/moveVideoClip\(/)
  assert.match(file,/moveCharacterKey\(/)
  assert.match(file,/deleteCharacterKey\(/)
  assert.match(file,/setVideoClipAudio\(/)
  assert.match(file,/setProjectVideoAudio\(/)
  assert.match(file,/aria-label="Texto do balão"/)
})
