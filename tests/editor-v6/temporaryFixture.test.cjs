const test = require('node:test')
const assert = require('node:assert/strict')
const { access, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { removeEditorV6TemporaryFixture } = require('../../scripts/editor-v6/temporaryFixture.cjs')

test('remove fixture sintético próprio criado diretamente na pasta temporária', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-cleanup-test-'))
  const sentinel = join(folder, 'synthetic-profile.txt')
  await writeFile(sentinel, 'somente fixture sintético')

  try {
    await removeEditorV6TemporaryFixture(folder, 'editor-v6-cleanup-test-')
    await assert.rejects(access(folder))
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('preserva diretório temporário com prefixo diferente', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'not-an-editor-v6-fixture-'))
  const sentinel = join(folder, 'keep.txt')
  await writeFile(sentinel, 'não remover')

  try {
    await assert.rejects(removeEditorV6TemporaryFixture(folder, 'editor-v6-cleanup-test-'), /prefixo deste fixture/)
    assert.equal(await readFile(sentinel, 'utf8'), 'não remover')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('recusa caminhos fora da raiz temporária do sistema', async () => {
  await assert.rejects(removeEditorV6TemporaryFixture(__filename, 'editor-v6-cleanup-test-'), /filha direta da pasta temporária/)
})
