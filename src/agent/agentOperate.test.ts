import { describe, expect, it, vi } from 'vitest';
import type { CameraShotInput } from '../cameras/cameraShots';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { defaultCameras, operateCommand, operateRequest, stepSeconds, type OperateContext } from './agentOperate';

const camera = { id: 'c', name: 'Wrist Camera', visible: true, componentId: 'raspberry-pi-camera-3' } as ScenePart;
const plate = { id: 'p', name: 'Plate', visible: true } as ScenePart;

function fakeSim(started: boolean) {
  const listeners = new Set<(p: Float64Array) => void>();
  const sim = {
    drive: { active: false, status: 'off', start: vi.fn(async () => started), respawn: vi.fn(), setKeys: vi.fn() },
    play: vi.fn(() => listeners.forEach((l) => l(new Float64Array([1, 2, 3])))),
    pause: vi.fn(),
    subscribePoses: (l: (p: Float64Array) => void) => {
      listeners.add(l);

      return () => listeners.delete(l);
    },
    latestStats: () => ({ robots: [{ fellAt: null, tilt: 3 }], joints: [] }),
    latestScan: () => null,
    model: null,
    worldParts: [],
  };

  return sim as unknown as Simulation & { drive: { setKeys: ReturnType<typeof vi.fn> } };
}

const context = (sim: Simulation, shoot = vi.fn()): OperateContext => ({
  sim,
  rig: { joints: [{ id: 'j' }], robots: [] } as unknown as Rig,
  parts: [camera, plate],
  fixedCameras: [],
  wait: async () => {},
  shoot: shoot as unknown as OperateContext['shoot'],
});

describe('operate', () => {
  it('clips actions to the controls and holds steps between 0.1 and 5 s', () => {
    expect(operateCommand({ forward: 3, turn: -0.5 }).v).toEqual([1, 0, -0.5]);
    expect(stepSeconds(undefined)).toBe(1);
    expect(stepSeconds(60)).toBe(5);
  });

  it('looks through the scene view and the robot’s cameras by default', () => {
    expect(defaultCameras([camera, plate], [])).toEqual(['Scene', 'Wrist Camera']);
  });

  it('holds the action, stops, pauses and shows the cameras at the last pose', async () => {
    const sim = fakeSim(true);
    const shoot = vi.fn(async (input: CameraShotInput) => ({
      shots: [{ view: input.names[0], dataUrl: 'data:image/jpeg;base64,' }],
      missing: [],
      available: ['Scene'],
    }));
    const reply = await operateRequest(context(sim, shoot), { action: { forward: 0.5 }, seconds: 2 });

    expect(sim.drive.setKeys).toHaveBeenNthCalledWith(1, expect.objectContaining({ v: [0.5, 0, 0] }));
    expect(sim.drive.setKeys).toHaveBeenLastCalledWith({ v: [0, 0, 0] });
    expect(sim.pause).toHaveBeenCalled();
    expect([...shoot.mock.calls[0][0].frames[0].poses!]).toEqual([1, 2, 3]);
    expect(reply.text).toMatch(/Ran 2\.0 s\. Upright/);
    expect(reply.images).toHaveLength(1);
  });

  it('says what to do when nothing drives the robot', async () => {
    const sim = fakeSim(false);

    (sim.drive as { status: string }).status = 'teach';

    expect((await operateRequest(context(sim), {})).text).toMatch(/train a skill/);
  });
});
