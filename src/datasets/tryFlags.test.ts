import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenceTry, touchTheDots } from '../cases/testing';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { flagKinds, tryFlags } from './tryFlags';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

describe('quality flags', () => {
  let recording: Recording;
  let model: SimModel;
  let bodies: number[];

  beforeAll(async () => {
    const { source } = await referenceTry(await loadMujoco(), touchTheDots(robot), robot);

    ({ recording, model } = source);
    bodies = model.bodies.flatMap((b, i) => (b.parts.length ? [i] : []));
  }, 60000);

  it('flags a joint limit hit at the frame it lands on the limit', () => {
    const joint = model.joints.findIndex((j) => j.range && j.actuator >= 0);
    const { id, range, type } = model.joints[joint];
    const top = Math.max(...range!) * (type === 'prismatic' ? 0.001 : Math.PI / 180);
    const qpos = Float64Array.from(recording.qpos);

    for (let f = 100; f < 110; f++) qpos[f * recording.nq + recording.jointQpos![joint]] = top;

    const before = tryFlags(recording, { model, bodies, skipJoints: [] }).filter((f) => f.joint === id && f.at === 2);
    const flags = tryFlags({ ...recording, qpos }, { model, bodies, skipJoints: [] });

    expect(before).toEqual([]);
    expect(flags).toContainEqual({ kind: 'limit', at: 100 * recording.dt, joint: id });
    expect(tryFlags({ ...recording, qpos }, { model, bodies, skipJoints: [id] }).some((f) => f.joint === id)).toBe(
      false,
    );
  });

  it('flags a frame gap and effort at the servo’s limit', () => {
    const t = Float32Array.from(recording.t, (v, f) => (f >= 150 ? v + 0.2 : v));
    const torque = Float32Array.from(recording.torque!, (v, f) => (f === 120 ? 1 : Math.min(v, 0.5)));
    const flags = tryFlags({ ...recording, t, torque }, { model, bodies, skipJoints: [] });

    expect(flags).toContainEqual({ kind: 'gap', at: 150 * recording.dt });
    expect(flags.filter((f) => f.kind === 'effort')).toEqual([{ kind: 'effort', at: 120 * recording.dt }]);
    expect(flagKinds(flags)).toEqual(expect.arrayContaining(['gap', 'effort']));
  });
});
