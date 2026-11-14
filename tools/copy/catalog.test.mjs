import { describe, expect, it } from 'vitest';
import { COMPONENTS, specLines } from '../../src/data/components.ts';
import { findBannedCopy } from './banned.mjs';

const textsOf = (part) => [part.description, ...part.specs.flatMap(([label, value]) => [label, ...specLines(value)])];

describe('catalog copy', () => {
  it('holds every catalog part’s description and specs to the copy rules', () => {
    const misses = COMPONENTS.flatMap((part) =>
      textsOf(part)
        .filter((text) => text && findBannedCopy(text))
        .map((text) => `${part.id}: ${text} (${findBannedCopy(text).fix})`),
    );

    expect(misses).toEqual([]);
  });
});
