import { describe, expect, it, vi } from 'vitest'
import { runEditorV6ProjectCreationOnce } from '../../src/renderer/src/features/editorV6/editorV6ProjectCreationGuard'

describe('runEditorV6ProjectCreationOnce', () => {
  it('ignores a second create request while the first is pending', async () => {
    const guard = { current: false }
    const setCreating = vi.fn()
    let finishFirst!: () => void
    const createProject = vi.fn(() => new Promise<void>((resolve) => { finishFirst = resolve }))

    const first = runEditorV6ProjectCreationOnce(guard, setCreating, createProject)
    await runEditorV6ProjectCreationOnce(guard, setCreating, createProject)

    expect(createProject).toHaveBeenCalledTimes(1)
    expect(setCreating).toHaveBeenNthCalledWith(1, true)
    finishFirst()
    await first

    expect(setCreating).toHaveBeenLastCalledWith(false)
    expect(guard.current).toBe(false)
  })

  it('releases the guard if creation rejects', async () => {
    const guard = { current: false }
    const setCreating = vi.fn()
    await expect(runEditorV6ProjectCreationOnce(guard, setCreating, async () => { throw new Error('failed') })).rejects.toThrow('failed')
    expect(guard.current).toBe(false)
    expect(setCreating).toHaveBeenLastCalledWith(false)
  })
})
