import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitSceneText, wrapSceneText } from '../../src/renderer/src/features/editorV6/sceneTextLayout'
import { wrapSceneText as wrapSceneTextFromSurface } from '../../src/renderer/src/features/editorV6/SceneSurface'

describe('quebra de texto da cena do Editor V6', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps paragraph boundaries and wraps words using the shared fallback width', () => {
    vi.stubGlobal('document', undefined)
    expect(wrapSceneText('alpha beta', 28, 10, 4)).toEqual(['alpha', 'beta'])
    expect(wrapSceneText('a\r\nb', 11, 10, 4)).toEqual(['a', 'b'])
  })

  it('splits long words by Unicode character and ellipsizes overflow within the final line', () => {
    vi.stubGlobal('document', undefined)
    expect(wrapSceneText('abcd', 11, 10, 4)).toEqual(['ab', 'cd'])
    expect(wrapSceneText('abcdef', 11, 10, 1)).toEqual(['a…'])
    expect(wrapSceneText('猫猫猫', 11, 10, 4)).toEqual(['猫猫', '猫'])
  })

  it('reduces the font as text grows and keeps all content while it fits the safe area', () => {
    vi.stubGlobal('document', undefined)
    const short = fitSceneText('Oi', 100, 100, 20, 8)
    const longer = fitSceneText('Uma fala maior que ocupa várias linhas do balão', 100, 100, 20, 8)

    expect(short.fontSize).toBe(20)
    expect(longer.fontSize).toBeLessThan(short.fontSize)
    expect(longer.lines.join(' ')).toBe('Uma fala maior que ocupa várias linhas do balão')
    expect(longer.lines.join(' ')).not.toContain('…')
  })

  it('preserves the SceneSurface text wrapping export', () => {
    expect(wrapSceneTextFromSurface).toBe(wrapSceneText)
  })
})
