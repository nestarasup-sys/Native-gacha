import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEditorV7Document } from '../../src/shared/editorV7.ts'
import { editorV6ElementSize } from '../../src/shared/editorV6SceneModel.ts'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene.ts'
import { planEditorV6VideoOverlays } from '../../src/shared/editorV6VideoComposition.ts'
import { runEditorV7Export } from '../../electron/domains/editorV7/exportRunner.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const backupRoot = join(root, 'out', 'editor-v6-stress', 'backups')
const runRoot = join(root, 'out', 'editor-v7-stress', 'runs')
const authorizedTitle = 'Teste de Importação — Personagens do Pacote'
const authorizedId = '2d6fb9ec-cfea-45ea-91ff-366fbc1abd59'
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1)
const isInside = (base, target) => {
  const relativePath = relative(base, target)
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
}

async function selectBackup() {
  const requested = argument('--backup')
  const candidates = requested ? [resolve(requested)] : (await readdir(backupRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('authorized-import-package-'))
    .map((entry) => join(backupRoot, entry.name)).reverse()
  for (const folder of candidates) {
    if (!isInside(backupRoot, folder)) throw Error('O backup precisa estar dentro da área de backups autorizados.')
    try {
      const manifest = JSON.parse(await readFile(join(folder, 'backup-manifest.json'), 'utf8'))
      if (manifest.verified === true && manifest.project?.id === authorizedId && manifest.project?.title === authorizedTitle) return { folder, manifest }
    } catch {}
  }
  throw Error(`Não encontrei um backup verificado do projeto autorizado “${authorizedTitle}”.`)
}

async function verifyBackupSource(folder, manifest, sourceName) {
  const sourceRoot = join(folder, sourceName)
  const expected = manifest.sources?.[sourceName]?.entries
  if (!Array.isArray(expected) || expected.length < 1) throw Error(`O manifesto verificado não contém hashes da fonte ${sourceName} do projeto autorizado.`)
  for (const entry of expected) {
    const target = resolve(sourceRoot, ...entry.path.split('/'))
    if (!isInside(sourceRoot, target)) throw Error('O manifesto do backup contém um caminho fora do projeto.')
    let current = sourceRoot
    for (const part of entry.path.split('/')) {
      current = join(current, part)
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw Error(`Link simbólico recusado no backup autorizado: ${entry.path}.`)
    }
    const bytes = await readFile(target)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== entry.bytes || digest !== entry.sha256) throw Error(`A verificação SHA-256 falhou em ${entry.path}.`)
  }
  return sourceRoot
}

async function imageData(sourceRoot, asset) {
  const folders = { background: 'backgrounds', object: 'objects', character: 'characters' }
  const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
  const folder = folders[asset.category], extension = extensions[asset.mimeType]
  if (!folder || !extension || !/^[0-9a-f-]{36}$/i.test(asset.id)) return null
  const path = join(sourceRoot, 'assets', folder, `${asset.id}${extension}`)
  const bytes = await readFile(path)
  return `data:${asset.mimeType};base64,${bytes.toString('base64')}`
}

