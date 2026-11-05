import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEditorV7Document } from '../../src/shared/editorV7.ts'
import { editorV6ElementSize } from '../../src/shared/editorV6SceneModel.ts'
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

async function verifyProjectBackup(folder, manifest) {
  const sourceRoot = join(folder, 'project')
  const expected = manifest.sources?.project?.entries
  if (!Array.isArray(expected) || expected.length < 1) throw Error('O manifesto verificado não contém hashes do projeto autorizado.')
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
  const used = new Map()
  const addAsset = async (assetId) => {
    if (!assetId) return undefined
    if (used.has(assetId)) return used.get(assetId)
    const sourceAsset = assetsById.get(assetId)
    if (!sourceAsset) return undefined
    const dataUrl = await imageData(sourceRoot, sourceAsset)
    if (!dataUrl) return undefined
    const asset = { id: sourceAsset.id, name: sourceAsset.name.slice(0, 240), mimeType: sourceAsset.mimeType, dataUrl }
    used.set(assetId, asset)
    doc.assets.push(asset)
    return asset
  }
  if (source.backgroundAssetId) {
    const asset = await addAsset(source.backgroundAssetId)
    if (asset) {
      const width = source.backgroundWidth * 19.2, height = source.backgroundHeight * 10.8
      doc.layers.push({ id: `background-${asset.id}`, name: 'Background', assetId: asset.id, startTick: 0, endTick: doc.durationTicks,
        transform: { x: (50 + source.backgroundX) * 19.2 - width / 2, y: (50 + source.backgroundY) * 10.8 - height / 2, width, height, rotation: source.backgroundRotation, opacity: 1, flipX: false }, preserveAspectRatio: 'none', visible: true, zIndex: -10_000 })
    }
  }
  for (const element of source.elements) {
    if (element.visible === false || (element.kind !== 'character' && element.kind !== 'image')) continue
    const asset = await addAsset(element.assetId)
    if (!asset) continue
    const size = editorV6ElementSize(element), width = size.width * 19.2, height = size.height * 10.8
    doc.layers.push({ id: element.id, name: element.text.slice(0, 240), assetId: asset.id, startTick: 0, endTick: doc.durationTicks,
      transform: { x: (50 + element.x) * 19.2 - width / 2, y: (50 + element.y) * 10.8 - height / 2, width, height, rotation: element.rotation, opacity: 1, flipX: element.flipX ?? false },
      preserveAspectRatio: element.kind === 'character' ? 'none' : 'xMidYMid meet', visible: true, zIndex: element.zIndex })
  }
  if (!doc.layers.length) throw Error('O frame/cena atual do projeto autorizado não contém camadas de imagem exportáveis.')
  return { document: doc, durationFrames: duration }
}

async function main() {
  const frameCountValue = argument('--frames')
  const frameCount = frameCountValue === undefined ? 30 : Number(frameCountValue)
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > 2_394) throw Error('--frames aceita um inteiro de 1 a 2394.')
  const backup = await selectBackup()
  const sourceRoot = await verifyProjectBackup(backup.folder, backup.manifest)
  const source = JSON.parse(await readFile(join(sourceRoot, 'editorV6.json'), 'utf8'))
  if (source.id !== authorizedId || source.title?.trim() !== authorizedTitle || source.timeline?.durationFrames !== backup.manifest.project.durationFrames) throw Error('O documento fonte não corresponde ao projeto autorizado registrado no backup.')
  const fps = source.timeline.fps ?? 30
  const runFolder = join(runRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  if (!isInside(runRoot, runFolder)) throw Error('Caminho de saída fora da pasta V7 aprovada.')
  await mkdir(runRoot, { recursive: true })
  await mkdir(runFolder, { recursive: false })
  const { document, durationFrames } = await makeDocument(sourceRoot, source, frameCount)
  const outputPath = join(runFolder, 'authorized-project-v7.mp4')
  const ffmpeg = join(root, 'resources', 'video-tools', 'ffmpeg.exe')
  const ffprobe = join(root, 'resources', 'video-tools', 'ffprobe.exe')
  const started = performance.now()
  const result = await runEditorV7Export({ document, ffmpeg, ffprobe, outputPath, signal: new AbortController().signal, onProgress: (frames, total) => {
    if (frames === 1 || frames % 30 === 0 || frames === total) process.stdout.write(`V7 export ${frames}/${total}\n`)
  } })
  const output = await readFile(outputPath)
  const report = { schemaVersion: 1, projectId: source.id, projectTitle: source.title, backupVerified: true, sourceFileHashesVerified: backup.manifest.sources.project.entries.length,
    durationFrames, fps, width: document.width, height: document.height, v7ImageLayers: document.layers.length, v7ImageAssets: document.assets.length,
    encoder: result.encoder, exportMilliseconds: result.milliseconds, renderMilliseconds: result.renderingMilliseconds, encoderBackpressureMilliseconds: result.encoderBackpressureMilliseconds,
    endToEndMilliseconds: Math.round(performance.now() - started), mp4Bytes: output.length,
    mp4Sha256: createHash('sha256').update(output).digest('hex'), outputPath }
  await writeFile(join(runFolder, 'authorized-project-v7-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => { process.stderr.write(`Export V7 do projeto autorizado falhou: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
