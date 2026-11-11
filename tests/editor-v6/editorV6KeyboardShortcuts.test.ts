import { describe, expect, it } from 'vitest'
import { resolveEditorV6KeyboardShortcut } from '../../src/renderer/src/features/editorV6/editorV6KeyboardShortcuts'

const base = { key: '', ctrlKey: false, metaKey: false, shiftKey: false, editableTarget: false, dragActive: false, castPickerOpen: false, savingCast: false, fullView: false }

describe('atalhos globais do Editor V6', () => {
  it('prioriza cancelar o arraste sobre o desfazer', () => {
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'z', ctrlKey: true, dragActive: true })).toMatchObject({ preventDefault: true, cancelDrag: true, undo: false })
  })
  it('fecha seletor e visualização com Escape, sem conflitar com campos editáveis', () => {
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'Escape', castPickerOpen: true, fullView: true })).toMatchObject({ closeCastPicker: true, exitFullView: true })
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'z', ctrlKey: true, editableTarget: true })).toMatchObject({ preventDefault: false, undo: false, redo: false })
  })
  it('mapeia Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z e Ctrl/Cmd+Y', () => {
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'z', metaKey: true })).toMatchObject({ undo: true, redo: false })
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'Z', ctrlKey: true, shiftKey: true })).toMatchObject({ undo: false, redo: true })
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'y', ctrlKey: true })).toMatchObject({ redo: true })
  })
  it('não fecha o seletor de elenco enquanto está salvando', () => {
    expect(resolveEditorV6KeyboardShortcut({ ...base, key: 'Escape', castPickerOpen: true, savingCast: true })).toMatchObject({ closeCastPicker: false })
  })
})
