import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { firstSteps, guideStepParts } from '../guide/guideSteps';
import { engineeringFindings } from '../readiness/findings';
import { box, fixtureMeasures, fixtureTriangles, joint } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { checkPrintability } from '../three/printability';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../types/robotics';
import { isPrinted } from './bom';
import { ASSEMBLY_MINUTES, buildTime, SERVO_SETUP_MINUTES, stepTimes, type TimeInputs } from './buildTime';
import { runEngineering } from './engineering';
import { TIME_CHECK } from './engineeringTime';
import { reportFromShapes } from './printReport';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
const roverProject = (extra: Partial<ProjectSettings> = {}): ProjectSettings => ({
  ...DEFAULT_PROJECT,
  joints: rover.joints,
  ...extra,
});

function timeInputs(parts: ScenePart[], project: ProjectSettings, extra: Partial<TimeInputs> = {}): TimeInputs {
  const measures = fixtureMeasures(parts);
  const triangles = fixtureTriangles(parts);
  const entries = parts.filter(isPrinted).map((part) => ({
    part,
    shape: { check: checkPrintability(triangles(part.id)!)!, measure: measures[part.id] },
  }));
  const steps = guideStepParts(parts, project);
  const report = reportFromShapes(entries, { project, printer: resolvePrinter('default', []) }, firstSteps(steps));

  return { plates: report.plan.plates, steps, printers: 1, ...extra };
}

function timeOf(parts: ScenePart[], project: ProjectSettings, extra: Partial<TimeInputs> = {}) {
  const time = timeInputs(parts, project, extra);
  const report = runEngineering({ parts, project, measures: fixtureMeasures(parts), servoOutputs: {}, time });

  return {
    total: buildTime({ parts, project, time }),
    row: report.rows.find((r) => r.check === TIME_CHECK)!,
    findings: engineeringFindings(report).filter((f) => f.check === TIME_CHECK),
  };
}

const servoJoints = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    joint({ id: `j${i}`, link: ['base', `link${i}`], origin: [0, 0, 0], axis: [1, 0, 0], effortNm: 1 }),
  );

describe('the Time row', () => {
  it('fails the rover under a 2 h budget, naming the longest plate and how to cut time', () => {
    const { row, findings } = timeOf(rover.parts, roverProject({ budgetHours: 2 }));

    expect(row.status).toBe('fail');
    expect(row.detail).toMatch(/^≈ \d+ h \d+ min of 2 h, .+ over: printing .+, assembly .+, servo set-up/);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe('blocker');
    expect(findings[0].agentText).toMatch(/plate 1 \(PLA, .*chassis.*\) prints for \d+ h /);
    expect(findings[0].agentText).toMatch(/3 servos to set up and calibrate/);
    expect(findings[0].agentText).toMatch(/Cut time: merge printed parts/);
  });

  it('takes longer to print at a higher infill', () => {
    const sparse = timeOf(rover.parts, roverProject({ infillPct: 15 })).total;
    const dense = timeOf(rover.parts, roverProject({ infillPct: 60 })).total;

    expect(dense.printHours).toBeGreaterThan(sparse.printHours);
    expect(dense.totalHours).toBeGreaterThan(sparse.totalHours);
  });

  it('takes less time when a printed wheel is bought instead', () => {
    const bought = rover.parts.map((p): ScenePart =>
      p.id === 'left_wheel_disc' ? { ...p, kind: 'component', componentId: 'pololu-wheel-70x8' } : p,
    );

    expect(timeOf(bought, roverProject()).total.totalHours).toBeLessThan(
      timeOf(rover.parts, roverProject()).total.totalHours,
    );
  });

  it('roughly halves the print share with a second printer', () => {
    const panels = Array.from({ length: 6 }, (_, i) => box(`panel${i}`, [i * 300, 5, 0], [200, 10, 200], 200));
    const one = timeOf(panels, DEFAULT_PROJECT).total;
    const two = timeOf(panels, DEFAULT_PROJECT, { printers: 2 }).total;

    expect(one.plates.length).toBeGreaterThan(3);
    expect(two.printHours / one.printHours).toBeGreaterThan(0.45);
    expect(two.printHours / one.printHours).toBeLessThan(0.6);
  });

  it('uses a sliced plate’s time for that plate only', () => {
    const panels = Array.from({ length: 2 }, (_, i) => box(`panel${i}`, [i * 300, 5, 0], [200, 10, 200], 200));
    const estimated = timeOf(panels, DEFAULT_PROJECT).total;
    const [first, second] = estimated.plates;
    const sliced = timeOf(panels, DEFAULT_PROJECT, { sliced: { [first.plate.hash]: 0.25 } }).total;

    expect(sliced.printHours).toBeCloseTo(0.25 + second.hours, 6);
    expect(sliced.plates.map((p) => p.sliced)).toEqual([true, false]);
  });

  it('adds minutes for each fastener in a step', () => {
    const screw = (id: string): ScenePart => ({
      ...box(id, [0, 0, 0], [3, 10, 3], 1),
      kind: 'hardware',
      hardware: { type: 'socket_head', size: 'M3', length: 10 },
    });
    const parts = [box('a', [0, 0, 0], [20, 20, 20], 10), ...['s1', 's2', 's3', 's4'].map(screw)];
    const [few] = stepTimes(parts, [['a', 's1']]);
    const [many] = stepTimes(parts, [['a', 's1', 's2', 's3', 's4']]);

    expect(many.fasteners).toBe(4);
    expect(many.minutes - few.minutes).toBeCloseTo(3 * ASSEMBLY_MINUTES.fastener);
  });

  it('spends more set-up time on 18 servos than on 6', () => {
    const time = { plates: [], steps: [], printers: 1 };
    const six = buildTime({ parts: [], project: { ...DEFAULT_PROJECT, joints: servoJoints(6) }, time });
    const eighteen = buildTime({ parts: [], project: { ...DEFAULT_PROJECT, joints: servoJoints(18) }, time });

    expect(six.setupHours).toBeCloseTo((6 * SERVO_SETUP_MINUTES) / 60);
    expect(eighteen.setupHours).toBeGreaterThan(six.setupHours);
  });

  it('shows the total as a note with no time budget, never a verdict', () => {
    const { row, findings } = timeOf(rover.parts, roverProject());

    expect(row.status).toBe('not run');
    expect(row.detail).toMatch(/^≈ \d+ h \d+ min: printing/);
    expect(findings).toEqual([]);
  });

  it('warns at 91% of the budget', () => {
    const total = timeOf(rover.parts, roverProject()).total.totalHours;
    const { row, findings } = timeOf(rover.parts, roverProject({ budgetHours: total / 0.91 }));

    expect(row.status).toBe('warn');
    expect(findings.map((f) => f.level)).toEqual(['note']);
  });

  it('passes inside the budget', () => {
    expect(timeOf(rover.parts, roverProject({ budgetHours: 1000 })).row.status).toBe('pass');
  });

  it('gives the same total for the same scene', () => {
    expect(timeOf(rover.parts, roverProject()).row.detail).toBe(timeOf(rover.parts, roverProject()).row.detail);
  });
});
