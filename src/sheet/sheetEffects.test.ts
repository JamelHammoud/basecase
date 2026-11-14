import { describe, expect, it } from 'vitest';
import { bomFindings } from '../readiness/findings';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { buildBom, filamentGrams, isPrinted } from '../utils/bom';
import { partMasses, runEngineering } from '../utils/engineering';
import { weight } from '../utils/weight';

type V3 = [number, number, number];

const ALUMINUM = { material: 'aluminum', thickness: 3.18 } as const;

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 80, height: 3, depth: 60 },
  color: '#fff',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
  ...o,
});

const box = (min: V3, max: V3, volumeMm3: number): MeshMeasure => ({
  volumeMm3,
  areaMm2: volumeMm3 / 1.4,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const servo = (id: string): ScenePart =>
  part({ id, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c018', mechanicalTag: undefined });

const parts = [
  part({ id: 'torso', kind: 'cad_part', printMaterial: 'PETG' }),
  servo('hipServo'),
  part({ id: 'thigh', kind: 'cad_part', printMaterial: 'PETG' }),
  servo('kneeServo'),
  part({ id: 'shin', name: 'Shin plate' }),
];
const measures: Record<string, MeshMeasure> = {
  torso: box([-40, 120, -30], [40, 200, 30], 120000),
  hipServo: box([-20, 100, -12], [20, 125, 12], 30000),
  thigh: box([-25, 60, -15], [25, 115, 15], 40000),
  kneeServo: box([-20, 55, -12], [20, 80, 12], 30000),
  shin: box([-40, 0, -1.5], [40, 60, 1.5], 14400),
};
const joint = ([id, parent, child, actuator]: string[], y: number): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [parent],
  child: [child],
  origin: [0, y, 0],
  axis: [1, 0, 0],
  range: [0, 90],
  actuators: [actuator],
  limb: 'leg',
});
const project: ProjectSettings = {
  printer: 'bambu-p1s',
  material: 'PLA',
  infillPct: 20,
  joints: [joint(['hip', 'torso', 'thigh', 'hipServo'], 112), joint(['knee', 'thigh', 'shin', 'kneeServo'], 67)],
};
const servoOutputs = {
  hipServo: { point: [0, 112, 0] as V3, axis: [1, 0, 0] as V3 },
  kneeServo: { point: [0, 67, 0] as V3, axis: [1, 0, 0] as V3 },
};

const withShin = (patch: Partial<ScenePart>) => parts.map((p) => (p.id === 'shin' ? { ...p, ...patch } : p));
const run = (scene: ScenePart[]) => runEngineering({ parts: scene, project, measures, servoOutputs });
const shinGrams = (scene: ScenePart[]) => partMasses(scene, project, measures).find((m) => m.id === 'shin')!.grams;
const totalGrams = (scene: ScenePart[]) => partMasses(scene, project, measures).reduce((s, m) => s + m.grams, 0);
const bom = (scene: ScenePart[]) => buildBom({ parts: scene, project, purchases: {}, measures });

describe('a part cut from sheet', () => {
  const sheet = withShin({ sheet: ALUMINUM });

  it('leaves the plates and its filament grams', () => {
    const printed = bom(parts);
    const cut = bom(sheet);

    expect(isPrinted(parts[4])).toBe(true);
    expect(isPrinted(sheet[4])).toBe(false);
    expect(printed.printed.map((p) => p.id)).toContain('shin');
    expect(cut.printed.map((p) => p.id)).not.toContain('shin');
    expect(printed.filamentG.PLA).toBeCloseTo(filamentGrams(measures.shin, 'PLA', 20), 6);
    expect(cut.filamentG.PLA).toBeUndefined();
    expect(cut.lines.find((l) => l.key === 'sheet:aluminum|3.18')).toMatchObject({
      category: 'Sheet',
      name: '6061 aluminum',
      detail: '3.18 mm',
      qty: 1,
      partIds: ['shin'],
    });
  });

  it('weighs its volume at the metal’s density in Weight', () => {
    const printedG = shinGrams(parts);
    const sheetG = shinGrams(sheet);

    expect(sheetG).toBeCloseTo((measures.shin.volumeMm3 / 1000) * 2.7, 6);
    expect(totalGrams(sheet) - totalGrams(parts)).toBeCloseTo(sheetG - printedG, 6);
    expect(run(sheet).rows[0]).toMatchObject({ check: 'Weight', status: 'pass' });
    expect(run(sheet).rows[0].detail.startsWith(weight(totalGrams(sheet)))).toBe(true);
  });

  it('loads the knee more when the shin plate becomes aluminum', () => {
    const knee = (scene: ScenePart[]) => run(scene).joints.find((l) => l.joint.id === 'knee')!;
    const printed = knee(parts);
    const metal = knee(sheet);

    expect(metal.massG - printed.massG).toBeCloseTo(shinGrams(sheet) - shinGrams(parts), 6);
    expect(metal.loadNm).toBeGreaterThan(printed.loadNm);
  });

  it('stops an old CNC aluminum tag from blocking', () => {
    const tagged = bom(withShin({ mechanicalTag: 'CNC Aluminum' }));

    expect(tagged.madeElsewhere).toEqual([]);
    expect(tagged.lines.find((l) => l.category === 'Sheet')?.key).toBe('sheet:aluminum|3.18');
    expect(bomFindings(tagged).filter((f) => f.rule === 'no-source')).toEqual([]);
  });

  it('keeps an old CNC aluminum tag on a thick block needing a source', () => {
    const block = part({
      id: 'block',
      mechanicalTag: 'CNC Aluminum',
      dimensions: { width: 30, height: 30, depth: 30 },
    });
    const tagged = buildBom({
      parts: [block],
      project,
      purchases: {},
      measures: { block: box([-15, 0, -15], [15, 30, 15], 27000) },
    });

    expect(tagged.lines.some((l) => l.category === 'Sheet')).toBe(false);
    expect(tagged.madeElsewhere).toEqual([{ id: 'block', name: 'block', process: 'CNC aluminum' }]);
    expect(bomFindings(tagged).some((f) => f.rule === 'no-source')).toBe(true);
  });

  it('keeps an old CNC aluminum tag on a thin shaped part needing a source', () => {
    const thin = { mechanicalTag: 'CNC Aluminum', dimensions: { width: 60, height: 10, depth: 40 } };
    const shaped = [
      part({ ...thin, id: 'pocketed', kind: 'boolean', boolean: { op: 'subtract', operands: [] } }),
      part({ ...thin, id: 'chamfered', edges: { kind: 'chamfer', mm: 2 } }),
      part({ ...thin, id: 'modeled', kind: 'cad_part' }),
      part({ ...thin, id: 'rod', kind: 'cylinder', dimensions: { width: 10, height: 80, depth: 10 } }),
    ];
    const tagged = buildBom({
      parts: shaped,
      project,
      purchases: {},
      measures: Object.fromEntries(shaped.map((p) => [p.id, box([-30, 0, -20], [30, 10, 20], 20000)])),
    });

    expect(tagged.lines.some((l) => l.category === 'Sheet')).toBe(false);
    expect(tagged.madeElsewhere.map((p) => p.id)).toEqual(['pocketed', 'chamfered', 'modeled', 'rod']);
    expect(bomFindings(tagged).filter((f) => f.rule === 'no-source')).toHaveLength(4);
  });
});
