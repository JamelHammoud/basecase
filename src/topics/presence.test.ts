import { describe, expect, it } from 'vitest';
import { TopicCollector } from './collector';
import { messageAt } from './messageTree';
import { decodeTopicLog, encodeTopicLog } from './topicFile';
import { TOPIC_LIMITS } from './topicLog';

const version = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);

describe('recorded field presence', () => {
  it('keeps stable paths in version 1 and reads them without presence metadata', () => {
    const c = new TopicCollector();

    c.add('/t', 'T', 0n, { reading: 12, name: '' });

    const bytes = encodeTopicLog(c.finish(0n));

    expect(version(bytes)).toBe(1);
    expect(messageAt(decodeTopicLog(bytes)!.topics[0], 0)).toEqual({ reading: 12, name: '' });
  });

  it('sorts presence with messages, preserves empty values and refuses truncated masks', () => {
    const c = new TopicCollector();

    c.add('/t', 'T', 2n, { payload: new Uint8Array() });
    c.add('/t', 'T', 0n, { payload: { name: 'nested' } });
    c.add('/t', 'T', 1n, { payload: '' });

    const bytes = encodeTopicLog(c.finish(0n));
    const topic = decodeTopicLog(bytes)!.topics[0];

    expect(version(bytes)).toBe(2);
    expect(messageAt(topic, 0)).toEqual({ payload: { name: 'nested' } });
    expect(messageAt(topic, 1)).toEqual({ payload: '' });
    expect(messageAt(topic, 2)).toEqual({ payload: new Uint8Array() });
    expect(decodeTopicLog(bytes.subarray(0, bytes.length - 8))).toBeNull();
  });

  it('charges late columns for earlier message gaps before allocating them', () => {
    const cells = TOPIC_LIMITS.cells;

    TOPIC_LIMITS.cells = 12;

    try {
      const c = new TopicCollector();

      for (let i = 0; i < 5; i++) c.add('/t', 'T', BigInt(i), { a: i });

      c.add('/t', 'T', 5n, { a: 5, b: 6, c: 7 });

      const topic = c.finish(0n).topics[0];

      expect([...topic.numbers.keys()]).toEqual(['a', 'b']);
      expect(topic.numbers.get('b')).toEqual(Float64Array.from([NaN, NaN, NaN, NaN, NaN, 6]));
      expect(topic.clipped).toBe(true);
    } finally {
      TOPIC_LIMITS.cells = cells;
    }
  });
});
