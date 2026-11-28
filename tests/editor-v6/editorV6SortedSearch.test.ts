import { describe, expect, it } from 'vitest'
import { editorV6LowerBound, editorV6UpperBound } from '../../src/shared/editorV6SortedSearch'

describe('buscas binárias da timeline V6', () => {
  const values = [{ frame: 1 }, { frame: 2 }, { frame: 2 }, { frame: 4 }]
  const frameOf = (item: { frame: number }) => item.frame

  it('encontra o primeiro quadro maior ou igual, inclusive com duplicatas', () => {
    expect(editorV6LowerBound(values, 0, frameOf)).toBe(0)
    expect(editorV6LowerBound(values, 2, frameOf)).toBe(1)
    expect(editorV6LowerBound(values, 3, frameOf)).toBe(3)
    expect(editorV6LowerBound(values, 5, frameOf)).toBe(4)
    expect(editorV6LowerBound([{ frame: 2 }], 2, frameOf)).toBe(0)
    expect(editorV6LowerBound([{ frame: 2 }], 3, frameOf)).toBe(1)
    expect(editorV6LowerBound([], 2, frameOf)).toBe(0)
  })

  it('encontra o primeiro quadro maior que o alvo, inclusive depois de duplicatas', () => {
    expect(editorV6UpperBound(values, 0, frameOf)).toBe(0)
    expect(editorV6UpperBound(values, 2, frameOf)).toBe(3)
    expect(editorV6UpperBound(values, 4, frameOf)).toBe(4)
    expect(editorV6UpperBound([{ frame: 2 }], 1, frameOf)).toBe(0)
    expect(editorV6UpperBound([{ frame: 2 }], 2, frameOf)).toBe(1)
    expect(editorV6UpperBound([], 2, frameOf)).toBe(0)
  })
})
