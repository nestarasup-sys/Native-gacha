import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
const require = createRequire(import.meta.url)
const { verifyRealUiCaptures, expected } = require('../scripts/fabricator/review-real-ui-captures.cjs')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

test('revisor de capturas exige oito PNGs autênticos, dimensões e SHA256 corretos', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-ui-review-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const baseline = join(root, 'baseline')
  await fs.mkdir(baseline)
  const results = []
  for (const key of expected) {
    const bytes = await sharp({ create: {
      width: 400, height: 300, channels: 4, background: '#aabbcc'
    } }).png().toBuffer()
    const name = key + '.png'
    await fs.writeFile(join(root, name), bytes)
    await fs.writeFile(join(baseline, name), bytes)
    results.push({ section: key, file: name, dimensions: '400x300', sha256: digest(bytes) })
  }
  const manifest = { schemaVersion: 1, mode: 'real-electron-ui', results }
  await fs.writeFile(join(root, 'manifest.json'), JSON.stringify(manifest))
  assert.equal((await verifyRealUiCaptures(root)).verified.length, 8)
  assert.equal((await verifyRealUiCaptures(root, baseline)).mode, 'comparado-com-baseline')
  await fs.writeFile(join(root, 'olhos.png'), Buffer.from('não é PNG'))
  await assert.rejects(verifyRealUiCaptures(root), /SHA256|PNG/)
  await fs.writeFile(join(root, 'olhos.png'), await fs.readFile(join(baseline, 'olhos.png')))
  manifest.results.pop()
  await fs.writeFile(join(root, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(verifyRealUiCaptures(root), /incompleto/)
})
