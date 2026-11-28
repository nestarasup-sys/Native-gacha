import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EditorV6Element, EditorV6Timeline, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { stabilizeEditorV6CharacterTrackFaceGeometry } from '../../src/shared/editorV6CharacterFaceGeometry'
import { normalizeEditorV6Timeline } from '../../src/shared/editorV6TimelineCore'

function state(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'actor', kind: 'character', characterId: 'seraphina', text: 'Seraphina',
    x: -32.353750185676596, y: 23.59504149901243, width: 45.53821496544125, height: 100.93415276558385,
    characterCanvasWidth: 45.53821496544125, rotation: 0, zIndex: 1, characterScale: 121,
    characterWidthScale: 100, characterHeightScale: 100, poseSlot: 2, poseSourceRevision: 'same-pose', faceRendererVersion: 11,
    activeExpressionPresetId: 'd7b56e24-12f4-4a1b-8d1d-154c317f169a', ...overrides
  }
}

function track(states: EditorV6Element[]): EditorV6TimelineTrack {
  return { id: 'track', kind: 'character', characterId: 'seraphina', name: 'Seraphina', muted: false, locked: false,
    blocks: states.map((entry, index) => ({ id: `block-${index}`, elementId: entry.id, state: entry, label: entry.text,
      startFrame: index * 100, durationFrames: 100 })) }
}