async function makeDocument(sourceRoot, source, frameCount) {
  const fps = source.timeline.fps ?? 30
  if (fps !== 30) throw Error('O gate inicial da nova arquitetura foi configurado para o projeto autorizado a 30 FPS.')
  const duration = Math.min(frameCount, source.timeline.durationFrames)
  const doc = createEditorV7Document(`v7-authorized-${source.id}`, authorizedTitle, { width: 1920, height: 1080, fps, durationFrames: duration })
  doc.background.color = /^#[0-9a-f]{6}$/i.test(source.backgroundColor) ? source.backgroundColor : '#ffffff'
  const assetsById = new Map(source.assets.map((asset) => [asset.id, asset]))
  const used = new Set()
  const addAsset = async (assetId) => {
    if (!assetId || used.has(assetId)) return
    const sourceAsset = assetsById.get(assetId)
    if (!sourceAsset) return
    const dataUrl = await imageData(sourceRoot, sourceAsset)
    if (!dataUrl) return
    doc.assets.push({ id: sourceAsset.id, name: sourceAsset.name.slice(0, 240), mimeType: sourceAsset.mimeType, dataUrl })
    used.add(assetId)
  }
  const transformFor = (element) => {
    const size = editorV6ElementSize(element), width = size.width * 19.2, height = size.height * 10.8
    return { x: (50 + element.x) * 19.2 - width / 2, y: (50 + element.y) * 10.8 - height / 2, width, height, rotation: element.rotation, opacity: 1, flipX: element.flipX ?? false }
  }
  const active = new Map()
  const endLayer = (id, frame) => {
    const record = active.get(id)
    if (record) { record.layer.endTick = Math.max(record.layer.startTick + 1, Math.round(frame * 90_000 / fps)); active.delete(id); doc.layers.push(record.layer) }
  }
  const beginLayer = async (id, state, frame) => {
    const startTick = Math.round(frame * 90_000 / fps)
    if ((state.kind === 'character' || state.kind === 'image') && state.assetId) {
      await addAsset(state.assetId)
      if (!used.has(state.assetId)) return
      const layer = { id: `${id}@${frame}`, name: state.text.slice(0, 240), assetId: state.assetId, startTick, endTick: doc.durationTicks, transform: transformFor(state), preserveAspectRatio: state.kind === 'character' ? 'none' : 'xMidYMid meet', visible: true, zIndex: state.zIndex }
      active.set(id, { signature: JSON.stringify([state.assetId, layer.transform, state.visible]), layer })
    } else if (state.kind === 'speech' || state.kind === 'thought' || state.kind === 'narrator') {
      const layer = { id: `${id}@${frame}`, name: state.text.slice(0, 240), text: state.text, textKind: state.kind === 'narrator' ? 'plain' : state.kind, textColor: '#352d35', ...(state.speakerName ? { speakerName: state.speakerName } : {}), startTick, endTick: doc.durationTicks, transform: transformFor(state), visible: true, zIndex: state.zIndex }
      active.set(id, { signature: JSON.stringify([state.kind, state.text, layer.transform, state.speakerName]), layer })
    }
  }
  for (let frame = 0; frame < duration; frame += 1) {
    const scene = resolveEditorV6SceneAtFrame(source, frame)
    const states = new Map()
    for (const element of scene.elements) states.set(element.id, element)
    for (const id of [...active.keys()]) if (!states.has(id)) endLayer(id, frame)
    for (const [id, state] of states) {
      const old = active.get(id)
      const signature = state.kind === 'character' || state.kind === 'image'
        ? JSON.stringify([state.assetId, transformFor(state), state.visible])
        : JSON.stringify([state.kind, state.text, transformFor(state), state.speakerName])
      if (old?.signature === signature) continue
      if (old) endLayer(id, frame)
      await beginLayer(id, state, frame)
      const next = active.get(id)
      if (next) next.signature = signature
    }
    const bg = scene.background
    const bgState = { kind: 'image', id: '__background__', text: 'Background', assetId: bg.backgroundAssetId, x: bg.backgroundX, y: bg.backgroundY, width: bg.backgroundWidth, height: bg.backgroundHeight, rotation: bg.backgroundRotation, zIndex: -10_000, visible: true }
    const bgSignature = JSON.stringify([bg.backgroundColor, bg.backgroundAssetId, bg.backgroundX, bg.backgroundY, bg.backgroundWidth, bg.backgroundHeight, bg.backgroundRotation])
    if (active.get('__background__')?.signature !== bgSignature) {
      endLayer('__background__', frame)
      if (bg.backgroundAssetId) await beginLayer('__background__', bgState, frame)
      const next = active.get('__background__')
      if (next) next.signature = bgSignature
    }
  }
  for (const id of [...active.keys()]) endLayer(id, duration)
  doc.background.color = /^#[0-9a-f]{6}$/i.test(source.backgroundColor) ? source.backgroundColor : '#ffffff'
  if (!doc.layers.length) throw Error('A timeline do projeto autorizado não contém camadas exportáveis.')
  return { document: doc, durationFrames: duration }
}

