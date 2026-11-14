import { describe, expect, it } from 'vitest';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { runEngineering } from './engineering';
import type { WalkSim } from './engineeringTypes';

type V3 = [number, number, number];

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const box = (min: V3, max: V3): MeshMeasure => ({
  volumeMm3: 1000,
  areaMm2: 200,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const servo = (id: string, variant?: string): ScenePart =>
  part({
    id,
    kind: 'component',
    componentId: variant ? 'feetech-sts3215' : 'feetech-sts3250',
    componentVariant: variant,
  });

const pitch = (id: string, o: { parent: string; child: string[]; y: number; servo: string }): RobotJoint => ({
  id,
  name: `left_${id}`,
  type: 'revolute',
  parent: [o.parent],
  child: o.child,
  origin: [0, o.y, 0],
  axis: [1, 0, 0],
  range: [-90, 90],
  actuators: [o.servo],
  limb: 'leg',
});

const joints = [
  pitch('hip_pitch', { parent: 'torso', child: ['thigh', 'kneeServo'], y: 330, servo: 'hipServo' }),
  pitch('knee', { parent: 'thigh', child: ['shank', 'ankleServo'], y: 170, servo: 'kneeServo' }),
  pitch('ankle_pitch', { parent: 'shank', child: ['foot'], y: 10, servo: 'ankleServo' }),
];

const legParts = (knee?: string) => [
  part({ id: 'torso', massG: 2800 }),
  part({ id: 'thigh', massG: 150 }),
  part({ id: 'shank', massG: 120 }),
  part({ id: 'foot', massG: 80 }),
  servo('hipServo'),
  servo('kneeServo', knee),
  servo('ankleServo'),
  part({ id: 'pack', kind: 'component', componentId: 'ovonic-4s-2200-35c' }),
  part({ id: 'rail', kind: 'component', componentId: 'pololu-d36v50f12' }),
];

const measures: Record<string, MeshMeasure> = {
  torso: box([-60, 340, -40], [60, 600, 40]),
  thigh: box([-15, 180, -15], [15, 320, 15]),
  shank: box([-15, 20, -15], [15, 160, 15]),
  foot: box([-30, 0, -60], [30, 15, 60]),
  hipServo: box([-20, 320, -12], [20, 345, 12]),
  kneeServo: box([-20, 160, -12], [20, 185, 12]),
  ankleServo: box([-20, 0, -12], [20, 25, 12]),
  pack: box([-30, 400, -20], [30, 430, 20]),
  rail: box([0, 500, 0], [10, 503, 10]),
};

const gait = (kneeDeg: number): ProjectSettings['animations'] => [
  {
    id: 'walk',
    name: 'Walk',
    duration: 1,
    loop: true,
    interpolation: 'smooth',
    source: 'gait',
    keyframes: [
      { t: 0, values: { knee: kneeDeg } },
      { t: 0.5, values: { knee: kneeDeg + 30 } },
    ],
  },
];

const run = (knee?: string, kneeDeg = 40, walk?: WalkSim) =>
  runEngineering({
    parts: legParts(knee),
    project: { printer: 'default', material: 'PETG', infillPct: 20, joints, animations: gait(kneeDeg) },
    measures,
    servoOutputs: {},
    walk,
  });

const walked = (kneeNm: number, o: Partial<WalkSim> = {}): WalkSim => ({
  policy: 'Walk',
  seconds: 14,
  fellAt: null,
  joints: {
    hip_pitch: { p99Nm: 1, rmsNm: 0.5, overS: 0 },
    knee: { p99Nm: kneeNm, rmsNm: 1.2, overS: kneeNm > 4.903 ? 0.08 : 0 },
    ankle_pitch: { p99Nm: 1, rmsNm: 0.4, overS: 0 },
  },
  ...o,
});

describe('Servo torque on a walking leg', () => {
  it('loads the knee with the whole robot on one leg at the gait’s crouch', () => {
    const r = run();
    const knee = r.joints.find((l) => l.joint.id === 'knee')!;
    const expected = (r.massG / 1000) * 9.81 * 0.16 * Math.sin((40 * Math.PI) / 360);

    expect(knee).toMatchObject({ kind: 'stance', crouchDeg: 40, leverMm: 160, volts: 12, status: 'pass' });
    expect(knee.crouchNm).toBeCloseTo(expected, 6);
    expect(knee.stallShare).toBeCloseTo(expected / 4.903, 6);
    expect(knee.heatShare).toBeCloseTo((0.67 * expected) / 1.569, 6);
    expect(r.joints.find((l) => l.joint.id === 'ankle_pitch')!.crouchNm).toBe(0);
  });

  it('fails an STS3215 at the same knee and never crouches less than 30°', () => {
    const weak = run('c018');
    const shallow = run(undefined, 10);

    expect(weak.joints.find((l) => l.joint.id === 'knee')!.status).toBe('fail');
    expect(weak.rows.find((x) => x.check === 'Servo torque')).toMatchObject({
      status: 'fail',
      detail: '1 joint overloaded',
    });
    expect(weak.rows.find((x) => x.check === 'Servo torque')!.items![0].text).toMatch(
      /^Left knee: 1\.\d\d N·m on one leg at a 40° crouch, 0\.\d\d of its 2\.94 N·m stall at 12 V/,
    );
    expect(shallow.joints.find((l) => l.joint.id === 'knee')!.crouchDeg).toBe(30);
    expect(weak.rows.find((x) => x.check === 'Peak torque')!.status).toBe('not run');
  });

  it('grades the walk sim’s 99th-percentile torque and uses its RMS for heat', () => {
    const peak = (r: ReturnType<typeof run>) => r.rows.find((x) => x.check === 'Peak torque')!;
    const calm = run(undefined, 40, walked(3));
    const tight = run(undefined, 40, walked(4.5));
    const past = run(undefined, 40, walked(6));
    const fell = run(undefined, 40, walked(3, { fellAt: 2.4 }));
    const knee = calm.joints.find((l) => l.joint.id === 'knee')!;

    expect(peak(calm)).toMatchObject({
      status: 'pass',
      detail: 'Worst: Left knee, 0.61 of stall at the 99th percentile',
    });
    expect(peak(tight)).toMatchObject({ status: 'warn', ids: ['kneeServo'] });
    expect(peak(past).status).toBe('fail');
    expect(peak(past).items![0].text).toMatch(/^Left knee: asks for 6\.00 N·m .*, above stall for 0\.08 s$/);
    expect(peak(fell)).toMatchObject({
      status: 'fail',
      detail: 'Fell at 2.4 s walking with servos limited to 0.7 × stall',
    });
    expect(knee.heatShare).toBeCloseTo(1.2 / 1.569, 6);
    expect(knee.simRmsNm).toBeCloseTo(1.2, 6);
    expect(peak(run(undefined, 40)).detail).toMatch(/^Needs a trained walk policy/);
  });
});
