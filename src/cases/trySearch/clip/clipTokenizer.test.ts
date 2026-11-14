import { describe, expect, it } from 'vitest';
import merges from '../../../../public/models/mobileclip-s0/merges.txt?raw';
import { CONTEXT_LENGTH, END_TOKEN, PAD_TOKEN, START_TOKEN, clipTokenizer } from './clipTokenizer';

const tokenizer = clipTokenizer(merges);

const REFERENCE: Array<[string, number[]]> = [
  ['a red mug', [320, 736, 9722]],
  ['failed grasp red block leader-arm', [8314, 34975, 736, 4593, 3236, 268, 4793]],
  ['Walk HEXAPOD   over 30 s', [2374, 16255, 4089, 323, 962, 274, 271, 338]],
  ["the robot's gripper!!", [518, 8797, 568, 2169, 2440, 748]],
  ['café 日本', [15304, 39121, 19277, 361]],
];

describe('the CLIP tokenizer', () => {
  it.each(REFERENCE)('encodes %j as the Hugging Face tokenizer does', (text, ids) => {
    const encoded = tokenizer.encode(text);

    expect(encoded.slice(0, ids.length + 2)).toEqual([START_TOKEN, ...ids, END_TOKEN]);
    expect(encoded).toHaveLength(CONTEXT_LENGTH);
    expect(encoded.slice(ids.length + 2).every((id) => id === PAD_TOKEN)).toBe(true);
  });

  it('cuts a long text to the context and still ends it', () => {
    const encoded = tokenizer.encode('grasp '.repeat(200));

    expect(encoded).toHaveLength(CONTEXT_LENGTH);
    expect(encoded[0]).toBe(START_TOKEN);
    expect(encoded[CONTEXT_LENGTH - 1]).toBe(END_TOKEN);
  });
});
