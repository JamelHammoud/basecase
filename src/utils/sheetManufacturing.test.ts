import * as THREE from 'three';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { MATERIAL_DENSITY } from '../data/supplies';
import { quotesWanted } from '../print/serviceQuotes';
import { bomFindings } from '../readiness/findings';
import { detectSheet } from '../sheet/detectSheet';
import { pocketTriangles } from '../sheet/sheet.fixtures';
import { buildMjcf } from '../sim/mjcf';
import { SimEngine } from '../sim/engine';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, measureObject } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildBom, isPrinted } from './bom';
import { runEngineering } from './engineering';
import { buildRig } from './kinematics';
import { printReportOf } from './printReport';

const panel = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  dimensions: { width: 100, height: 20, depth: 2 },
  position: [0, 20, 50],
  rotation: [0, 0, 0],
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const measure = (p: ScenePart) => {
  const { width, height, depth } = p.dimensions;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));

  mesh.position.set(...p.position);

  return { ...measureObject(mesh), sheet: detectSheet(localTriangles(mesh)) };
};

const aluminum = panel('aluminum', { sheet: { material: 'aluminum-6061', thicknessMm: 2 } });
const acrylic = panel('acrylic', { sheet: { material: 'acrylic', thicknessMm: 2 } });
const knee: RobotJoint = {
  id: 'knee',
  name: 'Knee',
  type: 'revolute',
  parent: ['base'],
  child: ['panel'],
  origin: [0, 20, 0],
  axis: [1, 0, 0],
  range: [-10, 10],
  limb: 'leg',
  effortNm: 0.1,
};

function leg(p: ScenePart) {
  const parts = [panel('base', { massG: 1 }), { ...p, id: 'panel' }];
  const measures = Object.fromEntries(parts.map((part) => [part.id, measure(part)]));
  const project = { ...DEFAULT_PROJECT, joints: [knee] };

  return { parts, measures, project, servoOutputs: {} };
}

describe('sheet manufacturing in the bill of materials', () => {
  it('groups by sheet material and stock thickness, leaving filament for printed parts', () => {
    const thicker = panel('thicker', {
      sheet: { material: 'aluminum-6061', thicknessMm: 3 },
      dimensions: { width: 100, height: 20, depth: 3 },
    });
    const parts = [aluminum, { ...aluminum, id: 'second' }, thicker, acrylic, panel('printed')];
    const measures = Object.fromEntries(parts.map((part) => [part.id, measure(part)]));
    const bom = buildBom({ parts, measures, project: DEFAULT_PROJECT, purchases: {} });
    const sheets = bom.lines.filter((line) => line.category === 'Sheet');

    expect(sheets).toHaveLength(3);
    expect(sheets.find((line) => line.partIds.includes('aluminum'))).toMatchObject({
      qty: 2,
      unit: 'pcs',
      detail: '2 mm',
      partIds: ['aluminum', 'second'],
    });
    expect(bom.printed.map((part) => part.id)).toEqual(['printed']);
    expect(bom.lines.find((line) => line.category === 'Filament')?.partIds).toEqual(['printed']);
    expect(bom.madeElsewhere).toEqual([]);
  });

  it('recognizes legacy CNC and laser-cut tags without a no-source blocker', () => {
    const parts = [
      panel('cnc', { mechanicalTag: 'CNC Aluminum' }),
      panel('laser', { mechanicalTag: 'Laser-Cut Acrylic/Carbon' }),
    ];
    const measures = Object.fromEntries(parts.map((part) => [part.id, measure(part)]));
    const bom = buildBom({ parts, measures, project: DEFAULT_PROJECT, purchases: {} });

    expect(Object.values(measures).every((entry) => entry.sheet?.thicknessMm === 2)).toBe(true);
    expect(bom.lines.filter((line) => line.category === 'Sheet')).toHaveLength(2);
    expect(bom.madeElsewhere).toEqual([]);
    expect(bomFindings(bom).filter((finding) => finding.level === 'blocker')).toEqual([]);
  });

  it('keeps a legacy CNC pocketed part out of Sheet and needing a source', () => {
    const positions = Array.from(pocketTriangles());
    const part = panel('cnc', {
      kind: 'mesh',
      mechanicalTag: 'CNC Aluminum',
      dimensions: { width: 80, height: 60, depth: 3 },
      mesh: { positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i), baseSize: [80, 60, 3] },
    });
    const group = buildPartGroup(part, false);
    const triangles = localTriangles(group);
    const measured = { ...measureObject(group), sheet: detectSheet(triangles) };

    releasePartGroup(group);

    const bom = buildBom({
      parts: [part],
      measures: { cnc: measured },
      project: DEFAULT_PROJECT,
      purchases: {},
    });

    expect(measured.triangles).toBeGreaterThan(0);
    expect(measured.volumeMm3).toBeCloseTo(12800, 4);
    expect(measured.sheet).toBeUndefined();
    expect(bom.lines.filter((line) => line.category === 'Sheet')).toEqual([]);
    expect(bomFindings(bom).filter((finding) => finding.level === 'blocker')).toMatchObject([
      { rule: 'no-source', ids: ['cnc'] },
    ]);
  });

  it('makes a geometrically qualified block-out into a fabricated sheet part', () => {
    const part = panel('beam', { ...aluminum, id: 'beam', kind: 'beam' });
    const bom = buildBom({ parts: [part], measures: { beam: measure(part) }, project: DEFAULT_PROJECT, purchases: {} });

    expect(bom.standIns).toEqual([]);
    expect(bom.lines).toEqual([expect.objectContaining({ category: 'Sheet', partIds: ['beam'] })]);
  });

  it('leaves an unsupported COTS block-out needing a source', () => {
    const bom = buildBom({
      parts: [panel('bought', { mechanicalTag: 'Off-the-shelf COTS' })],
      measures: {},
      project: DEFAULT_PROJECT,
      purchases: {},
    });

    expect(bom.madeElsewhere.map((part) => part.id)).toEqual(['bought']);
  });
});

