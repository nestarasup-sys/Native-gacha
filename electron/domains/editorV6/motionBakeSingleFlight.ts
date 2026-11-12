import type { EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'

type Flight = {
  controller: AbortController
  subscribers: Set<symbol>
  promise: Promise<EditorV6MotionBakeResult>
  settled: boolean
}

/** Shares one motion bake across callers while keeping cancellation scoped to each subscriber. */
export function createEditorV6MotionBakeSingleFlight() {
  const flights = new Map<string, Flight>()

  const run = (
    key: string,
    signal: AbortSignal,
    bake: (signal: AbortSignal) => Promise<EditorV6MotionBakeResult>,
    validateForSubscriber: (result: EditorV6MotionBakeResult) => void = () => {}
  ): Promise<EditorV6MotionBakeResult> => {
    if (signal.aborted) return Promise.reject(signal.reason ?? Error('Preparação de animação cancelada.'))

    let flight = flights.get(key)
    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController()
      const created: Flight = {
        controller,
        subscribers: new Set(),
        settled: false,
        promise: Promise.resolve().then(() => bake(controller.signal)).finally(() => {
          created.settled = true
          if (flights.get(key) === created) flights.delete(key)
        })
      }
      // A flight can be cancelled before any consumer attaches; keep its rejection handled.
      void created.promise.catch(() => {})
      flights.set(key, created)
      flight = created
    }

    const shared = flight
    return new Promise((resolve, reject) => {
      const subscriber = Symbol(key)
      shared.subscribers.add(subscriber)
      let released = false
      const release = (cancelWhenUnobserved = false) => {
        if (released) return
        released = true
        signal.removeEventListener('abort', onAbort)
        shared.subscribers.delete(subscriber)
        if (cancelWhenUnobserved && shared.subscribers.size === 0 && !shared.settled) {
          shared.controller.abort(Error('Nenhuma solicitação ainda aguarda esta animação.'))
        }
      }
      const onAbort = () => {
        release(true)
        reject(signal.reason ?? Error('Preparação de animação cancelada.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) { onAbort(); return }
      shared.promise.then((result) => {
        if (!released) {
          try { validateForSubscriber(result); release(); resolve(result) }
          catch (error) { release(); reject(error instanceof Error ? error : Error(String(error))) }
        }
      }, (error) => { if (!released) { release(); reject(error) } })
    })
  }

  return { run }
}
