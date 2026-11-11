import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../src/shared/editorV6'
import { createEditorV6DocumentImportPersistence } from '../../src/renderer/src/features/editorV6/editorV6DocumentImportPersistence'

function makeProject(id: string, updatedAt: string): EditorV6Document {
  return {
    schemaVersion: 1, id, title: id, color: '#abc', createdAt: 'created', updatedAt,
    backgroundColor: '#fff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements: [], timeline: { fps: 30, durationFrames: 300, tracks: [] }
  }
}

describe('persistência de importação no Editor V6', () => {
  it('reutiliza o projeto em memória e recorre ao bridge se outro projeto estiver ativo', async () => {
    const active = makeProject('active', 'a')
    const loadProject = vi.fn(async (id: string) => makeProject(id, 'loaded'))
    const context = createEditorV6DocumentImportPersistence({
      activeProjectIdRef: { current: 'active' }, getActiveProject: () => active, loadProject,
      recordHistory: vi.fn(), setActiveProject: vi.fn(), markUnsaved: vi.fn(),
      writeDocumentInOrder: vi.fn(async () => undefined), upsertSummary: vi.fn(),
      setSaved: vi.fn(), setError: vi.fn()
    })

    await expect(context.loadLatestProject('active')).resolves.toBe(active)
    await expect(context.loadLatestProject('other')).resolves.toMatchObject({ id: 'other', updatedAt: 'loaded' })
    expect(loadProject).toHaveBeenCalledOnce()
    expect(loadProject).toHaveBeenCalledWith('other')
  })

  it('registra histórico, ativa, grava e só então publica o resumo e o estado salvo', async () => {
    const source = makeProject('project-1', 'before')
    const next = makeProject('project-1', 'after')
    const events: unknown[] = []
    let active: EditorV6Document | null = source
    const summary = vi.fn((value: EditorV6ProjectSummary) => events.push(['summary', value.updatedAt]))
    const context = createEditorV6DocumentImportPersistence({
      activeProjectIdRef: { current: source.id }, getActiveProject: () => active,
      loadProject: vi.fn(async () => null),
      recordHistory: (value) => events.push(['history', value.updatedAt]),
      setActiveProject: (value) => { active = value; events.push(['active', value.updatedAt]) },
      markUnsaved: () => events.push(['unsaved']),
      writeDocumentInOrder: async (value) => { events.push(['write', value.updatedAt]) },
      upsertSummary: summary,
      setSaved: (saved) => events.push(['saved', saved]),
      setError: (error) => events.push(['error', error])
    })

    await expect(context.persistImportedDocument(source, next)).resolves.toBe(true)
    expect(events).toEqual([
      ['history', 'before'], ['active', 'after'], ['unsaved'], ['write', 'after'],
      ['summary', 'after'], ['saved', true], ['error', null]
    ])
  })

  it('persiste alterações obsoletas sem substituir outro projeto ativo ou limpar o estado salvo', async () => {
    const source = makeProject('source', 'before')
    const next = makeProject('source', 'after')
    const other = makeProject('other', 'current')
    const events: unknown[] = []
    const context = createEditorV6DocumentImportPersistence({
      activeProjectIdRef: { current: other.id }, getActiveProject: () => other,
      loadProject: vi.fn(async () => null),
      recordHistory: () => events.push(['history']),
      setActiveProject: () => events.push(['active']),
      markUnsaved: () => events.push(['unsaved']),
      writeDocumentInOrder: async () => { events.push(['write']) },
      upsertSummary: (summary) => events.push(['summary', summary.id]),
      setSaved: (saved) => events.push(['saved', saved]),
      setError: (error) => events.push(['error', error])
    })

    await expect(context.persistImportedDocument(source, next)).resolves.toBe(false)
    expect(events).toEqual([['write'], ['summary', 'source']])
  })

  it('não limpa o estado da sessão se o projeto mudar enquanto a gravação está em andamento', async () => {
    const source = makeProject('project-1', 'before')
    const next = makeProject('project-1', 'after')
    const other = makeProject('project-2', 'current')
    const events: unknown[] = []
    let active: EditorV6Document | null = source
    const context = createEditorV6DocumentImportPersistence({
      activeProjectIdRef: { current: source.id }, getActiveProject: () => active,
      loadProject: vi.fn(async () => null),
      recordHistory: () => events.push(['history']),
      setActiveProject: (project) => { active = project; events.push(['active', project.id]) },
      markUnsaved: () => events.push(['unsaved']),
      writeDocumentInOrder: async () => { events.push(['write']); active = other },
      upsertSummary: (summary) => events.push(['summary', summary.id]),
      setSaved: (saved) => events.push(['saved', saved]),
      setError: (error) => events.push(['error', error])
    })

    await expect(context.persistImportedDocument(source, next)).resolves.toBe(false)
    expect(events).toEqual([['history'], ['active', 'project-1'], ['unsaved'], ['write'], ['summary', 'project-1']])
  })

  it('propaga falha de gravação sem publicar um resumo de sucesso', async () => {
    const source = makeProject('project-1', 'before')
    const next = makeProject('project-1', 'after')
    const upsertSummary = vi.fn()
    const context = createEditorV6DocumentImportPersistence({
      activeProjectIdRef: { current: source.id }, getActiveProject: () => source,
      loadProject: vi.fn(async () => null), recordHistory: vi.fn(), setActiveProject: vi.fn(),
      markUnsaved: vi.fn(), writeDocumentInOrder: async () => { throw new Error('write failed') },
      upsertSummary, setSaved: vi.fn(), setError: vi.fn()
    })

    await expect(context.persistImportedDocument(source, next)).rejects.toThrow('write failed')
    expect(upsertSummary).not.toHaveBeenCalled()
  })
})
