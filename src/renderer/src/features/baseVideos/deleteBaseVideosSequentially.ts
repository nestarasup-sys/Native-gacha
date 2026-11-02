type DeleteBaseVideosSequentiallyDependencies = {
  videoIds: readonly string[]
  flushPendingSave: (videoId: string) => Promise<unknown>
  deleteVideo: (videoId: string) => Promise<void>
  onDeleted: (videoId: string) => void
}

/** Drains each video's metadata before deletion and reports only completed deletions. */
export async function deleteBaseVideosSequentially({
  videoIds,
  flushPendingSave,
  deleteVideo,
  onDeleted
}: DeleteBaseVideosSequentiallyDependencies): Promise<void> {
  for (const videoId of videoIds) {
    await flushPendingSave(videoId)
    await deleteVideo(videoId)
    onDeleted(videoId)
  }
}
