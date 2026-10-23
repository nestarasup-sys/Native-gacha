/** Shared structured-clone-only AV worker protocol. No DOM, React or FFmpeg handles cross IPC. */
export type VideoEngineMediaRequest = Readonly<{
  op: 'sync'|'seek'|'status'|'cancel'|'close'
  sessionId: string
  frame?: number
  audioFrame?: number
  playing?: boolean
}>
export type VideoEngineMediaClock = Readonly<{ frame: number; playing: boolean; audioMaster: boolean }>
