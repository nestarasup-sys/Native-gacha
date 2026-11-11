import { describe, expect, it } from 'vitest'
import { startEditorV6ProjectCatalogLoad } from '../../src/renderer/src/features/editorV6/editorV6ProjectCatalogLoad'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function harness(loadCatalog: () => Promise<{ projects: { id: string; title: string }[]; folder: string; clearLegacyCatalog: boolean }>) {
  const events: unknown[] = []
  return {
    events,
    dependencies: {
      loadCatalog,
      clearLegacyCatalog: () => events.push('clear-legacy'),
      setProjects: (projects: { id: string; title: string }[]) => events.push(['projects', projects.map(({ id }) => id)]),
      setFolder: (folder: string) => events.push(['folder', folder]),
      setLoading: (loading: boolean) => events.push(['loading', loading]),
      setError: (message: string | null) => events.push(['error', message])
    }
  }
}

describe('bootstrap da biblioteca do Editor V6', () => {
  it('publica o catálogo e só limpa legado depois de concluir a migração', async () => {
    const { dependencies, events } = harness(async () => ({ projects: [{ id: 'p1', title: 'Projeto' }], folder: 'local', clearLegacyCatalog: true }))
    startEditorV6ProjectCatalogLoad(dependencies)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([['projects', ['p1']], ['folder', 'local'], 'clear-legacy', ['loading', false]])
  })

  it('descarta uma resposta após o cleanup sem limpar catálogo legado', async () => {
    const result = deferred<{ projects: { id: string; title: string }[]; folder: string; clearLegacyCatalog: boolean }>()
    const { dependencies, events } = harness(() => result.promise)
    const cleanup = startEditorV6ProjectCatalogLoad(dependencies)
    cleanup()
    result.resolve({ projects: [{ id: 'late', title: 'Atrasado' }], folder: 'local', clearLegacyCatalog: true })
    await result.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([])
  })

  it('mantém a falha visível e encerra loading quando a leitura rejeita', async () => {
    const { dependencies, events } = harness(async () => { throw new Error('falha de leitura') })
    startEditorV6ProjectCatalogLoad(dependencies)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([['error', 'falha de leitura'], ['loading', false]])
  })
})
