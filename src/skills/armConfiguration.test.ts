import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { selfContactArm, selfContactArmInput } from '../sim/fixtures/selfContactArm';
import { buildMjcf } from '../sim/mjcf';
import { ArmConfiguration } from './armConfiguration';
import { fixtureModel } from './fixtureModels';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it('refuses missing source colliders and legacy models without provenance', () => {
  const input = selfContactArmInput(false);

  input.parts[2] = { ...input.parts[2], kind: 'component', componentId: 'missing-component' };

  const ambiguous = buildMjcf(input);
  const legacy = { ...selfContactArm(false), collisionGeometry: undefined };

  expect(() => new ArmConfiguration(mj, ambiguous, ['tip'])).toThrow(/collision geometry/);
  expect(() => new ArmConfiguration(mj, legacy, ['tip'])).toThrow(/collision geometry/);
});

it('selects only target ancestors and starts from the authored nonzero configuration', () => {
  const model = fixtureModel('arm-6dof');

  model.initial.values = { arm0: 12, arm1: -18, arm4: 25 };

  const space = new ArmConfiguration(mj, model, ['link1']);

  try {
    expect(space.joints.map((j) => j.id)).toEqual(['arm0', 'arm1']);
    expect(space.start[0]).toBeCloseTo((12 * Math.PI) / 180, 12);
    expect(space.start[1]).toBeCloseTo((-18 * Math.PI) / 180, 12);
    space.clear([0.1, -0.2]);
    expect(space.engine.jointAngles()[4]).toBeCloseTo((25 * Math.PI) / 180);
  } finally {
    space.dispose();
  }
});

it('includes stationary slide extension in ancestor swept-motion bounds', () => {
  const model = fixtureModel('arm-6dof');
  const slides = model.joints.filter((joint) => joint.type === 'prismatic');
  const folded = new ArmConfiguration(mj, model, ['link1']);
  const extended = new ArmConfiguration(
    mj,
    {
      ...model,
      initial: {
        ...model.initial,
        values: { ...model.initial.values, ...Object.fromEntries(slides.map((joint) => [joint.id, 20])) },
      },
    },
    ['link1'],
  );

  try {
    expect(slides.length).toBeGreaterThan(0);
    expect(extended.joints[0].travelM).toBeGreaterThanOrEqual(folded.joints[0].travelM + 0.019);

    for (const joint of slides) expect(extended.fixedValues[joint.id]).toBeCloseTo(20);
  } finally {
    folded.dispose();
    extended.dispose();
  }
});

it('preserves enabled non-adjacent self-contact and authored permitted pairs', () => {
  const forbidden = new ArmConfiguration(mj, selfContactArm(true), ['tip']);
  const permitted = new ArmConfiguration(mj, selfContactArm(true, [['base', 'tip']]), ['tip']);

  try {
    expect(forbidden.clear([0, 0])).toBe(true);
    expect(forbidden.clear([0, -Math.PI / 2])).toBe(false);
    expect(permitted.clear([0, -Math.PI / 2])).toBe(true);
  } finally {
    forbidden.dispose();
    permitted.dispose();
  }
});

it('refuses floating robots, moving scenery and closure constraints', () => {
  expect(() => new ArmConfiguration(mj, fixtureModel('quad-servo'), ['leg0_lower'])).toThrow(/fixed/);

  const model = fixtureModel('arm-3dof');
  const moving = {
    ...model,
    xml: model.xml.replace('</worldbody>', '<body name="moving"><freejoint/><geom size="0.01"/></body></worldbody>'),
  };
  const closed = {
    ...model,
    xml: model.xml.replace(
      '</mujoco>',
      `<equality><joint joint1="${model.joints[0].name}" joint2="${model.joints[1].name}"/></equality></mujoco>`,
    ),
  };

  expect(() => new ArmConfiguration(mj, moving, ['link2'])).toThrow(/moving/);
  expect(() => new ArmConfiguration(mj, closed, ['link2'])).toThrow(/closure/);
});

it('rejects a positive gap smaller than clearance and accepts a separated obstacle', () => {
  const model = selfContactArm(true);
  const obstacle = (x: number) => ({
    ...model,
    xml: model.xml.replace(
      '</worldbody>',
      `<body pos="${x} 0 0.2"><geom type="box" size="0.01 0.01 0.01"/></body></worldbody>`,
    ),
  });
  const narrow = new ArmConfiguration(mj, obstacle(0.1005), ['tip']);
  const separated = new ArmConfiguration(mj, obstacle(0.11), ['tip']);

  try {
    expect(narrow.clear([0, 0])).toBe(false);
    expect(separated.clear([0, 0])).toBe(true);
  } finally {
    narrow.dispose();
    separated.dispose();
  }
});
