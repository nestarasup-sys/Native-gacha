import { createRequire } from 'node:module'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element, type EditorV6Asset } from '../../src/shared/editorV6'
import { isEditorV6BlinkFrame } from '../../src/shared/editorV6FaceSchedule'
import { resolveEditorV6PreviewSceneAtFrame } from '../../src/shared/editorV6PreviewScene'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { materializeEngineV6LegacyFrame, planEngineV6DocumentFrame, planEngineV6ResolvedScene } from '../../src/engine-v6/v6FrameAdapter'

const { renderOfflineFrame } = createRequire(import.meta.url)('../../scripts/editor-v6/engine-v3/offlineCompositor.cjs') as {
  renderOfflineFrame: (plan: ReturnType<typeof materializeEngineV6LegacyFrame>) => Promise<Buffer>
}

function actor(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'actor', kind: 'character', characterId: 'alice', assetId: 'base',
    text: 'Alice', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, zIndex: 1, poseSlot: 1, ...overrides
  }
}
function asset(id: string, dataUrl = 'data:image/png;base64,AA=='): EditorV6Asset {
  return { id, category: 'character', name: id, mimeType: 'image/png', dataUrl }
}
function project(elements: EditorV6Element[] = [actor()], assets: EditorV6Asset[] = [asset('base')]): EditorV6Document {
  return {
    schemaVersion: 1, id: 'fixture-engine-v6', title: 'Frame plan sintético',
    color: '#aabbcc', createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
    backgroundColor: '#123456', backgroundAssetId: null,
    backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
    backgroundRotation: 0, assets, elements, timeline: createEditorV6Timeline(elements)
  }
}

