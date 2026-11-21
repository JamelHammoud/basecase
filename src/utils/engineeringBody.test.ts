import { expect, it } from 'vitest';
import { biped, project } from './engineering.fixtures';
import { robotWeight } from './engineering';

it('keeps interleaved scene joint order and actuator mass within each robot', () => {
  const a = biped({ prefix: 'a_', dx: -2000 });
  const b = biped({ prefix: 'b_', dx: 2000 });
  const aJoints = a.joints.toReversed();
  const bJoints = b.joints.toReversed();
  const joints = aJoints.flatMap((joint, i) => [bJoints[i], joint]);
  const parts = [...b.parts, ...a.parts];
  const measures = { ...a.measures, ...b.measures };
  const saved = structuredClone({ joints, parts, measures });
  const weight = robotWeight({ parts, measures, project: project({ joints }) });

  expect(weight.bodies.map((body) => body.key)).toEqual(['a_hipL', 'b_hipL']);

  for (const [index, scene] of [a, b].entries()) {
    const body = weight.bodies[index];
    const alone = robotWeight({ ...scene, project: project({ joints: scene.joints }) });
    const expected = scene.joints.toReversed();

    expect(body.joints).toEqual(expected);
    expect(body.joints[0]).toBe(expected[0]);
    expect(body.parts).toEqual(new Set(scene.parts.map((part) => part.id)));
    expect(body.mass).toEqual(alone.bodies[0].mass);
    expect(body.feet).toEqual(alone.bodies[0].feet);
    expect(body.legged).toBe(true);
  }

  expect({ joints, parts, measures }).toEqual(saved);

  const first = weight.bodies[0].joints.slice();

  joints.reverse();

  const next = robotWeight({ parts, measures, project: project({ joints }) });

  expect(next.bodies[0].joints).toEqual(a.joints);
  expect(weight.bodies[0].joints).toEqual(first);
});
