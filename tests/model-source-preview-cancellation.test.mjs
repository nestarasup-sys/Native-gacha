import test from 'node:test'
import assert from 'node:assert/strict'
import { loadImageFromDataUrl } from '../src/renderer/src/features/fabricator/models/imageData.ts'

const PreviousImage = globalThis.Image

class ImageDouble {
  onload = null
  onerror = null
  value = ''
  set src(value) { this.value = value }
  get src() { return this.value }
  finish() { this.onload?.() }
}

test.after(() => { globalThis.Image = PreviousImage })

test('abortar a decodificação encerra a imagem e limpa callbacks', async () => {
  const images = []
  globalThis.Image = class extends ImageDouble { constructor() { super(); images.push(this) } }
  const controller = new AbortController()
  const pending = loadImageFromDataUrl('data:image/png;base64,AA==', 'Falha ao carregar.', controller.signal)
  controller.abort()

  await assert.rejects(pending, error => error.name === 'AbortError')
  assert.equal(images.length, 1)
  assert.equal(images[0].src, '')
  assert.equal(images[0].onload, null)
  assert.equal(images[0].onerror, null)
})

test('sinal cancelado não cria uma instância de imagem', async () => {
  let created = 0
  globalThis.Image = class extends ImageDouble { constructor() { super(); created += 1 } }
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(loadImageFromDataUrl('data:image/png;base64,AA==', 'Falha ao carregar.', controller.signal), error => error.name === 'AbortError')
  assert.equal(created, 0)
})

test('conclusão normal remove callbacks e listener de cancelamento', async () => {
  const images = []
  globalThis.Image = class extends ImageDouble { constructor() { super(); images.push(this) } }
  const controller = new AbortController()
  const pending = loadImageFromDataUrl('data:image/png;base64,AA==', 'Falha ao carregar.', controller.signal)
  images[0].finish()

  assert.equal(await pending, images[0])
  assert.equal(images[0].onload, null)
  assert.equal(images[0].onerror, null)
  controller.abort()
  assert.equal(images[0].src, 'data:image/png;base64,AA==')
})
