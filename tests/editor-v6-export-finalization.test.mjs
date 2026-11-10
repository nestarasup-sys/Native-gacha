import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { finalizeEditorV6Export } from '../electron/domains/editorV6/exportFinalization.ts'

const partStream = () => ({
  codec_type: 'video', codec_name: 'h264', profile: 'High', pix_fmt: 'yuv420p', width: 320, height: 180,
  r_frame_rate: '30/1', time_base: '1/30', has_b_frames: 0, extradata_hash: 'sha256:stable-parts'
})

const makePart = (index, folder) => ({
  index,
  startFrame: index * 2,
  endFrame: (index + 1) * 2,
  encoder: 'libx264',
  path: join(folder, `part-${index}.mp4`),
  probe: { streams: [partStream()], format: {} }
})

const outputProbe = ({ packets = '4', frames, width = 320, height = 180, audio = false } = {}) => ({
  streams: [
    { ...partStream(), width, height, nb_read_packets: packets, ...(frames === undefined ? {} : { nb_read_frames: frames }), duration: '0.133333' },
    ...(audio ? [{ codec_type: 'audio', duration: '0.133333' }] : [])
  ],
  format: { duration: '0.133333' }
})

async function withTempFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-finalization-test-'))
  try { await run(folder) }
  finally { await rm(folder, { recursive: true, force: true }) }
}

function makeHarness(folder, overrides = {}) {
  const calls = []
  const probes = []
  const counts = []
  const warnings = []
  const validations = []
  const progress = []
  const parts = [makePart(0, folder), makePart(1, folder)]
  const dependencies = {
    ffmpeg: 'ffmpeg-test',
    ffprobe: 'ffprobe-test',
    folder,
    candidate: join(folder, 'candidate.mp4'),
    project: { media: [], exportAudio: [], timeline: { tracks: [] } },
    options: { startFrame: 0, endFrame: 4, width: 320, height: 180 },
    totalFrames: 4,
    parts,
    signal: new AbortController().signal,
    audioPath: async (clip) => `C:/media/${clip.fileName}`,
    runCommand: async (_binary, args, _signal, cwd) => { calls.push({ args, cwd }); return { stdout: '', stderr: '' } },
    probeMedia: async (_binary, path, _signal, count) => { probes.push({ path, count }); return outputProbe() },
    progress: (patch) => progress.push(patch),
    setAudioClipCount: (count) => counts.push(count),
    setDeliveryWarning: (warning) => warnings.push(warning),
    setValidation: (validation) => validations.push(validation),
    ...overrides
  }
  return { dependencies, calls, probes, counts, warnings, validations, progress }
}

test('concatena partes, valida quadros por pacotes e examina as emendas sem decodificar o vídeo inteiro', async () => {
  await withTempFolder(async (folder) => {
    const harness = makeHarness(folder)
    const result = await finalizeEditorV6Export(harness.dependencies)

    assert.equal(result.validation.decodedFramesNearEachSeam, 3)
    assert.deepEqual(result.validation.seams, [2])
    assert.equal(result.audioClips, 0)
    assert.deepEqual(harness.probes.map(({ count }) => count), ['packets'])
    assert.deepEqual(harness.counts, [0])
    assert.equal(harness.validations.length, 1)
    assert.equal(harness.calls.filter(({ args }) => args.includes('-err_detect')).length, 1)
    assert.match(harness.calls.find(({ args }) => args.includes('-f') && args.includes('concat')).args.join(' '), /-c:v copy/)
    assert.equal(await readFile(join(folder, 'parts.txt'), 'utf8'), "file 'part-0.mp4'\nfile 'part-1.mp4'\n")
  })
})

