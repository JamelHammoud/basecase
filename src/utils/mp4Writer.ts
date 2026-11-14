import {
  BufferTarget,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  VideoSampleSource,
  type Quality,
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

export interface Mp4Writer {
  start: () => Promise<void>;
  add: (sample: VideoSample) => Promise<void>;
  finish: () => Promise<Uint8Array>;
  cancel: () => Promise<void>;
  encodedBytes: () => number;
}

const CODECS: VideoCodec[] = ['avc', 'vp9', 'av1'];

export const encodableCodec = (size: { width: number; height: number }): Promise<VideoCodec | null> =>
  getFirstEncodableVideoCodec(CODECS, size);

export function mp4Writer({ codec, quality, frameRate, keyFrameInterval, realtime }: Mp4Options): Mp4Writer {
  const target = new BufferTarget();
  let encoded = 0;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
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

      return new Uint8Array(target.buffer ?? new ArrayBuffer(0));
    },
    cancel: () => output.cancel(),
    encodedBytes: () => encoded,
  };
}
