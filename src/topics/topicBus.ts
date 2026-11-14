import type { RecordedBus, SignalTrack } from '../cases/console/recordedSignals';
import { heldAt, topicMeaning } from './meaning';
import { isTopicSignal, type TopicIndex } from './topicIndex';

const MOST_SIGNALS = 64;

const ROBOT_FIELDS = { tilt: 'robot.tilt', x: 'robot.x', z: 'robot.z' } as const;

const firstNumber = (values: number[] | undefined) => values?.find((v) => !Number.isNaN(v)) ?? 0;

export function withMeaning(track: SignalTrack, index: TopicIndex | null): SignalTrack {
  if (!index) return track;

  const meaning = topicMeaning(index);
  const numbers = new Map(track.numbers);

  for (const [field, series] of Object.entries(meaning)) {
    const id = ROBOT_FIELDS[field as keyof typeof ROBOT_FIELDS];
    const offset = field === 'tilt' ? 0 : firstNumber(track.numbers.get(id));

    numbers.set(id, heldAt(series, track.t, offset));
  }

  return { ...track, numbers };
}

export function topicBus(bus: RecordedBus, index: TopicIndex | null): RecordedBus {
  if (!index) return bus;

  const time = () => bus.playhead()?.at ?? 0;

  return {
    ...bus,
    read: (id) => (isTopicSignal(id) ? index.valueAt(id, time()) : bus.read(id)),
    series: (id) => (isTopicSignal(id) ? index.series(id) : bus.series(id)),
    expand: (pattern) => (isTopicSignal(pattern) ? index.expand(pattern) : bus.expand(pattern)),
    topics: () => index,
    listed: () => index.listed(),
  };
}

export function topicSignalIds(index: TopicIndex | null, patterns?: readonly string[]) {
  if (!patterns) return undefined;

  const expanded = patterns.flatMap((p) => (index && isTopicSignal(p) ? index.expand(p) : [p]));

  return [...new Set(expanded)].slice(0, MOST_SIGNALS);
}

export function withTopicSignals(track: SignalTrack, index: TopicIndex | null, ids?: readonly string[]) {
  const wanted = (ids ?? []).filter(isTopicSignal);

  if (!index || !wanted.length) return track;

  const numbers = new Map(track.numbers);

  for (const id of wanted) {
    const { t, v } = index.series(id);

    if (t.length) numbers.set(id, heldAt({ t: Float64Array.from(t), v: Float64Array.from(v) }, track.t));
  }

  return { ...track, numbers };
}
