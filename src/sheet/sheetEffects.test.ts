import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { bomFindings } from '../readiness/findings';
import { measuresIn, printReportsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { MeshMeasure } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildBom } from '../utils/bom';
import { runEngineering, type EngineeringInputs } from '../utils/engineering';
import { printReportOf } from '../utils/printReport';
import { cutFiles } from './cutFiles';
import { sheetGrams } from './stock';

type V3 = [number, number, number];

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
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

const aluminum = { sheet: { material: 'aluminum' as const } };

describe('a plate cut from sheet, measured in the analysis worker', () => {
  const plate = part({
    id: 'plate',
    name: 'Chest/Plate',
    dimensions: { width: 60, height: 3, depth: 40 },
    ...aluminum,
  });
  const block = part({ id: 'block', dimensions: { width: 20, height: 20, depth: 20 } });
  const parts = [plate, block];
  const shapes = () =>
    snapshotShapes(
      parts.map((p) => ({
        id: p.id,
        object: new THREE.Mesh(new THREE.BoxGeometry(p.dimensions.width, p.dimensions.height, p.dimensions.depth)),
      })),
    );
  let measures: Record<string, MeshMeasure>;

  beforeAll(async () => {
    measures = await measuresIn(shapes());
  });

  it('reads the plate as 3 mm sheet and the block as none', () => {
    expect(measures.plate.sheet?.thicknessMm).toBe(3);
    expect(measures.plate.sheet?.areaMm2).toBe(2400);
    expect(measures.block.sheet).toBeUndefined();
  });

  it('takes the plate off the print plates and out of the filament grams', async () => {
    const report = await printReportOf(
      parts,
      { project: DEFAULT_PROJECT, printer: resolvePrinter('bambu-p1s', []) },
      (ids, faces) => printReportsIn(shapes(), faces).then((r) => Object.fromEntries(ids.map((id) => [id, r[id]]))),
    );
    const bom = buildBom({ parts, project: DEFAULT_PROJECT, purchases: {}, measures });
    const filamentIds = bom.lines.filter((l) => l.category === 'Filament').flatMap((l) => l.partIds);

    expect(report.plan.plates.flatMap((p) => p.items.map((i) => i.id))).toEqual(['block']);
    expect(bom.printed.map((p) => p.id)).toEqual(['block']);
    expect(filamentIds).toEqual(['block']);
    expect(bom.lines.find((l) => l.category === 'Sheet')).toMatchObject({
      key: 'sheet:aluminum|3',
      name: '6061 aluminum',
      detail: '3 mm',
      qty: 1,
      partIds: ['plate'],
    });
  });

  it('writes one cut file for the plate, named without path characters', () => {
    const { files, skipped } = cutFiles(parts, measures);

    expect(skipped).toEqual([]);
    expect(files.map((f) => f.name)).toEqual(['chest-plate-aluminum-6061-3mm.dxf']);
    expect(files[0].dxf.startsWith('0\nSECTION')).toBe(true);
  });
});

describe('a part tagged with an old made-elsewhere tag', () => {
  const tagged = part({
    id: 'bracket',
    mechanicalTag: 'CNC Aluminum',
    dimensions: { width: 50, height: 4, depth: 30 },
  });
  const measures: Record<string, MeshMeasure> = {
    bracket: { volumeMm3: 6000, areaMm2: 3640, min: [0, 0, 0], max: [50, 4, 30], centroid: [25, 2, 15], triangles: 12 },
  };

  it('no longer blocks: it is listed as aluminum sheet instead', () => {
    const bom = buildBom({ parts: [tagged], project: DEFAULT_PROJECT, purchases: {}, measures });

    expect(bom.madeElsewhere).toEqual([]);
    expect(bomFindings(bom).filter((f) => f.level === 'blocker')).toEqual([]);
    expect(bom.lines.map((l) => [l.category, l.key])).toEqual([['Sheet', 'sheet:aluminum|4']]);
  });
});

const box = (min: V3, max: V3, volumeMm3: number, sheet?: MeshMeasure['sheet']): MeshMeasure => ({
  volumeMm3,
  areaMm2: volumeMm3 / 5,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
  ...(sheet ? { sheet } : {}),
});

const servo = (id: string): ScenePart =>
  part({ id, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c018' });

const SHIN_SHEET = { thicknessMm: 3, areaMm2: 5600, outline: [], holes: [] };
const leg = [
  part({ id: 'torso', printMaterial: 'PETG' }),
  servo('hipServo'),
  part({ id: 'thigh', printMaterial: 'PETG' }),
  servo('kneeServo'),
  part({ id: 'shin' }),
];
const measures: Record<string, MeshMeasure> = {
  torso: box([-40, 120, -30], [40, 200, 30], 120000),
  hipServo: box([-20, 100, -12], [20, 125, 12], 30000),
  thigh: box([-25, 60, -15], [25, 115, 15], 40000),
  kneeServo: box([-20, 55, -12], [20, 80, 12], 30000),
  shin: box([-40, 0, -1.5], [40, 70, 1.5], 16800, SHIN_SHEET),
};
const joint = (id: string, parent: string, child: string, at: { y: number; servo: string }): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [parent],
  child: [child],
  origin: [0, at.y, 0],
  axis: [1, 0, 0],
  range: [0, 90],
  actuators: [at.servo],
  limb: 'leg',
});
const project: ProjectSettings = {
  ...DEFAULT_PROJECT,
  joints: [
    joint('hip', 'torso', 'thigh', { y: 112, servo: 'hipServo' }),
    joint('knee', 'thigh', 'shin', { y: 67, servo: 'kneeServo' }),
  ],
};
const legWith = (shin: Partial<ScenePart>) => {
  const input: EngineeringInputs = {
    parts: leg.map((p) => (p.id === 'shin' ? { ...p, ...shin } : p)),
    project,
    measures,
    servoOutputs: {
      hipServo: { point: [0, 112, 0], axis: [1, 0, 0] },
      kneeServo: { point: [0, 67, 0], axis: [1, 0, 0] },
    },
  };
  const r = runEngineering(input);
  const weight = Number(/^(\d+(?:\.\d+)?) g/.exec(r.rows.find((x) => x.check === 'Weight')!.detail)![1]);

  return { weight, knee: r.joints.find((j) => j.joint.id === 'knee')! };
};

describe('a shin plate cut from sheet on a two-joint leg', () => {
  it('moves the Weight row by the density ratio for that part', () => {
    const acrylicG = sheetGrams('acrylic', measures.shin);
    const aluminumG = sheetGrams('aluminum', measures.shin);

    expect(aluminumG / acrylicG).toBeCloseTo(2.7 / 1.19, 6);
    expect(legWith(aluminum).weight - legWith({ sheet: { material: 'acrylic' } }).weight).toBeCloseTo(
      aluminumG - acrylicG,
      -1,
    );
  });

  it('raises the knee’s servo load when the printed shin becomes aluminum', () => {
    const printed = legWith({});
    const metal = legWith(aluminum);

    expect(metal.knee.massG - printed.knee.massG).toBeCloseTo(metal.weight - printed.weight, -1);
    expect(metal.knee.massG).toBeGreaterThan(printed.knee.massG + 20);
    expect(metal.knee.loadNm).toBeGreaterThan(printed.knee.loadNm);
  });
});