test('usa a contagem decodificada como fallback se a contagem de pacotes não for conclusiva', async () => {
  await withTempFolder(async (folder) => {
    const harnessProbeCounts = []
    const harness = makeHarness(folder, {
      probeMedia: async (_binary, path, _signal, count) => {
        harnessProbeCounts.push(count)
        return count === true ? outputProbe({ packets: '3', frames: '4' }) : outputProbe({ packets: '3' })
      }
    })
    const result = await finalizeEditorV6Export(harness.dependencies)

    assert.deepEqual(harnessProbeCounts, ['packets', true])
    assert.equal(result.validation.streams[0].nb_read_frames, '4')
  })
})

test('recupera somente falha de taxa de decodificação de áudio e registra o aviso', async () => {
  await withTempFolder(async (folder) => {
    const calls = []
    const audioClip = { id: 'track-1', name: 'Tema', fileName: 'theme.flac', sourceFrames: 120, startFrame: 0, sourceInFrame: 0, durationFrames: 4, gain: 1, muted: false }
    const harness = makeHarness(folder, {
      parts: [{ ...makePart(0, folder), endFrame: 4 }],
      project: { media: [], exportAudio: [audioClip], timeline: { tracks: [] } },
      runCommand: async (_binary, args, _signal, cwd) => {
        calls.push({ args, cwd })
        if (calls.length === 1) throw Error('FFmpeg/FFprobe terminou com código 69: [aist#1:0/flac] Decode error rate 0.9 exceeds maximum')
        return { stdout: '', stderr: '' }
      },
      probeMedia: async (_binary, path, _signal, count) => { assert.equal(count, 'packets'); return outputProbe({ audio: true }) }
    })
    const result = await finalizeEditorV6Export(harness.dependencies)

    assert.equal(result.audioClips, 1)
    assert.equal(calls.length, 2)
    assert.ok(calls[1].args.includes('-max_error_rate'))
    assert.equal(calls.every((call) => call.cwd === folder), true)
    assert.match(harness.warnings[0], /theme\.flac/)
    assert.ok(harness.progress.some((patch) => patch.message?.startsWith('Recuperando quadros decodificáveis')))
  })
})

test('interrompe áudio sem pacotes decodificáveis sem tentar publicar silenciosamente', async () => {
  await withTempFolder(async (folder) => {
    const calls = []
    const audioClip = { id: 'track-1', name: 'Tema', fileName: 'theme.flac', sourceFrames: 120, startFrame: 0, sourceInFrame: 0, durationFrames: 4, gain: 1, muted: false }
    const harness = makeHarness(folder, {
      parts: [{ ...makePart(0, folder), endFrame: 4 }],
      project: { media: [], exportAudio: [audioClip], timeline: { tracks: [] } },
      runCommand: async (_binary, args) => {
        calls.push(args)
        throw Error('FFmpeg/FFprobe terminou com código 1: [aist#1:0/flac] Invalid data found when processing input')
      },
      probeMedia: async () => { throw Error('A sonda não deve rodar após uma falha de áudio fatal.') }
    })

    await assert.rejects(finalizeEditorV6Export(harness.dependencies), /não há quadros decodificáveis suficientes/)
    assert.equal(calls.length, 1)
    assert.deepEqual(harness.probes, [])
    assert.deepEqual(harness.warnings, [])
  })
})

test('guarda a sonda no relatório antes de rejeitar resolução final incompatível', async () => {
  await withTempFolder(async (folder) => {
    const harness = makeHarness(folder, {
      probeMedia: async () => outputProbe({ width: 640 })
    })

    await assert.rejects(finalizeEditorV6Export(harness.dependencies), /não passou na validação de quadros/)
    assert.equal(harness.validations.length, 1)
    assert.equal(harness.validations[0].streams[0].width, 640)
  })
})

test('recusa partes produzidas por codificadores diferentes antes de chamar FFmpeg', async () => {
  await withTempFolder(async (folder) => {
    const harness = makeHarness(folder, {
      parts: [makePart(0, folder), { ...makePart(1, folder), encoder: 'libopenh264' }]
    })

    await assert.rejects(finalizeEditorV6Export(harness.dependencies), /codificadores diferentes/)
    assert.deepEqual(harness.calls, [])
    assert.deepEqual(harness.counts, [])
  })
})
