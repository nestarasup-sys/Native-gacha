'use strict'

// Create an immutable, hash-verified input bundle for the one project allowed
// by the export mission. The app profile is read only; benchmark output is
// written to a unique directory under out/editor-v6-stress/backups.
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const PROJECT_TITLE = 'Teste de Importação — Personagens do Pacote'

async function inventory(source) {
  const entries = []
  async function visit(current, relative = '') {
    const info = await fs.lstat(current)
    if (info.isSymbolicLink()) throw Error(`Link simbólico recusado na fonte ${relative || path.basename(current)}.`)
    if (info.isDirectory()) {
      const children = await fs.readdir(current, { withFileTypes: true })
      children.sort((left, right) => left.name.localeCompare(right.name))
      for (const child of children) await visit(path.join(current, child.name), relative ? `${relative}/${child.name}` : child.name)
      return
    }
    if (!info.isFile()) throw Error(`Tipo de arquivo não suportado na fonte ${relative}.`)
    const digest = crypto.createHash('sha256')
    const bytes = await fs.readFile(current)
    digest.update(bytes)
    entries.push({ path: relative, bytes: info.size, sha256: digest.digest('hex') })
  }
  await visit(source)
  return entries
}

function sameInventory(left, right) {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index]
    return other && entry.path === other.path && entry.bytes === other.bytes && entry.sha256 === other.sha256
  })
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const appData = path.join(root, 'app-data')
  const profile = path.join(appData, 'runtime', 'profile')
  const projectsRoot = path.join(profile, 'studios', 'Editor V6')
  const projectMatches = []
  for (const entry of await fs.readdir(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('editorV6-')) continue
    const candidate = path.join(projectsRoot, entry.name)
    try {
      const candidateManifest = JSON.parse(await fs.readFile(path.join(candidate, 'editorV6.json'), 'utf8'))
      if (candidateManifest.title?.trim() === PROJECT_TITLE) projectMatches.push({ folder: candidate, manifest: candidateManifest })
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }
  if (projectMatches.length !== 1) throw Error(`Esperava um único projeto autorizado "${PROJECT_TITLE}"; encontrados: ${projectMatches.length}.`)
  const { folder: projectSource, manifest } = projectMatches[0]
  const sources = [
    ['project', projectSource],
    ['library', path.join(profile, 'studios', 'Editor Gacha', 'media-library')],
    ['characters', path.join(profile, 'customizer', 'characters', 'characters.json')],
    ['fabricator', path.join(profile, 'fabricator')]
  ]
  if (manifest.id !== path.basename(projectSource).slice('editorV6-'.length) || !Number.isSafeInteger(manifest.timeline?.durationFrames) || manifest.timeline.durationFrames < 1) {
    throw Error('A fonte não corresponde ao projeto autorizado ou não possui duração válida; nada foi copiado.')
  }
  for (const [, source] of sources) await fs.access(source)

  const backupRoot = path.join(root, 'out', 'editor-v6-stress', 'backups')
  await fs.mkdir(backupRoot, { recursive: true })
  const output = path.join(backupRoot, `authorized-import-package-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  await fs.mkdir(output, { recursive: false })
  const emptyMotionCache = path.join(output, 'motion-cache')
  await fs.mkdir(emptyMotionCache)
  const before = new Map()
  for (const [name, source] of sources) before.set(name, await inventory(source))
  for (const [name, source] of sources) {
    const destination = path.join(output, name)
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
  }
  const copied = new Map()
  for (const [name] of sources) copied.set(name, await inventory(path.join(output, name)))
  const after = new Map()
  for (const [name, source] of sources) after.set(name, await inventory(source))
  for (const [name] of sources) {
    if (!sameInventory(before.get(name), copied.get(name)) || !sameInventory(before.get(name), after.get(name))) {
      throw Error(`A verificação SHA-256 falhou para ${name}; origens e cópia foram preservadas em ${output}.`)
    }
  }
  const summary = Object.fromEntries(sources.map(([name]) => {
    const files = copied.get(name)
    return [name, { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), entries: files }]
  }))
  summary['motion-cache'] = { files: 0, bytes: 0, entries: [] }
  const backupManifest = {
    schemaVersion: 1, verified: true, createdAt: new Date().toISOString(),
    project: { id: manifest.id, title: manifest.title, updatedAt: manifest.updatedAt, durationFrames: manifest.timeline.durationFrames, fps: manifest.timeline.fps ?? 30 },
    sources: summary
  }
  await fs.writeFile(path.join(output, 'backup-manifest.json'), JSON.stringify(backupManifest, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ verified: true, output, project: backupManifest.project,
    sources: Object.fromEntries(Object.entries(summary).map(([name, value]) => [name, { files: value.files, bytes: value.bytes }])) }, null, 2))
}

main().catch(error => {
  console.error(`Backup do projeto autorizado falhou; nenhuma origem foi alterada. ${error.message}`)
  process.exitCode = 1
})
