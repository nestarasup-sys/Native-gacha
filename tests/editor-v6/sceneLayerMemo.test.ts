import { describe, expect, it } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import { sceneLayerPropsEqual } from '../../src/renderer/src/features/editorV6/SceneSurface'

const element = (overrides: Partial<EditorV6Element> = {}): EditorV6Element => ({
  id: 'actor', kind: 'character', text: 'STRESS_Aurora', x: 0, y: 0, width: 25, height: 50, rotation: 0, zIndex: 1,
  motionSprite: { x: 10, y: 20, width: 100, height: 200, atlasWidth: 500, atlasHeight: 1000 },
  ...overrides
})

describe('SceneLayer memoização por aparência', () => {
  it('ignora objetos de estado recém-criados quando os valores visuais são iguais', () => {
    const previous = { element: element(), asset: undefined, selected: false, interaction: undefined }
    const next = { ...previous, element: element() }
    expect(sceneLayerPropsEqual(previous, next)).toBe(true)
  })

  it('renderiza novamente quando posição, seleção ou recorte de animação muda', () => {
    const previous = { element: element(), asset: undefined, selected: false, interaction: undefined }
    expect(sceneLayerPropsEqual(previous, { ...previous, element: element({ x: 2 }) })).toBe(false)
    expect(sceneLayerPropsEqual(previous, { ...previous, selected: true })).toBe(false)
    expect(sceneLayerPropsEqual(previous, { ...previous, element: element({ motionSprite: { ...previous.element.motionSprite!, x: 11 } }) })).toBe(false)
  })

  it('renderiza atlas novo mesmo que o recorte geométrico permaneça idêntico', () => {
    const previous = { element: element(), asset: { id:'atlas', dataUrl:'data:image/png;base64,AAAA' } as never, selected: false, interaction: undefined }
    const next = { ...previous, asset: { id:'atlas', dataUrl:'data:image/png;base64,BBBB' } as never }
    expect(previous.element.motionSprite).toEqual(next.element.motionSprite)
    expect(sceneLayerPropsEqual(previous, next)).toBe(false)
  })

  it('invalida as aparências faciais quando campos de expressão, fala ou preset mudam', () => {
    const previous = { element: element(), asset: undefined, selected: false, interaction: undefined }
    expect(sceneLayerPropsEqual(previous, { ...previous, element: element({ activeFaceMode:'talk' }) })).toBe(false)
    expect(sceneLayerPropsEqual(previous, { ...previous, element: element({ activeExpressionPresetId:'preset-2' }) })).toBe(false)
    expect(sceneLayerPropsEqual(previous, { ...previous, element: element({ activeExpressionGaze:'left' }) })).toBe(false)
  })
})
