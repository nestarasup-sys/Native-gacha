import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6ClipAtFrame, timelineClips } from '../../src/shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { prepareEditorV6StageDrag, type EditorV6StageDrag } from '../../src/renderer/src/features/editorV6/editorV6StageDrag'
import { commitEditorV6StageDrag, rollbackEditorV6StageDrag } from '../../src/renderer/src/features/editorV6/editorV6StageDragLifecycle'

const timestamp = '2026-11-10T19:00:00.000Z'

function projectFixture(): EditorV6Document {
  const actor: EditorV6Element = {
    id: 'actor-1', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'Lia',
    x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1
  }
  return {
    schemaVersion: 1, id: 'project-1', title: 'Teste', color: '#d7b5cd',
    createdAt: timestamp, updatedAt: timestamp,
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor],
    assets: [{ id: 'asset-1', category: 'character', name: 'Lia', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }],
    timeline: createEditorV6Timeline([actor])
  }
}

function dragFixture(target: EditorV6StageDrag['target'], moved = true): EditorV6StageDrag {
  const project = projectFixture()
  const frame = 0
  if (target === 'video') {
    project.timeline.tracks.find((track) => track.kind === 'video')!.blocks.push({
      id: 'video-block', label: 'Vídeo', mediaId: 'media-1', startFrame: 0, durationFrames: 90,
      mediaLayout: { x: 3, y: 4, width: 40, height: 25, rotation: 12 }
    })
  }
  const scene = resolveEditorV6SceneAtFrame(project, frame, { includeMotion: false })
  const id = target === 'background' ? 'background' : target === 'video' ? 'media-video:video-block' : 'actor-1'
  const element = target === 'element' ? scene.elements.find((candidate) => candidate.id === id) : undefined
  const videoClip = target === 'video' ? timelineClips(project.timeline).find(({ block }) => block.id === 'video-block') : undefined
  const prepared = prepareEditorV6StageDrag({
    project, scene, id, target, element, videoClip,
    pointerId: 1, startX: 10, startY: 20, width: 200, height: 100
  })
  if (!prepared) throw new Error(`Não foi possível preparar o arraste ${target} do teste.`)
  return { ...prepared, moved }
}

function lifecycleHarness(initial: EditorV6Document) {
  const events: unknown[] = []
  let project = initial
  const dependencies = {
    updateActiveProject: (update: (current: EditorV6Document) => EditorV6Document) => {
      events.push('update')
      project = update(project)
    },
    setSelectedTimelineBlockId: (id: string | null) => events.push(['selection', id]),
    markUnsaved: () => events.push('unsaved'),
    recordHistory: (document: EditorV6Document) => events.push(['history', document]),
    now: () => { events.push('now'); return timestamp }
  }
  return { dependencies, events, getProject: () => project }
}

describe('finalização de arraste do palco no Editor V6', () => {
  it('cancela elemento restaurando o snapshot e selecionando o bloco anterior sem registrar histórico', () => {
    const drag = dragFixture('element')
    const current = structuredClone(drag.before)
    current.elements[0].x = 40
    const { dependencies, events, getProject } = lifecycleHarness(current)

    rollbackEditorV6StageDrag(drag, dependencies)

    expect(getProject()).toEqual({ ...drag.before, updatedAt: timestamp })
    expect(events).toEqual([
      'update', 'now', ['selection', editorV6ClipAtFrame(drag.before.timeline, drag.id, drag.frame)?.block.id ?? null], 'unsaved'
    ])
  })

  it('cancela fundo sem seleção de bloco e vídeo mantendo o bloco de vídeo selecionado', () => {
    const backgroundDrag = dragFixture('background')
    const backgroundHarness = lifecycleHarness(backgroundDrag.before)
    rollbackEditorV6StageDrag(backgroundDrag, backgroundHarness.dependencies)
    expect(backgroundHarness.events).toContainEqual(['selection', null])

    const videoDrag = dragFixture('video')
    const videoHarness = lifecycleHarness(videoDrag.before)
    rollbackEditorV6StageDrag(videoDrag, videoHarness.dependencies)
    expect(videoHarness.events).toContainEqual(['selection', videoDrag.blockId])
  })

  it('confirma a posição transitória e registra o snapshot anterior uma única vez', () => {
    const drag = dragFixture('element')
    const current = structuredClone(drag.before)
    current.elements[0].x = 40
    const { dependencies, events, getProject } = lifecycleHarness(current)

    commitEditorV6StageDrag(drag, dependencies)

    expect(getProject().elements[0].x).toBe(40)
    expect(getProject().updatedAt).toBe(timestamp)
    expect(events).toEqual([['history', drag.before], 'update', 'now', 'unsaved'])
  })

  it('não grava histórico nem marca o projeto como alterado para um clique sem movimento', () => {
    const drag = dragFixture('element', false)
    const { dependencies, events } = lifecycleHarness(drag.before)

    rollbackEditorV6StageDrag(drag, dependencies)
    commitEditorV6StageDrag(drag, dependencies)

    expect(events).toEqual([])
  })

  it('não sobrescreve outro projeto se a troca acontecer antes de finalizar o gesto', () => {
    const drag = dragFixture('element')
    const otherProject = { ...drag.before, id: 'project-2', title: 'Outro projeto' }
    const rollbackHarness = lifecycleHarness(otherProject)
    rollbackEditorV6StageDrag(drag, rollbackHarness.dependencies)
    expect(rollbackHarness.getProject()).toBe(otherProject)
    expect(rollbackHarness.events).not.toContain('now')

    const commitHarness = lifecycleHarness(otherProject)
    commitEditorV6StageDrag(drag, commitHarness.dependencies)
    expect(commitHarness.getProject()).toBe(otherProject)
    expect(commitHarness.events).toContainEqual(['history', drag.before])
    expect(commitHarness.events).not.toContain('now')
  })
})
