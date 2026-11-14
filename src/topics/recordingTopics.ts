import type { Recording } from '../sim/recorder';
import { decodeTopicLog } from './topicFile';
import { TopicIndex } from './topicIndex';

const indexes = new WeakMap<Uint8Array, TopicIndex | null>();

export function recordingTopics(recording: { topics?: Uint8Array | null } | null | undefined): TopicIndex | null {
  const bytes = recording?.topics;

  if (!bytes) return null;

  if (!indexes.has(bytes)) {
    const log = decodeTopicLog(bytes);

    indexes.set(bytes, log && log.topics.length ? new TopicIndex(log) : null);
  }

  return indexes.get(bytes) ?? null;
}

export function withoutTopics(recording: Recording): Recording {
  if (!recording.topics) return recording;

  const rest = { ...recording };

  delete rest.topics;

  return rest;
}