describe('geometria facial estável dos personagens do Editor V6', () => {
  it('normaliza snapshots V11 antigos sem apagar transformações intencionais', () => {
    const before = state()
    const after = state({ id: 'actor', y: 23.607904804495362, height: 101.07279857982229, activeExpressionPresetId: 'd8b56e24-12f4-4a1b-8d1d-154c317f169a' })
    const intentionallyMoved = state({ id: 'actor', y: 31, height: 101.18, activeExpressionPresetId: 'd9b56e24-12f4-4a1b-8d1d-154c317f169a' })
    const changedPose = state({ id: 'actor', poseSlot: 4, poseSourceRevision: 'other-pose', height: 104, activeExpressionPresetId: 'dab56e24-12f4-4a1b-8d1d-154c317f169a' })
    const migrated = stabilizeEditorV6CharacterTrackFaceGeometry(track([before, after, intentionallyMoved, changedPose]))
    const [first, normalized, moved, posed] = migrated.blocks.map((block) => block.state!)

    expect(normalized).toMatchObject({ width: first.width, height: first.height, characterCanvasWidth: first.characterCanvasWidth, x: first.x, y: first.y })
    expect(moved).toMatchObject({ height: first.height, y: 31 })
    expect(posed.height).toBe(104)
    expect(after.height - first.height).toBeCloseTo(0.13864581423844, 10)
  })

  it('migra snapshots faciais anteriores ao quadro de origem mantendo a pose e o movimento', () => {
    const legacy = state({ faceRendererVersion: 10, height: 101.1, activeExpressionPresetId: 'sad' })
    const normalized = stabilizeEditorV6CharacterTrackFaceGeometry(track([state(), legacy]))
    expect(normalized.blocks[1].state).toMatchObject({ height: state().height, y: state().y, faceRendererVersion: 10, activeExpressionPresetId: 'sad' })
  })

  it('estabiliza retratos da Intro ao normalizar qualquer edição da timeline', () => {
    const introTrack: EditorV6TimelineTrack = {
      id: 'intro-track', kind: 'intro', name: 'Intro', muted: false, locked: false,
      blocks: [
        { id: 'intro-a', label: 'Seraphina', startFrame: 0, durationFrames: 100, intro: {
          kind: 'character', characterId: 'seraphina', assetId: 'asset-a', text: 'Olá', englishText: 'Hello', flipX: false,
          faceRendererVersion: 11, portraitAspect: 0.5, poseSlot: 3,
          portraitLayout: { characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 },
          portraitFrame: { x: 0, y: 0, width: 20, height: 40 }
        } },
        { id: 'intro-b', label: 'Seraphina triste', startFrame: 100, durationFrames: 100, intro: {
          kind: 'character', characterId: 'seraphina', assetId: 'asset-b', text: 'Estou triste', englishText: 'I am sad', flipX: false,
          faceRendererVersion: 10, portraitAspect: 0.51, poseSlot: 3,
          portraitLayout: { characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 },
          portraitFrame: { x: 0.0001, y: 0.0001, width: 20.1, height: 40.2 }
        } }
      ]
    }
    const timeline: EditorV6Timeline = { fps: 30, durationFrames: 200, tracks: [introTrack] }
    const normalized = normalizeEditorV6Timeline(timeline).tracks[0]
    const [first, second] = normalized.blocks.map(block => block.intro!)
    expect(second).toMatchObject({ kind: 'character', portraitAspect: 0.5,
      portraitFrame: { x: 0, y: 0, width: 20, height: 40 }, poseSlot: 3 })
    expect(normalizeEditorV6Timeline({ ...timeline, tracks: [normalized] }).tracks[0]).toBe(normalized)
  })

  it('preserva transformações deliberadas no retrato e separa poses diferentes', () => {
    const introTrack: EditorV6TimelineTrack = {
      id: 'intro-track', kind: 'intro', name: 'Intro', muted: false, locked: false,
      blocks: [
        { id: 'intro-a', label: 'A', startFrame: 0, durationFrames: 100, intro: {
          kind: 'character', characterId: 'seraphina', assetId: 'asset-a', text: 'A', englishText: 'A', flipX: false,
          faceRendererVersion: 11, portraitAspect: 0.5, poseSlot: 3, portraitFrame: { x: 0, y: 0, width: 20, height: 40 }
        } },
        { id: 'intro-b', label: 'B', startFrame: 100, durationFrames: 100, intro: {
          kind: 'character', characterId: 'seraphina', assetId: 'asset-b', text: 'B', englishText: 'B', flipX: false,
          faceRendererVersion: 11, portraitAspect: 0.52, poseSlot: 3, portraitFrame: { x: 2, y: 3, width: 22, height: 44 }
        } },
        { id: 'intro-c', label: 'C', startFrame: 200, durationFrames: 100, intro: {
          kind: 'character', characterId: 'seraphina', assetId: 'asset-c', text: 'C', englishText: 'C', flipX: false,
          faceRendererVersion: 11, portraitAspect: 0.6, poseSlot: 4, portraitFrame: { x: 0, y: 0, width: 30, height: 50 }
        } }
      ]
    }
    const normalized = stabilizeEditorV6CharacterTrackFaceGeometry(introTrack)
    expect(normalized.blocks[1].intro).toMatchObject({ portraitAspect: 0.5,
      portraitFrame: { x: 2, y: 3, width: 20, height: 40 } })
    expect(normalized.blocks[2].intro).toMatchObject({ portraitAspect: 0.6,
      portraitFrame: { width: 30, height: 50 }, poseSlot: 4 })
  })

  it('normaliza a geometria legada ao carregar sem regravar o manifesto original', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'editor-v6-face-geometry-load-'))
    try {
      const projectId = 'd1b56e24-12f4-4a1b-8d1d-154c317f169a'
      const assetId = 'd2b56e24-12f4-4a1b-8d1d-154c317f169a'
      const actorId = 'd3b56e24-12f4-4a1b-8d1d-154c317f169a'
      const first = state({ id: actorId, assetId })
      const second = state({ id: actorId, assetId, faceRendererVersion: 10,
        activeExpressionPresetId: 'd8b56e24-12f4-4a1b-8d1d-154c317f169a', height: 101.07279857982229, y: 23.607904804495362 })
      const project: EditorV6Document = {
        schemaVersion: 1, id: projectId, title: 'Compatibilidade de expressões', color: '#d7b5cd',
        createdAt: '2026-11-27T00:00:00.000Z', updatedAt: '2026-11-27T00:00:00.000Z', backgroundColor: '#d7b5cd',
        backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
        backgroundRotation: 0, assets: [{ id: assetId, category: 'character', name: 'Seraphina', mimeType: 'image/png' }],
        elements: [first], timeline: { fps: 30, durationFrames: 200, knownElementIds: [actorId], tracks: [{
          id: 'd4b56e24-12f4-4a1b-8d1d-154c317f169a', kind: 'character', characterId: actorId, name: 'Seraphina',
          muted: false, locked: false, blocks: [first, second].map((entry, index) => ({
            id: `d${5 + index}b56e24-12f4-4a1b-8d1d-154c317f169a`, elementId: actorId, state: entry,
            label: 'Seraphina', startFrame: index * 100, durationFrames: 100
          }))
        }] }
      }
      const folder = join(root, `editorV6-${projectId}`)
      await fs.mkdir(join(folder, 'assets', 'characters'), { recursive: true })
      await fs.writeFile(join(folder, 'assets', 'characters', `${assetId}.png`), Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64'
      ))
      const manifest = JSON.stringify({ ...project, assets: [{ id: assetId, category: 'character', name: 'Seraphina', mimeType: 'image/png' }] })
      const manifestPath = join(folder, 'editorV6.json')
      await fs.writeFile(manifestPath, manifest)
      const persistence = createEditorV6DocumentPersistence({
        files: fs, editorV6Path: id => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
        validate: value => editorV6DocumentSchema.safeParse(value).success,
        assertLibraryVideoReferencesAvailable: async () => {}, assertLibraryBackgroundReferencesAvailable: async () => {},
        assertLibraryMediaReferencesAvailable: async () => {}, coordinateLibraryReferenceChange: operation => operation(),
        decodeImage: value => Buffer.from(value.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes })
      })

      const loaded = await persistence.readEditorV6(projectId)
      expect(loaded).not.toBeNull()
      const loadedTrack = loaded!.timeline.tracks.find(track => track.kind === 'character')!
      expect(loadedTrack.blocks[1].state).toMatchObject({ height: first.height, y: first.y, activeExpressionPresetId: second.activeExpressionPresetId })
      expect(await fs.readFile(manifestPath, 'utf8')).toBe(manifest)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
