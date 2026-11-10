import assert from 'node:assert/strict'
import test from 'node:test'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createEditorV6ExportTempFolder,
  removeEditorV6ExportCandidate,
  removeEditorV6ExportTempFolder,
  writeEditorV6ExportReport
} from '../electron/domains/editorV6/exportArtifacts.ts'

async function withTempRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'editor-v6-artifacts-test-'))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('cria uma pasta temporária identificável dentro da raiz configurada', async () => {
  await withTempRoot(async (root) => {
    const tempRoot = join(root, 'temp')
    const folder = await createEditorV6ExportTempFolder(tempRoot)

    assert.equal(folder.startsWith(join(tempRoot, 'editor-v6-export-')), true)
    assert.equal((await readdir(tempRoot)).length, 1)
  })
})

test('substitui relatório de forma atômica sem deixar arquivos temporários', async () => {
  await withTempRoot(async (root) => {
    const reportPath = join(root, 'reports', 'export.json')
    await writeEditorV6ExportReport(reportPath, { state: 'rendering', attempt: 1 })
    await writeEditorV6ExportReport(reportPath, { state: 'completed', attempt: 2 })

    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), { state: 'completed', attempt: 2 })
    assert.deepEqual(await readdir(join(root, 'reports')), ['export.json'])
  })
})

test('remove arquivo temporário de relatório se rename falhar', async () => {
  await withTempRoot(async (root) => {
    const reportPath = join(root, 'target-directory')
    await mkdir(reportPath)

    await assert.rejects(writeEditorV6ExportReport(reportPath, { state: 'failed' }))

    assert.deepEqual(await readdir(root), ['target-directory'])
  })
})

test('remove candidato ausente como sucesso, mas propaga falhas diferentes de ENOENT', async () => {
  await withTempRoot(async (root) => {
    const candidate = join(root, 'candidate.mp4')
    await removeEditorV6ExportCandidate(candidate)
    await mkdir(candidate)

    await assert.rejects(removeEditorV6ExportCandidate(candidate))
    await access(candidate)
  })
})

test('remove apenas pastas com prefixo de export dentro da raiz temporária', async () => {
  await withTempRoot(async (root) => {
    const tempRoot = join(root, 'temp')
    const otherRoot = join(root, 'outside')
    await mkdir(otherRoot)
    const generated = await createEditorV6ExportTempFolder(tempRoot)
    const outside = await mkdtemp(join(otherRoot, 'editor-v6-export-outside-'))
    const wrongPrefix = await mkdtemp(join(tempRoot, 'other-temp-'))
    await writeFile(join(generated, 'frame.bin'), 'synthetic')

    assert.equal(await removeEditorV6ExportTempFolder(tempRoot, generated), true)
    assert.equal(await removeEditorV6ExportTempFolder(tempRoot, tempRoot), false)
    assert.equal(await removeEditorV6ExportTempFolder(tempRoot, outside), false)
    assert.equal(await removeEditorV6ExportTempFolder(tempRoot, wrongPrefix), false)
    await access(outside)
    await access(wrongPrefix)
    await assert.rejects(access(generated))
  })
})
