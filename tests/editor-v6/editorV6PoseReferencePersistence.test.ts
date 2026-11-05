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
  it('grava fundos, objetos e áudios compartilhados só como IDs e resolve os IDs ao reabrir', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'native-editor-v6-library-refs-'))
    roots.push(root)
    const backgroundId = '22345678-1234-4abc-8abc-123456789abc'
    const objectId = '32345678-1234-4abc-8abc-123456789abc'
    const audioId = '42345678-1234-4abc-8abc-123456789abc'
    const document = {
      schemaVersion: 1 as const, id: projectId, title: 'Bibliotecas', color: '#d7b5cd',
      createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
      backgroundColor: '#ffffff', backgroundAssetId: backgroundId, backgroundX: 0, backgroundY: 0,
      backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
      assets: [
        { id: backgroundId, category: 'background' as const, name: 'Cenário', mimeType: 'image/png' as const, dataUrl: `gacha-editor-media://asset/${projectId}/${backgroundId}`, libraryAssetId: backgroundId },
        { id: objectId, category: 'object' as const, name: 'Objeto', mimeType: 'image/png' as const, dataUrl: `gacha-editor-media://asset/${projectId}/${objectId}`, libraryAssetId: objectId }
      ], elements: [],
      media: [{ id: audioId, libraryAudioId: audioId, name: 'Trilha', fileName: `${audioId}.mp3`, kind: 'audio' as const, mimeType: 'audio/mpeg', sourceFrames: 90, hasAudio: true, sizeBytes: 4096 }],
      timeline: createEditorV6Timeline([])
    }
    const checked: Array<[string, string[]]> = []
    const persistence = createEditorV6DocumentPersistence({
      files: fs, editorV6Path: (id) => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
      validate: () => true, assertLibraryVideoReferencesAvailable: async () => undefined,
      assertLibraryBackgroundReferencesAvailable: async (ids) => { checked.push(['background', [...ids]]) },
      assertLibraryMediaReferencesAvailable: async (category, ids) => { checked.push([category, [...ids]]) },
      coordinateLibraryReferenceChange: (operation) => operation(),
      decodeImage: (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), normalizeImage: async (bytes) => ({ bytes })
    })

    await persistence.writeEditorV6(document)
    const manifest = JSON.parse(await fs.readFile(join(root, `editorV6-${projectId}`, 'editorV6.json'), 'utf8'))
    expect(manifest.assets.map((asset: { id: string; libraryAssetId?: string; dataUrl?: string }) => ({ id: asset.id, libraryAssetId: asset.libraryAssetId, hasDataUrl: Boolean(asset.dataUrl) }))).toEqual([
      { id: backgroundId, libraryAssetId: backgroundId, hasDataUrl: false },
      { id: objectId, libraryAssetId: objectId, hasDataUrl: false }
    ])
    expect(manifest.media[0].libraryAudioId).toBe(audioId)
    await expect(fs.access(join(root, `editorV6-${projectId}`, 'assets', 'backgrounds', `${backgroundId}.png`))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.access(join(root, `editorV6-${projectId}`, 'media', `${audioId}.mp3`))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(checked).toEqual([['background', [backgroundId]], ['object', [objectId]], ['audio', [audioId]]])
    await expect(persistence.readEditorV6(projectId)).resolves.toMatchObject({
      assets: [{ libraryAssetId: backgroundId, dataUrl: `gacha-editor-media://asset/${projectId}/${backgroundId}` }, { libraryAssetId: objectId, dataUrl: `gacha-editor-media://asset/${projectId}/${objectId}` }],
      media: [{ libraryAudioId: audioId }]
    })
  })

  it('preserva ajustes de balões e cores de nome ao reabrir um roteiro', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'native-editor-v6-settings-'))
    roots.push(root)
    const folder = join(root, `editorV6-${projectId}`)
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(join(folder, 'editorV6.json'), JSON.stringify({
      id: projectId,
      title: 'Balões',
      elements: [],
      timeline: createEditorV6Timeline([]),
      characterNameColors: { 'character-1': '#5277b8' },
      balloonScalePercent: 145,
      balloonOffsetY: -18
    }))
    const persistence = createEditorV6DocumentPersistence({
      files: fs,
      editorV6Path: (id) => join(root, `editorV6-${id}`),
      editorV6LibraryPath: () => root,
      validate: () => true,
      assertLibraryVideoReferencesAvailable: async () => undefined,
      decodeImage: (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'),
      normalizeImage: async (bytes) => ({ bytes })
    })

    await expect(persistence.readEditorV6(projectId)).resolves.toMatchObject({
      characterNameColors: { 'character-1': '#5277b8' },
      balloonScalePercent: 145,
      balloonOffsetY: -18
    })
  })

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
