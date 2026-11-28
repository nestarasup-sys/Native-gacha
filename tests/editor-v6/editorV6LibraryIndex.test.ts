import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6LibraryIndex } from '../../electron/domains/editorV6/libraryIndex'

const goodId = '163b33b4-4b4b-4e45-a840-045944922630'
const brokenId = '263b33b4-4b4b-4e45-a840-045944922630'
const emptyId = '363b33b4-4b4b-4e45-a840-045944922630'
const unreadableId = '463b33b4-4b4b-4e45-a840-045944922630'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('índice da biblioteca do Editor V6', () => {
  it('mantém projetos íntegros visíveis e reporta manifestos inválidos sem ocultar a causa', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'editor-v6-library-index-'))
    roots.push(root)
    await Promise.all([goodId, brokenId, emptyId, unreadableId].map(id => fs.mkdir(join(root, `editorV6-${id}`))))
    await fs.writeFile(join(root, `editorV6-${brokenId}`, 'editorV6.json'), JSON.stringify({ id: goodId }))
    const good: EditorV6ProjectSummary = {
      id: goodId, title: 'Projeto íntegro', color: '#ffffff', createdAt: '2026-11-25T12:00:00.000Z',
      updatedAt: '2026-11-25T12:00:00.000Z'
    }
    const persistence = createEditorV6DocumentPersistence({
      files: fs, editorV6Path: id => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
      validate: (value): value is EditorV6Document => editorV6DocumentSchema.safeParse(value).success,
      assertLibraryVideoReferencesAvailable: async () => {}, assertLibraryBackgroundReferencesAvailable: async () => {},
      assertLibraryMediaReferencesAvailable: async () => {}, coordinateLibraryReferenceChange: operation => operation(),
      decodeImage: data => Buffer.from(data.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes })
    })
    const library = createEditorV6LibraryIndex({
      files: fs,
      editorV6LibraryPath: () => root,
      readEditorV6Summary: id => id === goodId
        ? Promise.resolve(good)
        : id === unreadableId ? Promise.reject(new Error('')) : persistence.readEditorV6Summary(id),
      readEditorV6PoseReferences: async () => null
    })

    const projects = await library.listEditorV6s()
    expect(projects).toContainEqual(good)
    expect(projects).toHaveLength(4)
    expect(projects[1]).toMatchObject({
      id: brokenId,
      title: `Projeto indisponível · ${brokenId.slice(0, 8)}`,
      unavailableReason: `O manifesto do Editor V6 ${brokenId} tem identificador incompatível.`
    })
    expect(projects[2]).toMatchObject({ id: emptyId, unavailableReason: 'O manifesto do projeto não foi encontrado.' })
    expect(projects[3]).toMatchObject({ id: unreadableId, unavailableReason: 'O manifesto do projeto não pôde ser lido.' })
  })
})
