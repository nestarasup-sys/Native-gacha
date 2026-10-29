/** Mantém operações da mesma entidade em ordem, sem bloquear outras chaves.
 * `retainFailures` deixa falhas visíveis em `getPendingWrites` até uma operação posterior concluir.
 */
export function createKeyedOperationQueue(options: { retainFailures?: boolean } = {}) {
  const retainFailures = options.retainFailures ?? false
  const tailsByKey = new Map<string, Promise<void>>()

  function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const preceding = tailsByKey.get(key) ?? Promise.resolve()
    const result = preceding.catch(() => undefined).then(operation)
    const trackedTail = retainFailures
      ? result.then(() => undefined)
      : result.then(() => undefined, () => undefined)
    tailsByKey.set(key, trackedTail)
    void trackedTail.then(
      () => { if (tailsByKey.get(key) === trackedTail) tailsByKey.delete(key) },
      () => { if (!retainFailures && tailsByKey.get(key) === trackedTail) tailsByKey.delete(key) }
    )
    return result
  }

  function getPendingWrites(): Promise<void>[] {
    return [...tailsByKey.values()]
  }

  return { run, getPendingWrites }
}
