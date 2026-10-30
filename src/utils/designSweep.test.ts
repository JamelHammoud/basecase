import { describe, expect, it } from 'vitest';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { editMeasures, editTriangles, sweepVariants, type SweepParameter } from './designSweep';
import { reportMetrics, sweepTable } from './designSweepTable';
import { runEngineering } from './engineering';

type V3 = [number, number, number];

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 60, height: 15, depth: 120 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const box = (min: V3, max: V3): MeshMeasure => ({
  volumeMm3: (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]),
  areaMm2: 200,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const joint = (id: string, o: { parent: string; child: string[]; y: number; servo: string }): RobotJoint => ({
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
  joint('knee', { parent: 'thigh', child: ['shank', 'ankleServo'], y: 170, servo: 'kneeServo' }),
  joint('ankle_pitch', { parent: 'shank', child: ['Left Foot'], y: 10, servo: 'ankleServo' }),
];

const servo = (id: string, y: number): ScenePart =>
  part({ id, kind: 'component', componentId: 'feetech-sts3250', position: [0, y, 0] });

const parts: ScenePart[] = [
  part({ id: 'torso', massG: 2800, position: [0, 470, 0] }),
  part({ id: 'thigh', massG: 150, position: [0, 250, 0] }),
  part({ id: 'shank', massG: 120, position: [0, 90, 0] }),
  part({ id: 'Left Foot', name: 'Left Foot', position: [0, 7.5, 0] }),
  servo('kneeServo', 172),
  servo('ankleServo', 12),
  part({ id: 'pack', kind: 'component', componentId: 'ovonic-4s-2200-35c', position: [0, 415, 0] }),
];

const measures: Record<string, MeshMeasure> = {
  torso: box([-60, 340, -40], [60, 600, 40]),
  thigh: box([-15, 180, -15], [15, 320, 15]),
  shank: box([-15, 20, -15], [15, 160, 15]),
  'Left Foot': box([-30, 0, -60], [30, 15, 60]),
  kneeServo: box([-20, 160, -12], [20, 185, 12]),
  ankleServo: box([-20, 0, -12], [20, 25, 12]),
  pack: box([-30, 400, -20], [30, 430, 20]),
};

const project: ProjectSettings = { printer: 'default', material: 'PETG', infillPct: 20, joints };

function metricsFor(p: SweepParameter) {
  const variants = sweepVariants(parts, joints, p);

  if (typeof variants === 'string') throw new Error(variants);

  return variants.map((v) => {
    const report = runEngineering({
      parts: v.parts,
      project,
      measures: editMeasures(measures, parts, v.edits),
      servoOutputs: {},
    });

    return { label: v.label, metrics: reportMetrics(report) };
  });
}

const base = {
  label: 'as modeled',
  metrics: reportMetrics(runEngineering({ parts, project, measures, servoOutputs: {} })),
};

describe('Design sweeps on copies of the scene', () => {
  it('swaps the knee servo for a weaker one and the knee share of stall rises', () => {
    const [weak] = metricsFor({ kind: 'servo', joints: ['knee'], values: ['component:feetech-sts3215|c018'] });

    expect(weak.metrics.worstJoint).toBe('Left knee');
    expect(weak.metrics.worstShare!).toBeGreaterThan(base.metrics.worstShare! * 1.5);
    expect(
      sweepVariants(parts, joints, { kind: 'servo', joints: ['knee'], values: ['component:feetech-sts3215'] }),
    ).toMatch(/comes in/);
  });

  it('raising the battery or moving it aside lowers the tipping angle', () => {
    const [up, aside] = metricsFor({
      kind: 'battery',
      values: [
        [0, 100, 0],
        [20, 0, 0],
      ],
    });

    expect(up.metrics.tipDeg!).toBeLessThan(base.metrics.tipDeg!);
    expect(aside.metrics.tipDeg!).toBeLessThan(base.metrics.tipDeg!);
    expect(up.metrics.massG).toBeCloseTo(base.metrics.massG, 6);
  });

  it('longer feet tip later, and only the parts named as feet change', () => {
    const variants = sweepVariants(parts, joints, { kind: 'foot', values: [{ length: 1.5, width: 1.2 }] });

    if (typeof variants === 'string') throw new Error(variants);

    const [v] = variants;
    const foot = editMeasures(measures, parts, v.edits)['Left Foot']!;
    const [long] = metricsFor({ kind: 'foot', values: [{ length: 1.5, width: 1.2 }] });

    expect([...v.edits.keys()]).toEqual(['Left Foot']);
    expect(foot.min).toEqual([-36, 0, -90]);
    expect(long.metrics.tipDeg!).toBeGreaterThan(base.metrics.tipDeg!);
    expect(
      Array.from(editTriangles(new Float32Array([10, 5, 20]), parts[3], v.edits.get('Left Foot')!)).map(Math.round),
    ).toEqual([12, 5, 30]);
    expect(sweepTable(base, [long]).split('\n')[3]).toMatch(/^\| feet 1\.5× long, 1\.2× wide \| .* \(\+\d+\.\d°\) \|/);
  });
});