describe('sheet manufacturing and printer plates', () => {
  it('keeps sheets out of service print quotes and printed-parts BOM lines', () => {
    const project = { ...DEFAULT_PROJECT, madeBy: 'service' as const };
    const parts = [aluminum, panel('printed')];
    const bom = buildBom({ parts, measures: {}, project, purchases: {} });

    expect(quotesWanted(parts, project).map((quote) => quote.part)).toEqual(['printed']);
    expect(bom.lines.filter((line) => line.category === 'Printed parts').map((line) => line.partIds)).toEqual([
      ['printed'],
    ]);
    expect(bom.lines.filter((line) => line.category === 'Sheet').map((line) => line.partIds)).toEqual([['aluminum']]);
    expect(bom.filamentG).toEqual({});
  });

  it('does not request sheet print shapes or add sheet grams and plates', async () => {
    const fetchShapes = vi.fn(async () => ({}));
    const report = await printReportOf(
      [aluminum, acrylic],
      { project: DEFAULT_PROJECT, printer: resolvePrinter('bambu-p1s', []) },
      fetchShapes,
    );

    expect(isPrinted(aluminum)).toBe(false);
    expect(fetchShapes).not.toHaveBeenCalled();
    expect(report.parts).toEqual([]);
    expect(report.plan.plates).toEqual([]);
    expect(report.totals).toEqual({ grams: 0, supportG: 0, hours: 0, failing: 0 });
  });
});

describe('sheet density in engineering and simulation', () => {
  it('changes solid PLA weight to aluminum by the material density ratio', () => {
    const input = leg({ ...aluminum, sheet: undefined, printMaterial: 'PLA' });
    const printed = runEngineering({ ...input, project: { ...input.project, infillPct: 100 } });
    const metal = runEngineering(leg(aluminum));

    expect((metal.massG - 1) / (printed.massG - 1)).toBeCloseTo(2.7 / MATERIAL_DENSITY.PLA, 8);
    expect(printed.masses.find((mass) => mass.id === 'panel')?.source).toBe('printed');
    expect(metal.masses.find((mass) => mass.id === 'panel')?.source).toBe('sheet');
  });

  it('replaces a former published mass when a part becomes sheet', () => {
    const report = runEngineering(leg({ ...aluminum, massG: 1000 }));
    const mass = report.masses.find((entry) => entry.id === 'panel');

    expect(mass?.grams).toBeCloseTo(10.8, 8);
    expect(mass?.source).toBe('sheet');
  });

  it('weighs the same solid volume by material and propagates it into knee torque', () => {
    const metal = runEngineering(leg(aluminum));
    const plastic = runEngineering(leg(acrylic));
    const metalPanel = metal.masses.find((mass) => mass.id === 'panel')!;
    const plasticPanel = plastic.masses.find((mass) => mass.id === 'panel')!;

    expect(metalPanel.grams).toBeCloseTo(10.8, 8);
    expect(plasticPanel.grams).toBeCloseTo(4.76, 8);
    expect(metalPanel.grams / plasticPanel.grams).toBeCloseTo(2.7 / 1.19, 8);
    expect(metal.massG).toBeCloseTo(11.8, 8);
    expect(metal.joints[0].swingNm).toBeCloseTo(0.0108 * 9.81 * 0.05, 8);
    expect(metal.rows.find((row) => row.check === 'Weight')?.status).toBe('pass');
  });

  it('puts the measured sheet mass into MJCF and changes the model fingerprint', () => {
    const model = (p: ScenePart) => {
      const input = leg(p);

      return buildMjcf({
        ...input,
        rig: buildRig([knee], input.parts),
        partTriangles: () => null,
      });
    };
    const metal = model(aluminum);
    const plastic = model(acrylic);

    expect(metal.xml).toMatch(/name="g_panel"[^>]*mass="0.0108"/);
    expect(plastic.xml).toMatch(/name="g_panel"[^>]*mass="0.00476"/);
    expect(Object.values(metal.massKg)[0]).toBeCloseTo(0.0118, 8);
    expect(metal.robots[0].fingerprint).not.toBe(plastic.robots[0].fingerprint);
  });

  it('uses sheet density in MuJoCo gravity and its measured peak joint torque', async () => {
    const mj = await loadMujoco();
    const torque = (part: ScenePart) => {
      const input = leg(part);
      const rig = buildRig([knee], input.parts);
      const sim = buildMjcf({
        ...input,
        rig,
        partTriangles: () => null,
        fixedBase: Object.fromEntries(rig.robots.map((robot) => [robot.key, true])),
      });
      const engine = new SimEngine(mj, sim);

      mj.mj_forward(engine.model, engine.data);

      const gravity = Math.abs(engine.data.qfrc_bias[0]);

      engine.step(2);

      const peak = engine.stats().joints[0].peak * sim.joints[0].effort;

      engine.dispose();

      return { gravity, peak };
    };
    const metal = torque(aluminum);
    const plastic = torque(acrylic);

    expect(metal.gravity).toBeCloseTo(0.0108 * 9.81 * 0.05, 8);
    expect(metal.gravity / plastic.gravity).toBeCloseTo(2.7 / 1.19, 8);
    expect(metal.peak).toBeGreaterThan(plastic.peak);
    expect(metal.peak).toBeGreaterThan(metal.gravity / 2);
  });
});
