import { describe, expect, it } from 'vitest'
import { editorV6FaceDetailIds, editorV6FaceDetailsAreLoading, editorV6FaceSheetKind, editorV6SelectedFaceCatalogItemId } from '../../src/renderer/src/features/editorV6/editorV6FaceSelection'
import { createDefaultSceneFaceTransform, resolveSceneFaceTransform, sceneFaceCatalogItemId, sceneFaceSheetKind } from '../../src/renderer/src/characters/sceneFaceSelection'
import { EDITOR_V6_FACE_DETAIL_CACHE_LIMIT, rememberEditorV6FaceCatalogItem } from '../../src/renderer/src/features/editorV6/editorV6FaceDetailCache'
import type { CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { FaceCatalogItem } from '../../src/shared/fabricator'

const appearance: CustomizerFaceAppearance = {
  modelSlot: 2,
  eyeCatalogId: 'eyes-main',
  eyebrowCatalogId: 'brows-main',
  noseCatalogId: 'nose-main',
  mouthClosedCatalogId: 'mouth-closed-main',
  mouthOpenCatalogId: 'mouth-open-main',
  eyeState: 0,
  eyebrows: true,
  noseIndex: 0,
  expressionIndex: 0,
  mouthOpen: false
}

describe('seleção de folhas faciais do Editor V6', () => {
  it('compartilha as mesmas regras de categoria e mantém a compatibilidade do modo de renderização', () => {
    expect(editorV6FaceSheetKind).toBe(sceneFaceSheetKind)
    expect(editorV6SelectedFaceCatalogItemId('mouth', 'talk-blink', appearance)).toBe('mouth-closed-main')
    expect(sceneFaceCatalogItemId('mouth', 'talk', appearance)).toBe('mouth-open-main')
  })

  it('resolve transformações atuais, chaves antigas da boca e defaults isolados', () => {
    const legacyMouth = { x: 13, y: 4, width: 88, height: 91, rotation: 7 }
    const selectedEye = { x: 2, y: 3, width: 99, height: 98, rotation: 1 }
    const mouth = resolveSceneFaceTransform('mouth', 'mouth-open', 'mouth-open-main', appearance, {
      'mouth-closed:mouth-closed-main': legacyMouth
    })
    const preferredMouth = { x: 5, y: 6, width: 100, height: 100, rotation: 0 }
    const preferred = resolveSceneFaceTransform('mouth', 'mouth-open', 'mouth-open-main', appearance, {
      mouth: preferredMouth, 'mouth-closed:mouth-closed-main': legacyMouth
    })
    const eye = resolveSceneFaceTransform('eyes', 'eyes', 'eyes-main', appearance, {
      eyes: createDefaultSceneFaceTransform(), 'eyes:eyes-main': selectedEye
    })
    const categoryFallback = resolveSceneFaceTransform('eyes', 'eyes', 'eyes-main', appearance, { eyes: selectedEye })
    const fallback = resolveSceneFaceTransform('nose', 'nose', undefined, appearance, undefined)

    expect(mouth.transformKey).toBe('mouth')
    expect(mouth.transform).toBe(legacyMouth)
    expect(preferred.transform).toBe(preferredMouth)
    expect(eye.transform).toBe(selectedEye)
    expect(categoryFallback.transform).toBe(selectedEye)
    expect(fallback.transform).toEqual({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })
    expect(fallback.transform).not.toBe(createDefaultSceneFaceTransform())
  })

  it('mapeia a categoria boca para a folha correspondente ao modo atual', () => {
    expect(editorV6FaceSheetKind('mouth', 'idle')).toBe('mouth-closed')
    expect(editorV6FaceSheetKind('mouth', 'talk')).toBe('mouth-open')
    expect(editorV6FaceSheetKind('eyes', 'talk')).toBe('eyes')
  })

  it('preserva a folha escolhida e usa a boca aberta padrão só como fallback', () => {
    expect(editorV6SelectedFaceCatalogItemId('eyes', 'idle', appearance)).toBe('eyes-main')
    expect(editorV6SelectedFaceCatalogItemId('mouth', 'idle', appearance)).toBe('mouth-closed-main')
    expect(editorV6SelectedFaceCatalogItemId('mouth', 'talk', appearance)).toBe('mouth-open-main')
    expect(editorV6SelectedFaceCatalogItemId('mouth', 'talk', { ...appearance, mouthOpenCatalogId: undefined }, 'mouth-default')).toBe('mouth-default')
    expect(editorV6SelectedFaceCatalogItemId('mouth', 'idle', undefined, 'mouth-default')).toBeUndefined()
  })

  it('carrega só os detalhes selecionados, deduplicando a boca aberta quando já é a folha ativa', () => {
    expect(editorV6FaceDetailIds('eyes-main', 'mouth-open-main')).toEqual(['eyes-main', 'mouth-open-main'])
    expect(editorV6FaceDetailIds('mouth-open-main', 'mouth-open-main')).toEqual(['mouth-open-main'])
    expect(editorV6FaceDetailIds(undefined, '')).toEqual([])
  })

  it('só sinaliza o carregamento das folhas exigidas para o modelo atualmente ativo', () => {
    const loading = new Set(['1:olhos', '2:boca-aberta'])
    expect(editorV6FaceDetailsAreLoading(2, ['olhos', 'boca-aberta'], loading)).toBe(true)
    expect(editorV6FaceDetailsAreLoading(2, ['olhos'], loading)).toBe(false)
    expect(editorV6FaceDetailsAreLoading(null, ['boca-aberta'], loading)).toBe(false)
  })

  it('limita o cache de folhas com imagens e renova a folha usada recentemente', () => {
    let cache: Record<string, FaceCatalogItem> = {}
    for (let index = 0; index < EDITOR_V6_FACE_DETAIL_CACHE_LIMIT; index += 1) {
      cache = rememberEditorV6FaceCatalogItem(cache, `slot:${index}`, { id: String(index) } as FaceCatalogItem)
    }
    cache = rememberEditorV6FaceCatalogItem(cache, 'slot:0', cache['slot:0'])
    cache = rememberEditorV6FaceCatalogItem(cache, 'slot:new', { id: 'new' } as FaceCatalogItem)

    expect(Object.keys(cache)).toHaveLength(EDITOR_V6_FACE_DETAIL_CACHE_LIMIT)
    expect(cache['slot:0']).toBeDefined()
    expect(cache['slot:1']).toBeUndefined()
    expect(cache['slot:new']).toBeDefined()
  })
})
