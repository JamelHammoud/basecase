import { describe, expect, it } from 'vitest';
import { nodeKernelService, renderPart } from '../cad-kernel/nodeHost/client.mjs';
import { tuneCadPart } from './cadTune.mjs';

const CRADLE = `include <robotics.scad>
// Cradle for the hip servo
wall = 2; // [1.2:0.4:4]
servo_cradle(STS3215, wall = wall);`;

const sourceOf = (code) => async () => ({ language: 'openscad', code, expect: null });

describe('tuning a part', () => {
  it('recompiles a recipe cradle with a thicker wall, growing its box by the wall', async () => {
    const before = await renderPart('openscad', CRADLE);
    const { code, result } = await tuneCadPart(
      { kernel: nodeKernelService, source: sourceOf(CRADLE) },
      { id: 'hip-cradle', values: { wall: 3 } },
    );
    const grown = before.stats.bbox.size.map((v, k) => +(result.stats.bbox.size[k] - v).toFixed(2));

    expect(before.ok).toBe(true);
    expect(result.ok).toBe(true);
    expect(code).toBe(CRADLE.replace('wall = 2;', 'wall = 3;'));
    expect(grown).toEqual([2, 2, 1]);
  }, 120000);
});
