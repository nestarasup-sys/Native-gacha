/**
 * Load independent part textures concurrently, but never paint them out of
 * authoring order. The original renderer awaited each decode before requesting
 * the next one; this bounded batch hides I/O/tint latency while keeping the
 * same compositing, source identity and per-part failure tolerance.
 *
 * Per-render only: no persistent cache, no project state, no asset mutation.
 */
export async function loadCharacterPartImages<T, Image>(
  parts: readonly T[],
  load: (part: T) => Promise<Image>,
  maxConcurrent = 4
): Promise<Array<Image | null>> {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8) {
    throw Error('Limite de carregamento de partes inválido.')
  }
  const output: Array<Image | null> = Array(parts.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < parts.length) {
      const index = next++
      try {
        output[index] = await load(parts[index])
      } catch {
        // A missing or corrupt source texture must not hide other model parts.
        // The original character layer painter applied this same fallback.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, parts.length) }, () => worker()))
  return output
}
