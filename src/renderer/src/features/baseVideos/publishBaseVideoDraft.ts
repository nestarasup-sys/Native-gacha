type PublishBaseVideoDraftDependencies = {
  videoId: string
  flushPendingSave: (videoId: string) => Promise<unknown>
  publish: (videoId: string) => Promise<number>
}

/** Persists pending draft metadata before requesting its permanent Base number. */
export async function publishBaseVideoDraft({ videoId, flushPendingSave, publish }: PublishBaseVideoDraftDependencies): Promise<number> {
  await flushPendingSave(videoId)
  return publish(videoId)
}
