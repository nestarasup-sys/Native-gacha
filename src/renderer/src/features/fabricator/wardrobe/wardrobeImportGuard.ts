/** Prevent late worker replies from changing a different wardrobe draft.
 * Request IDs alone are not sufficient if a worker from an older selection reports late.
 */
export function acceptsWardrobeWorkerResponse(
  expectedRequestId: number,
  activeRequestId: number,
  messageRequestId: number,
  sameWorker: boolean
): boolean {
  return sameWorker && expectedRequestId === activeRequestId && messageRequestId === expectedRequestId
}
