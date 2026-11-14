import type { DataTrack, MessageOf } from '../dataLayers/track';
import type { DataSchema } from '../dataLayers/messages';
import { messageAt } from './messageTree';
import { DATA_LAYER_SCHEMAS, schemaKey } from './schemas';
import type { TopicIndex } from './topicIndex';
import type { DecodedMessage, RecordedTopic } from './topicLog';

export const TOPIC_LAYER = 'topic:';

const KEPT_MESSAGES = 8;

export const isTopicLayer = (id: string) => id.startsWith(TOPIC_LAYER);

function cachedMessages(topic: RecordedTopic) {
  const kept = new Map<number, DecodedMessage>();

  return (i: number) => {
    const found = kept.get(i);

    if (found) return found;

    const made = messageAt(topic, i);

    if (kept.size >= KEPT_MESSAGES) kept.delete(kept.keys().next().value!);

    kept.set(i, made);

    return made;
  };
}

function topicTrack(topic: RecordedTopic, schema: DataSchema): DataTrack {
  const message = cachedMessages(topic);

  return {
    id: `${TOPIC_LAYER}${topic.topic}`,
    name: topic.topic,
    schema,
    fixed: schema === 'tf2_msgs/TFMessage' && topic.topic.endsWith('_static'),
    version: 0,
    times: topic.t,
    message: (i) => message(i) as unknown as MessageOf<DataSchema>,
  };
}

export function topicTracks(index: TopicIndex): DataTrack[] {
  return index.topics.flatMap((topic) => {
    const schema = DATA_LAYER_SCHEMAS.get(schemaKey(topic.schema));

    return schema ? [topicTrack(topic, schema)] : [];
  });
}
