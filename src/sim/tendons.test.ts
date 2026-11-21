import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { tendonMechanism, tendonMechanisms } from './fixtures/tendonMechanisms';
import { SimEngine } from './engine';
import { Recorder } from './recorder';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { buildMjcf } from './mjcf';
import { buildRig } from '../utils/kinematics';
import { withTendons } from '../joints/tendons';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(tendonMechanisms)('$name preserves motor actions and independent physical observations', (spec) => {
  const started = performance.now();
  const { input, model } = tendonMechanism(spec);
  const preparationMs = performance.now() - started;
  const engine = new SimEngine(mj, model);

  try {
    const motors = model.joints.filter((j) => j.actuator >= 0);
    const recorder = new Recorder(engine);

    expect(engine.model.nu).toBe(spec.coefficients.length);
    expect(engine.model.nq).toBe(spec.coefficients.length + spec.coefficients[0].length);
    expect(engine.model.neq).toBe(spec.coefficients.length);
    expect(motors.every((j) => j.effortSource === 'servo' && j.dynamics === 'measured')).toBe(true);
    engine.setController({ kind: 'hold', values: Object.fromEntries(motors.map((j, i) => [j.id, 20 - i * 10])) });

    const stepping = performance.now();

    engine.step(1, recorder.hook);

    const steppingMs = performance.now() - stepping;
    const angles = engine.jointAngles();

    for (const motor of motors) {
      const declaration = input.rig.byId.get(motor.id)!.tendon!;
      const motorIndex = model.joints.indexOf(motor);
      const excursion = declaration.terms.reduce((sum, term) => {
        const index = model.joints.findIndex((j) => j.id === term.joint);
        const coordinate = model.joints[index].type === 'prismatic' ? angles[index] * 1000 : angles[index];

        return sum + term.coefficient * coordinate;
      }, declaration.spool.coefficient * angles[motorIndex]);

      expect(Math.abs(excursion)).toBeLessThan(0.02);
      expect(angles[motorIndex]).toBeGreaterThan(0.1);
      expect(Math.abs(engine.data.actuator_force[motor.actuator])).toBeLessThanOrEqual(motor.effort + 1e-6);
    }

    expect(angles.some((angle, i) => model.joints[i].actuator < 0 && Math.abs(angle) > 0.001)).toBe(true);

    if (spec.name === 'two-axis differential wrist') {
      expect(angles[0]).toBeCloseTo((angles[2] + angles[3]) / 2, 2);
      expect(angles[1]).toBeCloseTo((angles[2] - angles[3]) / 2, 2);
      expect(angles[1]).toBeGreaterThan(0.02);
    }

    const recording = decodeRecording(encodeRecording(recorder.finish()))!;

    expect(recording.nu).toBe(motors.length);
    expect(recording.nq).toBe(model.joints.length);
    expect(recording.ctrl).toHaveLength(recording.nu * recording.frames);
    expect(recording.jointQpos).toHaveLength(model.joints.length);
    expect(recording.transmission?.motors.map((motor) => motor.joint)).toEqual(motors.map((motor) => motor.id));
    expect(recording.transmission?.observations.map((joint) => joint.joint)).toEqual(
      model.joints.map((joint) => joint.id),
    );
    expect(recording.transmission?.motors[0].tendon).toEqual(motors[0].tendon);
    expect(encodeRecording(recording)).toEqual(encodeRecording(recorder.finish()));
    process.stdout.write(
      JSON.stringify({
        mechanism: spec.name,
        preparationMs,
        steppingMs,
        recordingBytes: encodeRecording(recording).byteLength,
      }),
    );
  } finally {
    engine.dispose();
  }
});

it('commits an entire declaration batch or refuses it without changing the project', () => {
  const { input } = tendonMechanism();
  const original = structuredClone(input.project);
  const tendon = input.rig.byId.get('motor_0')!.tendon!;
  const invalid = [
    { ...tendon, terms: [{ ...tendon.terms[0], joint: 'missing' }] },
    { ...tendon, terms: [{ ...tendon.terms[0], joint: 'motor_0' }] },
    { ...tendon, terms: [{ ...tendon.terms[0], coefficient: Infinity }] },
    { ...tendon, terms: [{ ...tendon.terms[0], coefficient: 0 }] },
    { ...tendon, terms: [tendon.terms[0], tendon.terms[0]] },
    { ...tendon, spool: { ...tendon.spool, coefficient: 0 } },
  ];

  for (const declaration of invalid) {
    expect(() => withTendons(input.project, input.parts, [{ motor: 'motor_0', tendon: declaration }])).toThrow(
      /tendon/i,
    );
    expect(input.project).toEqual(original);
  }

  expect(() =>
    withTendons(input.project, input.parts, [
      { motor: 'motor_0', tendon },
      { motor: 'motor_0', tendon },
    ]),
  ).toThrow(/tendon/i);

  const removed = withTendons(input.project, input.parts, [{ motor: 'motor_0', tendon: null }]);
  const restored = withTendons(removed, input.parts, [{ motor: 'motor_0', tendon }]);

  expect(removed.joints!.find((j) => j.id === 'motor_0')!.tendon).toBeUndefined();
  expect(restored).toEqual(original);
  expect(JSON.parse(JSON.stringify(restored))).toEqual(original);
});

it('invalidates model evidence after a coefficient edit and restores legacy direct drive on removal', () => {
  const { input, model } = tendonMechanism();
  const tendon = input.rig.byId.get('motor_0')!.tendon!;
  const project = withTendons(input.project, input.parts, [
    { motor: 'motor_0', tendon: { ...tendon, terms: [{ ...tendon.terms[0], coefficient: -20 }] } },
  ]);
  const changed = buildMjcf({ ...input, project, rig: buildRig(project.joints!, input.parts) });
  const legacy = withTendons(input.project, input.parts, [{ motor: 'motor_0', tendon: null }]);
  const plain = buildMjcf({ ...input, project: legacy, rig: buildRig(legacy.joints!, input.parts) });

  expect(changed.robots[0].fingerprint).not.toBe(model.robots[0].fingerprint);
  expect(buildMjcf(input)).toEqual(model);
  expect(plain.xml).not.toContain('<tendon');
  expect(plain.joints.map((j) => j.actuator)).toEqual(model.joints.map((j) => j.actuator));
});

it('distinguishes authored output references whose IDs resemble generated scene indices', () => {
  const { input } = tendonMechanism(tendonMechanisms[2]);
  const rename = new Map([
    ['output_0', 'j0_output'],
    ['output_1', 'j1_output'],
  ]);
  const joints = input.project.joints.map((joint) => ({
    ...joint,
    id: rename.get(joint.id) ?? joint.id,
    ...(joint.tendon
      ? {
          tendon: {
            ...joint.tendon,
            terms: joint.tendon.terms.map((term) => ({ ...term, joint: rename.get(term.joint)! })),
          },
        }
      : {}),
  }));
  const project = { ...input.project, joints };
  const tendon = joints.find((joint) => joint.tendon)!.tendon!;
  const altered = withTendons(project, input.parts, [
    {
      motor: 'motor_0',
      tendon: { ...tendon, terms: tendon.terms.map((term, i) => ({ ...term, joint: tendon.terms[1 - i].joint })) },
    },
  ]);
  const model = (source: typeof project) =>
    buildMjcf({ ...input, project: source, rig: buildRig(source.joints, input.parts) });

  expect(model(altered).robots[0].fingerprint).not.toBe(model(project).robots[0].fingerprint);
});
