import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { createEditorV6CastCommands } from '../../src/renderer/src/features/editorV6/editorV6CastCommands'
import type { PreparedEditorV6CastSnapshots } from '../../src/renderer/src/features/editorV6/editorV6CastSnapshots'

function character(id: string): CustomizerCharacter {
  return { id, name: `Personagem ${id}`, updatedAt: `source-${id}`, customization: { modelSlot: 1 } } as CustomizerCharacter
}

function characterElement(id: string, characterId: string, assetId: string, zIndex: number): EditorV6Element {
  return {
    id, kind: 'character', characterId, assetId, text: characterId,
    x: 0, y: 0, width: 100, height: 150, rotation: 0, zIndex
  }
}

function asset(id: string, category: EditorV6Asset['category'] = 'character'): EditorV6Asset {
  return { id, category, name: id, mimeType: 'image/png', dataUrl: `data:image/png;base64,${id}` }
}

function project(): EditorV6Document {
  const elements: EditorV6Element[] = [
    characterElement('actor-a', 'a', 'asset-a', 3),
    characterElement('actor-b', 'b', 'asset-b', 8),
    { id: 'prop', kind: 'image', assetId: 'asset-prop', text: 'Prop', x: 0, y: 0, width: 20, height: 20, rotation: 0, zIndex: 5 }
  ]
  return {
    schemaVersion: 1, id: 'project-1', title: 'Project', color: '#ffffff',
    createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [asset('asset-a'), asset('asset-b'), asset('asset-prop', 'object')],
    elements, timeline: createEditorV6Timeline(elements)
  }
}

function preparedSnapshots(): PreparedEditorV6CastSnapshots {
  const element = characterElement('actor-c', 'c', 'asset-c', 6)
  return { assets: [asset('asset-c')], elements: [element] }
}

function setup(overrides: Partial<Parameters<typeof createEditorV6CastCommands>[0]> = {}) {
  const initialProject = project()
  let currentProject = initialProject
  const changeScene = vi.fn((update: (project: EditorV6Document) => EditorV6Document) => { currentProject = update(currentProject) })
  const dependencies: Parameters<typeof createEditorV6CastCommands>[0] = {
    activeProject: initialProject,
    availableCharacters: [character('a'), character('b'), character('c')],
    selectedCharacterIds: ['a', 'c'],
    saving: false,
    sourceSnapshot: null,
    getStageSize: () => ({ width: 1600, height: 900 }),
    prepareSnapshots: vi.fn(async () => preparedSnapshots()),
    changeScene,
    setSaving: vi.fn(),
    setPickerOpen: vi.fn(),
    setActiveTool: vi.fn(),
    restoreInspectorView: vi.fn(),
    setInspectorOpen: vi.fn(),
    setSelectedElementId: vi.fn(),
    setError: vi.fn(),
    now: () => '2026-11-10T13:00:00.000Z',
    ...overrides
  }
  return {
    dependencies, changeScene, initialProject,
    getProject: () => currentProject,
    replaceProject: (next: EditorV6Document) => { currentProject = next }
  }
}

describe('comandos do elenco do Editor V6', () => {
  it('publica seleção e snapshots preservando elementos, assets e ordem de camadas', async () => {
    const prepared = preparedSnapshots()
    const context = setup({ prepareSnapshots: vi.fn(async (input) => {
      expect(input.characters.map(({ id }) => id)).toEqual(['c'])
      expect(input.startZIndex).toBe(5)
      expect(input.stageWidth).toBe(1600)
      expect(input.stageHeight).toBe(900)
      return prepared
    }) })
    const commands = createEditorV6CastCommands(context.dependencies)

    await commands.saveCastSelection()

    const saved = context.getProject()
    expect(saved.elements.map(({ id }) => id)).toEqual(['actor-a', 'prop', 'actor-c'])
    expect(saved.assets.map(({ id }) => id)).toEqual(['asset-a', 'asset-prop', 'asset-c'])
    expect(saved.elements.at(-1)?.zIndex).toBe(6)
    expect(saved.updatedAt).toBe('2026-11-10T13:00:00.000Z')
    expect(context.changeScene).toHaveBeenCalledOnce()
    expect(context.dependencies.setPickerOpen).toHaveBeenCalledWith(false)
    expect(context.dependencies.setActiveTool).toHaveBeenCalledWith(null)
    expect(context.dependencies.restoreInspectorView).toHaveBeenCalledOnce()
    expect(context.dependencies.setInspectorOpen).toHaveBeenCalledWith(true)
    expect(context.dependencies.setSelectedElementId).toHaveBeenCalledWith('actor-c')
    expect(context.dependencies.setError).toHaveBeenLastCalledWith(null)
    expect(context.dependencies.setSaving).toHaveBeenNthCalledWith(1, true)
    expect(context.dependencies.setSaving).toHaveBeenLastCalledWith(false)
  })

  it('retém assets que chegam enquanto os snapshots estão sendo preparados', async () => {
    let context: ReturnType<typeof setup>
    const concurrentAsset = asset('asset-concurrent', 'object')
    context = setup({ prepareSnapshots: async () => {
      context.replaceProject({ ...context.getProject(), assets: [...context.getProject().assets, concurrentAsset] })
      return preparedSnapshots()
    } })
    const commands = createEditorV6CastCommands(context.dependencies)

    await commands.saveCastSelection()

    expect(context.getProject().assets.map(({ id }) => id)).toContain('asset-concurrent')
  })

  it('mantém o seletor aberto e libera saving quando a preparação falha', async () => {
    const context = setup({ prepareSnapshots: async () => { throw new Error('falha sintética de snapshot') } })
    const commands = createEditorV6CastCommands(context.dependencies)

    await commands.saveCastSelection()

    expect(context.changeScene).not.toHaveBeenCalled()
    expect(context.dependencies.setPickerOpen).not.toHaveBeenCalled()
    expect(context.dependencies.setError).toHaveBeenCalledWith('falha sintética de snapshot')
    expect(context.dependencies.setSaving).toHaveBeenNthCalledWith(1, true)
    expect(context.dependencies.setSaving).toHaveBeenLastCalledWith(false)
  })

  it('ignora execução sem projeto ou enquanto outra gravação está ativa', async () => {
    for (const overrides of [{ activeProject: null }, { saving: true }]) {
      const context = setup(overrides)
      await createEditorV6CastCommands(context.dependencies).saveCastSelection()
      expect(context.dependencies.prepareSnapshots).not.toHaveBeenCalled()
      expect(context.dependencies.setSaving).not.toHaveBeenCalled()
    }
  })
})
