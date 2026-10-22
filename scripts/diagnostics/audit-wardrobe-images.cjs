#!/usr/bin/env node
'use strict'
/** Diagnóstico SOMENTE LEITURA de um conjunto Roupas Dev.
 * Não corrige automaticamente: PNGs de peças simétricas podem ser idênticos legitimamente.
 * Uso: node scripts/diagnostics/audit-wardrobe-images.cjs "caminho/para/set-UUID"
 */
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10])

async function inspectWardrobeSet(folder) {
  if (typeof folder !== 'string' || !folder.trim()) throw Error('Informe a pasta set-ID do conjunto de roupas.')
  const directory = path.resolve(folder)
  const raw = JSON.parse(await fs.readFile(path.join(directory, 'wardrobe.json'), 'utf8'))
  if (!Array.isArray(raw.components) || raw.schemaVersion !== 1) throw Error('Manifesto do conjunto inválido.')
  const files = []
  const ids = new Set()
  for (const piece of raw.components) {
    if (typeof piece.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(piece.id)) throw Error('ID inválido no manifesto.')
    if (ids.has(piece.id)) throw Error('ID de peça repetido no manifesto: ' + piece.id)
    ids.add(piece.id)
    const file = path.join(directory, 'parts', piece.id + '.png')
    let bytes = null
    let reason = null
    try { bytes = await fs.readFile(file) }
    catch (error) { if (error.code === 'ENOENT') reason = 'PNG ausente'; else throw error }
    if (bytes && !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) reason = 'Assinatura PNG inválida'
    files.push({ id: piece.id, name: piece.name, category: piece.category,
      attachedPartId: piece.attachedPartId, filename: path.relative(directory, file),
      ...(bytes ? { sha256: hash(bytes), byteLength: bytes.length } : {}),
      ...(reason ? { warning: reason } : {}) })
  }
  const byHash = new Map()
  for (const entry of files) if (entry.sha256) byHash.set(entry.sha256, [...(byHash.get(entry.sha256) ?? []), entry.id])
  const duplicateGroups = [...byHash].filter(([,pieceIds])=>pieceIds.length>1)
    .map(([sha256,pieceIds])=>({sha256,componentIds:pieceIds}))
  return { schemaVersion:1, readOnly:true, setId:raw.id, modelSlot:raw.modelSlot,
    components:files, duplicateGroups,
    warning:duplicateGroups.length ? 'Peças com bytes idênticos. Pode ser legítimo; comparar com arquivo original/backup antes de restaurar.' : undefined }
}
if (require.main === module) {
  inspectWardrobeSet(process.argv[2]).then(report => {
    console.log(JSON.stringify(report,null,2))
    if(report.components.some(x=>x.warning))process.exitCode=2
  }).catch(error=>{console.error('Falha ao auditar sem modificar arquivos:',error.message);process.exitCode=1})
}
module.exports={inspectWardrobeSet}
