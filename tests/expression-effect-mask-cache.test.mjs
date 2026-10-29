import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createExpressionEffectMaskCache,
  EXPRESSION_EFFECT_MASK_CACHE_MAX_BYTES,
  EXPRESSION_EFFECT_MASK_CACHE_MAX_ENTRIES
} from '../src/renderer/src/characters/expressionEffectMaskCache.ts'

test('cache de máscaras compartilha leituras e limita a memória estimada pela resolução', async () => {
  let loads = 0
  const cache = createExpressionEffectMaskCache(async (source) => {
    loads += 1
    const size = source === 'large' ? 2800 : 1000
    return { naturalWidth: size, naturalHeight: size }
  })

  const first = cache.load('mask-a')
  const duplicate = cache.load('mask-a')
  assert.equal(first, duplicate)
  const image = await first
  assert.equal(loads, 1)
  assert.equal(await cache.load('mask-a'), image)

  await cache.load('large')
  assert.equal(cache.getStats().entries, 1)
  assert.equal(cache.getStats().retainedBytes, 'large'.length * 2 + 2800 * 2800 * 4)
  assert.equal(cache.getStats().maxEntries, EXPRESSION_EFFECT_MASK_CACHE_MAX_ENTRIES)
  assert.equal(cache.getStats().maxBytes, EXPRESSION_EFFECT_MASK_CACHE_MAX_BYTES)
})

test('cache de máscaras permite carregar novamente depois de erro e não retém imagem acima do teto', async () => {
  let attempts = 0
  const cache = createExpressionEffectMaskCache(async (source) => {
    attempts += 1
    if (source === 'failure' && attempts === 1) throw new Error('Falha sintética')
    const size = source === 'oversized' ? 5000 : 100
    return { width: size, height: size }
  })

  await assert.rejects(cache.load('failure'), /Falha sintética/)
  await cache.load('failure')
  assert.equal(attempts, 2)

  await cache.load('oversized')
  const retainedBytes = cache.getStats().retainedBytes
  assert.equal(cache.getStats().entries, 1)
  assert.ok(cache.getStats().maxBytes <= EXPRESSION_EFFECT_MASK_CACHE_MAX_BYTES)
  await cache.load('oversized')
  assert.equal(attempts, 4)
  assert.equal(cache.getStats().retainedBytes, retainedBytes)
})
