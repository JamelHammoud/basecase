import { COMPARISON_LIMITS, type ComparisonChannel } from './comparison';
import { IMAGE_SCHEMAS, schemaKey } from '../../topics/schemas';
import { comparisonUnit } from './comparisonUnits';
import type { RecordedTopic, Ragged } from '../../topics/topicLog';
import { topicRef, type TopicIndex } from '../../topics/topicIndex';

function appendList(channels: ComparisonChannel[], topic: RecordedTopic, path: string, list: Ragged) {
  let width = 0;

  for (let i = 0; i < topic.t.length; i++) width = Math.max(width, list.at[i + 1] - list.at[i]);

  for (let i = 0; i < width; i++) {
    if (channels.length > COMPARISON_LIMITS.channels) return;

    channels.push({
      id: topicRef(topic.topic, `${path}[${i}]`),
      unit: null,
      kind: 'number',
      t: topic.t,
      values: list.v,
      clipped: topic.clipped,
      topic,
      path,
      item: { offsets: list.at, index: i },
    });
  }
}

function appendTopic(channels: ComparisonChannel[], topic: RecordedTopic) {
  for (const [path, values] of topic.numbers) {
    if (channels.length > COMPARISON_LIMITS.channels) return;

    if (topic.labels.has(path)) continue;

    channels.push({
      id: topicRef(topic.topic, path),
      unit: comparisonUnit(topic.schema, path),
      kind: 'number',
      t: topic.t,
      values,
      clipped: topic.clipped,
      topic,
      path,
    });
  }

  for (const [path, values] of topic.labels) {
    if (channels.length > COMPARISON_LIMITS.channels) return;

    channels.push({
      id: topicRef(topic.topic, path),
      unit: null,
      kind: 'state',
      t: topic.t,
      values,
      clipped: topic.clipped,
      topic,
      path,
    });
  }

  for (const [path, list] of topic.lists) {
    if (channels.length > COMPARISON_LIMITS.channels) return;

    if (path === 'data' && IMAGE_SCHEMAS.has(schemaKey(topic.schema))) continue;

    appendList(channels, topic, path, list);
  }
}

export function topicChannels(index: TopicIndex): ComparisonChannel[] {
  const channels: ComparisonChannel[] = [];

  for (const topic of index.topics) {
    if (channels.length > COMPARISON_LIMITS.channels) return channels;

    appendTopic(channels, topic);
  }

  return channels;
}
