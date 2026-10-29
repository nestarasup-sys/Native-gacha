const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const USAGE_GROUPS = {
  characters: ['characters'],
  libraries: ['libraries'],
  projects: ['projects'],
  media: ['media'],
  database: ['database'],
  backups: ['backups'],
  cache: ['cache'],
  temporary: ['temp'],
  operations: ['logs', 'crash-dumps', 'manifests'],
  other: [],
  profile: ['runtime/profile', 'cache/electron-session']
}
const ELECTRON_CACHE_NAMES = [
    'Cache', 'Code Cache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GPUCache',
    'GPUPersistentCache', 'GrShaderCache', 'ShaderCache', 'VideoDecodeStats', 'blob_storage', 'Shared Dictionary'
  ]
const ELECTRON_CACHE_NAME_SET = new Set(ELECTRON_CACHE_NAMES.map((name) => name.toLowerCase()))

async function measureTree(root, { excludeNames = null } = {}) {
  let files = 0; let bytes = 0; let unreadable = 0
  try {
    const rootStat = await fsp.lstat(root)
    if (rootStat.isSymbolicLink()) return { files, bytes, unreadable }
    if (rootStat.isFile()) return { files: 1, bytes: rootStat.size, unreadable }
  } catch (error) {
    if (error.code === 'ENOENT') return { files, bytes, unreadable }
    unreadable += 1; return { files, bytes, unreadable }
  }
  async function walk(folder) {
    let entries
    try { entries = await fsp.readdir(folder, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT') return
      unreadable += 1; return
    }
    for (const entry of entries) {
      if (excludeNames?.has(entry.name.toLowerCase())) continue
      const absolute = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) { await walk(absolute); continue }
      if (!entry.isFile()) continue
      try {
        const stat = await fsp.stat(absolute)
        files += 1; bytes += stat.size
      } catch { unreadable += 1 }
    }
  }
  await walk(root)
  return { files, bytes, unreadable }
}

async function getAppDataUsage(dataRoot) {
  const root = path.resolve(dataRoot)
  const rootStat = await fsp.lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || path.resolve(root) !== await fsp.realpath(root)) throw new Error('Raiz app-data não canônica.')
  const result = {}
  for (const [group, relatives] of Object.entries(USAGE_GROUPS)) {
    const accountedRootEntries = new Set(Object.values(USAGE_GROUPS).flat().filter(Boolean).map((relative) => relative.split('/')[0]))
    const roots = group === 'other'
      ? (await fsp.readdir(root, { withFileTypes: true })).filter((entry) => !accountedRootEntries.has(entry.name) && !entry.isSymbolicLink()).map((entry) => path.join(root, entry.name))
      : group === 'cache'
      ? await (async () => {
        const cacheRoot = path.join(root, 'cache')
        let entries = []
        try { entries = await fsp.readdir(cacheRoot, { withFileTypes: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
        const sessionRoot = path.join(cacheRoot, 'electron-session')
        const roots = entries.filter((entry) => entry.name !== 'electron-session' && !entry.isSymbolicLink()).map((entry) => path.join(cacheRoot, entry.name))
        for (const name of ELECTRON_CACHE_NAMES) {
          const candidate = path.join(sessionRoot, name)
          if (fs.existsSync(candidate)) roots.push(candidate)
        }
        return roots
      })()
      : group === 'profile'
      ? relatives.map((relative) => path.join(root, relative)).filter((candidate) => fs.existsSync(candidate))
      : relatives.map((relative) => path.join(root, relative))
    const totals = await Promise.all(roots.map((candidate) => measureTree(candidate, { excludeNames: group === 'profile' ? ELECTRON_CACHE_NAME_SET : null })))
    result[group] = totals.reduce((sum, item) => ({ files: sum.files + item.files, bytes: sum.bytes + item.bytes, unreadable: sum.unreadable + item.unreadable }), { files: 0, bytes: 0, unreadable: 0 })
  }
  return { groups: result, measuredAt: new Date().toISOString() }
}

module.exports = { getAppDataUsage }
