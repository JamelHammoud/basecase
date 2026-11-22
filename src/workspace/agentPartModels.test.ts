import { expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { awaitPartModels } from './agentPartModels';

it('keeps scene mutations and cursor interaction independent of pending display preparation', async () => {
  const meshesReady = vi.fn(() => new Promise<string[]>(() => {}));
  const viewport = { meshesReady } as unknown as Viewport3DHandle;

  await awaitPartModels('apply', viewport);
  await awaitPartModels('focus', viewport);
  expect(meshesReady).not.toHaveBeenCalled();
});

it('waits for geometry readiness before a measuring tool reads the scene', async () => {
  let release = () => {};
  const meshesReady = vi.fn(
    () =>
      new Promise<string[]>((resolve) => {
        release = () => resolve([]);
      }),
  );
  const viewport = { meshesReady } as unknown as Viewport3DHandle;
  let complete = false;
  const pending = awaitPartModels('define_joints', viewport).then(() => {
    complete = true;
  });

  expect(meshesReady).toHaveBeenCalledOnce();
  expect(complete).toBe(false);
  release();
  await pending;
  expect(complete).toBe(true);
});
