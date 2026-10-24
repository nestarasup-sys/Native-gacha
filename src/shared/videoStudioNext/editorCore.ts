import type { StudioDocument, VideoTimelineDocument } from '../studio'
import { resizeTimelineBlock, type TimelineBlockTarget } from '../videoTimelineEditing'

/**
 * First independently testable command boundary for the rebuilt Video Studio.
 * No React, DOM, timers, PNG copies or IO; history and saving remain in the
 * legacy adapter until the new DocumentController is ready.
 */
export type VideoStudioEditorCommand =
  | Readonly<{ type: 'resize-block'; target: TimelineBlockTarget; startFrame: number; endFrame: number }>
  | Readonly<{ type: 'set-track-settings'; trackId: string; settings: NonNullable<VideoTimelineDocument['trackSettings']>[string] }>
  | Readonly<{ type: 'set-character-transitions'; enabled: boolean }>
  | Readonly<{ type: 'set-duration'; durationFrames: number; playheadFrame: number }>
  | Readonly<{ type: 'set-view'; zoom?: number; height?: number }>

/** A rejected/no-op command returns the original StudioDocument by identity. */
export function applyVideoStudioEditorCommand(
  studio: StudioDocument,
  timeline: VideoTimelineDocument,
  command: VideoStudioEditorCommand,
  updatedAt: string
): StudioDocument {
  let next = timeline
  switch (command.type) {
    case 'resize-block': {
      const actorIds = studio.elements.filter((element) => element.kind === 'character').map((element) => element.id)
      next = resizeTimelineBlock(timeline, command.target, command.startFrame, command.endFrame, actorIds)
      break
    }
    case 'set-track-settings': {
      if (!command.trackId.trim()) return studio
      if (timeline.trackSettings?.[command.trackId] === command.settings) return studio
      next = { ...timeline, trackSettings: { ...timeline.trackSettings, [command.trackId]: command.settings } }
      break
    }
    case 'set-character-transitions': {
      if (typeof command.enabled !== 'boolean' || timeline.animateCharacterTransitions === command.enabled) return studio
      next = { ...timeline, animateCharacterTransitions: command.enabled }
      break
    }
    case 'set-duration': {
      if (!Number.isSafeInteger(command.durationFrames) || command.durationFrames < 1
        || !Number.isSafeInteger(command.playheadFrame) || command.playheadFrame < 0) return studio
      const playheadFrame = Math.min(command.playheadFrame, command.durationFrames)
      if (timeline.durationFrames === command.durationFrames && timeline.playheadFrame === playheadFrame) return studio
      next = { ...timeline, durationFrames: command.durationFrames, playheadFrame }
      break
    }
    case 'set-view': {
      if (command.zoom !== undefined && (!Number.isFinite(command.zoom) || command.zoom <= 0)) return studio
      if (command.height !== undefined && (!Number.isFinite(command.height) || command.height <= 0)) return studio
      if ((command.zoom === undefined || command.zoom === timeline.timelineZoom)
        && (command.height === undefined || command.height === timeline.timelineHeight)) return studio
      next = {
        ...timeline,
        ...(command.zoom === undefined ? {} : { timelineZoom: command.zoom }),
        ...(command.height === undefined ? {} : { timelineHeight: command.height }),
      }
      break
    }
  }
  if (next === timeline) return studio
  return { ...studio, videoTimeline: next, updatedAt }
}
