import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { filterCustomizerHairStylesByGender, getCustomizerHairLibraryPage } from '../src/renderer/src/features/customizer/customizerHairCatalog.ts'

const hair = (id, gender) => ({
  id,
  modelSlot: 1,
  name: id,
  ...(gender ? { gender } : {}),
  category: 'rearHair',
  front: { width: 16, height: 12 },
  back: null,
  fringe: null,
  updatedAt: '2026-11-06T00:00:00.000Z'
})

const styles = [hair('old-set'), hair('female-set', 'female'), hair('male-set', 'male')]

test('filtra cabelos pelo gênero e mantém conjuntos antigos disponíveis para todos', () => {
  assert.deepEqual(
    filterCustomizerHairStylesByGender(styles, 'female', false).map(({ id }) => id),
    ['old-set', 'female-set']
  )
  assert.deepEqual(
    filterCustomizerHairStylesByGender(styles, 'male', false).map(({ id }) => id),
    ['old-set', 'male-set']
  )
  assert.deepEqual(
    filterCustomizerHairStylesByGender(styles, 'male', true).map(({ id }) => id),
    ['old-set', 'female-set', 'male-set']
  )
  assert.deepEqual(styles.map(({ id }) => id), ['old-set', 'female-set', 'male-set'])
})

test('a biblioteca pagina apenas os cabelos elegíveis para o personagem', () => {
  const maleOptions = filterCustomizerHairStylesByGender(styles, 'male', false)
  const page = getCustomizerHairLibraryPage(maleOptions, 'rearHair', 0)

  assert.deepEqual(page.options.map(({ id }) => id), ['old-set', 'male-set'])
  assert.deepEqual(page.visibleStyles.map(({ id }) => id), ['old-set', 'male-set'])
})

test('o controle de cabelos do outro gênero aparece em Modelos abaixo do seletor de gênero', async () => {
  const [picker, page, hairWorkspace] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerModelPicker.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerHairWorkspace.tsx', 'utf8')
  ])

  assert.ok(picker.indexOf('customizer-model-hair-filter') > picker.indexOf('customizer-model-gender-band'))
  assert.match(picker, /Mostrar cabelos \{oppositeGenderLabel\}\?/)
  assert.match(page, /showOtherGenderHair=\{showOtherGenderHair\}/)
  assert.doesNotMatch(hairWorkspace, /Mostrar cabelos/)
})
