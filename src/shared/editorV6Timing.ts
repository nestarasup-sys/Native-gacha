/** Fixed playback clock used by Editor V6 timeline frames. */
export const EDITOR_V6_TIMELINE_FPS = 30
export const secondsToFrame = (value: number): number => Math.ceil(value * EDITOR_V6_TIMELINE_FPS - 1e-8)

/** Audio is mixed at 48 kHz, so each timeline frame spans exactly 1,600 samples. */
export const EDITOR_V6_AUDIO_SAMPLE_RATE = 48_000
export const EDITOR_V6_AUDIO_SAMPLES_PER_TIMELINE_FRAME = EDITOR_V6_AUDIO_SAMPLE_RATE / EDITOR_V6_TIMELINE_FPS
