import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createRenderedCharacterPortraitCache,
  RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES,
  RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_ENTRIES
} from '../src/renderer/src/ui/components/renderedCharacterPortraitCache.ts'

test('cache de retratos deduplica renders e respeita limites de quantidade e bytes', async () => {
  let renderCount = 0
  const cache = createRenderedCharacterPortraitCache()
  const render = async (source) => {
    renderCount += 1
    return source.startsWith('oversized:') ? 'x'.repeat(RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES) : `portrait:${source}`
  }

  const first = cache.load('character-1:1', render)
  const duplicate = cache.load('character-1:1', render)
  assert.equal(first, duplicate)
  assert.equal(await first, 'portrait:character-1:1')
  assert.equal(renderCount, 1)

  for (let index = 0; index < RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_ENTRIES + 2; index += 1) {
    await cache.load(`character-${index}:1`, render)
  }
  assert.equal(cache.getStats().entries, RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_ENTRIES)
  assert.ok(cache.getStats().retainedBytes <= RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES)

  await cache.load('oversized:1', render)
  assert.ok(cache.getStats().retainedBytes <= RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES)
  const rendersBeforeRetry = renderCount
  await cache.load('oversized:1', render)
  assert.equal(renderCount, rendersBeforeRetry + 1)
})

test('cache mantém resultado nulo como fallback e não repete renderização inválida', async () => {
  const cache = createRenderedCharacterPortraitCache()
  let renderCount = 0
  const render = async () => { renderCount += 1; return null }

  assert.equal(await cache.load('character-invalid:1', render), null)
  assert.equal(await cache.load('character-invalid:1', render), null)
  assert.equal(renderCount, 1)
})
