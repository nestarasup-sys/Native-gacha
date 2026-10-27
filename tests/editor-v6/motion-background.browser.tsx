import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useMotionPreparation } from '../../src/renderer/src/features/editorV6/motion/useMotionPreparation'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'

Object.assign(globalThis, { runBackgroundCheck: async () => {
  const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
  const nativeTimeout = window.setTimeout.bind(window)
  const wait = (ms: number) => new Promise<void>((resolve) => nativeTimeout(resolve, ms))
  window.setTimeout = ((callback: TimerHandler, ms?: number, ...args: unknown[]) => nativeTimeout(callback, ms === 2500 ? 30 : ms === 150 ? 0 : ms, ...args)) as typeof window.setTimeout
  let calls = 0, cancellations = 0, finish: (() => void) | undefined, automatic = false
  Object.defineProperty(window, 'desktop', { configurable: true, value: {
    prepareEditorV6Motion: async () => { calls++; if (!automatic) await new Promise<void>((resolve) => { finish = resolve }) },
    cancelEditorV6Motion: async () => { cancellations++; finish?.(); finish = undefined },
  } })
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1 }
  const stamp = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Background', color: '#ffffff', createdAt: stamp, updatedAt: stamp, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, assets: [], elements: [actor], timeline: createEditorV6Timeline([actor]) }
  project.timeline.tracks.find((track) => track.kind === 'character')!.blocks.push({ id: crypto.randomUUID(), elementId: actor.id, label: 'Pose 2', startFrame: 60, durationFrames: 240, state: { ...actor, poseSlot: 2 } })
  const characters: CustomizerCharacter[] = [{ id: 'alice', name: 'Alice', hair: '#000000', outfit: '#000000', skin: '#ffffff', createdAt: stamp, updatedAt: stamp, customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }]
  function Harness({ enabled }: { enabled: boolean }) { useMotionPreparation(project, characters, enabled); return null }
  const mount = document.createElement('div'); document.body.append(mount)
  const root = createRoot(mount)
  try {
    flushSync(() => root.render(<Harness enabled={false} />)); await wait(80)
    assert(calls === 0, 'Disabled preparation started a bake')
    flushSync(() => root.render(<Harness enabled />))
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(80)
    assert(calls === 0, 'Preparation ran while dragging')
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(80)
    assert(calls === 1, 'Idle preparation did not start')
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(20)
    assert(cancellations === 1, 'Editing did not cancel an active preparation')
    flushSync(() => root.render(<Harness enabled={false} />))
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(80)
    assert(calls === 1, 'Disabled preparation resumed after pointerup')
    automatic = true
    flushSync(() => root.render(<Harness enabled />)); await wait(80)
    assert(calls === 2, 'Idle preparation did not resume')
    document.dispatchEvent(new WheelEvent('wheel', { bubbles: true })); await wait(80)
    assert(calls === 2, 'Already prepared transitions were repeatedly requested')
    return { passed: true, idle: true, pausedWhileDragging: true, cancellation: true, disabledDuringPlaybackOrExport: true, noRepeatedRequests: true }
  } finally { flushSync(() => root.unmount()); mount.remove(); window.setTimeout = nativeTimeout }
} })
