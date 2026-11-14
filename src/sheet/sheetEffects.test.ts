import { describe, expect, it } from 'vitest';
import { bomFindings } from '../readiness/findings';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { buildBom, isPrinted } from '../utils/bom';
import { robotWeight, runEngineering } from '../utils/engineering';

type V3 = [number, number, number];

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 60, height: 3, depth: 40 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const box = (min: V3, max: V3, volumeMm3: number): MeshMeasure => ({
  volumeMm3,
  areaMm2: volumeMm3 / 2,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const servo = (id: string): ScenePart =>
  part({ id, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c018' });

const ALUMINUM = { material: 'aluminum', thicknessMm: 3 } as const;
const SHIN_MM3 = 60 * 3 * 40;

const leg = [
  part({ id: 'thigh', kind: 'cad_part', dimensions: { width: 50, height: 55, depth: 30 } }),
  servo('kneeServo'),
  part({ id: 'shin', name: 'Shin plate' }),
];
const measures: Record<string, MeshMeasure> = {
  thigh: box([-25, 60, -15], [25, 115, 15], 40000),
  kneeServo: box([-20, 55, -12], [20, 80, 12], 30000),
  shin: box([-30, 0, -1.5], [30, 40, 1.5], SHIN_MM3),
};
const joints: RobotJoint[] = [
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
const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 100, joints };
const asSheet = (patch: Partial<ScenePart>) => leg.map((p) => (p.id === 'shin' ? { ...p, ...patch } : p));
const bomOf = (parts: ScenePart[]) =>
  buildBom({ parts, project, purchases: {}, measures, now: new Date('2026-11-14T12:00:00') });
const shinGrams = (parts: ScenePart[]) =>
  robotWeight({ parts, project, measures }).masses.find((m) => m.id === 'shin')!;
const knee = (parts: ScenePart[]) =>
  runEngineering({
    parts,
    project,
    measures,
    servoOutputs: { kneeServo: { point: [0, 67, 0], axis: [1, 0, 0] } },
  }).joints.find((l) => l.joint.id === 'knee')!;

describe('a part cut from sheet', () => {
  it('leaves the print plates and the filament', () => {
    const printed = bomOf(leg);
    const cut = bomOf(asSheet({ sheet: ALUMINUM }));

    expect(isPrinted(leg[2])).toBe(true);
    expect(isPrinted({ ...leg[2], sheet: ALUMINUM })).toBe(false);
    expect(printed.printed.map((p) => p.id)).toContain('shin');
    expect(cut.printed.map((p) => p.id)).not.toContain('shin');
    expect(cut.filamentG.PLA).toBeCloseTo(printed.filamentG.PLA! - SHIN_MM3 * 0.00126, 3);
  });

  it('is listed under Sheet by material and thickness', () => {
    const line = bomOf(asSheet({ sheet: ALUMINUM })).lines.find((l) => l.category === 'Sheet');

    expect(line).toMatchObject({ key: 'sheet:aluminum|3', name: '6061 aluminum', detail: '3 mm', qty: 1 });
    expect(line!.partIds).toEqual(['shin']);
  });

  it('weighs its volume at the metal’s density', () => {
    const printed = shinGrams(leg);
    const cut = shinGrams(asSheet({ sheet: ALUMINUM }));
    const weight = (parts: ScenePart[]) => robotWeight({ parts, project, measures }).all.grams;

    expect(cut.source).toBe('sheet');
    expect(cut.grams / printed.grams).toBeCloseTo(2.7 / 1.26, 6);
    expect(weight(asSheet({ sheet: ALUMINUM })) - weight(leg)).toBeCloseTo(cut.grams - printed.grams, 6);
  });

  it('loads the knee more when the shin plate becomes aluminum', () => {
    const before = knee(leg);
    const after = knee(asSheet({ sheet: ALUMINUM }));

    expect(after.massG - before.massG).toBeCloseTo(SHIN_MM3 * (0.0027 - 0.00126), 3);
    expect(after.loadNm).toBeGreaterThan(before.loadNm);
  });

  it('stops blocking a part tagged CNC Aluminum in an old scene', () => {
    const bom = bomOf(asSheet({ mechanicalTag: 'CNC Aluminum' }));

    expect(bom.madeElsewhere).toEqual([]);
    expect(bomFindings(bom).filter((f) => f.level === 'blocker')).toEqual([]);
    expect(bom.lines.find((l) => l.category === 'Sheet')?.key).toBe('sheet:aluminum|3');
  });
});
