import { describe, expect, it } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { startEditorV6ActiveProjectLoad } from '../../src/renderer/src/features/editorV6/editorV6ActiveProjectLoad'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function document(id: string): EditorV6Document {
  return { id, title: id } as EditorV6Document
}

function harness(loadProject: (id: string) => Promise<EditorV6Document | null>) {
  const events: unknown[] = []
  return {
    events,
    dependencies: {
      loadProject,
      setError: (value: string | null) => events.push(['error', value]),
      setSaved: (value: boolean) => events.push(['saved', value]),
      setActiveProjectId: (value: string | null) => events.push(['active-id', value]),
      setActiveProject: (value: EditorV6Document | null) => events.push(['active-document', value?.id ?? null]),
      pausePlayback: () => events.push('pause'),
      publishPlayheadFrame: (value: number) => events.push(['frame', value])
    }
  }
}

describe('carregamento do projeto ativo do Editor V6', () => {
  it('ignora a resposta atrasada do projeto que deixou de estar selecionado', async () => {
    const first = deferred<EditorV6Document | null>()
    const second = deferred<EditorV6Document | null>()
    const calls = new Map([['first', first.promise], ['second', second.promise]])
    const { dependencies, events } = harness((id) => calls.get(id)!)
    const generation = { current: 0 }

    startEditorV6ActiveProjectLoad('first', generation, dependencies)
    startEditorV6ActiveProjectLoad('second', generation, dependencies)
    second.resolve(document('second'))
    await second.promise
    await Promise.resolve()
    first.resolve(document('first'))
    await first.promise
    await Promise.resolve()

    expect(events.filter((event) => Array.isArray(event) && event[0] === 'active-document')).toEqual([
      ['active-document', null], ['active-document', null], ['active-document', 'second']
    ])
  })

  it('descarta a leitura no cleanup e mantém o comportamento de projeto ausente', async () => {
    const pending = deferred<EditorV6Document | null>()
    const { dependencies, events } = harness(() => pending.promise)
    const generation = { current: 0 }
    const cleanup = startEditorV6ActiveProjectLoad('late', generation, dependencies)
    cleanup()
    pending.resolve(document('late'))
    await pending.promise
    await Promise.resolve()
    expect(events).not.toContainEqual(['active-document', 'late'])

    const missing = harness(async () => null)
    startEditorV6ActiveProjectLoad('missing', { current: 0 }, missing.dependencies)
    await Promise.resolve()
    expect(missing.events).toContainEqual(['error', 'Esse projeto não foi encontrado na biblioteca local do Editor V6.'])
    expect(missing.events).toContainEqual(['active-id', null])
  })

  it('limpa a sessão e zera o playhead quando não há projeto ativo', () => {
    const { dependencies, events } = harness(async () => null)
    startEditorV6ActiveProjectLoad(null, { current: 0 }, dependencies)
    expect(events).toEqual(['pause', ['frame', 0], ['active-document', null], ['saved', true]])
  })
})
