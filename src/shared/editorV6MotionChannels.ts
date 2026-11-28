/** IPC channel names needed by the sandboxed motion-worker preload. */
export const editorV6MotionChannels = {
  payload: 'editor-v6:motion-worker:payload',
  complete: 'editor-v6:motion-worker:complete'
} as const
