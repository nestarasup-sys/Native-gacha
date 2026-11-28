import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import { createEditorV6DocumentCommands } from '../../src/renderer/src/features/editorV6/editorV6DocumentCommands'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'

const projectId = '163b33b4-4b4b-4e45-a840-045944922630'
const sourceMediaId = '263b33b4-4b4b-4e45-a840-045944922630'
const targetMediaId = '363b33b4-4b4b-4e45-a840-045944922630'
const date = '2026-11-25T12:00:00.000Z'
const roots: string[] = []

afterEach(async () => {
  useEditorV6Store.getState().clear(projectId)
  useEditorV6Store.getState().setActiveProject(null)
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('largura em lote do Editor V6 e persistência', () => {
  it('salva e reabre a largura aplicada a todos os vídeos sem alterar os demais parâmetros', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'editor-v6-video-width-persistence-'))
    roots.push(root)
    const source = {
      id: '463b33b4-4b4b-4e45-a840-045944922630', label: 'Origem', mediaId: sourceMediaId,
      startFrame: 0, durationFrames: 30, mediaLayout: { x: 0, y: 0, width: 53, height: 40, rotation: 0 }
    }
    const target = {
      id: '563b33b4-4b4b-4e45-a840-045944922630', label: 'Destino', mediaId: targetMediaId,
      startFrame: 30, durationFrames: 30, mediaInFrame: 4, audioEnabled: false, gain: 0.35,
      mediaLayout: { x: 13, y: -7, width: 88, height: 62, rotation: 16 }
    }
    const hidden = {
      id: '663b33b4-4b4b-4e45-a840-045944922630', label: 'Oculto', mediaId: sourceMediaId,
      startFrame: 60, durationFrames: 30, mediaLayout: { x: -4, y: 3, width: 71, height: 51, rotation: -9 }
    }
    const hiddenVideo = {
      id: 'a63b33b4-4b4b-4e45-a840-045944922630', label: 'Também oculto', mediaId: targetMediaId,
      startFrame: 0, durationFrames: 30, mediaLayout: { x: 2, y: 5, width: 36, height: 41, rotation: 7 }
    }
    const document: EditorV6Document = {
      schemaVersion: 1, id: projectId, title: 'Largura em lote', color: '#ffffff', createdAt: date, updatedAt: date,
      backgroundColor: '#000000', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
      backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, assets: [], elements: [],
      media: [sourceMediaId, targetMediaId].map((id, index) => ({
        id, name: `Vídeo ${index + 1}`, fileName: `${id}.mp4`, libraryVideoId: id, kind: 'video' as const, mimeType: 'video/mp4',
        sourceFrames: 100, hasAudio: true, width: index ? 1080 : 1920, height: index ? 1920 : 1080, sizeBytes: 100
      })),
      timeline: { fps: 30, durationFrames: 90, tracks: [{
        id: '763b33b4-4b4b-4e45-a840-045944922630', kind: 'video', name: 'Vídeo', muted: false, locked: false, hidden: true,
        blocks: [source, target, hidden, hiddenVideo]
      }] }
    }
    useEditorV6Store.getState().setActiveProject(document)
    let unsaved = 0
    const commandsForCurrentState = () => {
      const currentStore = useEditorV6Store.getState()
      const currentProject = currentStore.activeProject!
      return createEditorV6DocumentCommands({
        activeProject: currentProject, activeProjectId: currentProject.id, activeProjectIdRef: { current: currentProject.id },
        selectedElementId: null, selectedTimelineBlockId: source.id, setSelectedElementId: () => {},
        updateActiveProject: currentStore.updateActiveProject, setActiveProject: currentStore.setActiveProject,
        now: () => '2026-11-25T12:01:00.000Z', markUnsaved: () => { unsaved++ },
        writeDocumentInOrder: async () => {}, upsertSummary: () => {}, setSaved: () => {}, setError: () => {},
        setCanUndo: () => {}, setCanRedo: () => {}, bumpHistoryVersion: () => {}, getFrame: () => 0
      })
    }

    commandsForCurrentState().applyVideoWidthToAll(source.id)
    const edited = useEditorV6Store.getState().activeProject!
    expect(unsaved).toBe(1)
    expect(useEditorV6Store.getState().histories[projectId].undo).toHaveLength(1)
    const blocks = edited.timeline.tracks.flatMap(track => track.blocks)
    expect(blocks.map(block => block.mediaLayout?.width)).toEqual([53, 53, 53, 53])
    expect(blocks[1]).toMatchObject({ startFrame: 30, durationFrames: 30, mediaInFrame: 4, audioEnabled: false, gain: 0.35,
      mediaLayout: { x: 13, y: -7, width: 53, height: 62, rotation: 16 } })
    expect(blocks[3]).toMatchObject({ mediaLayout: { x: 2, y: 5, width: 53, height: 41, rotation: 7 } })

    commandsForCurrentState().undo()
    const undone = useEditorV6Store.getState().activeProject!
    expect(undone.timeline.tracks.flatMap(track => track.blocks).map(block => block.mediaLayout?.width)).toEqual([53, 88, 71, 36])
    commandsForCurrentState().redo()
    expect(useEditorV6Store.getState().activeProject!.timeline.tracks.flatMap(track => track.blocks).map(block => block.mediaLayout?.width))
      .toEqual([53, 53, 53, 53])

    const persistence = createEditorV6DocumentPersistence({
      files: fs, editorV6Path: id => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
      validate: (value): value is EditorV6Document => editorV6DocumentSchema.safeParse(value).success,
      assertLibraryVideoReferencesAvailable: async () => {}, assertLibraryBackgroundReferencesAvailable: async () => {},
      assertLibraryMediaReferencesAvailable: async () => {}, coordinateLibraryReferenceChange: operation => operation(),
      decodeImage: data => Buffer.from(data.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes })
    })
    await persistence.writeEditorV6(edited)
    const reopened = (await persistence.readEditorV6(projectId))!
    const reopenedBlocks = reopened.timeline.tracks.flatMap(track => track.blocks)
    expect(reopenedBlocks.map(block => block.mediaLayout?.width)).toEqual([53, 53, 53, 53])
    expect(reopenedBlocks[1]).toMatchObject({ mediaInFrame: 4, audioEnabled: false, gain: 0.35,
      mediaLayout: { x: 13, y: -7, width: 53, height: 62, rotation: 16 } })
    expect(reopened.timeline.tracks.find(track => track.id === '763b33b4-4b4b-4e45-a840-045944922630')?.hidden).toBe(true)
  })
})
