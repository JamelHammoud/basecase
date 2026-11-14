import { McapStreamReader, type McapTypes, type TypedMcapRecord } from '@mcap/core';
import { decompress } from 'fzstd';
import { plural } from '../../../electron/plural.mjs';
import { decodeImageStamp, decodeJointState, MCAP_DAMAGED, MCAP_TOO_MANY_JOINTS } from './ros2Cdr';
import {
  DataImportError,
  finiteOrRefuse,
  IMPORT_LIMITS,
  type SourceData,
  type SourceEpisode,
  type SourceVideo,
} from './types';

export const MCAP_TOO_LARGE = 'This MCAP file is too large.';
export const MCAP_COMPRESSION = 'Only zstd or uncompressed MCAP files open.';
export const MCAP_NO_JOINTS = 'This MCAP file has no joint states.';
export const MCAP_TOO_LONG = `This MCAP file is longer than ${plural(IMPORT_LIMITS.seconds / 60, 'minute')}.`;

export const MCAP_GRID_HZ = 50;

const SLICE_BYTES = 4 * 1024 * 1024;
const NS_PER_SECOND = 1e9;
const COMPRESSIONS = new Set(['', 'zstd']);
const MAX_SPAN_NS = BigInt(IMPORT_LIMITS.seconds) * 1_000_000_000n;
const MAX_CHUNK_BYTES = BigInt(IMPORT_LIMITS.chunkBytes);

type ChannelKind = 'joints' | 'image';

const KIND_BY_SCHEMA = new Map<string, ChannelKind>([
  ['sensor_msgs/msg/JointState', 'joints'],
  ['sensor_msgs/msg/Image', 'image'],
  ['sensor_msgs/msg/CompressedImage', 'image'],
]);

export interface McapInput {
  name: string;
  bytes: Uint8Array;
}

interface JointSample {
  ns: bigint;
  names: string[];
  position: Float64Array;
}

interface ImageTopic {
  path: string;
  first: bigint;
  last: bigint;
  frames: number;
}

interface Recording {
  joints: JointSample[];
  images: Map<string, ImageTopic>;
  first: bigint | null;
  last: bigint | null;
}

