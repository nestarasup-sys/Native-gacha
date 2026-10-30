export function createPoseReferenceChangeCoordinator() {
  let pending: Promise<void> = Promise.resolve()

  return function coordinate<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = pending.catch(() => undefined).then(operation)
    pending = next.then(() => undefined, () => undefined)
    return next
  }
}
