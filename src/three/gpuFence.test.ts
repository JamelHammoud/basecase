import { describe, expect, it } from 'vitest';
import { GpuFence } from './gpuFence';

const TIMEOUT_EXPIRED = 0x911b;
const ALREADY_SIGNALED = 0x911a;

function fakeGl() {
  const done = new Set<object>();
  const deleted: object[] = [];
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    TIMEOUT_EXPIRED,
    fenceSync: () => ({}),
    flush: () => {},
    clientWaitSync: (sync: object) => (done.has(sync) ? ALREADY_SIGNALED : TIMEOUT_EXPIRED),
    deleteSync: (sync: object) => deleted.push(sync),
  };

  return { gl: gl as unknown as WebGL2RenderingContext, done, deleted };
}

describe('GpuFence', () => {
  it('is full once the GPU holds its depth of unfinished frames', () => {
    const { gl } = fakeGl();
    const fence = new GpuFence(gl, 2);

    fence.mark();

    expect(fence.full()).toBe(false);

    fence.mark();

    expect(fence.full()).toBe(true);
  });

  it('frees a slot and deletes the sync when the oldest frame finishes', () => {
    const syncs: object[] = [];
    const { gl, done, deleted } = fakeGl();
    const tracked = { ...gl, fenceSync: () => syncs[syncs.push({}) - 1] } as unknown as WebGL2RenderingContext;
    const fence = new GpuFence(tracked, 2);

    fence.mark();
    fence.mark();
    done.add(syncs[0]);

    expect(fence.full()).toBe(false);
    expect(deleted).toEqual([syncs[0]]);
  });
});
