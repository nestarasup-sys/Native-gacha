/**
 * A single pose preparation can have multiple renderers with an identical
 * immutable source resource. Do the expensive source work once, then let
 * each renderer draw its own private composed body/face surfaces.
 *
 * Caller owns the pair and drops it after both renderers finish. Never used
 * as a cross-export cache or retained across model/pose revisions.
 */
export type GachaPairedResource<T> = {
  load: (factory: () => Promise<T>) => Promise<T>
  clear: () => void
}
export function createGachaPairedResource<T>(): GachaPairedResource<T> {
  let pending: Promise<T> | undefined
  return {
    load(factory) {
      if (!pending) {
        const request = Promise.resolve().then(factory)
        pending = request
        void request.catch(() => { if (pending === request) pending = undefined })
      }
      return pending
    },
    clear() { pending = undefined }
  }
}
