import { describe, expect, it, vi } from 'vitest';
import { seeded } from '../utils/seeded';
import { LOG_LEVELS, logEntries, type LogEntry, type LogQuery } from './logs';
import { TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

const SCHEMAS = [
  { schema: 'rcl_interfaces/Log', levels: [10, 20, 30, 40, 50] },
  { schema: 'rcl_interfaces/msg/Log', levels: [10, 20, 30, 40, 50] },
  { schema: 'rosgraph_msgs/Log', levels: [1, 2, 4, 8, 16] },
  { schema: 'rosgraph_msgs/msg/Log', levels: [1, 2, 4, 8, 16] },
  { schema: 'foxglove.Log', levels: [1, 2, 3, 4, 5] },
];

function previousEntries(index: TopicIndex, query: LogQuery = {}): LogEntry[] {
  const words = (query.search ?? '').toLowerCase().split(/\s+/u).filter(Boolean);
  const until = query.until ?? Infinity;
  const entries = index.topics.flatMap((topic) => {
    const mapping = SCHEMAS.find((candidate) => candidate.schema === topic.schema);

    if (!mapping || (query.topics?.length && !query.topics.includes(`topic.${topic.topic}`))) return [];

    const levels = topic.numbers.get('level');
    const names = topic.labels.get('name');
    const messages = topic.labels.get('msg') ?? topic.labels.get('message');
    const rows: LogEntry[] = [];

    for (let i = 0; i < topic.t.length && topic.t[i] <= until; i++) {
      rows.push({
        at: topic.t[i],
        level: LOG_LEVELS[mapping.levels.indexOf(levels?.[i] ?? Number.NaN)] ?? 'info',
        name: names?.[i] ?? '',
        text: messages?.[i] ?? '',
        topic: topic.topic,
      });
    }

    return rows;
  });

  return entries
    .filter((entry) => LOG_LEVELS.indexOf(entry.level) >= LOG_LEVELS.indexOf(query.level ?? 'debug'))
    .filter((entry) => words.every((word) => `${entry.name} ${entry.text}`.toLowerCase().includes(word)))
    .sort((a, b) => a.at - b.at);
}

function topicOf(schema: string, count: number, id = 0): RecordedTopic {
  return {
    topic: `/logs.${id}`,
    schema,
    t: Float64Array.from({ length: count }, (_, i) => Math.floor(i / 2) / 10),
    numbers: new Map(),
    labels: new Map(),
    lists: new Map(),
    blobs: new Map(),
    clipped: false,
  };
}

function fixture(seed: number): TopicIndex {
  const random = seeded(seed);
  const topics = SCHEMAS.map(({ schema, levels }, id) => {
    const topic = topicOf(schema, Math.floor(random() * 70), id);
    const codes = [...levels, Number.NaN, -1, 0, Infinity];
    const text = ['Ready', 'motor STALLED', 'battery low', '', 'İ ARM', 'arm\nready'];
    const names = ['base', 'ARM', '', 'arm.motor'];

    topic.numbers.set(
      'level',
      Float64Array.from(topic.t, () => codes[Math.floor(random() * codes.length)]),
    );
    topic.labels.set(
      'name',
      Array.from(topic.t, () => names[Math.floor(random() * names.length)]),
    );
    topic.labels.set(
      id % 2 ? 'message' : 'msg',
      Array.from(topic.t, () => text[Math.floor(random() * text.length)]),
    );

    return topic;
  });

  return new TopicIndex({ topics: [...topics, topicOf('std_msgs/String', 20, 5)] });
}

describe('recorded log queries', () => {
  it('matches complete entries across mixed schemas, filters and tied timestamps', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const index = fixture(seed);
      const before = structuredClone(index.topics);
      const queries: LogQuery[] = [
        {},
        { topics: [] },
        { topics: ['topic./missing'] },
        { topics: ['topic./logs.3', 'topic./logs.0', 'topic./logs.3'] },
        ...LOG_LEVELS.map((level) => ({ level, until: (seed % 30) / 10 })),
        ...['', ' \t\n', 'ARM stalled', 'low battery', 'arm.motor', 'İ', 'missing'].map((search) => ({ search })),
        ...[-Infinity, -1, 0, 0.1, 0.15, Infinity, Number.NaN].map((until) => ({ until })),
        { level: 'warn', search: 'arm ready', topics: ['topic./logs.1'], until: 2 },
      ];

      for (const query of queries) expect(logEntries(index, query)).toEqual(previousEntries(index, query));

      expect(index.topics).toEqual(before);
    }
  });

  it('preserves sparse column fallbacks, edits and independent results', () => {
    const topic = topicOf('rcl_interfaces/msg/Log', 6);
    const messages = ['first', '', 'third'];

    delete messages[2];
    topic.labels.set('msg', messages);
    topic.labels.set('message', ['fallback', 'other']);
    topic.labels.set('name', ['ARM']);
    topic.numbers.set('level', Float64Array.of(10, 20, Number.NaN));

    const index = new TopicIndex({ topics: [topic] });
    const first = logEntries(index);
    const second = logEntries(index);

    expect(first.map((entry) => entry.text)).toEqual(['first', '', '', '', '', '']);
    expect(first.map((entry) => entry.level)).toEqual(['debug', 'info', 'info', 'info', 'info', 'info']);
    expect(second).toEqual(first);
    expect(second[0]).not.toBe(first[0]);
    first[0].text = 'changed output';
    messages[0] = 'edited source';
    topic.numbers.get('level')![0] = 50;
    expect(logEntries(index, { level: 'fatal' })).toEqual(previousEntries(index, { level: 'fatal' }));
    expect(second[0].text).toBe('first');
    topic.labels.delete('msg');
    expect(logEntries(index)).toEqual(previousEntries(index));
    Object.freeze(topic.labels.get('message'));
    Object.freeze(topic.labels.get('name'));
    Object.freeze(topic);
    expect(logEntries(index, { search: 'fallback' })).toEqual(previousEntries(index, { search: 'fallback' }));
    expect(logEntries(new TopicIndex({ topics: [] }))).toEqual([]);
  });

  it.each([300, 600])('reads text only for severity matches among %i messages per schema', (count) => {
    let reads = 0;
    const topics = SCHEMAS.map(({ schema, levels }, id) => {
      const topic = topicOf(schema, count, id);
      const labels = Array.from({ length: count }, (_, i) => (i % 20 ? 'ready' : 'ARM stalled'));
      const counted = new Proxy(labels, {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/u.test(key)) reads++;

          return Reflect.get(target, key, receiver);
        },
      });

      topic.numbers.set(
        'level',
        Float64Array.from(topic.t, (_, i) => levels[i % 10 ? 0 : 3]),
      );
      topic.labels.set('name', counted);
      topic.labels.set('msg', counted);

      return topic;
    });
    const index = new TopicIndex({ topics });
    const query: LogQuery = { level: 'warn', search: 'ARM stalled' };
    const result = logEntries(index, query);

    expect(reads).toBe((count / 10) * SCHEMAS.length * 2);
    expect(result).toHaveLength((count / 20) * SCHEMAS.length);
    expect(result.every((entry) => entry.level === 'error')).toBe(true);
    reads = 0;
    expect(result).toEqual(previousEntries(index, query));
    expect(reads).toBe(count * SCHEMAS.length * 2);
  });

  it.each(['', ' \t\n'])('skips message case conversion for an empty search %j', (search) => {
    const index = fixture(12);
    const expected = previousEntries(index, { search });
    const lower = vi.spyOn(String.prototype, 'toLowerCase');
    const result = logEntries(index, { search });
    const calls = lower.mock.calls.length;

    lower.mockRestore();
    expect(result).toEqual(expected);
    expect(calls).toBe(1);
  });
});
