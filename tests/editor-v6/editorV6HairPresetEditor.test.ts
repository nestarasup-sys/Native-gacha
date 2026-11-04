import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FIRST_HAIR_MOTION_PRESET, HAIR_MOTION_PRESET_KEY, normalizeHairMotionPreset } from '../../src/shared/hairMotionEngine'
import { HAIR_MOTION_LAYER_CONTROLS, HAIR_MOTION_PHYSICS_CONTROLS } from '../../src/shared/hairMotionPresetControls'
import { EditorV6HairPresetEditor } from '../../src/renderer/src/features/editorV6/EditorV6HairPresetEditor'
import { saveEditorV6HairPresetSlot } from '../../src/renderer/src/features/editorV6/editorV6HairPresetStorage'

function storage(initial: string | null) {
  const values = new Map<string, string>()
  if (initial !== null) values.set(HAIR_MOTION_PRESET_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  }
}

describe('Editor V6 — presets sharing the Fabricator source of truth', () => {
  it('renders all seven physics parameters and all three layers without enabling timeline preview animation', () => {
    const html = renderToStaticMarkup(createElement(EditorV6HairPresetEditor, {
      slot: 2, preset: FIRST_HAIR_MOTION_PRESET, onChange: () => {}, onSave: () => {}, onDiscard: () => {}
    }))
    for (const control of HAIR_MOTION_PHYSICS_CONTROLS) {
      expect(html).toContain(control.label)
      expect(html).toContain(`min="${control.min}"`)
      expect(html).toContain(`max="${control.max}"`)
    }
    for (const side of HAIR_MOTION_LAYER_CONTROLS) expect(html).toContain(side.label)
    expect(html).toContain('Salvar Preset 2')
    expect(html).toContain('Descartar rascunho')
    expect(html).not.toContain('<canvas')
  })

  it('writes only the selected slot to the exact same localStorage key; retains the other four', () => {
    const old = [FIRST_HAIR_MOTION_PRESET, null, { ...FIRST_HAIR_MOTION_PRESET, physics: { ...FIRST_HAIR_MOTION_PRESET.physics, wind: 77 } }, null, null]
    const store = storage(JSON.stringify(old))
    const changed = { ...FIRST_HAIR_MOTION_PRESET, physics: { ...FIRST_HAIR_MOTION_PRESET.physics, wind: -87 } }
    const next = saveEditorV6HairPresetSlot(store, 2, changed)
    expect(next.length).toBe(5)
    expect(next[0]).toEqual(old[0])
    expect(next[1]?.physics.wind).toBe(-87)
    expect(next[2]).toEqual(old[2])
    expect(JSON.parse(store.getItem(HAIR_MOTION_PRESET_KEY)!)).toEqual(next)
  })

  it('does not overwrite invalid existing storage, invalid slot or invalid parameters', () => {
    const invalid = storage('{broken')
    expect(() => saveEditorV6HairPresetSlot(invalid, 2, FIRST_HAIR_MOTION_PRESET)).toThrow()
    expect(invalid.getItem(HAIR_MOTION_PRESET_KEY)).toBe('{broken')
    const empty = storage(null)
    expect(() => saveEditorV6HairPresetSlot(empty, 0, FIRST_HAIR_MOTION_PRESET)).toThrow()
    expect(() => saveEditorV6HairPresetSlot(empty, 2, { ...FIRST_HAIR_MOTION_PRESET, physics: { ...FIRST_HAIR_MOTION_PRESET.physics, gust: 900 } })).toThrow()
    expect(empty.getItem(HAIR_MOTION_PRESET_KEY)).toBeNull()
    expect(normalizeHairMotionPreset(saveEditorV6HairPresetSlot(empty, 2, FIRST_HAIR_MOTION_PRESET)[1])).not.toBeNull()
  })
})
