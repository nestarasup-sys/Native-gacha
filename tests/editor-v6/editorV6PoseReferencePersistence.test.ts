import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditorV6Timeline } from '../../src/shared/editorV6'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6LibraryIndex } from '../../electron/domains/editorV6/libraryIndex'

const projectId = '12345678-1234-4abc-8abc-123456789abc'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('inventário leve de poses do Editor V6', () => {
  it('lê poses de cena e timeline sem carregar imagens do projeto', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'native-editor-pose-references-'))
    roots.push(root)
    const projectPath = (id: string) => join(root, `editorV6-${id}`)
    const actor = {
      id: 'actor-1', kind: 'character' as const, characterId: 'character-1', poseSlot: 7,
      text: 'Lia', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1
    }
    const folder = projectPath(projectId)
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(join(folder, 'editorV6.json'), JSON.stringify({
      id: projectId, title: 'Animação', elements: [actor], timeline: createEditorV6Timeline([actor])
    }))

    const persistence = createEditorV6DocumentPersistence({
      files: {
        ...fs,
        readFile: async (path, ...args) => {
          if (String(path).endsWith('.png')) throw new Error('O inventário não deve abrir imagens')
          return fs.readFile(path, ...args)
        }
      },
      editorV6Path: projectPath,
      editorV6LibraryPath: () => root,
      validate: () => true,
      assertLibraryVideoReferencesAvailable: async () => undefined,
      decodeImage: (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'),
      normalizeImage: async (bytes) => ({ bytes })
    })

    const references = await persistence.readEditorV6PoseReferences(projectId)
    expect(references?.elements[0]?.poseSlot).toBe(7)
    expect(references?.timeline.tracks.flatMap((track) => track.blocks).some((block) => block.state?.poseSlot === 7)).toBe(true)
    expect(await persistence.readEditorV6PoseReferences('12345678-1234-4abc-8abc-123456789abd')).toBeNull()

    const library = createEditorV6LibraryIndex({
      files: fs, editorV6LibraryPath: () => root,
      readEditorV6Summary: async () => null,
      readEditorV6PoseReferences: persistence.readEditorV6PoseReferences
    })
    expect(await library.listEditorV6s()).toHaveLength(0)
    expect(await library.listEditorV6PoseReferenceDocuments()).toHaveLength(1)
  })

  it('propaga falhas de recuperação em vez de esconder um possível vínculo', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'native-editor-pose-recovery-'))
    roots.push(root)
    const folder = join(root, `editorV6-${projectId}`)
    const journalRoot = join(folder, '.editorV6-assets-transaction')
    await fs.mkdir(journalRoot, { recursive: true })
    await fs.writeFile(join(journalRoot, 'journal.json'), JSON.stringify({
      schemaVersion: 1, previousHash: '0'.repeat(64), nextHash: '1'.repeat(64),
      entries: [{ relativePath: 'assets/characters/orphan.png', backedUp: true }]
    }))
    const persistence = createEditorV6DocumentPersistence({
      files: fs,
      editorV6Path: (id) => join(root, `editorV6-${id}`),
      editorV6LibraryPath: () => root,
      validate: () => true,
      assertLibraryVideoReferencesAvailable: async () => undefined,
      decodeImage: () => Buffer.alloc(0),
      normalizeImage: async (bytes) => ({ bytes })
    })

    await expect(persistence.readEditorV6PoseReferences(projectId)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
