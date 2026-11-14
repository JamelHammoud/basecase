import { isSchema, LOG_SCHEMAS, schemaKey } from './schemas';
import { topicRef, type TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  at: number;
  level: LogLevel;
  name: string;
  text: string;
  topic: string;
}

const ROS2_LEVELS: Record<number, LogLevel> = { 10: 'debug', 20: 'info', 30: 'warn', 40: 'error', 50: 'fatal' };
const ROS1_LEVELS: Record<number, LogLevel> = { 1: 'debug', 2: 'info', 4: 'warn', 8: 'error', 16: 'fatal' };
const FOXGLOVE_LEVELS: Record<number, LogLevel> = { 1: 'debug', 2: 'info', 3: 'warn', 4: 'error', 5: 'fatal' };

const LEVELS_BY_SCHEMA: Record<string, Record<number, LogLevel>> = {
  'rcl_interfaces/Log': ROS2_LEVELS,
  'rosgraph_msgs/Log': ROS1_LEVELS,
  'foxglove.Log': FOXGLOVE_LEVELS,
};

export const levelRank = (level: LogLevel) => LOG_LEVELS.indexOf(level);

export const isLogTopic = (topic: RecordedTopic) => isSchema(LOG_SCHEMAS, topic.schema);

export function logTopics(index: TopicIndex, refs?: readonly string[]): RecordedTopic[] {
  const all = index.topics.filter(isLogTopic);

  return refs?.length ? all.filter((t) => refs.includes(topicRef(t.topic))) : all;
}

function topicEntries(topic: RecordedTopic, until: number): LogEntry[] {
  const levels = LEVELS_BY_SCHEMA[schemaKey(topic.schema)] ?? {};
  const level = topic.numbers.get('level');
  const text = topic.labels.get('msg') ?? topic.labels.get('message');
  const name = topic.labels.get('name');
  const entries: LogEntry[] = [];

  for (let i = 0; i < topic.t.length && topic.t[i] <= until; i++) {
    entries.push({
      at: topic.t[i],
      level: levels[level?.[i] ?? Number.NaN] ?? 'info',
      name: name?.[i] ?? '',
      text: text?.[i] ?? '',
      topic: topic.topic,
    });
  }

  return entries;
}

export interface LogQuery {
  topics?: readonly string[];
  until?: number;
  level?: LogLevel;
  search?: string;
}

const matchesSearch = (entry: LogEntry, words: string[]) => {
  const haystack = `${entry.name} ${entry.text}`.toLowerCase();

  return words.every((w) => haystack.includes(w));
};

export function logEntries(index: TopicIndex, query: LogQuery = {}): LogEntry[] {
  const until = query.until ?? Infinity;
  const least = levelRank(query.level ?? 'debug');
  const words = (query.search ?? '').toLowerCase().split(/\s+/u).filter(Boolean);

  return logTopics(index, query.topics)
    .flatMap((t) => topicEntries(t, until))
    .filter((e) => levelRank(e.level) >= least && matchesSearch(e, words))
    .sort((a, b) => a.at - b.at);
}
