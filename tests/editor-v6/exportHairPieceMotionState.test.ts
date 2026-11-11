import { describe, expect, it, vi } from 'vitest'
import { FIRST_HAIR_MOTION_PRESET, type HairMotionLoop, type HairMotionState } from '../../src/shared/hairMotionEngine'
import type { EditorV6FrameTimings } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer } from '../../src/shared/editorV6HairMotion'
import { prepareEditorV6ExportHairPieceMotion } from '../../src/renderer/src/features/editorV6/exportHairPieceMotionState'

const piece = (id = 'front-piece', side: EditorV6HairMotionLayer['side'] = 'front'): EditorV6HairMotionLayer => ({ id, side, textureId: 'texture', width: 10, height: 20, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0 })
const animation = (overrides: Partial<Pick<EditorV6HairMotionBundle, 'posteriorOnly' | 'poseReactionOnly' | 'loopFrames'>> = {}): Pick<EditorV6HairMotionBundle, 'preset' | 'posteriorOnly' | 'poseReactionOnly' | 'loopFrames'> => ({ preset: FIRST_HAIR_MOTION_PRESET, ...overrides })

function prepare(overrides: Partial<Parameters<typeof prepareEditorV6ExportHairPieceMotion>[0]> = {}) {
  const options: Parameters<typeof prepareEditorV6ExportHairPieceMotion>[0] = {
    animation: animation(), elementId: 'actor', piece: piece(), frame: 4, poseReactionEnds: [], motionStateStarted: performance.now(),
    states: new Map<string, HairMotionState>(), loops: new Map<string, HairMotionLoop>(), instancePhases: new Map([['actor', 1.25]]),
    headAtFrame: frame => frame * 0.02, timings: {}, ...overrides
  }
  return { options, result: prepareEditorV6ExportHairPieceMotion(options) }
}

describe('prepareEditorV6ExportHairPieceMotion', () => {
  it('advances sequential frames and safely rebuilds state when seeking backward', () => {
    const { options, result } = prepare()
    expect(result.state.frame).toBe(4)
    expect(result.state.previousHead).toBeCloseTo(0.08)
    const rewound = prepareEditorV6ExportHairPieceMotion({ ...options, frame: 2 })
    expect(rewound.state).toBe(result.state)
    expect(rewound.state.frame).toBe(2)
    expect(rewound.phase).toBeCloseTo(1.25 + piece().phase)
  })

  it('caches absolute loop samples and applies authored head impulses', () => {
    const headAtFrame = vi.fn((frame: number) => frame * 0.02)
    const loops = new Map<string, HairMotionLoop>()
    const options = { ...prepare().options, animation: animation({ loopFrames: 90 }), frame: 4, loops, headAtFrame }
    const first = prepareEditorV6ExportHairPieceMotion(options)
    const firstFrame = first.state.frame
    const cachedLoop = loops.get('actor:front-piece')
    const second = prepareEditorV6ExportHairPieceMotion({ ...options, frame: 5 })

    expect(firstFrame).toBe(4)
    expect(first.state.time).toBe(1)
    expect(cachedLoop).toBeDefined()
    expect(loops.get('actor:front-piece')).toBe(cachedLoop)
    expect(headAtFrame).toHaveBeenCalledWith(4)
    expect(headAtFrame).toHaveBeenCalledWith(3)
    expect(second.state.frame).toBe(5)
  })

  it('reacts only on explicit rearHair layer IDs after a pose ends', () => {
    const base = prepare().options
    const rear = prepareEditorV6ExportHairPieceMotion({ ...base, animation: animation({ poseReactionOnly: true }), piece: piece('rearHair:strand', 'back'), frame: 10, poseReactionEnds: [5] })
    const baseHair = prepareEditorV6ExportHairPieceMotion({ ...base, animation: animation({ poseReactionOnly: true }), piece: piece('backHair:strand', 'back'), frame: 10, poseReactionEnds: [5] })

    expect(rear.state.time).toBe(1)
    expect(rear.state.offsets.some(offset => offset !== 0)).toBe(true)
    expect(baseHair.state.time).toBe(0)
    expect([...baseHair.state.offsets].every(offset => offset === 0)).toBe(true)
  })

  it('keeps only the posterior pieces enabled when the export is posterior-only', () => {
    const base = prepare().options
    const animationSettings = animation({ posteriorOnly: true })
    const front = prepareEditorV6ExportHairPieceMotion({ ...base, animation: animationSettings, piece: piece('front-piece', 'front'), states: new Map() })
    const rear = prepareEditorV6ExportHairPieceMotion({ ...base, animation: animationSettings, piece: piece('rearHair:strand', 'front'), states: new Map() })

    expect(front.settings.enabled).toBe(false)
    expect(front.state.offsets.every(offset => offset === 0)).toBe(true)
    expect(rear.settings.enabled).toBe(true)
  })
})
