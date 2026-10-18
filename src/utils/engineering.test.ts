import { describe, expect, it } from 'vitest';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { EngineeringInputs, engineeringText, runEngineering } from './engineering';

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

const box = (min: V3, max: V3, volumeMm3: number): MeshMeasure => ({
  volumeMm3,
  areaMm2: volumeMm3 / 5,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const servo = (id: string, name: string): ScenePart =>
  part({ id, name, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c018' });

const parts = [
  part({ id: 'torso', name: 'Torso', printMaterial: 'PETG' }),
  servo('hipServo', 'Hip servo'),
  part({ id: 'thigh', name: 'Thigh', printMaterial: 'PETG' }),
  servo('kneeServo', 'Knee servo'),
  part({ id: 'shin', name: 'Shin' }),
  part({ id: 'battery', name: 'Battery', kind: 'box', supplyId: 'lipo-3s-2200' }),
];
const measures: Record<string, MeshMeasure> = {
  torso: box([-40, 120, -30], [40, 200, 30], 120000),
  battery: box([-30, 150, -20], [30, 180, 20], 50000),
  hipServo: box([-20, 100, -12], [20, 125, 12], 30000),
  thigh: box([-25, 60, -15], [25, 115, 15], 40000),
  kneeServo: box([-20, 55, -12], [20, 80, 12], 30000),
  shin: box([-40, 0, -40], [40, 70, 40], 60000),
};
const joints: RobotJoint[] = [
  {
    id: 'hip',
    name: 'left_hip_pitch',
    type: 'revolute',
    parent: ['torso'],
    child: ['thigh'],
    origin: [0, 112, 0],
    axis: [1, 0, 0],
    range: [-60, 60],
    actuators: ['hipServo'],
    limb: 'leg',
  },
  {
    id: 'knee',
    name: 'left_knee',
    type: 'revolute',
    parent: ['thigh'],
    child: ['shin'],
    origin: [0, 67, 0],
    axis: [1, 0, 0],
    range: [0, 120],
    actuators: ['kneeServo'],
    limb: 'leg',
  },
];
const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, joints };
const input: EngineeringInputs = {
  parts,
  project,
  measures,
  servoOutputs: {
    hipServo: { point: [0, 112, 0], axis: [1, 0, 0] },
    kneeServo: { point: [0, 67, 0], axis: [1, 0, 0] },
  },
};

const statuses = (rows: ReturnType<typeof runEngineering>['rows']) => rows.map((r) => [r.check, r.status]);
const withParts = (patch: Record<string, Partial<ScenePart>>) => parts.map((p) => ({ ...p, ...patch[p.id] }));

describe('runEngineering on a two-joint leg', () => {
  it('passes a sound leg and warns about PLA next to a servo', () => {
    const r = runEngineering(input);

    expect(statuses(r.rows)).toEqual([
      ['Weight', 'pass'],
      ['Servo torque', 'pass'],
      ['Servo alignment', 'pass'],
      ['Joint support', 'pass'],
      ['Servo voltage', 'pass'],
      ['Current and runtime', 'pass'],
      ['Standing stability', 'pass'],
      ['Heat near servos', 'warn'],
    ]);
    expect(r.rows[0].detail).toBe('378 g, centre of mass 130 mm up');
    expect(r.rows.at(-1)!.ids).toEqual(['shin']);
    expect(r.joints.map((l) => [l.joint.id, l.massG.toFixed(1), l.status])).toEqual([
      ['hip', '43.6', 'pass'],
      ['knee', '26.0', 'pass'],
    ]);
    expect(engineeringText(r, (v) => v)).toContain(
      '- hip left_hip_pitch: carries 44 g; hold 0.02, stance 0.00 → 0.02 N·m vs rated 0.98 / stall 2.94 (1% of stall) PASS · axis through [0, 112, 0]',
    );
  });

  it('flags overloaded, misaligned and one-sided joints', () => {
    const r = runEngineering({
      ...input,
      parts: withParts({ shin: { massG: 2000 } }),
      measures: { ...measures, thigh: box([-10, 60, -15], [10, 115, 15], 40000) },
      servoOutputs: { ...input.servoOutputs, kneeServo: { point: [0, 67, 5], axis: [1, 0, 0] } },
      sweep: (moving, _origin, _axis, angles) =>
        angles.filter((a) => a >= 60).map((angle) => ({ a: moving[0], b: 'torso', depthMm: 2, angle })),
    });
    const row = (check: string) => r.rows.find((x) => x.check === check)!;

    expect(row('Servo torque')).toMatchObject({
      status: 'fail',
      detail: '1 joint over rated torque',
      items: [
        { text: 'Left hip pitch: needs 1.31 N·m of its 0.98 N·m rated', ids: ['hipServo'] },
        { text: 'Left knee: needs 0.63 N·m of its 0.98 N·m rated', ids: ['kneeServo'] },
      ],
    });
    expect(r.joints.map((l) => l.status)).toEqual(['fail', 'warn']);
    expect(row('Servo alignment')).toMatchObject({
      status: 'fail',
      detail: 'Servo output not on the joint axis: left_knee (0.0°, 5.0 mm off)',
    });
    expect(row('Joint support').status).toBe('warn');
    expect(row('Joint support').detail).toMatch(/: left_hip_pitch$/);
    expect(row('Range of motion')).toMatchObject({
      status: 'fail',
      items: [
        { text: 'Left hip pitch: clear to 30° of 60°; at 60° the thigh meets the torso', ids: ['thigh', 'torso'] },
        { text: 'Left knee: clear to 0° of 120°; at 60° the shin meets the torso', ids: ['shin', 'torso'] },
      ],
    });
  });

  it('checks servo voltage against the battery', () => {
    const c001 = { componentVariant: 'c001' };
    const r = runEngineering({ ...input, parts: withParts({ hipServo: c001, kneeServo: c001 }) });
    const noBattery = runEngineering({ ...input, parts: parts.filter((p) => p.id !== 'battery') });

    expect(r.rows.find((x) => x.check === 'Servo voltage')).toMatchObject({
      status: 'fail',
      detail: '3S LiPo 2200 mAh reaches 12.6 V charged, above the 7.4 V maximum of 2 servos',
      ids: ['hipServo', 'kneeServo'],
    });
    expect(statuses(noBattery.rows)).toContainEqual(['Battery', 'fail']);
    expect(noBattery.rows.map((x) => x.check)).not.toContain('Current and runtime');
  });

  it('reports no joints without running torque', () => {
    const r = runEngineering({ ...input, project: { ...project, joints: [] } });

    expect(statuses(r.rows).slice(0, 2)).toEqual([
      ['Weight', 'pass'],
      ['Servo torque', 'not run'],
    ]);
    expect(r.joints).toEqual([]);
  });
});
