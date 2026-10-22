/** Extração de thumbnail de mídia apenas no preview; não altera o exportador FFmpeg. */
export function captureVideoPoster(videoId: string, sourceFrame = 0): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    let finished = false
    const timeout = window.setTimeout(() => finish(null), 12000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.onloadeddata = null
      video.onseeked = null
      video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    const finish = (poster: string | null) => {
      if (finished) return
      finished = true
      cleanup()
      resolve(poster)
    }
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null)
        const width = 320, height = 180
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return finish(null)
        const sourceRatio = video.videoWidth / video.videoHeight
        const targetRatio = width / height
        const sourceWidth = sourceRatio > targetRatio ? video.videoHeight * targetRatio : video.videoWidth
        const sourceHeight = sourceRatio > targetRatio ? video.videoHeight : video.videoWidth / targetRatio
        context.drawImage(video, (video.videoWidth - sourceWidth) / 2, (video.videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height)
        finish(canvas.toDataURL('image/jpeg', 0.78))
      } catch { finish(null) }
    }
    video.onerror = () => finish(null)
    video.onseeked = capture
    video.onloadeddata = () => {
      const frameTime = Math.max(0, sourceFrame / 60)
      if (frameTime > 0 && Number.isFinite(video.duration) && frameTime < video.duration) {
        try { video.currentTime = frameTime } catch { capture() }
      } else capture()
    }
    video.src = `gacha-video://library/${videoId}`
    video.load()
  })
}

