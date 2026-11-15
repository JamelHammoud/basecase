import { describe, expect, it, vi } from 'vitest';
import { xl330Arm } from '../../wiring/fixtures';
import { wiringNetlist } from '../../wiring/netlist';
import { wiringCache } from './wiringCache';

describe('wiring worker result cache', () => {
  it('shares pending and completed work for the same scene and geometry', async () => {
    const scene = xl330Arm();
    const cached = wiringCache();
    const run = vi.fn(async () => wiringNetlist(scene));
    const a = cached([], scene, run);
    const b = cached([], { ...scene, project: { ...scene.project } }, run);

    expect(a).toBe(b);
    await a;
    expect(cached([], scene, run)).toBe(a);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('invalidates on geometry, placement, joint range, anchors and cable choices', async () => {
    const scene = xl330Arm();
    const cached = wiringCache();
    const run = vi.fn(async () => wiringNetlist(scene));
    const instance = { id: 'servo', key: 'mesh-1', matrix: [1, 0, 0] };

    await cached([instance], scene, run);
    await cached([{ ...instance, key: 'mesh-2' }], scene, run);
    await cached([{ ...instance, matrix: [1, 0, 20] }], scene, run);
    await cached([instance], { ...scene, project: { ...scene.project, joints: [] } }, run);
    await cached([instance], { ...scene, parts: [...scene.parts] }, run);
    await cached([instance], { ...scene, project: { ...scene.project, wiring: [] } }, run);
    expect(run).toHaveBeenCalledTimes(6);
  });

  it('retries a failed worker job', async () => {
    const scene = xl330Arm();
    const cached = wiringCache();
    const run = vi.fn(async () => {
      throw new Error('Worker stopped');
    });

    await expect(cached([], scene, run)).rejects.toThrow('Worker stopped');
    await expect(cached([], scene, run)).rejects.toThrow('Worker stopped');
    expect(run).toHaveBeenCalledTimes(2);
  });
});
