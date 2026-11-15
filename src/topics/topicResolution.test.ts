import { describe, expect, it } from 'vitest';
import { recordedTopic, topicIndex } from './topicFixtures';
import { TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

function scanned(topics: RecordedTopic[], id: string) {
  if (!id.startsWith('topic.')) return null;

  const rest = id.slice('topic.'.length);
  let found: RecordedTopic | null = null;

  for (const topic of topics) {
    const fits = rest === topic.topic || rest.startsWith(`${topic.topic}.`);

    if (fits && (!found || topic.topic.length > found.topic.length)) found = topic;
  }

  return found && { topic: found, path: rest.slice(found.topic.length + 1) };
}

describe('recorded topic resolution', () => {
  it('keeps longest dotted prefixes, exact names, boundaries and the first duplicate', () => {
    const names = ['/arm', '/arm.state', '/arm.state.deep', '/arm2', '/Arm', '__proto__', '', '.', '/arm.'];
    const topics = [...names, '/arm.state'].map((name, i) => recordedTopic(name, String(i), [0]));
    const index = new TopicIndex({ topics });
    const suffixes = ['', '.', '.value', '.deep.value', '.position[2]', '2.value', '/value'];

    for (const name of [...names, '/missing', '/arm.state.deeper']) {
      for (const suffix of suffixes) {
        const id = `topic.${name}${suffix}`;
        const expected = scanned(topics, id);
        const actual = index.resolve(id);

        expect(actual?.topic ?? null, id).toBe(expected?.topic ?? null);
        expect(actual?.path, id).toBe(expected?.path);
      }
    }

    expect(index.resolve('topic./arm.state.value')?.topic).toBe(topics[1]);
    expect(index.topic('topic./arm.state')).toBe(topics[1]);
    expect(index.topic('topic./arm.state.value')).toBeNull();
    expect(index.has('/arm.state')).toBe(true);
    expect(index.has('/missing')).toBe(false);
    expect(index.resolve('joint./arm.state.value')).toBeNull();
    expect(topicIndex().resolve('topic./arm.value')).toBeNull();
  });

  it('uses the same owner for numeric, exact-label and ragged signals while seeking', () => {
    const parent = recordedTopic('/arm', 'parent', [0, 1], { numbers: { 'state.value': [90, 91] } });
    const child = recordedTopic('/arm.state', 'child', [0, 1, 2], {
      numbers: { value: [1, Number.NaN, 3] },
      labels: { value: ['', '9007199254740993', ''], mode: ['idle', 'drive', 'stop'] },
      lists: { effort: [[4, 5], [6], [7, 8]] },
    });
    const before = structuredClone([parent, child]);
    const index = topicIndex(parent, child);
    const signal = 'topic./arm.state.value';

    expect(index.series(signal)).toEqual({ t: [0, 1, 2], v: [1, Number.NaN, 3] });
    expect(index.labels(signal)).toEqual({ t: [0, 1, 2], v: ['1', '9007199254740993', '3'] });

    const expected = new Map<number, number | string[] | undefined>([
      [2, 3],
      [0, 1],
      [1.5, ['9007199254740993']],
      [-1, undefined],
    ]);

    for (const time of [2, 0, 1.5, -1]) {
      expect(index.valueAt(signal, time)).toEqual(expected.get(time));
    }

    expect(index.valueAt('topic./arm.state.mode', 1.5)).toEqual(['drive']);
    expect(index.valueAt('topic./arm.state.effort[1]', 1.5)).toBeUndefined();
    expect(index.valueAt('topic./arm.state.effort[1]', 2)).toBe(8);
    expect(index.valueAt('topic./arm.state.missing', 2)).toBeUndefined();
    expect([parent, child]).toEqual(before);

    const replacement = recordedTopic('/arm.state', 'replacement', [0], { numbers: { value: [42] } });

    expect(topicIndex(parent, replacement).valueAt(signal, 0)).toBe(42);
    expect(index.valueAt(signal, 0)).toBe(1);
  });

  it.each([256, 512])('does not scan %i topic names during repeated playback reads', (size) => {
    let reads = 0;
    const topics = Array.from({ length: size }, (_, i) => {
      const topic = recordedTopic(`/robot${i}`, '', [0, 1], { numbers: { 'pose.position.x': [i, i + 1] } });
      const name = topic.topic;

      Object.defineProperty(topic, 'topic', {
        get: () => {
          reads++;

          return name;
        },
      });

      return topic;
    });
    const index = new TopicIndex({ topics });

    expect(reads).toBeLessThanOrEqual(size * 3);
    reads = 0;

    for (let frame = 0; frame < 20; frame++) {
      const last = frame % 2;

      expect(index.valueAt(`topic./robot${size - 1}.pose.position.x`, last)).toBe(size - 1 + last);
      expect(index.valueAt('topic./absent.pose.position.x', last)).toBeUndefined();
    }

    expect(reads).toBe(0);
  });
});
