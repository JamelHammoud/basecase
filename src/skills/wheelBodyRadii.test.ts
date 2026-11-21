import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { bodyFacts } from './anythingBody';
import { wheelSetups } from './anythingRoute';
import { fixtureModel } from './fixtureModels';
import { wheelBodyRadii } from './wheelBodyRadii';

const referenceRadii = (bodies: number[], sizes: number[], count: number) =>
  Array.from({ length: count }, (_, body) =>
    Math.max(...bodies.flatMap((owner, g) => (owner === body ? sizes.slice(g * 3, g * 3 + 3) : [])), 0.001),
  );

describe('compiled wheel body radii', () => {
  it('preserves body ownership, empty bodies, the radius floor and nonfinite sizes across edits', () => {
    const bodies = [3, 1, 3, 0, 1, 4, 5];
    const sizes = [
      0.02,
      0.03,
      0.01,
      0,
      -0,
      0.0001,
      0.09,
      0.04,
      0.01,
      1,
      2,
      3,
      0.1,
      0.2,
      0.3,
      NaN,
      0,
      1,
      Infinity,
      1,
      2,
    ];
    const model = { nbody: 7, ngeom: bodies.length, geom_bodyid: bodies, geom_size: sizes };
    const first = wheelBodyRadii(model);
    const original = Array.from(first);

    expect(Array.from(first)).toEqual(referenceRadii(bodies, sizes, model.nbody));
    bodies[0] = 2;
    sizes[6] = 0.4;
    expect(Array.from(wheelBodyRadii(model))).toEqual(referenceRadii(bodies, sizes, model.nbody));
    expect(Array.from(first)).toEqual(original);
    expect(wheelBodyRadii({ ...model, ngeom: 0 })).toEqual(new Float64Array(7).fill(0.001));
  });

  it.each([300, 600])('reads each geometry owner once for %i geometries', (count) => {
    const bodies = Array.from({ length: count }, (_, g) => g % 12);
    const sizes = Array.from({ length: count * 3 }, (_, i) => i / 1000);
    let reads = 0;
    const owners = new Proxy(bodies, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const radii = wheelBodyRadii({ nbody: 12, ngeom: count, geom_bodyid: owners, geom_size: sizes });

    expect(Array.from(radii)).toEqual(referenceRadii(bodies, sizes, 12));
    expect(reads).toBe(count);
    reads = 0;
    referenceRadii(owners, sizes, 12);
    expect(reads).toBe(12 * count);
  });
});

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(['rover-diff', 'rover-four', 'arm-3dof'])('preserves complete %s wheel setups from MuJoCo', (robot) => {
  const model = fixtureModel(robot);
  const facts = bodyFacts(mj, model);
  const engine = new SimEngine(mj, model);

  try {
    const wheels = facts.joints.filter((joint) => joint.actuated && joint.drive === 'velocity');
    const ids = wheels.map((joint) => mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, joint.name));
    const center = ids.reduce((sum, id) => sum + engine.data.xanchor[id * 3], 0) / Math.max(ids.length, 1);
    const radii = referenceRadii(
      Array.from(engine.model.geom_bodyid as ArrayLike<number>),
      Array.from(engine.model.geom_size as ArrayLike<number>),
      engine.model.nbody,
    );
    const expected = wheels.map((wheel, i) => ({
      joint: wheel.id,
      spin: engine.data.xaxis[ids[i] * 3] >= 0 ? 1 : -1,
      lateralMm: (engine.data.xanchor[ids[i] * 3] - center) * 1000,
      radiusMm: (radii[engine.model.jnt_bodyid[ids[i]]] ?? 0.001) * 1000,
    }));

    expect(wheelSetups(mj, model, facts)).toEqual(expected);
    expect(
      wheelSetups(mj, model, {
        ...facts,
        joints: [{ ...facts.joints[0], id: 'missing', name: 'missing', drive: 'velocity', actuated: true }],
      }),
    ).toEqual([{ joint: 'missing', spin: -1, lateralMm: NaN, radiusMm: 1 }]);
    expect(wheelSetups(mj, model, { ...facts, joints: [...facts.joints].reverse() })).toEqual([...expected].reverse());
    expect(
      wheelSetups(mj, model, { ...facts, joints: facts.joints.map((joint) => ({ ...joint, actuated: false })) }),
    ).toEqual([]);
  } finally {
    engine.dispose();
  }
});
