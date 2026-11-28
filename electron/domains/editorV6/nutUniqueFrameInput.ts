import type { NutRawVideoWriter } from './nutRawVideoWriter';

export type NutUniqueFrameWrite = {
  bytesWritten: number;
  frameWritten: boolean;
};

export type NutUniqueFrameInputStats = {
  logicalFrames: number;
  uniqueRunFrames: number;
  repeatedFrames: number;
  framePackets: number;
  bitmapPayloadBytes: number;
  nutBytesWritten: number;
};

/** Writes one NUT packet per identical-frame run, plus one end marker frame. */
export class NutUniqueFrameInput {
  private expectedFrame = 0;
  private lastBitmap: Buffer | undefined;
  private finished = false;
  private readonly mutableStats: NutUniqueFrameInputStats;

  constructor(
    private readonly writer: Pick<NutRawVideoWriter, 'writeFrame' | 'end'>,
    headerBytes = 0
  ) {
    if (!Number.isSafeInteger(headerBytes) || headerBytes < 0) throw new Error('NUT header byte count must be non-negative.');
    this.mutableStats = {
      logicalFrames: 0,
      uniqueRunFrames: 0,
      repeatedFrames: 0,
      framePackets: 0,
      bitmapPayloadBytes: 0,
      nutBytesWritten: headerBytes
    };
  }

  get stats(): Readonly<NutUniqueFrameInputStats> {
    return { ...this.mutableStats };
  }

  async writeFrame(frameIndex: number, bitmap: Buffer): Promise<NutUniqueFrameWrite> {
    if (this.finished) throw new Error('NUT unique-frame input is already finished.');
    if (!Number.isSafeInteger(frameIndex) || frameIndex !== this.expectedFrame)
      throw new Error(`NUT unique-frame input expected frame ${this.expectedFrame}, received ${frameIndex}.`);
    this.expectedFrame += 1;
    this.mutableStats.logicalFrames += 1;

    if (this.lastBitmap?.equals(bitmap)) {
      this.mutableStats.repeatedFrames += 1;
      return { bytesWritten: 0, frameWritten: false };
    }

    const bytesWritten = await this.writer.writeFrame(frameIndex, bitmap);
    // Keep an owned snapshot: layered renderers may reuse their assembly buffers.
    this.lastBitmap = Buffer.from(bitmap);
    this.mutableStats.uniqueRunFrames += 1;
    this.mutableStats.framePackets += 1;
    this.mutableStats.bitmapPayloadBytes += bitmap.byteLength;
    this.mutableStats.nutBytesWritten += bytesWritten;
    return { bytesWritten, frameWritten: true };
  }

  async finish(frameCount: number): Promise<void> {
    if (this.finished) throw new Error('NUT unique-frame input is already finished.');
    if (!Number.isSafeInteger(frameCount) || frameCount !== this.expectedFrame || frameCount <= 0)
      throw new Error(`NUT unique-frame input cannot finish at frame count ${frameCount}; received ${this.expectedFrame}.`);
    if (!this.lastBitmap) throw new Error('NUT unique-frame input has no terminal bitmap.');

    const terminalBytes = await this.writer.writeFrame(frameCount, this.lastBitmap);
    this.mutableStats.framePackets += 1;
    this.mutableStats.bitmapPayloadBytes += this.lastBitmap.byteLength;
    this.mutableStats.nutBytesWritten += terminalBytes;
    await this.writer.end();
    this.finished = true;
  }
}
