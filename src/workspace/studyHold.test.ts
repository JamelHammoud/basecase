import { describe, expect, it, vi } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { servoArm } from '../sim/fixtures/servoArm';
import type { Simulation } from '../sim/useSimulation';
import type { StudyScene } from '../study/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { runStudyHold } from './studyHold';

function sceneOf(robot: ReturnType<typeof servoArm>): StudyScene {
  return {
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    triangles: Object.fromEntries(robot.parts.map((part) => [part.id, fixtureTriangles(robot.parts)(part.id)!])),
  };
}

describe('study hold and shoves', () => {
  it('retains the derated worker simulation and both body weight shoves for a legged design', async () => {
    const hexapod = fixtureRobots().find((robot) => robot.id === 'hexapod')!;
    const runOn = vi.fn(async () => ({ stats: { robots: [] } }));
    const scene = sceneOf(hexapod);
    const before = structuredClone(scene);

    expect(await runStudyHold(scene, { runOn } as unknown as Simulation)).toEqual({ fellAt: null });
    expect(scene).toEqual(before);
    expect(runOn).toHaveBeenCalledTimes(1);

    const [model, options] = runOn.mock.calls[0] as unknown as [
      unknown,
      {
        seconds: number;
        controller: { kind: string };
        trace: boolean;
        pushes: Array<{ at: number; force: number[] }>;
        forceLimits: (model: unknown) => unknown;
      },
    ];

    expect(options).toMatchObject({ seconds: 4.5, controller: { kind: 'hold' }, trace: true });
    expect(options.pushes.map((push) => push.at)).toEqual([1.5, 2.75]);
    expect(options.pushes[0].force[2]).toBeGreaterThan(0);
    expect(options.pushes[1].force[0]).toBe(options.pushes[0].force[2]);
    expect(options.forceLimits(model)).toBeDefined();
  });

  it('does not start a worker hold for an arm fixed to the floor', async () => {
    const runOn = vi.fn();

    expect(await runStudyHold(sceneOf(servoArm()), { runOn } as unknown as Simulation)).toBe('no legs');
    expect(runOn).not.toHaveBeenCalled();
  });
});