interface FileState {
  path: string;
  schemas: Map<number, string>;
  channels: Map<number, { kind: ChannelKind; topic: string }>;
  recording: Recording;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

const seconds = (ns: bigint) => Number(ns) / NS_PER_SECOND;

const stampOr = (stampNs: bigint, logTime: bigint) => (stampNs === 0n ? logTime : stampNs);

function inflateZstd(buffer: Uint8Array, size: bigint): Uint8Array {
  if (size > MAX_CHUNK_BYTES) throw new DataImportError(MCAP_TOO_LARGE);

  return decompress(buffer, new Uint8Array(Number(size)));
}

function checkChunk(chunk: McapTypes.Chunk) {
  if (!COMPRESSIONS.has(chunk.compression)) throw new DataImportError(MCAP_COMPRESSION);

  if (chunk.uncompressedSize > MAX_CHUNK_BYTES) throw new DataImportError(MCAP_TOO_LARGE);
}

function takeChannel(state: FileState, channel: McapTypes.Channel) {
  const kind = KIND_BY_SCHEMA.get(state.schemas.get(channel.schemaId) ?? '');

  if (!kind || channel.messageEncoding !== 'cdr') return;

  state.channels.set(channel.id, { kind, topic: channel.topic });
}

function noteJointStamp(recording: Recording, ns: bigint) {
  const first = recording.first === null || ns < recording.first ? ns : recording.first;
  const last = recording.last === null || ns > recording.last ? ns : recording.last;

  if (last - first > MAX_SPAN_NS) throw new DataImportError(MCAP_TOO_LONG);

  recording.first = first;
  recording.last = last;
}

function takeJoints(recording: Recording, message: McapTypes.Message) {
  const decoded = decodeJointState(message.data);

  if (decoded.position.length === 0) return;

  finiteOrRefuse(decoded.position, 'This MCAP file');

  const ns = stampOr(decoded.stampNs, message.logTime);

  noteJointStamp(recording, ns);
  recording.joints.push({ ns, names: decoded.name, position: decoded.position });
}

function takeImage(state: FileState, topic: string, message: McapTypes.Message) {
  const ns = stampOr(decodeImageStamp(message.data).stampNs, message.logTime);
  const seen = state.recording.images.get(topic);

  if (!seen) {
    state.recording.images.set(topic, { path: state.path, first: ns, last: ns, frames: 1 });

    return;
  }

  seen.first = ns < seen.first ? ns : seen.first;
  seen.last = ns > seen.last ? ns : seen.last;
  seen.frames += 1;
}

function takeMessage(state: FileState, message: McapTypes.Message) {
  const channel = state.channels.get(message.channelId);

  if (!channel) return;

  if (channel.kind === 'joints') {
    takeJoints(state.recording, message);

    return;
  }

  takeImage(state, channel.topic, message);
}

function takeRecord(state: FileState, record: TypedMcapRecord) {
  switch (record.type) {
    case 'Schema':
      state.schemas.set(record.id, record.name);

      break;
    case 'Channel':
      takeChannel(state, record);

      break;
    case 'Message':
      takeMessage(state, record);

      break;
    case 'Chunk':
      checkChunk(record);

      break;
    default:
      break;
  }
}

function drain(reader: McapStreamReader, state: FileState) {
  for (let record = reader.nextRecord(); record; record = reader.nextRecord()) takeRecord(state, record);
}

function readFile(file: McapInput, recording: Recording) {
  if (file.bytes.byteLength > IMPORT_LIMITS.fileBytes) throw new DataImportError(MCAP_TOO_LARGE);

  const state: FileState = { path: file.name, schemas: new Map(), channels: new Map(), recording };
  const reader = new McapStreamReader({ includeChunks: true, decompressHandlers: { zstd: inflateZstd } });

  try {
    for (let offset = 0; offset < file.bytes.byteLength; offset += SLICE_BYTES) {
      reader.append(file.bytes.subarray(offset, offset + SLICE_BYTES));
      drain(reader, state);
    }
  } catch (error) {
    throw error instanceof DataImportError ? error : damaged();
  }

  if (!reader.done()) throw damaged();
}

function jointIndex(samples: JointSample[]) {
  const index = new Map<string, number>();

  for (const sample of samples) {
    for (const name of sample.names) {
      if (index.has(name)) continue;

      if (index.size === IMPORT_LIMITS.joints) throw new DataImportError(MCAP_TOO_MANY_JOINTS);

      index.set(name, index.size);
    }
  }

  return index;
}

function jointSeries(samples: JointSample[], index: Map<string, number>, start: bigint) {
  const series = Array.from({ length: index.size }, () => ({ times: [] as number[], values: [] as number[] }));

  for (const sample of samples) {
    const time = seconds(sample.ns - start);

    sample.names.forEach((name, i) => {
      const column = index.get(name);

      if (column === undefined) return;

      series[column].times.push(time);
      series[column].values.push(sample.position[i]);
    });
  }

  return series;
}

function interpolate(times: number[], values: number[], at: number, i: number) {
  if (at <= times[i] || i === times.length - 1) return values[i];

  const fraction = (at - times[i]) / (times[i + 1] - times[i]);

  return values[i] + (values[i + 1] - values[i]) * fraction;
}

function resampleJoint(joint: { times: number[]; values: number[] }, grid: Float64Array) {
  const out = new Float64Array(grid.length);
  const last = joint.times.length - 1;
  let i = 0;

  for (let k = 0; k < grid.length; k++) {
    while (i < last && joint.times[i + 1] <= grid[k]) i++;

    out[k] = interpolate(joint.times, joint.values, grid[k], i);
  }

  return out;
}

function timeGrid(spanNs: bigint) {
  const frames = Math.floor(seconds(spanNs) * MCAP_GRID_HZ + 1e-6) + 1;

  return Float64Array.from({ length: frames }, (_, k) => k / MCAP_GRID_HZ);
}

function videosOf(recording: Recording, start: bigint): SourceVideo[] {
  return [...recording.images].map(([camera, topic]) => ({
    camera,
    path: topic.path,
    from: seconds(topic.first - start),
    to: seconds(topic.last - start),
    frames: topic.frames,
  }));
}

interface Read extends Recording {
  first: bigint;
  last: bigint;
}

const sortedSamples = (recording: Recording) => [...recording.joints].sort((a, b) => Number(a.ns - b.ns));

function episodeOf(recording: Read, index: Map<string, number>, at: number): SourceEpisode {
  const series = jointSeries(sortedSamples(recording), index, recording.first);
  const t = timeGrid(recording.last - recording.first);
  const state = new Float64Array(t.length * index.size);

  series.forEach((joint, column) => {
    resampleJoint(joint, t).forEach((value, frame) => {
      state[frame * index.size + column] = value;
    });
  });

  return { index: at, task: null, t, state, action: null, videos: videosOf(recording, recording.first) };
}

function readRecording(files: McapInput[]): Read {
  const recording: Recording = { joints: [], images: new Map(), first: null, last: null };

  for (const file of files) readFile(file, recording);

  if (recording.first === null || recording.last === null) throw new DataImportError(MCAP_NO_JOINTS);

  return { ...recording, first: recording.first, last: recording.last };
}

function sharedJoints(recordings: Read[]) {
  const [first, ...rest] = recordings.map((r) => [...jointIndex(sortedSamples(r)).keys()]);
  const names = first.filter((name) => rest.every((other) => other.includes(name)));

  if (names.length === 0) throw new DataImportError(MCAP_NO_JOINTS);

  return new Map(names.map((name, column) => [name, column]));
}

function sourceOf(recordings: Read[]): SourceData {
  const index = sharedJoints(recordings);
  const episodes = recordings.map((recording, at) => episodeOf(recording, index, at));

  return { format: 'mcap', robotType: null, names: [...index.keys()], episodes };
}

export async function readMcap(files: McapInput[]): Promise<SourceData> {
  return sourceOf([readRecording(files)]);
}

export async function readMcapEach(files: McapInput[]): Promise<SourceData> {
  return sourceOf(files.map((file) => readRecording([file])));
}
