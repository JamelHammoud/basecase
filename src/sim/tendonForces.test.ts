import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { tendonMechanism, tendonMechanisms } from './fixtures/tendonMechanisms';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { buildRig } from '../utils/kinematics';
import { withTendons } from '../joints/tendons';
import type { IdealTendon } from '../types/tendon';
import { box } from './fixtures/parts';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

function elasticEngine() {
  const { input } = tendonMechanism(tendonMechanisms[2]);
  const tendon = input.rig.byId.get('motor_0')!.tendon!;
  const elastic: IdealTendon = {
    ...tendon,
    terms: tendon.terms.map((term, i) => ({ ...term, coefficient: i === 0 ? -10 : 15 })),
    law: { kind: 'elastic', restLengthMm: 0.2, stiffnessNPerMm: 0.4, dampingNsPerMm: 0.01 },
  };
  const project = withTendons(input.project, input.parts, [{ motor: 'motor_0', tendon: elastic }]);
  const model = buildMjcf({ ...input, project, rig: buildRig(project.joints!, input.parts) });

  return new SimEngine(mj, model);
}

it('distributes elastic and damping forces by signed virtual work without assigning joint ratios', () => {
  const engine = elasticEngine();

  try {
    engine.model.dof_damping.fill(0);
    engine.model.dof_frictionloss.fill(0);
    engine.data.qpos.set([0.12, -0.07, 0.03]);
    engine.data.qvel.set([0.02, -0.03, 0.01]);
    mj.mj_forward(engine.model, engine.data);

    const coefficients = [-0.01, 0.015, -0.01];
    const length = coefficients.reduce((sum, c, i) => sum + c * engine.data.qpos[i], 0);
    const velocity = coefficients.reduce((sum, c, i) => sum + c * engine.data.qvel[i], 0);
    const force = -400 * (length - 0.0002) - 10 * velocity;

    expect(engine.model.neq).toBe(0);
    expect(engine.model.ntendon).toBe(1);
    expect(engine.data.ten_length[0]).toBeCloseTo(length, 12);
    expect(engine.data.ten_velocity[0]).toBeCloseTo(velocity, 12);

    coefficients.forEach((c, i) => expect(engine.data.qfrc_passive[i]).toBeCloseTo(c * force, 12));

    const power = coefficients.reduce((sum, c, i) => sum + c * force * engine.data.qvel[i], 0);

    expect(power).toBeCloseTo(force * velocity, 12);
  } finally {
    engine.dispose();
  }
});

it('redistributes underactuated motion under load while preserving total excursion', () => {
  const { model } = tendonMechanism(tendonMechanisms[2]);
  const unloaded = new SimEngine(mj, model);
  const loaded = new SimEngine(mj, model);

  try {
    for (const engine of [unloaded, loaded]) engine.setController({ kind: 'hold', values: { motor_0: 20 } });

    loaded.data.qfrc_applied[0] = -0.015;
    unloaded.step(1);
    loaded.step(1);

    const a = unloaded.jointAngles();
    const b = loaded.jointAngles();

    expect(Math.abs(a[0] - b[0])).toBeGreaterThan(0.05);
    expect(Math.abs(a[1] - b[1])).toBeGreaterThan(0.03);
    expect(Math.abs(10 * b[0] + 15 * b[1] - 10 * b[2])).toBeLessThan(0.02);
  } finally {
    unloaded.dispose();
    loaded.dispose();
  }
});

it('returns a spring wrist when the motor goes limp', () => {
  const { model } = tendonMechanism(tendonMechanisms[1]);
  const engine = new SimEngine(mj, model);

  try {
    engine.setController({ kind: 'hold', values: { motor_0: 30 } });
    engine.step(1);

    const driven = Math.abs(engine.jointAngles()[0]);

    expect(driven).toBeGreaterThan(0.15);
    engine.setController({ kind: 'limp' });
    engine.step(3);
    expect(Math.abs(engine.jointAngles()[0])).toBeLessThan(driven / 2);
  } finally {
    engine.dispose();
  }
});

it('retains catalog motor saturation against an applied spool load', () => {
  const { model } = tendonMechanism();
  const engine = new SimEngine(mj, model);

  try {
    const motor = model.joints.find((j) => j.actuator >= 0)!;

    engine.data.qfrc_applied[1] = -100;
    engine.setController({ kind: 'hold', values: { motor_0: 90 } });
    engine.step(0.2);
    expect(Math.abs(engine.data.actuator_force[0])).toBeCloseTo(motor.effort, 5);
    expect(engine.model.actuator_ctrlrange[1]).toBeCloseTo(Math.PI / 2);
  } finally {
    engine.dispose();
  }
});

it('refuses cross-robot references, direct actuation, and incorrect coefficient units atomically', () => {
  const { input } = tendonMechanism();
  const tendon = input.rig.byId.get('motor_0')!.tendon!;
  const other = { ...input.rig.byId.get('output_0')!, id: 'other', parent: ['isolated'], child: ['isolated-tip'] };
  const project = { ...input.project, joints: [...input.project.joints, other] };
  const parts = [
    ...input.parts,
    box('isolated', [500, 400, 0], [20, 10, 20], 100),
    box('isolated-tip', [550, 400, 0], [40, 10, 10], 30),
  ];
  const separate = buildRig(project.joints, parts);

  expect(separate.robotOf.get('other')).not.toBe(separate.robotOf.get('motor_0'));

  expect(() =>
    withTendons(project, parts, [
      { motor: 'motor_0', tendon: { ...tendon, terms: [{ ...tendon.terms[0], joint: 'other' }] } },
    ]),
  ).toThrow(/tendon/i);
  expect(() =>
    withTendons(input.project, input.parts, [
      { motor: 'motor_0', tendon: { ...tendon, terms: [{ ...tendon.terms[0], unit: 'mm/mm' }] } },
    ]),
  ).toThrow(/tendon/i);

  const powered = {
    ...input.project,
    joints: input.project.joints.map((j) => (j.id === 'output_0' ? { ...j, actuation: 'powered' as const } : j)),
  };

  expect(() => withTendons(powered, input.parts, [{ motor: 'motor_0', tendon }])).toThrow(/tendon/i);
  expect(input.project.joints[0].actuation).toBe('passive');
});
