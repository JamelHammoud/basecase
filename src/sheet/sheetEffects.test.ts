import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { bomFindings } from '../readiness/findings';
import { printReportsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { measureTriangles, type MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { buildBom, filamentGrams, isPrinted } from '../utils/bom';
import { runEngineering, type EngineeringInputs } from '../utils/engineering';
import { partMasses } from '../utils/engineeringMass';
import { printReportOf } from '../utils/printReport';
import type { PartSheet } from './materials';
import { platePart, solidPart, trianglesOf } from './sheet.fixtures';

type V3 = [number, number, number];

const ALUMINUM: PartSheet = { material: 'aluminum', thicknessMm: 3.18 };
const project: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, budgetUsd: 100 };
const now = new Date('2026-11-14T12:00:00');

const box = (min: V3, max: V3, volumeMm3: number): MeshMeasure => ({
  volumeMm3,
  areaMm2: volumeMm3 / 5,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});

const bracket = solidPart({ id: 'bracket', kind: 'box', name: 'Bracket' });
const plainPlate = solidPart({
  id: 'plate',
  kind: 'box',
  name: 'Shin Plate',
  dimensions: { width: 100, height: 3, depth: 60 },
});
const sheetPlate: ScenePart = { ...plainPlate, sheet: ALUMINUM };
const flatMeasures = {
  bracket: box([-20, -10, -15], [20, 10, 15], 24000),
  plate: box([-50, -1.5, -30], [50, 1.5, 30], 18000),
};

const bomOf = (parts: ScenePart[]) => buildBom({ parts, project, purchases: {}, measures: flatMeasures, now });

const meshOf = (part: ScenePart) => {
  const { width, height, depth } = part.dimensions;

  return { id: part.id, object: new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)) };
};

describe('a sheet part leaves printing', () => {
  it('is not printed and leaves the printed list and the filament grams', () => {
    const before = bomOf([bracket, plainPlate]);
    const after = bomOf([bracket, sheetPlate]);

    expect(isPrinted(plainPlate)).toBe(true);
    expect(isPrinted(sheetPlate)).toBe(false);
    expect(before.printed.map((p) => p.id).sort()).toEqual(['bracket', 'plate']);
    expect(after.printed.map((p) => p.id)).toEqual(['bracket']);
    expect(after.filamentG.PLA).toBeLessThan(before.filamentG.PLA!);
    expect(after.filamentG.PLA).toBeCloseTo(before.printed.find((p) => p.id === 'bracket')!.grams, 6);
  });

  it('lists the part under a Sheet line named for its stock', () => {
    const line = bomOf([bracket, sheetPlate]).lines.find((l) => l.category === 'Sheet');

    expect(line).toMatchObject({
      key: 'sheet:aluminum|3.18',
      name: '6061 aluminum',
      detail: '3.18 mm',
      partIds: ['plate'],
    });
  });

  it('keeps the part off the print plates', async () => {
    const parts = [solidPart({ id: 'bracket-2', kind: 'box' }), { ...sheetPlate, id: 'plate-2' }];
    const asked: string[] = [];
    const report = await printReportOf(parts, { project, printer: resolvePrinter('bambu-p1s', []) }, (ids, faces) => {
      asked.push(...ids);

      return printReportsIn(snapshotShapes(parts.filter((p) => ids.includes(p.id)).map(meshOf)), faces);
    });

    expect(asked).toEqual(['bracket-2']);
    expect(report.parts.map((r) => r.id)).toEqual(['bracket-2']);
    expect(report.plan.plateOf['plate-2']).toBeUndefined();
    expect(report.plan.plateOf['bracket-2']).toBeGreaterThan(0);
  });
});

const legPart = (o: Partial<ScenePart> & { id: string }): ScenePart =>
  solidPart({ kind: 'cad_part', category: 'structure', color: '#fff', ...o });

const servo = (id: string, name: string) =>
  legPart({ id, name, kind: 'component', componentId: 'feetech-sts3215', componentVariant: 'c018' });

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

const shinPlate = (sheet?: PartSheet) => legPart({ id: 'shin', name: 'Shin Plate', kind: 'box', sheet });

