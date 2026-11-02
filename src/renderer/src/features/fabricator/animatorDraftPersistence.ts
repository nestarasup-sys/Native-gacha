import type {
  AnimatorAnimation,
  AnimatorAnimationAsset,
  AnimatorAnimationDraft,
  AnimatorFrame
} from '../../../../shared/fabricator'
import {
  serializeAnimation,
  serializeAnimatorDraft
} from './models/animatorFrameModel'
import type { AnimatorFrameState } from './models/animatorFrameModel'

export type AnimatorDraftSaveRequest = {
  draft: AnimatorAnimationDraft
  assets: AnimatorAnimationAsset[]
}

export type AnimatorDraftWriteQueue = { current: Promise<void> }

function selectedFrame(
  animation: AnimatorAnimation,
  frameId: string
): AnimatorFrame | undefined {
  return animation.frames.find((frame) => frame.id === frameId)
}

export function isAnimatorDraftFrameDirty(
  animation: AnimatorAnimation,
  current: AnimatorFrameState
): boolean {
  const frame = selectedFrame(animation, current.frameId)
  return Boolean(frame
    && (JSON.stringify(frame.transforms) !== JSON.stringify(current.transforms)
      || JSON.stringify(frame.joints) !== JSON.stringify(current.joints)))
}

export function isAnimatorDraftDocumentDirty(
  animation: AnimatorAnimation,
  current: AnimatorFrameState,
  savedAnimation: string | null
): boolean {
  return savedAnimation === null
    || JSON.stringify(serializeAnimation(animation)) !== savedAnimation
    || isAnimatorDraftFrameDirty(animation, current)
}

export function createAnimatorDraftSaveRequest(
  animation: AnimatorAnimation,
  editingSlot: number,
  current: AnimatorFrameState,
  dirtyFrame: boolean,
  pendingAssets: ReadonlyMap<string, string>,
  assetsAlreadyPersisted: boolean
): AnimatorDraftSaveRequest {
  const assets = assetsAlreadyPersisted
    ? []
    : animation.parts.flatMap((part) => {
      const dataUrl = pendingAssets.get(part.id)
      return dataUrl === undefined ? [] : [{ id: part.id, dataUrl }]
    })

  return {
    draft: serializeAnimatorDraft(animation, editingSlot, current, dirtyFrame),
    assets
  }
}

/** Serializes draft writes and lets a failed write be retried by the next save. */
export function enqueueAnimatorDraftSave(
  queue: AnimatorDraftWriteQueue,
  sourceModelSlot: number,
  request: AnimatorDraftSaveRequest,
  save: (modelSlot: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]) => Promise<void>
): Promise<void> {
  const next = queue.current.catch(() => undefined).then(() =>
    save(sourceModelSlot, request.draft, request.assets)
  )
  queue.current = next
  return next
}