async function main() {
  const frameCountValue = argument('--frames')
  const frameCount = frameCountValue === undefined ? 30 : Number(frameCountValue)
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > 2_394) throw Error('--frames aceita um inteiro de 1 a 2394.')
  const backup = await selectBackup()
  const sourceRoot = await verifyBackupSource(backup.folder, backup.manifest, 'project')
  const libraryRoot = await verifyBackupSource(backup.folder, backup.manifest, 'library')
  const source = JSON.parse(await readFile(join(sourceRoot, 'editorV6.json'), 'utf8'))
  if (source.id !== authorizedId || source.title?.trim() !== authorizedTitle || source.timeline?.durationFrames !== backup.manifest.project.durationFrames) throw Error('O documento fonte não corresponde ao projeto autorizado registrado no backup.')
  const fps = source.timeline.fps ?? 30
  const runFolder = join(runRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  if (!isInside(runRoot, runFolder)) throw Error('Caminho de saída fora da pasta V7 aprovada.')
  await mkdir(runRoot, { recursive: true })
  await mkdir(runFolder, { recursive: false })
  const { document, durationFrames } = await makeDocument(sourceRoot, source, frameCount)
  const videoOverlays = planEditorV6VideoOverlays(source, 0, durationFrames).map((clip) => {
    if (!clip.libraryVideoId || !/^[0-9a-f-]{36}$/i.test(clip.libraryVideoId)) throw Error(`O clipe ${clip.blockId} não aponta para um vídeo estável da biblioteca autorizada.`)
    const media = source.media.find((item) => item.libraryVideoId === clip.libraryVideoId)
    if (!media) throw Error(`Não encontrei metadados de áudio/vídeo para ${clip.blockId}.`)
    const path = join(libraryRoot, 'videos', `${clip.libraryVideoId}.mp4`)
    return { path, startFrame: clip.startFrame, endFrame: clip.endFrame, mediaInFrame: clip.mediaInFrame, layout: clip.layout,
      audioEnabled: media.hasAudio && source.timeline.tracks.some((track) => track.kind === 'video' && !track.muted && !track.hidden && track.blocks.some((block) => block.id === clip.blockId && block.audioEnabled !== false)),
      gain: source.timeline.tracks.flatMap((track) => track.blocks).find((block) => block.id === clip.blockId)?.gain ?? 1 }
  })
  for (const clip of videoOverlays) await readFile(clip.path)
  const outputPath = join(runFolder, 'authorized-project-v7.mp4')
  const ffmpeg = join(root, 'resources', 'video-tools', 'ffmpeg.exe')
  const ffprobe = join(root, 'resources', 'video-tools', 'ffprobe.exe')
  const started = performance.now()
  const result = await runEditorV7Export({ document, ffmpeg, ffprobe, outputPath, videoOverlays, signal: new AbortController().signal, onProgress: (frames, total) => {
    if (frames === 1 || frames % 30 === 0 || frames === total) process.stdout.write(`V7 export ${frames}/${total}\n`)
  } })
  const output = await readFile(outputPath)
  const report = { schemaVersion: 2, projectId: source.id, projectTitle: source.title, backupVerified: true,
    sourceFileHashesVerified: { project: backup.manifest.sources.project.entries.length, library: backup.manifest.sources.library.entries.length },
    durationFrames, fps, width: document.width, height: document.height, v7Layers: document.layers.length, v7TextLayers: document.layers.filter((layer) => layer.text !== undefined).length, v7ImageAssets: document.assets.length,
    videoClips: videoOverlays.length, audioVideoClips: videoOverlays.filter((clip) => clip.audioEnabled).length, timelineTrackCount: source.timeline.tracks.length, timelineBlockCount: source.timeline.tracks.reduce((count, track) => count + track.blocks.length, 0),
    encoder: result.encoder, exportMilliseconds: result.milliseconds, renderMilliseconds: result.renderingMilliseconds, encoderBackpressureMilliseconds: result.encoderBackpressureMilliseconds,
    endToEndMilliseconds: Math.round(performance.now() - started), mp4Bytes: output.length,
    mp4Sha256: createHash('sha256').update(output).digest('hex'), outputPath, ...(result.mediaDecodeWarning ? { mediaDecodeWarning: result.mediaDecodeWarning } : {}) }
  await writeFile(join(runFolder, 'authorized-project-v7-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => { process.stderr.write(`Export V7 do projeto autorizado falhou: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
