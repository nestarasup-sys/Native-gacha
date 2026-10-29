import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  publishStudioAssetsAndManifest,
  recoverStudioAssetTransaction
} from '../electron/domains/storage/studioAssetTransaction.ts'
import {
  publishEditorV6AssetsAndManifest,
  recoverEditorV6AssetTransaction
} from '../electron/domains/editorV6/assetTransaction.ts'

const assetPath = 'assets/backgrounds/synthetic.png'
const transactions = [
  {
    name: 'Studio',
    errorDomain: 'Studio',
    manifestName: 'studio.json',
    journalName: '.studio-assets-transaction',
    publish: publishStudioAssetsAndManifest,
    recover: recoverStudioAssetTransaction
  },
  {
    name: 'Editor V6',
    errorDomain: 'EditorV6',
    manifestName: 'editorV6.json',
    journalName: '.editorV6-assets-transaction',
    publish: publishEditorV6AssetsAndManifest,
    recover: recoverEditorV6AssetTransaction
  }
]

async function setup(t, transaction) {
  const parent = await fs.mkdtemp(join(tmpdir(), 'native-asset-manifest-transaction-'))
  t.after(() => fs.rm(parent, { recursive: true, force: true }))
  const folder = join(parent, 'project')
  await fs.mkdir(join(folder, 'assets', 'backgrounds'), { recursive: true })
  await fs.writeFile(join(folder, assetPath), 'PREVIOUS_BYTES')
  await fs.writeFile(join(folder, transaction.manifestName), JSON.stringify({ title: 'OLD' }, null, 2))
  return { parent, folder, asset: join(folder, assetPath), journal: join(folder, transaction.journalName) }
}

for (const transaction of transactions) {
  test(`${transaction.name}: publica manifesto e assets juntos e limpa seu journal`, async t => {
    const { folder, asset, journal } = await setup(t, transaction)
    await transaction.publish({
      files: fs, folder,
      assets: [{ relativePath: assetPath, bytes: Buffer.from('NEW_BYTES') }],
      manifestValue: { title: 'NEW' }
    })

    assert.equal(await fs.readFile(asset, 'utf8'), 'NEW_BYTES')
    assert.equal(JSON.parse(await fs.readFile(join(folder, transaction.manifestName), 'utf8')).title, 'NEW')
    await assert.rejects(fs.access(journal), { code: 'ENOENT' })
  })

  test(`${transaction.name}: falha durante PNG restaura bytes e manifesto antigos`, async t => {
    const { folder, asset } = await setup(t, transaction)
    let injected = false
    const files = {
      ...fs,
      writeFile: async (path, data, ...options) => {
        if (!injected && String(path).endsWith('.png')) {
          injected = true
          await fs.writeFile(path, 'PARTIAL_BYTES')
          throw Error('interrupção sintética durante PNG')
        }
        return fs.writeFile(path, data, ...options)
      }
    }

    await assert.rejects(transaction.publish({
      files, folder,
      assets: [{ relativePath: assetPath, bytes: Buffer.from('NEW_BYTES') }],
      manifestValue: { title: 'NEW' }
    }), /interrupção sintética durante PNG/)
    assert.equal(await fs.readFile(asset, 'utf8'), 'PREVIOUS_BYTES')
    assert.equal(JSON.parse(await fs.readFile(join(folder, transaction.manifestName), 'utf8')).title, 'OLD')
  })

  test(`${transaction.name}: reabertura recupera journal interrompido sem tocar no projeto vizinho`, async t => {
    const { parent, folder, asset, journal } = await setup(t, transaction)
    const neighbor = join(parent, 'neighbor.txt')
    await fs.writeFile(neighbor, 'KEEP')
    await fs.mkdir(journal, { recursive: true })
    await fs.writeFile(join(journal, '0.bak'), 'PREVIOUS_BYTES')
    await fs.writeFile(join(journal, 'journal.json'), JSON.stringify({
      schemaVersion: 1,
      previousHash: 'a'.repeat(64),
      nextHash: 'b'.repeat(64),
      entries: [{ relativePath: assetPath, backedUp: true }]
    }))
    await fs.writeFile(asset, 'CRASH_PARTIAL')

    await transaction.recover(fs, folder)
    assert.equal(await fs.readFile(asset, 'utf8'), 'PREVIOUS_BYTES')
    assert.equal(await fs.readFile(neighbor, 'utf8'), 'KEEP')
    await assert.rejects(fs.access(journal), { code: 'ENOENT' })
  })

  test(`${transaction.name}: manifesto promovido continua confirmado após falha do callback`, async t => {
    const { folder, asset, journal } = await setup(t, transaction)
    await assert.rejects(transaction.publish({
      files: fs, folder,
      assets: [{ relativePath: assetPath, bytes: Buffer.from('COMMITTED_BYTES') }],
      manifestValue: { title: 'COMMITTED' },
      afterCommit: async () => { throw Error('falha pós-promoção') }
    }), /falha pós-promoção/)

    assert.equal(await fs.readFile(asset, 'utf8'), 'COMMITTED_BYTES')
    assert.equal(JSON.parse(await fs.readFile(join(folder, transaction.manifestName), 'utf8')).title, 'COMMITTED')
    await assert.rejects(fs.access(journal), { code: 'ENOENT' })
  })

  test(`${transaction.name}: journal não pode escapar da pasta de assets`, async t => {
    const { parent, folder, journal } = await setup(t, transaction)
    const outside = join(parent, 'escaped.txt')
    await fs.writeFile(outside, 'PROTECTED')
    await fs.mkdir(journal, { recursive: true })
    await fs.writeFile(join(journal, 'journal.json'), JSON.stringify({
      schemaVersion: 1,
      previousHash: null,
      nextHash: 'c'.repeat(64),
      entries: [{ relativePath: 'assets/../../escaped.txt', backedUp: false }]
    }))

    await assert.rejects(transaction.recover(fs, folder), new RegExp(`Caminho de asset fora do ${transaction.errorDomain}`))
    assert.equal(await fs.readFile(outside, 'utf8'), 'PROTECTED')
  })
}
