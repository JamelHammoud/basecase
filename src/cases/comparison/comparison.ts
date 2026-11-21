import type { StoredTry } from '../tryFile';
import { decodeRecording } from '../recordingFile';
import type { Recording } from '../../sim/recorder';
import { lastAtOrBefore } from '../../dataLayers/track';
import { decodeTopicLog } from '../../topics/topicFile';
import { TopicIndex } from '../../topics/topicIndex';
import type { RecordedTopic } from '../../topics/topicLog';
import { fieldPresent } from '../../topics/presence';
import { comparisonEvents } from './comparisonEvents';
import { topicChannels } from './comparisonChannels';
import { recordedJointUnit } from './comparisonUnits';

export const COMPARISON_LIMITS = { bytes: 64 * 1024 * 1024, channels: 64, plot: 2048, events: 2048, text: 256 };

export interface ComparisonEvent {
  id: string;
  name: string;
  at: number;
  clipped?: boolean;
  signal?: string;
  value?: string;
}

export interface ComparisonChannel {
  id: string;
  unit: string | null;
  kind: 'number' | 'state';
  t: ArrayLike<number>;
  values: ArrayLike<number> | readonly string[];
  clipped: boolean;
  topic?: RecordedTopic;
  path?: string;
  stride?: number;
  address?: number;
  item?: { offsets: Uint32Array; index: number };
}

export interface ComparisonSource {
  stored: StoredTry;
  hash: string;
  bytes: number;
  start: number;
  end: number;
  channels: ComparisonChannel[];
  channelsClipped: boolean;
  events: ComparisonEvent[];
  eventsClipped: boolean;
  stateEventsClipped: boolean;
  index: TopicIndex;
  recording: Recording;
}

export interface SamplingRule {
  kind: 'previous';
  maxAge: number;
}

export interface MatchedSignals {
  left: string;
  right: string;
  leftUnit: string;
  rightUnit: string;
  rule: SamplingRule;
}

export interface ComparisonSlot {
  source: ComparisonSource;
  offset: number;
}

export interface ComparisonSample {
  status: 'sample' | 'missing' | 'outside' | 'stale' | 'clipped';
  value?: number | string;
  at?: number;
  clipped?: boolean;
}

export const comparisonHash = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');

function jointChannels(recording: Recording, stored: StoredTry): ComparisonChannel[] {
  return stored.robot.joints.slice(0, COMPARISON_LIMITS.channels).flatMap((id, i) => {
    const address = recording.jointQpos?.[i];

    if (address === undefined || address < 0 || address >= recording.nq) return [];

    return [
      {
        id: `joint.${id}.position`,
        unit: recordedJointUnit(recording, id),
        kind: 'number' as const,
        t: recording.t,
        values: recording.qpos,
        clipped: false,
        stride: recording.nq,
        address,
      },
    ];
  });
}

