import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } from 'mediabunny';
import { columnStats, DATASET_FPS, type EpisodeData } from './episodes';
import { episodeText, subtaskRows } from './language';
import type { DatasetEpisode, DatasetSpec } from './lerobotRows';

export const FIXTURE_WIDTH = 64;
export const FIXTURE_HEIGHT = 48;

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const AVC_DESCRIPTION = fromBase64('AULACv/hABZnQsAK3EewEQAAAwABAAADADIPEieAAQAFaM4PLIA=');

const KEY_FRAMES = ['AAAAHWWIhAS8RigACeHHAAETKOAAIfcnJyddddddddeA', 'AAAAHWWIggF/EYoAAtvxwABG4jgACLbJycnXXXXXXXXg'];

export interface ClipOptions {
  frames: number;
  description?: Uint8Array;
}

export async function fixtureClip({ frames, description = AVC_DESCRIPTION }: ClipOptions) {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new EncodedVideoPacketSource('avc');
  const decoderConfig = {
    codec: 'avc1.42c00a',
    codedWidth: FIXTURE_WIDTH,
    codedHeight: FIXTURE_HEIGHT,
    description,
  };

  output.setMetadataTags({ creationTime: null });
  output.addVideoTrack(source, { frameRate: DATASET_FPS });
  await output.start();

  for (let i = 0; i < frames; i++) {
    const packet = new EncodedPacket(fromBase64(KEY_FRAMES[i % 2]), 'key', i / DATASET_FPS, 1 / DATASET_FPS);

    await source.add(packet, i === 0 ? { decoderConfig } : undefined);
  }

  await output.finalize();

  return new Uint8Array(target.buffer!);
}

export const FIXTURE_JOINTS = ['j1_shoulder', 'j2_elbow', 'j3_wrist'];
export const FIXTURE_RAYS = 4;
export const FIXTURE_CAMERAS = ['scene', 'wrist_camera'];

function fixtureData(length: number, seed: number, task: string): EpisodeData {
  const width = FIXTURE_JOINTS.length;
  const wave = (n: number, w: number, phase: number) =>
    Float32Array.from({ length: n * w }, (_, i) => Math.sin(seed + phase + i * 0.1));

  return {
    task,
    frames: Array.from({ length }, (_, i) => i * 2),
    timestamps: Float32Array.from({ length }, (_, i) => i / DATASET_FPS),
    state: wave(length, width, 0),
    action: wave(length, width, 0.5),
    scan: Float32Array.from({ length: length * FIXTURE_RAYS }, (_, i) => 0.25 + ((i + seed) % 7) / 10),
  };
}

export const FIXTURE_INSTRUCTION = 'Touch the point, then hold still.';

const FIXTURE_LABELS = [
  {
    segments: [
      { start: 0, end: 11, label: 'reach point' },
      { start: 11, end: 24, label: 'touch point', instruction: 'Touch the point with the tip.' },
    ],
  },
  {
    instruction: FIXTURE_INSTRUCTION,
    segments: [
      { start: 0, end: 8, label: 'reach point' },
      { start: 8, end: 18, label: 'hold' },
    ],
  },
  {},
];

function withLanguage(data: EpisodeData, episode: number, language: boolean): EpisodeData {
  if (!language) return data;

  const text = episodeText(data.task, FIXTURE_LABELS[episode % FIXTURE_LABELS.length]);

  return { ...data, task: text.task, subtasks: subtaskRows(text.segments, data.frames, text.task) };
}

export interface FixtureOptions {
  lengths?: number[];
  tasks?: string[];
  language?: boolean;
  clip?: (episode: number, frames: number) => Promise<Uint8Array>;
}

export async function fixtureSpec({
  lengths = [12, 9, 15],
  tasks = ['Touch the point with the end effector.'],
  language = true,
  clip = (_, frames) => fixtureClip({ frames }),
}: FixtureOptions = {}): Promise<DatasetSpec> {
  const episodes: DatasetEpisode[] = [];

  for (const [i, length] of lengths.entries()) {
    const data = withLanguage(fixtureData(length, i, tasks[i % tasks.length]), i, language);
    const videos: Record<string, Uint8Array> = {};

    for (const key of FIXTURE_CAMERAS) videos[key] = await clip(i, length);

    episodes.push({
      ...data,
      videos,
      imageStats: Object.fromEntries(
        FIXTURE_CAMERAS.map((key, k) => [key, { ...columnStats([0.1 * i, 0.2, 0.3 + k / 10], 3), count: [length] }]),
      ),
      source: { try: `try-${i}`, seed: i, source: i ? 'try-0' : null },
    });
  }

  return {
    robotType: 'arm',
    jointNames: FIXTURE_JOINTS,
    videos: FIXTURE_CAMERAS.map((key) => ({ key, width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT, codec: 'h264' })),
    episodes,
    source: { case: 'touch-the-dots', modelHash: 'fixture' },
    scans: [{ part: 'lidar', name: 'Slamtec RPLIDAR S2', rays: FIXTURE_RAYS, rangeM: 12, rateHz: 10, fovDeg: 360 }],
  };
}
