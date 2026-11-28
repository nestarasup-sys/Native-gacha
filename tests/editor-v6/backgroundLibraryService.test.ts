import { describe, expect, it, vi } from 'vitest'
import { createBackgroundLibraryService } from '../../electron/domains/mediaLibrary/backgroundLibraryService'

const backgrounds = [
  { id: '12345678-1234-4abc-8abc-123456789abc', name: 'um.png', mimeType: 'image/png' as const, extension: 'png' as const, size: 12, createdAt: '2026-11-01T00:00:00.000Z', available: true, studios: [] },
  { id: '22345678-1234-4abc-8abc-123456789abc', name: 'dois.png', mimeType: 'image/png' as const, extension: 'png' as const, size: 14, createdAt: '2026-11-02T00:00:00.000Z', available: true, studios: [] }
]

describe('biblioteca de fundos do Editor V6', () => {
  it('lista todos os fundos com uma consulta de referências em lote', async () => {
    const editorV6ReferencesForIds = vi.fn(async (ids: readonly string[]) => new Map([[ids[0], [{ id: '32345678-1234-4abc-8abc-123456789abc', title: 'Projeto válido' }]]]))
    const service = createBackgroundLibraryService({
      openImportDialog: async () => null,
      library: { list: async () => backgrounds, importFile: vi.fn(), rename: vi.fn(), delete: vi.fn() },
      assertRoteiroUnreferenced: vi.fn(),
      assertEditorV6Unreferenced: vi.fn(),
      editorV6ReferencesForIds,
      coordinateReferenceChange: async (operation) => operation(),
      enqueueWrite: async (operation) => operation()
    })

    const result = await service.list()
    expect(editorV6ReferencesForIds).toHaveBeenCalledTimes(1)
    expect(editorV6ReferencesForIds).toHaveBeenCalledWith(backgrounds.map((item) => item.id))
    expect(result).toHaveLength(2)
    expect(result[0].editorV6Projects).toEqual([{ id: '32345678-1234-4abc-8abc-123456789abc', title: 'Projeto válido' }])
    expect(result[1].editorV6Projects).toEqual([])
  })
})
