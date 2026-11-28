import type { Writable } from 'node:stream';

const NUT_ID = Buffer.from('nut/multimedia container\0', 'ascii');
const MAIN_START_CODE = 0x4e4d7a561f5f04adn;
const STREAM_START_CODE = 0x4e5311405bf2f9dbn;
const SYNCPOINT_START_CODE = 0x4e4be4adeeca4569n;
const INFO_START_CODE = 0x4e49ab68b596ba78n;
const FLAG_KEY = 1;
const FLAG_SIZE_MSB = 32;
const FLAG_CHECKSUM = 64;
const FLAG_CODED_PTS = 8;
const FLAG_CODED = 4096;
const FLAG_INVALID = 8192;
const MAX_DISTANCE = 32 * 1024 - 1;

interface FrameCode {
  flags: number;
  streamId: number;
  sizeMul: number;
  sizeLsb: number;
  ptsDelta: number;
  headerIndex: number;
}

export interface NutRawVideoWriterOptions {
  width: number;
  height: number;
  fps?: number;
  writable: Writable;
  signal?: AbortSignal;
}

/** Writes a stable-version NUT stream containing timestamped BGRA raw frames. */
export class NutRawVideoWriter {
  private readonly frameBytes: number;
  private readonly fps: number;
  private readonly ptsShift: number;
  private nextPts = -1;
  private headerWritten = false;

  constructor(private readonly options: NutRawVideoWriterOptions) {
    const { width, height } = options;
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
      throw new Error('NUT BGRA dimensions must be positive integers.');
    }
    this.frameBytes = width * height * 4;
    if (!Number.isSafeInteger(this.frameBytes)) throw new Error('NUT BGRA frame size is too large.');
    this.fps = options.fps ?? 30;
    if (!Number.isSafeInteger(this.fps) || this.fps <= 0) throw new Error('NUT FPS must be a positive integer.');
    this.ptsShift = this.fps <= 1000 ? 7 : 14;
  }

  async writeHeader(): Promise<number> {
    if (this.headerWritten) throw new Error('NUT header was already written.');
    this.assertNotAborted();
    const chunks = [
      NUT_ID,
      makePacket(MAIN_START_CODE, makeMainHeader(this.fps)),
      makePacket(STREAM_START_CODE, makeStreamHeader(this.options.width, this.options.height, this.fps, this.ptsShift)),
      makePacket(INFO_START_CODE, Buffer.from([0, 0, 0, 0, 0])),
    ];
    const header = Buffer.concat(chunks);
    await writeChunk(this.options.writable, header, this.options.signal);
    this.headerWritten = true;
    return header.byteLength;
  }

  async writeFrame(pts: number, bgra: Buffer): Promise<number> {
    this.assertNotAborted();
    if (!this.headerWritten) throw new Error('NUT header must be written before frames.');
    if (!Number.isSafeInteger(pts) || pts < 0 || pts <= this.nextPts) {
      throw new Error('NUT frame PTS must be a strictly increasing non-negative integer.');
    }
    if (bgra.byteLength !== this.frameBytes) {
      throw new Error(`NUT BGRA frame must contain exactly ${this.frameBytes} bytes.`);
    }

    const syncpoint = makePacket(SYNCPOINT_START_CODE, Buffer.concat([putV(pts), putV(0)]));
    const frameHeader = makeFrameHeader(pts, bgra.byteLength, this.ptsShift);
    await writeChunk(this.options.writable, syncpoint, this.options.signal);
    await writeChunk(this.options.writable, frameHeader, this.options.signal);
    await writeChunk(this.options.writable, bgra, this.options.signal);
    this.nextPts = pts;
    return syncpoint.byteLength + frameHeader.byteLength + bgra.byteLength;
  }

  async end(): Promise<void> {
    this.assertNotAborted();
    await new Promise<void>((resolve, reject) => {
      this.options.writable.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
  }

  private assertNotAborted(): void {
    if (this.options.signal?.aborted) throw new Error('NUT output was cancelled.');
  }
}

function makeMainHeader(fps: number): Buffer {
  const codes = Array.from({ length: 256 }, (): FrameCode => ({
    flags: 0,
    streamId: 0,
    sizeMul: 0,
    sizeLsb: 0,
    ptsDelta: 0,
    headerIndex: 0,
  }));
  codes[0]!.flags = FLAG_INVALID;
  codes[1] = { flags: FLAG_CODED, streamId: 0, sizeMul: 1, sizeLsb: 0, ptsDelta: 1, headerIndex: 0 };
  codes[2] = { flags: FLAG_SIZE_MSB | FLAG_CODED_PTS, streamId: 0, sizeMul: 1, sizeLsb: 0, ptsDelta: 0, headerIndex: 0 };
  codes[3] = { flags: FLAG_KEY | FLAG_SIZE_MSB | FLAG_CODED_PTS, streamId: 0, sizeMul: 1, sizeLsb: 0, ptsDelta: 0, headerIndex: 0 };
  for (let code = 4; code <= 77; code += 1) {
    codes[code] = { flags: FLAG_SIZE_MSB, streamId: 0, sizeMul: 250, sizeLsb: code - 4, ptsDelta: 1, headerIndex: 0 };
  }
  for (let code = 79; code <= 254; code += 1) {
    codes[code] = { flags: FLAG_SIZE_MSB, streamId: 0, sizeMul: 250, sizeLsb: code - 5, ptsDelta: 1, headerIndex: 0 };
  }
  codes[78]!.flags = FLAG_INVALID;
  codes[255]!.flags = FLAG_INVALID;

  const payload: Buffer[] = [putV(3), putV(1), putV(MAX_DISTANCE), putV(1), putV(1), putV(fps)];
  let i = 0;
  while (i < 256) {
    if (i === 78) {
      i += 1;
      continue;
    }
    const current = codes[i]!;
    let run = 1;
    while (i + run < 256 && i + run !== 78 && sameFrameCodeRun(current, codes[i + run]!, run)) run += 1;
    payload.push(putV(current.flags), putV(6), putS(current.ptsDelta), putV(current.sizeMul), putV(current.streamId), putV(current.sizeLsb), putV(0), putV(run));
    i += run;
  }
  payload.push(putV(0)); // no elision headers
  return Buffer.concat(payload);
}

function sameFrameCodeRun(first: FrameCode, next: FrameCode, offset: number): boolean {
  return first.flags === next.flags && first.streamId === next.streamId && first.sizeMul === next.sizeMul &&
    first.ptsDelta === next.ptsDelta && first.headerIndex === next.headerIndex && next.sizeLsb === first.sizeLsb + offset;
}

function makeStreamHeader(width: number, height: number, fps: number, ptsShift: number): Buffer {
  return Buffer.concat([
    putV(0), // stream id
    putV(0), // video class
    putV(4),
    Buffer.from('BGRA', 'ascii'),
    putV(0), // time base index
    putV(ptsShift),
    putV(fps), // maximum PTS distance in time-base ticks
    putV(0), // decode delay
    Buffer.from([0]), // stream flags
    putV(0), // extradata size
    putV(width),
    putV(height),
    putV(0), // sample aspect ratio numerator
    putV(0), // sample aspect ratio denominator
    putV(0), // colorspace type
  ]);
}

function makeFrameHeader(pts: number, frameBytes: number, ptsShift: number): Buffer {
  const codedFlags = FLAG_KEY | FLAG_CODED_PTS | FLAG_SIZE_MSB | FLAG_CHECKSUM;
  const withoutChecksum = Buffer.concat([Buffer.from([1]), putV(codedFlags), putV(pts & ((1 << ptsShift) - 1)), putV(frameBytes)]);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32LE(crc32Mpeg(withoutChecksum));
  return Buffer.concat([withoutChecksum, checksum]);
}

function makePacket(startCode: bigint, payload: Buffer): Buffer {
  const start = Buffer.allocUnsafe(8);
  start.writeBigUInt64BE(startCode);
  const body = Buffer.concat([start, putV(payload.length + 4), payload]);
  const checksum = Buffer.allocUnsafe(4);
  checksum.writeUInt32LE(crc32Mpeg(payload));
  return Buffer.concat([body, checksum]);
}

function putV(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('NUT variable integer must be a non-negative safe integer.');
  const bytes = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return Buffer.from(bytes);
}

function putS(value: number): Buffer {
  return putV(value > 0 ? value * 2 - 1 : -value * 2);
}

function crc32Mpeg(buffer: Buffer): number {
  const table = crc32MpegTable();
  let crc = 0;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return crc >>> 0;
}

let crcTable: Uint32Array | undefined;

function crc32MpegTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) value = ((value << 1) ^ ((value & 0x80000000) ? 0x04c11db7 : 0)) >>> 0;
    crcTable[index] = (((value & 0xff) << 24) | ((value & 0xff00) << 8) | ((value >>> 8) & 0xff00) | (value >>> 24)) >>> 0;
  }
  return crcTable;
}

