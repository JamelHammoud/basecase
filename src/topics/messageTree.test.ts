import { describe, expect, it, vi } from 'vitest';
import { TopicCollector } from './collector';
import { messageAt, messageTree } from './messageTree';
import { decodeTopicLog, encodeTopicLog } from './topicFile';
import { recordedTopic } from './topicFixtures';

describe('recorded message paths', () => {
  it('reconstructs all column kinds through repeated forward and backward reads', () => {
    const collector = new TopicCollector();

    for (let i = 0; i < 3; i++)
      collector.add('/sensor', 'Sensor', BigInt(i), {
        header: { frame_id: 'arm', stamp: i },
        names: ['wrist', ''],
        samples: [i, i + 1],
        bytes: new Uint8Array([i, 255]),
        reading: i === 1 ? 9007199254740993n : i,
        payload: i === 1 ? '' : { value: i },
      });

    const bytes = encodeTopicLog(collector.finish(0n));
    const log = decodeTopicLog(bytes)!;
    const topic = log.topics[0];

    for (const i of [0, 1, 2, 2, 1, 0]) {
      const expected = {
        header: { frame_id: 'arm', stamp: i },
        names: ['wrist', ''],
        samples: new Float64Array([i, i + 1]),
        bytes: new Uint8Array([i, 255]),
        reading: i === 1 ? '9007199254740993' : i,
        payload: i === 1 ? '' : { value: i },
      };

      expect(messageAt(topic, i)).toEqual(expected);
      expect(messageTree(topic, i)).toContainEqual({
        key: 'names',
        children: [
          { key: '0', value: 'wrist' },
          { key: '1', value: '' },
        ],
      });
    }

    expect(encodeTopicLog(log)).toEqual(bytes);
  });

  it('reads changed columns and new paths without retaining message objects', () => {
    const topic = recordedTopic('/sensor', 'Sensor', [0, 1], {
      numbers: { 'pose.position.x': [1, 2] },
      labels: { 'names[0]': ['arm', 'wrist'] },
    });
    const first = messageAt(topic, 0);

    topic.numbers.set('pose.position.x', new Float64Array([3, 4]));
    topic.numbers.set('pose.position.y', new Float64Array([5, 6]));
    topic.labels.delete('names[0]');

    expect(messageAt(topic, 0)).toEqual({ pose: { position: { x: 3, y: 5 } } });
    expect(messageAt(topic, 1)).toEqual({ pose: { position: { x: 4, y: 6 } } });
    expect(first).toEqual({ pose: { position: { x: 1 } }, names: ['arm'] });

    const second = messageAt(topic, 0);

    Object.defineProperty(second, 'pose', { value: 'changed' });
    expect(messageAt(topic, 0)).toEqual({ pose: { position: { x: 3, y: 5 } } });
  });

  it('keeps special property names as owned fields across repeated reads', () => {
    const topic = recordedTopic('/sensor', 'Sensor', [0], {
      numbers: { '__proto__.polluted': [7], 'constructor.prototype.value': [8], 'items[2].value': [9] },
    });

    for (let i = 0; i < 2; i++) {
      const message = messageAt(topic, 0);

      expect(Object.hasOwn(message, '__proto__')).toBe(true);
      expect(message['__proto__']).toEqual({ polluted: 7 });
      expect(message.constructor).toEqual({ prototype: { value: 8 } });
      expect(message.items).toEqual([undefined, undefined, { value: 9 }]);
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    }
  });

  it.each([300, 600])('parses %i field paths once across 40 messages', (columns) => {
    const topic = recordedTopic(
      '/sensor',
      'Sensor',
      Array.from({ length: 40 }, (_, i) => i),
    );

    for (let i = 0; i < columns; i++)
      topic.numbers.set(
        `sensors[${i}].value`,
        Float64Array.from(topic.t, (t) => i + t),
      );

    const parsing = vi.spyOn(String.prototype, 'matchAll');
    const lastValues: unknown[] = [];

    try {
      for (let i = 0; i < 40; i++) lastValues.push(messageAt(topic, i).sensors);

      expect(parsing).toHaveBeenCalledTimes(columns);
    } finally {
      parsing.mockRestore();
    }

    expect(lastValues[0]).toEqual(Array.from({ length: columns }, (_, i) => ({ value: i })));
    expect(lastValues[39]).toEqual(Array.from({ length: columns }, (_, i) => ({ value: i + 39 })));

    topic.numbers.set('new.value', new Float64Array(40).fill(123));
    expect(messageAt(topic, 0).new).toEqual({ value: 123 });
    expect(messageAt({ ...topic, numbers: new Map([['sensors[0].value', new Float64Array([42])]]) }, 0)).toEqual({
      sensors: [{ value: 42 }],
    });
  });
});
