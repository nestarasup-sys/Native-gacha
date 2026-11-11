import { describe, expect, it } from 'vitest'
import { resolveEditorV6TimelineKeyCommand, type EditorV6TimelineKeyInput } from '../../src/renderer/src/features/editorV6/editorV6TimelineKeyboard'

const base: EditorV6TimelineKeyInput = {
  key: '', ctrlKey: false, metaKey: false, shiftKey: false,
  editableTarget: false, defaultPrevented: false, selectedId: 'block-1', frame: 10, durationFrames: 100
}

describe('atalhos locais da timeline do Editor V6', () => {
  it('mapeia divisão e duplicação somente com bloco selecionado e modificador', () => {
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'k', ctrlKey: true })).toEqual({ action: 'split', preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'd', metaKey: true })).toEqual({ action: 'duplicate', preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'k', ctrlKey: true, selectedId: null })).toBeNull()
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 's', ctrlKey: true })).toBeNull()
  })

  it('resolve os comandos de snap, zoom, fit, play e remoção', () => {
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 's' })).toMatchObject({ action: 'toggle-snap' })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: '=' })).toMatchObject({ action: 'zoom-in' })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: '-' })).toMatchObject({ action: 'zoom-out' })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'z', shiftKey: true })).toMatchObject({ action: 'fit' })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: ' ' })).toMatchObject({ action: 'play' })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'Delete' })).toEqual({ action: 'remove', blockId: 'block-1', preventDefault: true })
  })

  it('limita seek por quadro, incluindo passos de cinco quadros e home/end', () => {
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'ArrowLeft' })).toEqual({ action: 'seek', frame: 9, preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'ArrowRight', shiftKey: true, frame: 98 })).toEqual({ action: 'seek', frame: 100, preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'Home', frame: 0 })).toEqual({ action: 'seek', frame: 0, preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'End' })).toEqual({ action: 'seek', frame: 100, preventDefault: true })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'ArrowLeft', frame: 0 })).toEqual({ action: 'seek', frame: 0, preventDefault: true })
  })

  it('preserva Escape sem preventDefault e ignora edição/diálogo ou evento já tratado', () => {
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 'Escape' })).toEqual({ action: 'cancel', preventDefault: false })
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 's', editableTarget: true })).toBeNull()
    expect(resolveEditorV6TimelineKeyCommand({ ...base, key: 's', defaultPrevented: true })).toBeNull()
  })
})
