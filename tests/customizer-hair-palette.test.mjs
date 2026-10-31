import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultCharacterColorOverrides,
  defaultCharacterHairColorOverrides,
  normalizeCharacterHairColorOverrides,
  setCharacterHairColorRole
} from '../src/shared/customizer.ts'

test('hair palette defaults to the four fixed grayscale source roles', () => {
  assert.deepEqual(defaultCharacterHairColorOverrides, {
    outline: '#2B2B2B',
    shadow: '#6B6B6B',
    base: '#A8A8A8',
    light: '#E2E2E2'
  })
  assert.deepEqual(normalizeCharacterHairColorOverrides(), defaultCharacterHairColorOverrides)
})

test('hair defaults stay independent from the clothing palette', () => {
  assert.equal(defaultCharacterColorOverrides.light, '#55C5D4')
  assert.equal(defaultCharacterColorOverrides.detail, '#8C7BFF')
  assert.equal(normalizeCharacterHairColorOverrides().light, '#E2E2E2')
})

test('old saved hair highlights remain unchanged when read through the new palette', () => {
  const normalized = normalizeCharacterHairColorOverrides({
    outline: '#33221F',
    fade: '#613525',
    base: '#8E4B35',
    highlight: '#C68156'
  })
  assert.deepEqual(normalized, {
    outline: '#33221F',
    shadow: '#613525',
    base: '#8E4B35',
    light: '#C68156'
  })
})

test('changing a hair role keeps the hair light fallback and does not add a clothing detail role', () => {
  assert.deepEqual(setCharacterHairColorRole(undefined, 'outline', '#101010'), {
    outline: '#101010',
    shadow: '#6B6B6B',
    base: '#A8A8A8',
    light: '#E2E2E2'
  })
})
