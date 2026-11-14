import { describe, expect, it } from 'vitest';
import { createCase } from './caseTools.mjs';

const lamp = { name: 'Lamp', kind: 'cylinder', position: [0, -300, 1], size: [120, 120, 2], behavior: 'marker' };

describe('world objects the agent sends', () => {
  it('keep movable through create_case, so a Case’s code can move them', () => {
    const objects = createCase.config.inputSchema.objects.parse([{ ...lamp, movable: true }, lamp]);

    expect(objects.map((o) => o.movable)).toEqual([true, undefined]);
  });
});
