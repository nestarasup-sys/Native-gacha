import { describe, expect, it } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../src/shared/editorV6'
import { createEditorV6TimelinePointerCommands } from '../../src/renderer/src/features/editorV6/editorV6TimelinePointerCommands'

function makeTimeline() {
  const block: EditorV6TimelineBlock = { id: 'block-1', elementId: 'actor', label: 'Actor', startFrame: 30, durationFrames: 60 }
  const track: EditorV6TimelineTrack = { id: 'track-1', kind: 'character', characterId: 'actor', name: 'Actor', muted: false, locked: false, blocks: [block] }
  const timeline: EditorV6Timeline = { fps: 30, durationFrames: 300, tracks: [track] }
  const document = { id: 'project-1', timeline } as EditorV6Document
  return { block, track, timeline, document }
}

function harness() {
  const fixture = makeTimeline()
  const events: unknown[] = []
  const scroll = {
    scrollLeft: 20,
    getBoundingClientRect: () => ({ left: 10 })
  } as HTMLElement
  const didDrag = { current: false }
  const commands = createEditorV6TimelinePointerCommands({
    scrollNode: () => scroll,
    document: () => fixture.document,
    frame: () => 45,
    settings: () => ({ pps: 30, snap: false, heading: 100 }),
    didDrag,
    seek: (frame) => events.push(['seek', frame]),
    select: (block) => events.push(['select', block.id]),
    changeTimeline: (update) => events.push(['commit', update(fixture.timeline)]),
    closeMenu: () => events.push(['close-menu']),
    setDraft: (timeline) => events.push(['draft', timeline?.tracks[0].blocks[0].startFrame ?? null]),
    setGuide: (frame) => events.push(['guide', frame]),
    setReadout: (block) => events.push(['readout', block?.startFrame ?? null])
  })
  return { commands, events, fixture, didDrag }
}

function pointerEvent(overrides: Record<string, unknown> = {}) {
  const event = {
    button: 0,
    clientX: 100,
    pointerId: 7,
    type: 'pointerdown',
    altKey: false,
    stopPropagation: () => undefined,
    currentTarget: { setPointerCapture: (id: number) => captures.push(id) },
    ...overrides
  }
  return event as unknown as ReactPointerEvent<HTMLElement>
}

const captures: number[] = []

describe('interações de ponteiro da timeline do Editor V6', () => {
  it('captura, cria prévia ao arrastar, grava ao soltar e limpa os indicadores', () => {
    captures.length = 0
    const { commands, events, fixture, didDrag } = harness()
    commands.onPointer(pointerEvent(), fixture.track, fixture.block, 'move')
    commands.movePointer(pointerEvent({ type: 'pointermove', clientX: 130 }))
    commands.endPointer(pointerEvent({ type: 'pointerup', clientX: 130 }))

    expect(captures).toEqual([7])
    expect(didDrag.current).toBe(true)
    expect(events).toEqual([
      ['seek', 30], ['select', 'block-1'], ['close-menu'],
      ['draft', 60], ['guide', undefined], ['readout', 60],
      ['commit', expect.objectContaining({ tracks: [expect.objectContaining({ blocks: [expect.objectContaining({ startFrame: 60 })] })] })],
      ['draft', null], ['guide', undefined], ['readout', null]
    ])
  })

  it('ignora pointer diferente e o cancelamento descarta drag provisório', () => {
    const { commands, events, fixture } = harness()
    commands.onPointer(pointerEvent(), fixture.track, fixture.block, 'move')
    commands.movePointer(pointerEvent({ pointerId: 8, type: 'pointermove', clientX: 130 }))
    expect(events).toEqual([['seek', 30], ['select', 'block-1'], ['close-menu']])
    commands.cancel()
    expect(events.slice(-3)).toEqual([['draft', null], ['guide', undefined], ['readout', null]])
  })

  it('converte posição do ponteiro em quadro ao arrastar a régua', () => {
    captures.length = 0
    const { commands, events } = harness()
    commands.onScrub(pointerEvent({ clientX: 190 }))
    commands.movePointer(pointerEvent({ pointerId: 7, type: 'pointermove', clientX: 220 }))
    expect(captures).toEqual([7])
    expect(events).toEqual([['seek', 100], ['seek', 130]])
  })

  it('não inicia arraste em botão secundário nem em faixa bloqueada', () => {
    const { commands, events, fixture } = harness()
    commands.onPointer(pointerEvent({ button: 2 }), fixture.track, fixture.block, 'move')
    commands.onPointer(pointerEvent(), { ...fixture.track, locked: true }, fixture.block, 'move')
    expect(events).toEqual([])
  })
})
