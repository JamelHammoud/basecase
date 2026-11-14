import { lastAtOrBefore } from '../dataLayers/track';
import { DIAGNOSTIC_SCHEMAS, isSchema } from './schemas';
import { topicRef, type TopicIndex } from './topicIndex';
import { TOPIC_LIMITS, type RecordedTopic } from './topicLog';

export const DIAGNOSTIC_LEVELS = ['ok', 'warn', 'error', 'stale'] as const;

export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number];

export interface DiagnosticRow {
  name: string;
  level: DiagnosticLevel;
  message: string;
  hardware: string;
  at: number;
  topic: string;
}

export const isDiagnosticTopic = (topic: RecordedTopic) => isSchema(DIAGNOSTIC_SCHEMAS, topic.schema);

const levelOf = (value: number | undefined): DiagnosticLevel => DIAGNOSTIC_LEVELS[value ?? 0] ?? 'stale';

function statusAt(topic: RecordedTopic, message: number, item: number): Omit<DiagnosticRow, 'topic'> | null {
  const label = (field: string) => topic.labels.get(`status[${item}].${field}`)?.[message] ?? '';
  const name = label('name');

  if (!name) return null;

  return {
    name,
    level: levelOf(topic.numbers.get(`status[${item}].level`)?.[message]),
    message: label('message'),
    hardware: label('hardware_id'),
    at: topic.t[message],
  };
}

function newestByName(topic: RecordedTopic, at: number, rows: Map<string, DiagnosticRow>) {
  const last = lastAtOrBefore(topic.t, at);

  for (let message = 0; message <= last; message++) {
    for (let item = 0; item < TOPIC_LIMITS.items; item++) {
      const status = statusAt(topic, message, item);

      if (!status) break;

      rows.set(status.name, { ...status, topic: topic.topic });
    }
  }
}

export function diagnosticsAt(index: TopicIndex, query: { topic?: string; at: number }): DiagnosticRow[] {
  const rows = new Map<string, DiagnosticRow>();
  const topics = index.topics.filter(
    (t) => isDiagnosticTopic(t) && (!query.topic || topicRef(t.topic) === query.topic),
  );

  for (const topic of topics) newestByName(topic, query.at, rows);

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
