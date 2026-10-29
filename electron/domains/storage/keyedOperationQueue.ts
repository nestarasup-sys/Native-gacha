/** Mantém operações da mesma entidade em ordem, sem bloquear outras chaves. */
export function createKeyedOperationQueue() {
  const pendingByKey = new Map<string, Promise<void>>()

  function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const preceding = pendingByKey.get(key) ?? Promise.resolve()
    const result = preceding.catch(() => undefined).then(operation)
    const settled = result.then(() => undefined, () => undefined)
    pendingByKey.set(key, settled)
    void settled.then(() => {
      if (pendingByKey.get(key) === settled) pendingByKey.delete(key)
    })
    return result
  }

  function getPendingWrites(): Promise<void>[] {
    return [...pendingByKey.values()]
  }

  return { run, getPendingWrites }
}
