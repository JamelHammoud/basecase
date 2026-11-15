import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createVisionScope, VisionScopeContext } from '../cameras/visionScope';
import { buildRig } from '../utils/kinematics';
import type { VelocityDrive } from './driveAccess';
import { useDrive } from './useDrive';

function preparingDrive() {
  let finish: (value: VelocityDrive | null) => void = () => undefined;
  const velocity = new Promise<VelocityDrive | null>((resolve) => {
    finish = resolve;
  });
  const startSim = vi.fn(async () => undefined);
  const setController = vi.fn();
  const result: { drive?: ReturnType<typeof useDrive> } = {};

  function Harness() {
    result.drive = useDrive({
      parts: [],
      rig: buildRig([], []),
      pose: undefined,
      status: 'off',
      stats: null,
      send: vi.fn(),
      viewportRef: { current: null },
      modelRef: { current: null },
      frameHookRef: { current: null },
      subscribeStop: () => () => undefined,
      startSim,
      pinned: () => null,
      setController,
      runOn: vi.fn(),
      velocity: { current: () => velocity },
    });

    return null;
  }

  renderToString(
    createElement(VisionScopeContext.Provider, { value: createVisionScope('drive-startup') }, createElement(Harness)),
  );

  return { drive: result.drive!, finish, startSim, setController };
}

describe('drive preparation cancellation', () => {
  it('keeps Stop effective while the velocity policy is still loading', async () => {
    const { drive, finish, startSim, setController } = preparingDrive();
    const starting = drive.start();

    drive.stop();
    finish(null);
    expect(await starting).toBe(false);
    expect(startSim).not.toHaveBeenCalled();
    expect(setController).toHaveBeenCalledExactlyOnceWith({ kind: 'hold' });
  });

  it('checks the Case startup guard after loading its velocity policy', async () => {
    const { drive, finish, startSim, setController } = preparingDrive();
    let current = true;
    const starting = drive.start(undefined, { current: () => current });

    current = false;
    finish(null);
    expect(await starting).toBe(false);
    expect(startSim).not.toHaveBeenCalled();
    expect(setController).not.toHaveBeenCalled();
  });
});
