import { lastAtOrBefore } from '../../dataLayers/track';
import { messageTree, type TreeNode } from '../../topics/messageTree';
import type { RecordedTopic } from '../../topics/topicLog';
import { COMPARISON_LIMITS, type ComparisonSource } from './comparison';

export interface ComparisonMessage {
  nodes: TreeNode[];
  at: number | null;
  clipped: boolean;
}

const FIELDS = 32;
const ITEMS = 32;

function messagePresence(topic: RecordedTopic, i: number) {
  if (!topic.presence) return undefined;

  return new Map(
    [...topic.presence].map(([path, mask]) => [
      path,
      Uint8Array.of((mask[Math.floor(i / 8)] & (1 << (i % 8))) !== 0 ? 1 : 0),
    ]),
  );
}

export function comparisonMessage(source: ComparisonSource, topicName: string, time: number): ComparisonMessage {
  const topic = source.index.topics.find((candidate) => candidate.topic === topicName);
  const i = topic ? lastAtOrBefore(topic.t, time) : -1;

  if (!topic || i < 0 || time > source.end || !Number.isFinite(time)) return { nodes: [], at: null, clipped: false };

  let clipped =
    topic.clipped ||
    topic.numbers.size > FIELDS ||
    topic.labels.size > FIELDS ||
    topic.lists.size > FIELDS ||
    topic.blobs.size > 0;
  const numbers = new Map([...topic.numbers].slice(0, FIELDS).map(([path, v]) => [path, Float64Array.of(v[i])]));
  const labels = new Map(
    [...topic.labels].slice(0, FIELDS).map(([path, v]) => {
      clipped ||= v[i].length > COMPARISON_LIMITS.text;

      return [path, [v[i].slice(0, COMPARISON_LIMITS.text)]];
    }),
  );
  const lists = new Map(
    [...topic.lists].slice(0, FIELDS).map(([path, row]) => {
      const length = row.at[i + 1] - row.at[i];
      const v = row.v.subarray(row.at[i], row.at[i] + Math.min(length, ITEMS));

      clipped ||= length > ITEMS;

      return [path, { at: Uint32Array.of(0, v.length), v }];
    }),
  );
  const single = {
    ...topic,
    t: Float64Array.of(topic.t[i]),
    numbers,
    labels,
    lists,
    blobs: new Map(),
    presence: messagePresence(topic, i),
  };

  return { nodes: messageTree(single, 0), at: topic.t[i], clipped };
}
