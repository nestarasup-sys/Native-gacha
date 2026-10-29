import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomizerHairPreviewCache, CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_BYTES } from '../src/renderer/src/features/customizer/customizerHairPreviewCache.ts'

test('cache de prévias do Customizador compartilha tarefas e não retém imagem acima do orçamento', async () => {
  const loadedSources = []
  const oversizedPreview = 'x'.repeat(13 * 1024 * 1024)
  const cache = createCustomizerHairPreviewCache(async (source) => {
    loadedSources.push(source)
    return source === 'large' ? oversizedPreview : `trimmed:${source}`
  })

  const firstRequest = cache.load('hair-1')
  const duplicateRequest = cache.load('hair-1')
  assert.equal(firstRequest, duplicateRequest)
  await firstRequest
  assert.equal(cache.getStats().entries, 1)
  assert.equal(loadedSources.filter((source) => source === 'hair-1').length, 1)

  await cache.load('large')
  assert.equal(cache.getStats().entries, 1)
  assert.equal(cache.getStats().maxBytes, CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_BYTES)
  assert.ok(cache.getStats().retainedBytes <= CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_BYTES)

  await cache.load('large')
  assert.equal(loadedSources.filter((source) => source === 'large').length, 2)
})
