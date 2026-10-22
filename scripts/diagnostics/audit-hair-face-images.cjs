#!/usr/bin/env node
'use strict'
/** Auditoria APENAS LEITURA para fontes de cabelo e rosto do Fabricador.
 * Não recupera, grava, renomeia nem apaga imagens.
 * Uso: node scripts/diagnostics/audit-hair-face-images.cjs "PASTA_DO_CATALOGO"
 * Detecta hair.json, hair-style.json, face.json ou item.json.
 */
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const PNG_MAGIC = Buffer.from([137,80,78,71,13,10,26,10])
const MANIFESTS = ['hair.json', 'hair-style.json', 'face.json', 'item.json']
const SAFE_ID = /^[a-zA-Z0-9_-]{1,80}$/
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function declaredAssets(filename, data) {
  if (filename === 'hair.json' || filename === 'hair-style.json') {
    const sides = ['front', 'back', 'fringe'].filter(side => data[side])
    if (filename === 'hair.json' && data.sourceImageSaved) sides.push('source')
    return sides.map(side => ({ id: side, relative: side + '.png' }))
  }
  if (!Array.isArray(data.pieces)) throw new Error('Manifesto facial sem lista de peças.')
  const sheets = filename === 'face.json'
    ? Object.keys(data.sheets ?? {}).filter(kind => data.sheets[kind])
    : [data.category]
  if (sheets.some(kind => typeof kind !== 'string' || !SAFE_ID.test(kind)))
    throw new Error('Nome inválido de folha facial.')
  const assets = sheets.map(kind => ({ id: 'sheet-' + kind, relative: 'sheet-' + kind + '.png' }))
  for (const piece of data.pieces) {
    if (typeof piece?.id !== 'string' || !SAFE_ID.test(piece.id)) throw new Error('ID de peça facial inválido.')
    assets.push({ id: piece.id, relative: piece.id + '.png' })
  }
  if (new Set(assets.map(asset => asset.relative)).size !== assets.length)
    throw new Error('IDs de arquivo duplicados no manifesto facial.')
  return assets
}

async function inspectHairFaceCatalog(folder) {
  if (typeof folder !== 'string' || !folder.trim()) throw new Error('Informe a pasta do catálogo.')
  const directory = path.resolve(folder)
  const found = []
  for (const filename of MANIFESTS) {
    try { await fs.access(path.join(directory, filename)); found.push(filename) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (found.length !== 1) throw new Error('Esperado um único manifesto válido de rosto ou cabelo; encontrados: ' + found.length)
  const filename = found[0]
  const manifest = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'))
  if (manifest?.schemaVersion !== 1) throw new Error('Versão de catálogo não suportada.')
  const expected = declaredAssets(filename, manifest)
  const assets = []
  for (const item of expected) {
    const relativePath = path.join('images', item.relative)
    let bytes
    try { bytes = await fs.readFile(path.join(directory, relativePath)) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      assets.push({ id: item.id, filename: relativePath, warning: 'PNG ausente' })
      continue
    }
    assets.push({ id: item.id, filename: relativePath,
      sha256: hash(bytes), byteLength: bytes.byteLength,
      ...(!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? { warning: 'Assinatura PNG inválida' } : {}) })
  }
  const byHash = new Map()
  for (const asset of assets) if (asset.sha256) byHash.set(asset.sha256, [...(byHash.get(asset.sha256) ?? []), asset.id])
  const duplicates = [...byHash].filter(([,ids]) => ids.length > 1)
    .map(([sha256,ids]) => ({ sha256, assetIds: ids }))
  return { schemaVersion: 1, readOnly: true, manifest: filename, id: manifest.id ?? null,
    modelSlot: manifest.modelSlot, assets, duplicateGroups: duplicates,
    note: 'Hashes iguais são indício, não prova de corrupção; imagens de lados simétricos podem ser iguais.' }
}

if (require.main === module) {
  inspectHairFaceCatalog(process.argv[2]).then(report => {
    console.log(JSON.stringify(report, null, 2))
    if (report.assets.some(asset => asset.warning)) process.exitCode = 2
  }).catch(error => { console.error('Auditoria sem alterações falhou:', error.message); process.exitCode = 1 })
}
module.exports = { inspectHairFaceCatalog, declaredAssets }
