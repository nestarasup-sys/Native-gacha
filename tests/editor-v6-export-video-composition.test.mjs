import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEditorV6VideoComposition, editorV6OutputColorFilter } from '../electron/domains/editorV6/exportVideoComposition.ts'

const clip = (overrides = {}) => ({
  blockId: 'video-block',
  fileName: 'scene.mp4',
  mediaInFrame: 45,
  startFrame: 120,
  endFrame: 150,
  layout: { x: 10, y: -5, width: 50, height: 25, rotation: 15 },
  ...overrides
})

test('monta filtros estáveis para vídeo sobreposto e calcula seek, offset, posição e rotação', () => {
  const result = buildEditorV6VideoComposition({
    clips: [clip()],
    mediaPaths: ['C:/media/scene.mp4'],
    partStartFrame: 90,
    width: 1920,
    height: 1080,
    layeredVideo: false
  })

  assert.deepEqual(result.videoInputs, ['-ss', '1.5', '-t', '1', '-i', 'C:/media/scene.mp4'])
  assert.deepEqual(result.filterArgs, [
    '-filter_complex',
    `[0:v]setsar=1[base];[1:v:0]scale=960:270:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=rgba,rotate=${15 * Math.PI / 180}:ow=rotw(iw):oh=roth(ih):c=none,setpts=PTS-STARTPTS+1/TB[clip0];[base][clip0]overlay=x='1152-overlay_w/2':y='486-overlay_h/2':enable='gte(t,1)*lt(t,2)':eof_action=pass:repeatlast=0[mix0];[mix0]${editorV6OutputColorFilter}[vout]`,
    '-map', '[vout]'
  ])
  assert.equal(result.rawHeight, 1080)
})

test('mantém ordem de composição entre vários vídeos', () => {
  const result = buildEditorV6VideoComposition({
    clips: [clip(), clip({ blockId: 'later-block', mediaInFrame: 0, startFrame: 135, endFrame: 150 })],
    mediaPaths: ['first.mp4', 'second.mp4'],
    partStartFrame: 120,
    width: 320,
    height: 180,
    layeredVideo: false
  })

  const graph = result.filterArgs[1]
  assert.ok(graph.indexOf('[base][clip0]overlay') < graph.indexOf('[mix0][clip1]overlay'))
  assert.match(graph, /\[2:v:0\].*setpts=PTS-STARTPTS\+0\.5\/TB\[clip1\]/)
  assert.deepEqual(result.videoInputs.slice(-6), ['-ss', '0', '-t', '0.5', '-i', 'second.mp4'])
})

test('duplica a entrada base e sobrepõe a camada frontal no modo de vídeo em camadas', () => {
  const result = buildEditorV6VideoComposition({
    clips: [],
    mediaPaths: [],
    partStartFrame: 0,
    width: 320,
    height: 180,
    layeredVideo: true
  })

  assert.deepEqual(result.videoInputs, [])
  assert.deepEqual(result.filterArgs, [
    '-filter_complex',
    `[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base];[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg];[base][fg]overlay=0:0:format=auto:eof_action=pass:repeatlast=1[mixed];[mixed]${editorV6OutputColorFilter}[vout]`,
    '-map', '[vout]'
  ])
  assert.equal(result.rawHeight, 360)
})
