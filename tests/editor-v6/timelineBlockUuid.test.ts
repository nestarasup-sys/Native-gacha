import { describe, expect, it } from 'vitest'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { editorV6DocumentSchema, parseEditorV6Document } from '../../src/shared/editorV6Schema'

const date = '2026-11-27T12:00:00.000Z'
const blockId = 'a63b33b4-4b4b-5e45-a840-045944922630'
const projectId = '163b33b4-4b4b-4e45-a840-045944922630'

function documentWithBlockId(id: string) {
  return {
    schemaVersion: 1 as const, id: projectId, title: 'IDs de timeline', color: '#d7b5cd', createdAt: date, updatedAt: date,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, assets: [], elements: [],
    timeline: { fps: 30 as const, durationFrames: 30, tracks: [{
      id: '763b33b4-4b4b-4e45-a840-045944922630', kind: 'object' as const, name: 'Objetos', muted: false, locked: false,
      blocks: [{ id, label: 'Bloco externo', startFrame: 0, durationFrames: 30 }]
    }] }
  }
}

describe('identificadores de blocos da timeline', () => {
  it('aceita UUID determinístico v5 no bloco e mantém válidos os demais dados do documento', () => {
    const document = documentWithBlockId(blockId)
    expect(editorV6DocumentSchema.safeParse(document).success).toBe(true)
    expect(parseEditorV6Document(document).timeline.tracks[0].blocks[0].id).toBe(blockId)
  })

  it('mantém UUID v4 obrigatório para IDs de projeto', () => {
    const document = documentWithBlockId(blockId)
    expect(editorV6DocumentSchema.safeParse({ ...document, id: blockId }).success).toBe(false)
  })

  it('continua rejeitando valores que não são UUIDs válidos para blocos', () => {
    expect(editorV6DocumentSchema.safeParse(documentWithBlockId('bloco-externo')).success).toBe(false)
  })

  it('mostra o caminho do campo inválido ao carregar um manifesto', async () => {
    const manifest = { ...documentWithBlockId(blockId), title: '' }
    const files = {
      readFile: async (path: string | Buffer | URL) => {
        if (String(path).replaceAll('\\', '/').endsWith('/editorV6.json')) return Buffer.from(JSON.stringify(manifest))
        throw Object.assign(new Error('not found'), { code: 'ENOENT' })
      },
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      rename: async () => undefined,
      unlink: async () => undefined,
      rm: async () => undefined
    }
    const persistence = createEditorV6DocumentPersistence({
      files: files as never, editorV6Path: () => '/synthetic/editorV6', editorV6LibraryPath: () => '/synthetic',
      validate: () => false, assertLibraryVideoReferencesAvailable: async () => {},
      assertLibraryBackgroundReferencesAvailable: async () => {}, assertLibraryMediaReferencesAvailable: async () => {},
      coordinateLibraryReferenceChange: operation => operation(), decodeImage: () => Buffer.alloc(0),
      normalizeImage: async bytes => ({ bytes })
    })
    await expect(persistence.readEditorV6(projectId)).rejects.toThrow(/title:/)
  })
})
