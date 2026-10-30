import { app, ipcMain, protocol } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createEditorV6WorkerFactory } from '../../electron/domains/editorV6/exportWorkers'
import { runEditorV6Export } from '../../electron/domains/editorV6/exportRunner'
import { editorV6MotionPlans, missingEditorV6Motions } from '../../src/shared/editorV6Motion'
import { editorV6ElementSize } from '../../src/shared/editorV6SceneModel'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import type { EditorV6Asset } from '../../src/shared/editorV6'

const root = resolve(process.argv[2]), projectFolder = resolve(process.argv[3]), outputFolder = resolve(process.argv[4])
const ffmpeg = join(root, 'resources/video-tools/ffmpeg.exe'), ffprobe = join(root, 'resources/video-tools/ffprobe.exe')
const assetFolder = (category: EditorV6Asset['category']) => category === 'background' ? 'backgrounds' : category === 'character' ? 'characters' : 'objects'
protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-editor-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
app.setPath('userData', join(outputFolder, 'stress-export-profile'))
app.on('window-all-closed', () => {})

async function main() {
  await app.whenReady()
  await mkdir(outputFolder, { recursive: true })
  const stored = JSON.parse(await readFile(join(projectFolder, 'editorV6.json'), 'utf8'))
  const assets = await Promise.all((stored.assets as EditorV6Asset[]).map(async (asset) => {
    const bytes = await readFile(join(projectFolder, 'assets', assetFolder(asset.category), `${asset.id}.png`))
    return { ...asset, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
  }))
  const sourceProject = editorV6DocumentSchema.parse({ ...stored, assets })
  const project = editorV6DocumentSchema.parse({
    ...sourceProject,
    exportAudio: [],
    timeline: {
      ...sourceProject.timeline,
      tracks: sourceProject.timeline.tracks.filter((track) => track.kind !== 'audio').map((track) => track.kind === 'video'
        ? { ...track, blocks: track.blocks.map((block) => block.mediaId ? { ...block, audioEnabled: false } : block) }
        : track)
    }
  })
  const plans = editorV6MotionPlans(project)
  const missing = missingEditorV6Motions(project)
  if (missing.length) throw Error(`O projeto de estresse não tem ${missing.length} atlas de transição persistidos.`)
  const mediaEndFrame = Math.max(0, ...project.timeline.tracks.filter((track) => track.kind === 'video').flatMap((track) => track.blocks.filter((block) => block.mediaId).map((block) => block.startFrame + block.durationFrames)))
  const nonCharacterBoundaries = project.timeline.tracks.filter((track) => track.kind !== 'character' && track.kind !== 'audio').flatMap((track) => track.blocks.flatMap((block) => [block.startFrame, block.startFrame + block.durationFrames]))
  const visibleMotionPlans = plans.filter((plan) => {
    const samples = plan.samples.map((sample) => plan.endFrame + sample.offset)
    const first = samples[0], last = samples.at(-1)
    return samples.length >= 2 && first >= mediaEndFrame && !nonCharacterBoundaries.some((frame) => frame > first && frame <= last)
  })
  if (visibleMotionPlans.length < 20) throw Error(`Poucas transições estão isoladas o bastante para validar os quadros exportados (${visibleMotionPlans.length}).`)
  const sampleFrames = [...new Set(visibleMotionPlans.flatMap((plan) => {
    const first = plan.samples[0], last = plan.samples.at(-1)
    return [plan.endFrame + first.offset, plan.endFrame + last.offset]
  }))].sort((a, b) => a - b)

  const factory = createEditorV6WorkerFactory({
    ipcMain,
    html: join(root, 'out/renderer/editor-v6-export.html'),
    preload: join(root, 'out/preload/editorV6ExportPreload.cjs'),
    mediaPath: (_projectId, fileName, libraryVideoId) => join(projectFolder, libraryVideoId ? 'library' : 'media', fileName)
  })
  const outputPath = join(outputFolder, 'stress-heavy-240s-silent.mp4')
  const reportPath = join(outputFolder, 'stress-heavy-240s-silent.report.json')
  try {
    console.log(`[V6 stress export] Exportando silenciosamente ${project.timeline.durationFrames} quadros, ${plans.length} transições.`)
    const report = await runEditorV6Export(project, {
      startFrame: 0, endFrame: project.timeline.durationFrames, width: 320, height: 180, turbo: true, encoder: 'cpu'
    }, {
      ffmpeg, ffprobe, tempRoot: join(outputFolder, 'temp'), id: randomUUID(), outputPath, reportPath,
      signal: new AbortController().signal,
      getCharacters: async () => [],
      bakeMotion: async () => { throw Error('O fixture não deveria precisar gerar atlases de movimento.') },
      createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => factory.create({ project: renderProject, width: 320, height: 180, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}) }, signal),
      audioPath: (_clip) => join(projectFolder, 'media', _clip.fileName),
      mediaPath: (_projectId, fileName, libraryVideoId) => join(projectFolder, libraryVideoId ? 'library' : 'media', fileName),
      progress: (patch) => { if (patch.message) console.log(`[V6 stress export] ${patch.message}`) }
    })
    if (report.state !== 'completed' || report.totalFrames !== project.timeline.durationFrames || report.motionTransitionsRequired !== 0 || report.motionTransitionsPrepared !== 0) throw Error(`A exportação terminou com dados inesperados: ${JSON.stringify({ state: report.state, frames: report.totalFrames, transitionsRequired: report.motionTransitionsRequired, transitionsPrepared: report.motionTransitionsPrepared })}`)
    const probe = report.validation as { streams?: Array<{ codec_type: string; nb_read_frames?: string | number; r_frame_rate?: string; duration?: string }>; format?: { duration?: string } }
    const video = probe.streams?.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
    if (Number(video?.nb_read_frames) !== project.timeline.durationFrames || video?.r_frame_rate !== '30/1' || audio || report.audioClips !== 0) throw Error('A exportação silenciosa perdeu quadros, taxa de quadros ou incluiu uma faixa de áudio.')

    const expression = `select='${sampleFrames.map((frame) => `eq(n,${frame})`).join('+')}'`
    const decoded = execFileSync(ffmpeg, ['-v', 'error', '-i', outputPath, '-vf', expression, '-fps_mode', 'passthrough', '-frames:v', String(sampleFrames.length), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 64 * 1024 ** 2 })
    const frameBytes = 320 * 180 * 3
    if (decoded.length !== sampleFrames.length * frameBytes) throw Error(`O MP4 entregou ${decoded.length / frameBytes} quadros de amostra; esperava ${sampleFrames.length}.`)
    const frames = new Map<number, Buffer>()
    sampleFrames.forEach((frame, index) => frames.set(frame, decoded.subarray(index * frameBytes, (index + 1) * frameBytes)))
    const motionResults = visibleMotionPlans.map((plan) => {
      const first = plan.endFrame + plan.samples[0].offset, last = plan.endFrame + plan.samples.at(-1)!.offset
      const firstImage = frames.get(first)!, lastImage = frames.get(last)!
      const bounds = [plan.from, plan.to].map((element) => {
        const size = editorV6ElementSize(element)
        return {
          left: (50 + element.x) * 3.2 - size.width * 1.6,
          right: (50 + element.x) * 3.2 + size.width * 1.6,
          top: (50 + element.y) * 1.8 - size.height * .9,
          bottom: (50 + element.y) * 1.8 + size.height * .9
        }
      })
      const left = Math.max(0, Math.floor(Math.min(...bounds.map((item) => item.left)) - 4))
      const right = Math.min(320, Math.ceil(Math.max(...bounds.map((item) => item.right)) + 4))
      const bodyTop = Math.min(...bounds.map((item) => item.top + (item.bottom - item.top) * .3))
      const top = Math.max(0, Math.floor(bodyTop - 4))
      const bottom = Math.min(180, Math.ceil(Math.max(...bounds.map((item) => item.bottom)) + 4))
      let changedPixels = 0
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const offset = (y * 320 + x) * 3
        const delta = Math.abs(firstImage[offset] - lastImage[offset]) + Math.abs(firstImage[offset + 1] - lastImage[offset + 1]) + Math.abs(firstImage[offset + 2] - lastImage[offset + 2])
        if (delta > 50) changedPixels++
      }
      const visible = changedPixels >= 12
      return { blockId: plan.blockId, characterId: plan.characterId, firstFrame: first, lastFrame: last, changedPixels, visible }
    })
    const invisible = motionResults.filter((result) => !result.visible)
    if (invisible.length) throw Error(`${invisible.length} transições não alteraram pixels suficientes do personagem no MP4 decodificado: ${JSON.stringify(invisible.slice(0, 8))}`)

    const summary = {
      passed: true, outputPath, reportPath, frames: report.totalFrames, durationSeconds: Number(probe.format?.duration ?? 0),
      fps: video.r_frame_rate, audioClips: report.audioClips, videoInputs: report.videoInputs, audioOutput: false,
      motionAtlasesPersisted: plans.length, motionTransitionsNewlyPreparedDuringExport: report.motionTransitionsPrepared,
      motionTransitionsDecodedAndVisible: motionResults.length,
      decodedSampleFrames: sampleFrames.length,
      visualChecks: motionResults
    }
    await writeFile(join(outputFolder, 'stress-export-validation.json'), JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify({ ...summary, visualChecks: `${motionResults.length} transições verificadas` }, null, 2))
  } finally { factory.dispose() }
}

const timeout = setTimeout(() => { console.error('A exportação de estresse excedeu 30 minutos.'); app.exit(1) }, 30 * 60 * 1000)
void main().then(() => { clearTimeout(timeout); app.exit(0) }, (error: unknown) => { clearTimeout(timeout); console.error('[V6 stress export] Falha:', error); app.exit(1) })
