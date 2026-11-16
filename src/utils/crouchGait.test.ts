import { describe, expect, it } from 'vitest';
import type { RobotAnimation } from '../types/robotics';
import { robotWeight } from './engineering';
import { biped, project } from './engineering.fixtures';
import { crouchModel } from './engineeringCrouch';
import type { CheckContext } from './engineeringTypes';

function context(): CheckContext {
  const scene = biped();
  const settings = project({ joints: scene.joints });
  const input = { parts: scene.parts, project: settings, measures: scene.measures, servoOutputs: {} };
  const { byId, bodies, all } = robotWeight(input);

  return {
    input,
    parts: scene.parts,
    project: settings,
    measures: scene.measures,
    joints: scene.joints,
    byPart: new Map(scene.parts.map((part) => [part.id, part])),
    byId,
    all,
    onFloor: bodies.flatMap((body) => body.feet),
    servos: [],
    bodies,
  };
}

const animation = (keyframes: RobotAnimation['keyframes'], name = 'Walk'): RobotAnimation => ({
  id: name,
  name,
  duration: 1,
  loop: true,
  interpolation: 'smooth',
  keyframes,
});

function previousCrouch(ctx: CheckContext, knees: Set<string>) {
  let best: number | undefined;

  for (const gait of ctx.project.animations ?? []) {
    if (gait.source !== 'gait' && !/walk|gait/i.test(gait.name)) continue;

    for (const id of knees) {
      const values = gait.keyframes.map((frame) => frame.values[id]).filter((value) => typeof value === 'number');

      if (values.length) best = Math.max(best ?? 0, Math.min(...values.map(Math.abs)));
    }
  }

  return best !== undefined && best > 30 ? { crouchDeg: best, fromGait: true } : { crouchDeg: 30, fromGait: false };
}

describe('gait crouch sampling', () => {
  it('preserves missing channels, negative angles, gait selection and nonfinite values', () => {
    const ctx = context();
    const baseline = crouchModel(ctx);
    const angles = [undefined, -90, -40, -30, -0, 0, 20, 30, 45, 110, Infinity, -Infinity, NaN];

    expect(baseline.knees).toEqual(new Set(['kneeL', 'kneeR']));

    ctx.project.animations = [animation([{ t: 0, values: {} }]), animation([], 'Gait')];
    expect(crouchModel(ctx)).toEqual(baseline);
    ctx.project.animations = [
      animation([{ t: 0, values: { kneeL: -45 } }]),
      { ...animation([{ t: 0, values: { kneeR: -80 } }], 'Steps'), source: 'gait' },
    ];
    expect(crouchModel(ctx)).toEqual({ ...baseline, crouchDeg: 80, fromGait: true });

    for (const left of angles)
      for (const right of angles) {
        ctx.project.animations = [
          animation([{ t: 0, values: { kneeL: 150, kneeR: 150 } }], 'Pose'),
          animation([
            { t: 0, values: {} },
            { t: 0.5, values: { ...(left === undefined ? {} : { kneeL: left }), kneeR: -80 } },
            { t: 1, values: { kneeL: -60, ...(right === undefined ? {} : { kneeR: right }) } },
          ]),
          { ...animation([{ t: 0, values: { kneeL: 35 } }], 'Steps'), source: 'gait' },
          animation([], 'GAIT'),
        ];

        const before = structuredClone(ctx.project.animations);

        expect(crouchModel(ctx)).toEqual({ ...baseline, ...previousCrouch(ctx, baseline.knees) });
        expect(ctx.project.animations).toEqual(before);
      }
  });

  it('reads later edits afresh and leaves earlier results independent', () => {
    const ctx = context();
    const frames = [{ t: 0, values: { kneeL: -45, kneeR: 55 } }];

    ctx.project.animations = [animation(frames)];

    const first = crouchModel(ctx);

    expect(first).toMatchObject({ crouchDeg: 55, fromGait: true });
    frames[0].values.kneeR = -75;
    expect(crouchModel(ctx)).toMatchObject({ crouchDeg: 75, fromGait: true });
    expect(first).toMatchObject({ crouchDeg: 55, fromGait: true });
    ctx.project.animations = [];
    expect(crouchModel(ctx)).toMatchObject({ crouchDeg: 30, fromGait: false });
  });
});
