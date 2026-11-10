import test from 'node:test'
import assert from 'node:assert/strict'
import {
  editorV6AudioDecodeFailureSource,
  editorV6AudioFilterGraphs,
  editorV6TimelineMediaAudio,
  isEditorV6AudioDecodeRateFailure,
  isEditorV6AudioPacketDecodeFailure,
  planEditorV6ProjectAudio
} from '../electron/domains/editorV6/exportAudio.ts'

const audioAsset = { id: 'asset-audio', kind: 'audio', name: 'Narração', fileName: 'voice.wav', sourceFrames: 900, hasAudio: true, libraryAudioId: 'library-audio' }
const videoAsset = { id: 'asset-video', kind: 'video', name: 'Cena', fileName: 'scene.mp4', sourceFrames: 600, hasAudio: true, libraryVideoId: 'library-video' }
const silentAsset = { id: 'asset-silent', kind: 'video', name: 'Mudo', fileName: 'silent.mp4', sourceFrames: 600, hasAudio: false }

function block(id, mediaId, overrides = {}) {
  return { id, mediaId, startFrame: 0, durationFrames: 90, ...overrides }
}

test('mapeia áudio de faixas e vídeos audíveis, ignorando fontes bloqueadas ou sem áudio', () => {
  const project = {
    media: [audioAsset, videoAsset, silentAsset],
    timeline: { tracks: [
      { kind: 'audio', muted: false, hidden: false, blocks: [
        block('voice', audioAsset.id, { startFrame: 12, mediaInFrame: 8, gain: 0.6 }),
        block('disabled', audioAsset.id, { audioEnabled: false }),
        block('silent', silentAsset.id)
      ] },
      { kind: 'video', muted: false, hidden: false, blocks: [block('video-audio', videoAsset.id, { mediaInFrame: 3 })] },
      { kind: 'audio', muted: true, hidden: false, blocks: [block('muted-track', audioAsset.id)] },
      { kind: 'video', muted: false, hidden: true, blocks: [block('hidden-track', videoAsset.id)] }
    ] }
  }

  const audio = editorV6TimelineMediaAudio(project)

  assert.deepEqual(audio.map(({ id, libraryAudioId, libraryVideoId }) => ({ id, libraryAudioId, libraryVideoId })), [
    { id: 'voice', libraryAudioId: 'library-audio', libraryVideoId: undefined },
    { id: 'video-audio', libraryAudioId: undefined, libraryVideoId: 'library-video' }
  ])
  assert.equal(audio[0].sourceInFrame, 8)
  assert.equal(audio[0].gain, 0.6)
  assert.equal(audio[1].sourceInFrame, 3)
  assert.equal(audio[1].gain, 1)
})

test('plane áudio de exportação antes do áudio de timeline e recorta pelas bordas do intervalo', () => {
  const project = {
    exportAudio: [{ id: 'music', name: 'Música', fileName: 'music.wav', sourceFrames: 300, startFrame: 10, sourceInFrame: 0, durationFrames: 60, gain: 0.8, muted: false }],
    media: [audioAsset],
    timeline: { tracks: [{ kind: 'audio', muted: false, hidden: false, blocks: [block('voice', audioAsset.id, { startFrame: 30, mediaInFrame: 8 })] }] }
  }

  const audio = planEditorV6ProjectAudio(project, 40, 100)

  assert.deepEqual(audio.map(({ clip }) => clip.id), ['music', 'voice'])
  assert.deepEqual(audio.map(({ sourceInFrame, durationFrames, delayFrames }) => ({ sourceInFrame, durationFrames, delayFrames })), [
    { sourceInFrame: 30, durationFrames: 30, delayFrames: 0 },
    { sourceInFrame: 18, durationFrames: 60, delayFrames: 0 }
  ])
})

test('cria filtros de mixagem estrita e recuperação com mesmos canais e duração final', () => {
  const audio = [
    { clip: { gain: 0.5 }, sourceInFrame: 30, durationFrames: 60, delayFrames: 15 },
    { clip: { gain: 1 }, sourceInFrame: 0, durationFrames: 90, delayFrames: 0 }
  ]

  const graphs = editorV6AudioFilterGraphs(audio, 150)

  assert.equal(graphs.strict.length, 3)
  assert.equal(graphs.recoverable.length, 3)
  assert.match(graphs.strict[0], /atrim=start=1:duration=2,asetpts=N\/SR\/TB,aresample=48000/)
  assert.match(graphs.strict[0], /volume=0\.5,adelay=24000S:all=1\[a0\]/)
  assert.match(graphs.recoverable[0], /asetpts=PTS-STARTPTS,aresample=48000:async=48000:first_pts=0/)
  assert.equal(graphs.strict[2], '[a0][a1]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=5,atrim=duration=5,asetpts=N/SR/TB[mix]')
  assert.equal(graphs.recoverable[2], graphs.strict[2])
  assert.deepEqual(editorV6AudioFilterGraphs([], 150), { strict: [], recoverable: [] })
})

test('associa erros de stream à fonte correta e detecta apenas falhas recuperáveis ou de pacote', () => {
  const audio = [{ clip: { id: 'first' } }, { clip: { id: 'second' } }]

  assert.deepEqual(editorV6AudioDecodeFailureSource(new Error('falha em aist#2:0/aac'), audio), { clip: audio[1].clip, codec: 'AAC' })
  assert.deepEqual(editorV6AudioDecodeFailureSource(new Error('falha sem stream'), audio), { clip: undefined, codec: undefined })
  assert.equal(isEditorV6AudioDecodeRateFailure(new Error('FFmpeg/FFprobe terminou com código 69: Decode error rate 0.8 exceeds maximum')), true)
  assert.equal(isEditorV6AudioDecodeRateFailure(new Error('FFmpeg/FFprobe terminou com código 1: falha')), false)
  assert.equal(isEditorV6AudioPacketDecodeFailure(new Error('Invalid data found when processing input')), true)
  assert.equal(isEditorV6AudioPacketDecodeFailure(new Error('sem dados de áudio')), false)
})