function clockBounds(recording: Recording, index: TopicIndex) {
  const times: ArrayLike<number>[] = [recording.t, ...index.topics.map((topic) => topic.t)];
  let start = Infinity;
  let end = -Infinity;

  for (const t of times) {
    if (!t.length) continue;

    let previous = -Infinity;

    for (let i = 0; i < t.length; i++) {
      if (!Number.isFinite(t[i]) || t[i] < previous) throw new Error('Open the try again.');

      previous = t[i];
    }

    start = Math.min(start, t[0]);
    end = Math.max(end, t[t.length - 1]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Open the try again.');

  return { start, end };
}

export async function prepareSource({
  stored,
  bytes,
}: {
  stored: StoredTry;
  bytes: Uint8Array;
}): Promise<ComparisonSource> {
  if (bytes.byteLength > COMPARISON_LIMITS.bytes) throw new Error('Choose a recording under 64 MB.');

  const recording = decodeRecording(bytes);

  if (!recording || recording.frames !== stored.frames) throw new Error('Open the try again.');

  const log = recording.topics ? decodeTopicLog(recording.topics) : { topics: [] };

  if (!log) throw new Error('Open the try again.');

  const index = new TopicIndex(log);
  const allChannels = [...jointChannels(recording, stored), ...topicChannels(index)];
  const channels = allChannels.slice(0, COMPARISON_LIMITS.channels);

  return {
    stored,
    recording,
    index,
    channels,
    channelsClipped: allChannels.length > COMPARISON_LIMITS.channels,
    ...comparisonEvents(recording, channels),
    hash: await comparisonHash(bytes),
    bytes: bytes.byteLength,
    ...clockBounds(recording, index),
  };
}

export const sourceTime = (source: Pick<ComparisonSource, 'start'>, shared: number, offset: number) =>
  source.start + shared - offset;

export const alignmentOffset = (source: Pick<ComparisonSource, 'start'>, event: ComparisonEvent, shared: number) =>
  shared - (event.at - source.start);

export function comparisonRange(slots: readonly ComparisonSlot[]) {
  return {
    from: Math.min(...slots.map((slot) => slot.offset)),
    to: Math.max(...slots.map(({ source, offset }) => offset + source.end - source.start)),
  };
}

function stateValue(channel: ComparisonChannel, i: number) {
  const topic = channel.topic;
  const path = channel.path!;

  if (!topic) return channel.values[i];

  if (fieldPresent(topic, path, i, 'label')) return topic.labels.get(path)?.[i];

  const numeric = topic.numbers.get(path)?.[i];

  return fieldPresent(topic, path, i, 'number') && numeric !== undefined && Number.isFinite(numeric)
    ? String(numeric)
    : undefined;
}

export function channelValue(channel: ComparisonChannel, i: number) {
  if (channel.kind === 'state') return stateValue(channel, i);

  const at = channel.item
    ? channel.item.offsets[i] + channel.item.index
    : i * (channel.stride ?? 1) + (channel.address ?? 0);

  if (channel.item && at >= channel.item.offsets[i + 1]) return undefined;

  const value = channel.values[at];
  const kind = channel.item ? 'list' : 'number';
  const present = !channel.topic || fieldPresent(channel.topic, channel.path!, i, kind);

  return present && typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function sampleAt(source: ComparisonSource, id: string, time: number, rule: SamplingRule): ComparisonSample {
  const channel = source.channels.find((column) => column.id === id);

  return sampleChannel(channel, time, rule);
}

export function sampleChannel(
  channel: ComparisonChannel | undefined,
  time: number,
  rule: SamplingRule,
): ComparisonSample {
  if (!Number.isFinite(time)) return { status: 'outside' };

  if (!channel || !channel.t.length) return { status: 'missing' };

  const t = channel.t;

  if (time < t[0] || time > t[t.length - 1])
    return { status: time > t[t.length - 1] && channel.clipped ? 'clipped' : 'outside' };

  const i = lastAtOrBefore(t, time);
  const at = t[i];
  const value = channelValue(channel, i);

  if (value === undefined) return { status: 'missing', at };

  if (channel.kind === 'number' && (!Number.isFinite(rule.maxAge) || rule.maxAge < 0 || time - at > rule.maxAge))
    return { status: 'stale', at };

  return { status: 'sample', value, at, clipped: channel.clipped };
}

export function differenceAt(
  slots: readonly [ComparisonSlot, ComparisonSlot],
  shared: number,
  match: MatchedSignals | null,
) {
  if (!match || !match.leftUnit.trim() || match.leftUnit !== match.rightUnit || match.rule.kind !== 'previous')
    return null;

  const ids = [match.left, match.right];

  if (slots.some(({ source }, i) => !compatibleChannel(source, ids[i], match.leftUnit))) return null;

  const [a, b] = slots.map(({ source, offset }, i) =>
    sampleAt(source, i === 0 ? match.left : match.right, sourceTime(source, shared, offset), match.rule),
  );

  return a.status === 'sample' && b.status === 'sample' && typeof a.value === 'number' && typeof b.value === 'number'
    ? a.value - b.value
    : null;
}

function compatibleChannel(source: ComparisonSource, id: string, unit: string) {
  const channel = source.channels.find((candidate) => candidate.id === id);

  return channel?.kind === 'number' && channel.unit === unit;
}
