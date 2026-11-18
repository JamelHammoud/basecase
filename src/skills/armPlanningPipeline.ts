import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { JointValues } from '../types/robotics';
import type { State } from './contract';
import type { DraftInput } from './teach';

export function armReachRequest(mj: MainModule, model: SimModel, target: JointValues, part = 'link2'): DraftInput {
  const engine = new SimEngine(mj, model);

  try {
    engine.reset({ values: target });

    const body = model.bodies.find((b) => b.parts.includes(part))!;
    const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name);
    const point = [0, 1, 2].map((axis) => engine.data.xpos[id * 3 + axis] as number) as [number, number, number];
    const axes = ['x', 'y', 'z'] as const;
    const state: State = {
      all: point.flatMap((value, i) => [
        { atom: { expr: { signal: axes[i] }, cmp: '>' as const, value: value - 0.005, scale: 0.005 } },
        { atom: { expr: { signal: axes[i] }, cmp: '<' as const, value: value + 0.005, scale: 0.005 } },
      ]),
    };

    return {
      name: 'Obstructed reach',
      request: 'Reach around the obstacle',
      seconds: 10,
      goal: {
        kind: 'reach',
        part,
        waypoints: [{ point_mm: point.map((v) => v * 1000) as [number, number, number], hold_s: 1 }],
      },
      contract: { version: 1, success: { hold_for: { seconds: 0.5, within: { last: 2 }, state } }, failures: [] },
      signals: Object.fromEntries(axes.map((axis) => [axis, { kind: 'part-position', part, axis }])),
    };
  } finally {
    engine.dispose();
  }
}
