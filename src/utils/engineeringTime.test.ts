import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import type { Plate } from '../print/plan';
import type { SlicedPlate } from '../print/printBridge';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { checkPrintability } from '../three/printability';
import { DEFAULT_PROJECT, type ProjectSettings, type RobotJoint, type ScenePart } from '../types/robotics';
import { isPrinted } from './bom';
import { buildTime, printTimeOf, SERVO_MINUTES } from './buildTime';
import { runEngineering } from './engineering';
import { TIME_CHECK } from './engineeringTime';
import { reportFromShapes } from './printReport';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

interface Scene {
  parts: ScenePart[];
  joints: RobotJoint[];
}

interface Run {
  project?: Partial<ProjectSettings>;
  printers?: number;
  sliced?: (plate: Plate) => SlicedPlate | undefined;
  steps?: string[][];
}

function reportOf(parts: ScenePart[], project: ProjectSettings) {
  const triangles = fixtureTriangles(parts);
  const measures = fixtureMeasures(parts);
  const entries = parts
    .filter(isPrinted)
    .map((part) => ({ part, shape: { check: checkPrintability(triangles(part.id)!)!, measure: measures[part.id] } }));

  return reportFromShapes(entries, { project, printer: resolvePrinter('default', []) });
}

function timeInput(scene: Scene, run: Run = {}) {
  const project = { ...DEFAULT_PROJECT, joints: scene.joints, ...run.project };
  const report = reportOf(scene.parts, project);

  return {
    project,
    report,
    input: {
      ...printTimeOf(report, { printers: run.printers ?? 1, sliced: run.sliced }),
      steps: run.steps ?? [scene.parts.map((p) => p.id)],
    },
  };
}

function timeRow(scene: Scene, run: Run = {}) {
  const { project, input } = timeInput(scene, run);
  const report = runEngineering({
    parts: scene.parts,
    measures: fixtureMeasures(scene.parts),
    project,
    servoOutputs: {},
    time: input,
  });

  return report.rows.find((r) => r.check === TIME_CHECK)!;
}

const time = (scene: Scene, run: Run = {}) => {
  const { input } = timeInput(scene, run);

  return buildTime(input, scene);
};

const screw = (id: string): ScenePart => ({
  ...rover.parts[0],
  id,
  name: id,
  kind: 'hardware',
  hardware: { type: 'socket_head', size: 'M3', length: 10 },
  dimensions: { width: 3, height: 10, depth: 3 },
});

const servoJoints = (count: number): RobotJoint[] =>
  Array.from({ length: count }, (_, i) => ({ ...rover.joints[0], id: `j${i}`, name: `j${i}` }));

describe('Time', () => {
  it('fails the rover under a 2 h budget, naming the longest plate, the busiest step and the servos', () => {
    const row = timeRow(rover, { project: { budgetHours: 2 } });

    expect(row.status).toBe('fail');
    expect(row.detail).toMatch(/^≈ \d+ h \d+ min of 2 h: print .*assembly .*3 servos/);
    expect(row.itemsAreContext).toBe(true);
    expect(row.items?.map((i) => i.text)).toEqual([
      expect.stringMatching(/^Plate 1: /),
      expect.stringMatching(/^Step 1: 8 min$/),
      expect.stringMatching(/^3 servos: 15 min$/),
    ]);
  });

  it('counts more print hours at a higher infill', () => {
    expect(time(rover, { project: { infillPct: 60 } }).printHours).toBeGreaterThan(time(rover).printHours);
  });

  it('counts fewer print hours when a printed part becomes a catalog part', () => {
    const wheel = rover.parts.find((p) => p.id === 'left_wheel_disc')!;
    const bought: Scene = {
      ...rover,
      parts: rover.parts.map((p) => (p === wheel ? { ...p, kind: 'component', componentId: 'pololu-wheel-70x8' } : p)),
    };

    expect(time(bought).printHours).toBeLessThan(time(rover).printHours);
  });

  it('halves the print share with a second printer', () => {
    const one = time(rover);
    const two = time(rover, { printers: 2 });

    expect(two.printHours).toBeCloseTo(one.printHours / 2, 6);
    expect(two.assemblyHours).toBe(one.assemblyHours);
  });

  it('replaces the estimate with the sliced time for the sliced plate only', () => {
    const split: Scene = {
      ...rover,
      parts: rover.parts.map((p) => (p.id === 'caster_wheel_disc' ? { ...p, printMaterial: 'TPU' } : p)),
    };
    const { report } = timeInput(split);
    const [first, second] = report.plan.plates;
    const sliced = (plate: Plate) => (plate.number === first.number ? ({ seconds: 1800 } as SlicedPlate) : undefined);
    const t = time(split, { sliced });

    expect(report.plan.plates).toHaveLength(2);
    expect(t.printHours).toBeCloseTo(0.5 + second.hours, 6);
  });

  it('adds minutes for every fastener in a step', () => {
    const screws = ['s1', 's2', 's3', 's4'].map(screw);
    const few: Scene = { ...rover, parts: [...rover.parts, screws[0]] };
    const many: Scene = { ...rover, parts: [...rover.parts, ...screws] };
    const steps = (scene: Scene) => [
      rover.parts.map((p) => p.id),
      scene.parts.slice(rover.parts.length).map((p) => p.id),
    ];

    const fewTime = time(few, { steps: steps(few) });
    const manyTime = time(many, { steps: steps(many) });

    expect(manyTime.assemblyHours).toBeGreaterThan(fewTime.assemblyHours);
    expect(manyTime.busiestStep).toMatchObject({ number: 2, fasteners: 4 });
  });

  it('spends more set-up time on 18 servos than on 6', () => {
    const six = time({ ...rover, joints: servoJoints(6) });
    const eighteen = time({ ...rover, joints: servoJoints(18) });

    expect(six.servoHours).toBeCloseTo((6 * SERVO_MINUTES) / 60, 6);
    expect(eighteen.servoHours).toBeGreaterThan(six.servoHours);
  });

  it('shows the total as a note, with no verdict, when no time budget is set', () => {
    const row = timeRow(rover);

    expect(row.status).toBe('not run');
    expect(row.detail).toMatch(/^≈ \d+ h \d+ min: print /);
    expect(row.items).toBeUndefined();
  });

  it('warns above 90% of the budget and passes below it', () => {
    const total = time(rover).totalHours;

    expect(timeRow(rover, { project: { budgetHours: total / 0.91 } }).status).toBe('warn');
    expect(timeRow(rover, { project: { budgetHours: total / 0.85 } }).status).toBe('pass');
  });

  it('gives the same total for the same scene', () => {
    expect(timeRow(rover, { project: { budgetHours: 2 } })).toEqual(timeRow(rover, { project: { budgetHours: 2 } }));
    expect(time(rover).totalHours).toBe(time(rover).totalHours);
  });
});