const legInput = (shin: ScenePart, shinMeasure: MeshMeasure): EngineeringInputs => ({
  parts: [
    legPart({ id: 'torso', name: 'Torso', printMaterial: 'PETG' }),
    servo('hipServo', 'Hip servo'),
    legPart({ id: 'thigh', name: 'Thigh', printMaterial: 'PETG' }),
    servo('kneeServo', 'Knee servo'),
    shin,
    legPart({ id: 'battery', name: 'Battery', kind: 'box', supplyId: 'lipo-3s-2200' }),
  ],
  project: { ...project, joints },
  measures: {
    torso: box([-40, 120, -30], [40, 200, 30], 120000),
    battery: box([-30, 150, -20], [30, 180, 20], 50000),
    hipServo: box([-20, 100, -12], [20, 125, 12], 30000),
    thigh: box([-25, 60, -15], [25, 115, 15], 40000),
    kneeServo: box([-20, 55, -12], [20, 80, 12], 30000),
    shin: shinMeasure,
  },
  servoOutputs: {
    hipServo: { point: [0, 112, 0], axis: [1, 0, 0] },
    kneeServo: { point: [0, 67, 0], axis: [1, 0, 0] },
  },
});

describe('a sheet part weighs its metal', () => {
  it('gives the plate 2.7 g/cm³ instead of its printed grams', async () => {
    const plate = await platePart();
    const m = measureTriangles(trianglesOf(plate));
    const printedG = filamentGrams(m, 'PLA', project.infillPct);
    const sheetG = (m.volumeMm3 / 1000) * 2.7;
    const [printed] = partMasses([plate], project, { [plate.id]: m });
    const [cut] = partMasses([{ ...plate, sheet: ALUMINUM }], project, { [plate.id]: m });

    expect(m.volumeMm3).toBeGreaterThan(17000);
    expect(m.volumeMm3).toBeLessThan(18000);
    expect(printed).toMatchObject({ source: 'printed' });
    expect(printed.grams).toBeCloseTo(printedG, 9);
    expect(cut).toMatchObject({ source: 'sheet' });
    expect(cut.grams).toBeCloseTo(sheetG, 9);
    expect(cut.grams).toBeGreaterThan(printed.grams);
  });

  it('raises the robot’s Weight by exactly the difference for that part', async () => {
    const plate = await platePart();
    const m = measureTriangles(trianglesOf(plate));
    const shin: MeshMeasure = { ...m, centroid: [0, 30, 20] };
    const printed = runEngineering(legInput(shinPlate(), shin));
    const cut = runEngineering(legInput(shinPlate(ALUMINUM), shin));
    const weightRow = (r: typeof printed) => r.rows.find((row) => row.check === 'Weight')!;
    const expectedDelta = (m.volumeMm3 / 1000) * 2.7 - filamentGrams(m, 'PLA', project.infillPct);

    expect(cut.massG - printed.massG).toBeCloseTo(expectedDelta, 6);
    expect(weightRow(cut).detail).not.toBe(weightRow(printed).detail);
    expect(weightRow(cut).detail).toMatch(new RegExp(`^${Math.round(cut.massG)} g`));
  });
});

describe('a metal shin loads the knee', () => {
  it('raises the knee’s carried mass, torque and share of stall', async () => {
    const plate = await platePart();
    const m = measureTriangles(trianglesOf(plate));
    const shin: MeshMeasure = { ...m, centroid: [0, 30, 20] };
    const kneeOf = (sheet?: PartSheet) =>
      runEngineering(legInput(shinPlate(sheet), shin)).joints.find((l) => l.joint.id === 'knee')!;
    const printed = kneeOf();
    const cut = kneeOf(ALUMINUM);
    const extraG = (m.volumeMm3 / 1000) * 2.7 - filamentGrams(m, 'PLA', project.infillPct);

    expect(cut.massG - printed.massG).toBeCloseTo(extraG, 6);
    expect(cut.loadNm).toBeGreaterThan(printed.loadNm);
    expect(cut.stallShare).toBeDefined();
    expect(cut.stallShare!).toBeGreaterThan(printed.stallShare!);
    expect(cut.heatShare!).toBeGreaterThan(printed.heatShare!);
  });
});

describe('an old scene tagged CNC Aluminum', () => {
  const tagged = solidPart({ id: 'old', kind: 'box', name: 'Old Bracket', mechanicalTag: 'CNC Aluminum' });
  const bom = buildBom({
    parts: [tagged],
    project,
    purchases: {},
    measures: { old: box([-20, -10, -15], [20, 10, 15], 24000) },
    now,
  });

  it('has no no-source blocker', () => {
    expect(bom.madeElsewhere).toEqual([]);
    expect(bomFindings(bom).filter((f) => f.rule === 'no-source')).toEqual([]);
    expect(bomFindings(bom).filter((f) => f.level === 'blocker')).toEqual([]);
  });

  it('is listed as aluminum sheet with no thickness', () => {
    expect(bom.lines.find((l) => l.partIds.includes('old'))).toMatchObject({
      category: 'Sheet',
      key: 'sheet:aluminum|',
      name: '6061 aluminum',
      detail: '',
    });
    expect(bom.printed).toEqual([]);
  });
});
