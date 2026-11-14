import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  type EncodedPacket,
  type VideoCodec,
} from 'mediabunny';
import { DATASET_FPS } from './episodes';

export interface VideoSpan {
  file: number;
  from: number;
  to: number;
}

export interface JoinedVideo {
  files: Uint8Array[];
  spans: VideoSpan[];
}

interface Clip {
  bytes: number;
  codec: VideoCodec;
  config: VideoDecoderConfig;
  packets: EncodedPacket[];
  start: number;
  duration: number;
}

const MICROSECOND = 1e6;

const seconds = (value: number) => Math.round(value * MICROSECOND) / MICROSECOND;

async function readClip(bytes: Uint8Array): Promise<Clip> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });

  try {
    const track = await input.getPrimaryVideoTrack();
    const config = await track?.getDecoderConfig();

    if (!track?.codec || !config) throw new Error('A camera video has no video track.');

    const packets: EncodedPacket[] = [];

    for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet);

    const start = Math.min(...packets.map((p) => p.timestamp));
    const end = Math.max(...packets.map((p) => p.timestamp + p.duration));

    return { bytes: bytes.byteLength, codec: track.codec, config, packets, start, duration: seconds(end - start) };
  } finally {
    input.dispose();
  }
}

const descriptionOf = (config: VideoDecoderConfig) => {
  const d = config.description;

  if (!d) return new Uint8Array();

  return ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
};

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const joinable = (a: Clip, b: Clip) =>
  a.codec === b.codec &&
  a.config.codec === b.config.codec &&
  a.config.codedWidth === b.config.codedWidth &&
  a.config.codedHeight === b.config.codedHeight &&
  sameBytes(descriptionOf(a.config), descriptionOf(b.config));

function groupClips(clips: Clip[], limitBytes: number): Clip[][] {
  const groups: Clip[][] = [];
  let size = 0;

  for (const clip of clips) {
    const current = groups.at(-1);
    const full = !!current && size + clip.bytes >= limitBytes;

    if (!current || full || !joinable(current[0], clip)) {
      groups.push([clip]);
      size = clip.bytes;

      continue;
    }

    current.push(clip);
    size += clip.bytes;
  }

  return groups;
}

async function writeGroup(clips: Clip[]): Promise<{ bytes: Uint8Array; spans: Omit<VideoSpan, 'file'>[] }> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new EncodedVideoPacketSource(clips[0].codec);
  const spans: Omit<VideoSpan, 'file'>[] = [];
  let offset = 0;
  let first = true;

  output.setMetadataTags({ creationTime: null });
  output.addVideoTrack(source, { frameRate: DATASET_FPS });
  await output.start();

  for (const clip of clips) {
    for (const packet of clip.packets) {
      const moved = packet.clone({ timestamp: seconds(offset + packet.timestamp - clip.start) });

      await source.add(moved, first ? { decoderConfig: clip.config } : undefined);
      first = false;
    }

    spans.push({ from: offset, to: seconds(offset + clip.duration) });
    offset = seconds(offset + clip.duration);
  }

  await output.finalize();

  return { bytes: new Uint8Array(target.buffer ?? new ArrayBuffer(0)), spans };
}

export async function joinVideos(videos: Uint8Array[], limitBytes: number): Promise<JoinedVideo> {
  const clips: Clip[] = [];

  for (const bytes of videos) clips.push(await readClip(bytes));

  const joined: JoinedVideo = { files: [], spans: [] };

  for (const group of groupClips(clips, limitBytes)) {
    const { bytes, spans } = await writeGroup(group);
    const file = joined.files.length;

    joined.files.push(bytes);
    joined.spans.push(...spans.map((s) => ({ file, ...s })));
  }

  return joined;
}
