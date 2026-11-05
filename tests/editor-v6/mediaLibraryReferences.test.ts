import { describe, expect, it } from 'vitest'
import { createEditorV6MediaReferenceIndex, collectEditorV6LibraryReferenceIds } from '../../electron/domains/editorV6/mediaReferences'

const itemId = '22345678-1234-4abc-8abc-123456789abc'
const projects = [{ id: '12345678-1234-4abc-8abc-123456789abc', title: 'Teste V6', color: '#ffffff', createdAt: '', updatedAt: '' }]

describe('referências por ID à biblioteca de mídia V6', () => {
  it('localiza fundo/objeto por categoria e áudio em timeline ou mixagem', async () => {
    const manifest = {
      assets: [{ id: itemId, libraryAssetId: itemId, category: 'object' }],
      media: [{ id: itemId, libraryAudioId: itemId }],
      exportAudio: [{ id: 'clip', libraryAudioId: itemId }]
    }
    expect(collectEditorV6LibraryReferenceIds(manifest, 'object')).toEqual(new Set([itemId]))
    expect(collectEditorV6LibraryReferenceIds(manifest, 'background')).toEqual(new Set())
    expect(collectEditorV6LibraryReferenceIds(manifest, 'audio')).toEqual(new Set([itemId]))
    const index = createEditorV6MediaReferenceIndex({ listProjects: async () => projects, readManifest: async () => manifest })
    expect(await index.references('audio', itemId)).toEqual([{ projectId: projects[0].id, title: 'Teste V6' }])
    await expect(index.assertUnreferenced('audio', itemId)).rejects.toThrow(/vinculado pelo ID/)
    await expect(index.assertUnreferenced('background', itemId)).resolves.toBeUndefined()
  })
})
