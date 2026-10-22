import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportModelSourceToDownloads } from '../electron/domains/fabricator/modelSourceExport.ts'

const png = () => {
  const bytes = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(24, 16)
  bytes.writeUInt32BE(24, 20)
  return 'data:image/png;base64,' + bytes.toString('base64')
}
test('exporta PNG no diretório Downloads escolhido pelo Electron, sem alterar fonte', async t => {
  const downloads = await mkdtemp(join(tmpdir(), 'native-gacha-downloads-'))
  t.after(() => rm(downloads, {recursive:true,force:true}))
  const dataUrl = png()
  const first = await exportModelSourceToDownloads(1, dataUrl, downloads)
  const second = await exportModelSourceToDownloads(1, dataUrl, downloads)
  assert.notEqual(first,second)
  assert.match(first,/Native-Gacha-Modelo-01-Model-Source-[a-f0-9-]+\.png$/)
  assert.equal((await readFile(first)).toString('base64'), dataUrl.split(',')[1])
  assert.equal((await readdir(downloads)).length,2)
})
test('bloqueia entradas inválidas e nunca sobrescreve PNG existente', async () => {
  await assert.rejects(exportModelSourceToDownloads(0,png(),'/tmp'),/Slot inválido/)
  await assert.rejects(exportModelSourceToDownloads(1,'data:text/plain;base64,AAAA','/tmp'),/PNG/)
  let options
  await exportModelSourceToDownloads(2,png(),'/tmp',async (_path,_bytes,flags) => { options=flags })
  assert.equal(options.flag,'wx')
})