describe('Engine V6 — contrato de frame 1.0', () => {
  it('produces stable versioned frame plans without copying image bytes or mutating documents', () => {
    const doc = project()
    const original = JSON.stringify(doc)
    const first = planEngineV6DocumentFrame(doc, 0, { width: 16, height: 9 })
    const again = planEngineV6DocumentFrame(doc, 0, { width: 16, height: 9 })
    expect(first).toEqual(again)
    expect(JSON.stringify(doc)).toBe(original)
    expect(first).toMatchObject({ contractVersion: 1, projectId: doc.id, sourceFrame: 0, logicalHeight: 1080, requiredAssetIds: ['base'] })
    expect(first.commands).toEqual([{ kind: 'image', assetId: 'base', x: 960, y: 540,
      width: 1920, height: 1080, rotation: 0, opacity: 1, flipX: false, contain: false }])
    expect(JSON.stringify(first)).not.toContain('data:image/')
    expect(materializeEngineV6LegacyFrame(doc, first).assets).toEqual([{ id: 'base', dataUrl: doc.assets[0].dataUrl }])
  })

  it('retains character geometry, motion atlas crop and flip', () => {
    const figure = actor({ x: 10, y: -5, width: 20, height: 30, characterScale: 150, characterWidthScale: 50, flipX: true, rotation: 45 })
    const doc = project([figure])
    const scene = resolveEditorV6SceneAtFrame(doc, 5)
    const withAtlas = {
      ...scene,
      elements: [{ ...scene.elements[0], motionSprite: { x: 8, y: 1, width: 8, height: 16, atlasWidth: 16, atlasHeight: 16 } }]
    }
    const planned = planEngineV6ResolvedScene(doc, withAtlas, { width: 1920, height: 1080 })
    expect(planned.requiredAssetIds).toEqual(['base'])
    expect(planned.commands[0]).toMatchObject({ kind: 'image', x: 1152, y: 486,
      width: 288, height: 486, rotation: 45, flipX: true,
      source: { x: 8, y: 1, width: 8, height: 16 } })
  })

  it('plans a background and independent foreground without duplicating resource IDs', () => {
    const doc = project([actor(), actor({ id: 'actor-two', zIndex: 2 })], [asset('base'), asset('bg')])
    doc.backgroundAssetId = 'bg'
    const all = planEngineV6DocumentFrame(doc, 0, { width: 640, height: 360 })
    expect(all.requiredAssetIds).toEqual(['bg', 'base'])
    expect(all.commands.map(command => command.kind === 'image' ? command.assetId : 'solid')).toEqual(['bg', 'base', 'base'])
    const background = planEngineV6DocumentFrame(doc, 0, { width: 640, height: 360, layer: 'background' })
    const foreground = planEngineV6DocumentFrame(doc, 0, { width: 640, height: 360, layer: 'foreground' })
    expect(background.requiredAssetIds).toEqual(['bg'])
    expect(foreground.requiredAssetIds).toEqual(['base'])
    expect(foreground.backgroundColor).toBe('transparent')
  })

  it('rejects unsupported text, mouth masks, active video and missing assets explicitly', () => {
    const doc = project()
    const scene = resolveEditorV6SceneAtFrame(doc, 0)
    const options = { width: 640, height: 360 }
    expect(() => planEngineV6ResolvedScene(doc, { ...scene, elements: [{ ...actor(), kind: 'speech' }] }, options)).toThrow(/Texto/)
    expect(() => planEngineV6ResolvedScene(doc, { ...scene, elements: [{ ...actor(), mouthPatch: { assetId: 'face' } as EditorV6Element['mouthPatch'] }] }, options)).toThrow(/Composição facial/)
    expect(() => planEngineV6ResolvedScene(doc, { ...scene, mediaVideo: {} as NonNullable<typeof scene.mediaVideo> }, options)).toThrow(/Vídeo sobreposto/)
    expect(() => planEngineV6ResolvedScene(doc, { ...scene, elements: [{ ...actor(), assetId: 'missing' }] }, options)).toThrow(/Asset não encontrado/)
    expect(() => planEngineV6DocumentFrame(doc, -1, options)).toThrow(/fora dos limites/)
    expect(() => planEngineV6DocumentFrame(doc, 0, { width: -1, height: 1080 })).toThrow(/Dimensões/)
  })

  it('refuses cross-project materialization and external media URLs', () => {
    const doc = project()
    const planned = planEngineV6DocumentFrame(doc, 0, { width: 8, height: 8 })
    expect(() => materializeEngineV6LegacyFrame({ ...doc, id: 'another-project' }, planned)).toThrow(/incompatível/)
    const external = { ...doc, assets: [asset('base', 'gacha-editor-media://asset/fixture/a')] }
    expect(() => materializeEngineV6LegacyFrame(external, planned)).toThrow(/resolução de mídia/)
  })

  it('produces real pixels from a V6 document using the headless Sharp renderer', async () => {
    const redPng = await sharp({ create: { width: 1, height: 1, channels: 4,
      background: '#ff0000ff' } }).png().toBuffer()
    const doc = project([actor()], [asset('base', `data:image/png;base64,${redPng.toString('base64')}`)])
    const ir = planEngineV6DocumentFrame(doc, 0, { width: 16, height: 9 })
    const rgba = await renderOfflineFrame(materializeEngineV6LegacyFrame(doc, ir))
    expect(rgba.length).toBe(16 * 9 * 4)
    expect([...rgba.subarray((4 * 16 + 8) * 4, (4 * 16 + 8) * 4 + 4)]).toEqual([255, 0, 0, 255])
  })
})

describe('Editor V6 — política de prévia leve', () => {
  it('does not sample speech-mouth modes but keeps deterministic automatic blinking', () => {
    const character = actor({ faceModeAssetIds: { blink: 'blink', talk: 'talk', 'talk-blink': 'talk-blink' } })
    const doc = project([character], [asset('base'), asset('blink'), asset('talk'), asset('talk-blink')])
    doc.timeline = { ...doc.timeline, tracks: [...doc.timeline.tracks, {
      id: 'speech-track', kind: 'speech', name: 'Fala', muted: false, locked: false,
      blocks: [{ id: 'speech', label: 'Fala', characterId: 'alice', startFrame: 0, durationFrames: 180 }]
    }] }
    const blink = Array.from({ length: 180 }, (_, frame) => frame).find(frame => isEditorV6BlinkFrame(doc.id, 'alice', frame))
    const nonBlink = Array.from({ length: 180 }, (_, frame) => frame).find(frame => !isEditorV6BlinkFrame(doc.id, 'alice', frame))
    expect(blink).toBeDefined()
    expect(nonBlink).toBeDefined()
    expect(resolveEditorV6PreviewSceneAtFrame(doc, blink!).elements[0].assetId).toBe('blink')
    expect(resolveEditorV6PreviewSceneAtFrame(doc, nonBlink!).elements[0].assetId).toBe('base')
    expect(resolveEditorV6SceneAtFrame(doc, nonBlink!).elements[0].assetId).toBe('talk')
  })
})
