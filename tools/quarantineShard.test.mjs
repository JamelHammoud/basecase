import { describe, expect, it } from 'vitest';
import { loadQuarantine, onPlatform } from './quarantine.mjs';
import { quarantineShard } from './quarantineShard.mjs';

describe('quarantine shards', () => {
  it.each(['linux', 'win32'])('runs each %s entry once and keeps each file on one shard', (platform) => {
    const entries = onPlatform(loadQuarantine(), platform);
    const shards = Array.from({ length: 6 }, (_, index) => quarantineShard(entries, `${index + 1}/6`));
    const combined = shards.flat();

    expect(combined).toHaveLength(entries.length);
    expect(new Set(combined)).toEqual(new Set(entries));

    for (const file of new Set(entries.map((entry) => entry.file))) {
      expect(shards.filter((shard) => shard.some((entry) => entry.file === file))).toHaveLength(1);
    }

    const sizes = shards.map((shard) => new Set(shard.map((entry) => entry.file)).size);

    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('keeps the unsharded run complete and partitioning independent of entry order', () => {
    const entries = [{ file: 'c' }, { file: 'a', test: 'one' }, { file: 'b' }, { file: 'a', test: 'two' }];

    expect(quarantineShard(entries)).toEqual(entries);
    expect(quarantineShard(entries, '1/2')).toEqual([entries[0], entries[1], entries[3]]);
    expect(quarantineShard([...entries].reverse(), '1/2').reverse()).toEqual(quarantineShard(entries, '1/2'));
    expect(quarantineShard([], '2/6')).toEqual([]);
    expect(quarantineShard(entries, '6/6')).toEqual([]);
  });

  it.each(['0/6', '7/6', '1/0', '-1/6', '1.5/6', '1', 'one/six', '1/9007199254740992'])(
    'rejects malformed shard %s',
    (shard) => {
      expect(() => quarantineShard([], shard)).toThrow('Quarantine shard');
    },
  );
});