async function writeChunk(writable: Writable, chunk: Buffer, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('NUT output was cancelled.');
  if (writable.destroyed || writable.writableEnded) throw new Error('NUT output stream is closed.');
  let callbackResolve!: () => void;
  let callbackReject!: (error: Error) => void;
  const callbackPromise = new Promise<void>((resolve, reject) => { callbackResolve = resolve; callbackReject = reject; });
  const accepted = writable.write(chunk, (error?: Error | null) => (error ? callbackReject(error) : callbackResolve()));
  if (accepted) return waitForWriteCallback(writable, callbackPromise, signal);
  return Promise.all([callbackPromise, waitForDrain(writable, signal)]).then(() => undefined);
}

function waitForWriteCallback(writable: Writable, callback: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return callback;
  if (signal.aborted) {
    writable.destroy();
    return Promise.reject(new Error('NUT output was cancelled.'));
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener('abort', onAbort);
    const onAbort = (): void => {
      cleanup();
      writable.destroy();
      reject(new Error('NUT output was cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    callback.then(
      () => { cleanup(); resolve(); },
      (error: Error) => { cleanup(); reject(error); }
    );
  });
}

function waitForDrain(writable: Writable, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    writable.destroy();
    return Promise.reject(new Error('NUT output was cancelled.'));
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      writable.off('drain', onDrain);
      writable.off('error', onError);
      writable.off('close', onClose);
      signal?.removeEventListener('abort', onAbort);
    };
    const onDrain = (): void => { cleanup(); resolve(); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const onClose = (): void => { cleanup(); reject(new Error('NUT output stream closed before drain.')); };
    const onAbort = (): void => {
      const error = new Error('NUT output was cancelled.');
      cleanup();
      reject(error);
      writable.destroy();
    };
    writable.once('drain', onDrain);
    writable.once('error', onError);
    writable.once('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
