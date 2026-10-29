import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEyeInteriorMaskCache,
  EYE_INTERIOR_MASK_CACHE_MAX_BYTES,
  EYE_INTERIOR_MASK_CACHE_MAX_ENTRIES
} from '../src/renderer/src/ui/image/eyeInteriorMaskCache.ts'

test('cache de máscaras reutiliza imagens menores e não retém canvas acima do orçamento', async () => {
  const calls = []
  const cache = createEyeInteriorMaskCache(async (source) => {
    calls.push(source)
    return source === 'large'
      ? { width: 5000, height: 5000 }
      : { width: 2000, height: 2000 }
  })

  const firstMask = await cache.load('eye-a')
  assert.equal(firstMask.width, 2000)
  assert.equal((await cache.load('eye-a')), firstMask)
  assert.equal(calls.filter((source) => source === 'eye-a').length, 1)

  await cache.load('large')
  assert.equal(cache.getStats().entries, 1)
  assert.equal(cache.getStats().retainedBytes, 2000 * 2000 * 4 + 'eye-a'.length * 2)
  assert.ok(cache.getStats().retainedBytes <= EYE_INTERIOR_MASK_CACHE_MAX_BYTES)
  assert.equal(cache.getStats().maxEntries, EYE_INTERIOR_MASK_CACHE_MAX_ENTRIES)

  await cache.load('large')
  assert.equal(calls.filter((source) => source === 'large').length, 2)
})
