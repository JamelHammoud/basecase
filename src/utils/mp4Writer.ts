import {
  BufferTarget,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSampleSource,
  type Quality,
  type Target,
  type VideoCodec,
  type VideoSample,
} from 'mediabunny';

export interface Mp4Options {
  codec: VideoCodec;
  quality: Quality;
  frameRate?: number;
  keyFrameInterval?: number;
  realtime?: boolean;
}

export interface Mp4Writer<Result = Uint8Array> {
  start: () => Promise<void>;
  add: (sample: VideoSample) => Promise<void>;
  finish: () => Promise<Result>;
  cancel: () => Promise<void>;
  encodedBytes: () => number;
}

export type Mp4Chunk = (position: number, data: Uint8Array<ArrayBuffer>) => void;

export const STREAM_CHUNK_BYTES = 1024 * 1024;

const CODECS: VideoCodec[] = ['avc', 'vp9', 'av1'];

export const encodableCodec = (size: { width: number; height: number }): Promise<VideoCodec | null> =>
  getFirstEncodableVideoCodec(CODECS, size);

function writerOn<Result>(
  { codec, quality, frameRate, keyFrameInterval, realtime }: Mp4Options,
  target: Target,
  result: () => Result,
): Mp4Writer<Result> {
  let encoded = 0;
  const streamed = target instanceof StreamTarget;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: streamed ? false : 'in-memory' }), target });
  const source = new VideoSampleSource({
    codec,
    quality,
    ...(keyFrameInterval === undefined ? {} : { keyFrameInterval }),
    ...(realtime ? { latencyMode: 'realtime' as const } : {}),
    onEncodedPacket: (packet) => {
      encoded += packet.byteLength;
    },
  });

  output.addVideoTrack(source, frameRate === undefined ? {} : { frameRate });

  return {
    start: () => output.start(),
    add: (sample) => source.add(sample),
    finish: async () => {
      await output.finalize();

      return result();
    },
    cancel: () => output.cancel(),
    encodedBytes: () => encoded,
  };
}

export function mp4Writer(options: Mp4Options): Mp4Writer {
  const target = new BufferTarget();

  return writerOn(options, target, () => new Uint8Array(target.buffer ?? new ArrayBuffer(0)));
}

export function streamedMp4Writer(options: Mp4Options, chunk: Mp4Chunk): Mp4Writer<void> {
  const writable = new WritableStream<{ position: number; data: Uint8Array<ArrayBuffer> }>({
    write: ({ position, data }) => chunk(position, data.slice()),
  });

  return writerOn(
    options,
    new StreamTarget(writable, { chunked: true, chunkSize: STREAM_CHUNK_BYTES }),
    () => undefined,
  );
}
