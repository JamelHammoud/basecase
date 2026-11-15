import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { resolvePrinter } from '../data/printers';
import { planInput } from '../print/plan.fixtures';
import { reportFromShapes } from './printReport';
import { isPrinted } from './bom';
import { buildTime, timeRow } from './engineeringTime';
import { engineeringFindings } from '../readiness/findings';
import { runEngineering } from './engineering';
import { currentSlices } from '../print/slices';

const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
const project = { ...DEFAULT_PROJECT, joints: rover.joints, budgetHours: 2 };
const report = (parts = rover.parts, infillPct = 20) =>
  reportFromShapes(
    parts.filter(isPrinted).map((part) => {
      const { width: w, height: h, depth: d } = part.dimensions;
      const check = planInput(part.id, [w, d, h]).check;

      return {
        part,
        shape: {
          check: { poses: [check.pose], minWallMm: 2, thinShare: 0, thinAreaMm2: 0 },
          measure: {
            volumeMm3: w * h * d,
            areaMm2: 2 * (w * h + w * d + h * d),
            centroid: [0, 0, 0] as [number, number, number],
            min: [0, 0, 0] as [number, number, number],
            max: [w, h, d] as [number, number, number],
            triangles: 12,
          },
        },
      };
    }),
    { project: { ...project, infillPct }, printer: resolvePrinter('default', []) },
  );
const input = () => ({ parts: rover.parts, project, print: report() });

describe('build time budget', () => {
  it('fails the rover under two hours and lists contributors for Fix', () => {
    const row = timeRow(input());

    expect(row.status).toBe('fail');
    expect(row.agentText).toMatch(/Plate .*Step .*servo/s);
    expect(row.agentText).toContain('Merge compatible printed parts');
    expect(row.agentText).toContain('referenceable catalog part');
    expect(row.agentText).not.toContain('infill');
  });

  it('rises with infill and falls when a printed part becomes a catalog part', () => {
    expect(buildTime({ ...input(), print: report(rover.parts, 80) }).hours).toBeGreaterThan(buildTime(input()).hours);

    const first = rover.parts.find(isPrinted)!;
    const parts = rover.parts.map((p) =>
      p.id === first.id ? { ...p, kind: 'component' as const, componentId: 'feetech-sts3215' } : p,
    );

    expect(buildTime({ ...input(), parts, print: report(parts) }).hours).toBeLessThan(buildTime(input()).hours);
  });

  it('divides only printing across printers, with at least one', () => {
    const one = buildTime(input());
    const two = buildTime({ ...input(), printerCount: 2 });

    expect(two.printHours).toBeCloseTo(one.printHours / 2);
    expect(two.assemblyMinutes).toBe(one.assemblyMinutes);
    expect(two.setupMinutes).toBe(one.setupMinutes);
    expect(buildTime({ ...input(), printerCount: 0 })).toEqual(one);
  });

  it('replaces matching sliced plates only and rejects stale slices', () => {
    const print = report(rover.parts.map((p) => ({ ...p, print: { copies: 3 } })));
    const plate = print.plan.plates[0];
    const slices = [{ number: plate.number, hash: plate.hash, seconds: 360 }];
    const estimate = buildTime({ ...input(), print });
    const sliced = buildTime({ ...input(), print, slices });

    expect(sliced.printHours).toBeCloseTo(estimate.printHours - plate.hours + 0.1);
    expect(buildTime({ ...input(), print, slices: [{ ...slices[0], hash: 'stale' }] })).toEqual(estimate);
  });

  it('keeps the first valid duration for duplicate slices and reads revised results afresh', () => {
    const print = report();
    const plate = print.plan.plates[0];
    const base = { ...input(), print };
    const matching = { number: plate.number, hash: plate.hash };
    const slices = [NaN, Infinity, -1, 0, 3600].map((seconds) => ({ ...matching, seconds }));
    const zero = buildTime({ ...base, slices: [{ ...matching, seconds: 0 }] });

    expect(buildTime({ ...base, slices })).toEqual(zero);

    slices[3] = { ...matching, seconds: 1800 };

    const revised = buildTime({ ...base, slices });

    expect(revised.printHours).toBeCloseTo(zero.printHours + 0.5);
    expect(revised.hours).toBeCloseTo(zero.hours + 0.5);
    expect(revised.assemblyMinutes).toBe(zero.assemblyMinutes);
    expect(revised.setupMinutes).toBe(zero.setupMinutes);
    expect(buildTime({ ...base, slices: slices.slice(0, 3) })).toEqual(buildTime(base));
  });

  it('adds assembly minutes for fasteners and inserts', () => {
    const base = rover.parts[0];
    const fastener = (id: string, type: 'socket_head' | 'heat_insert'): ScenePart => ({
      ...base,
      id,
      kind: 'hardware',
      hardware: { type, size: 'M3', length: 6 },
    });
    const withScrew = [...rover.parts, fastener('screw', 'socket_head')];
    const withInsert = [...withScrew, fastener('insert', 'heat_insert')];

    expect(buildTime({ ...input(), parts: withScrew }).assemblyMinutes).toBeGreaterThan(
      buildTime(input()).assemblyMinutes,
    );
    expect(buildTime({ ...input(), parts: withInsert }).assemblyMinutes).toBeGreaterThan(
      buildTime({ ...input(), parts: withScrew }).assemblyMinutes,
    );
  });

  it('uses estimates after labels change, as Print mode does', () => {
    const print = report();
    const plate = print.plan.plates[0];
    const record = {
      labels: 'original-guide',
      plates: [{ ...plate, seconds: 360, support: false, warnings: [], thumbnail: null }],
    };
    const estimate = buildTime({ ...input(), print });
    const sliced = buildTime({ ...input(), print, slices: currentSlices(record, 'original-guide') });

    expect(sliced.printHours).toBeCloseTo(estimate.printHours - plate.hours + 0.1);
    expect(buildTime({ ...input(), print, slices: currentSlices(record, 'revised-guide') })).toEqual(estimate);
    expect(currentSlices(null, '')).toBeUndefined();
    expect(currentSlices({ plates: record.plates }, '')).toBe(record.plates);
  });

  it('allows more setup time for eighteen servos than six', () => {
    const joints = (n: number) => Array.from({ length: n }, (_, i) => ({ ...rover.joints[0], id: `servo-${i}` }));
    const six = buildTime({ ...input(), project: { ...project, joints: joints(6) } });
    const eighteen = buildTime({ ...input(), project: { ...project, joints: joints(18) } });

    expect(eighteen.setupMinutes).toBe(six.setupMinutes * 3);
  });

  it('shows a note without a budget, never a blocker', () => {
    const settings = { ...project, budgetHours: undefined };
    const row = timeRow({ ...input(), project: settings });
    const engineering = runEngineering({
      parts: rover.parts,
      project: settings,
      measures: {},
      servoOutputs: {},
      print: report(),
    });
    const findings = engineeringFindings(engineering).filter((f) => f.check === 'Time');

    expect(row.status).toBe('warn');
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe('note');
    expect(findings[0].agentText).toContain('Plate');
  });

  it('warns at ninety-one percent and passes below ninety percent', () => {
    const hours = buildTime(input()).hours;

    expect(timeRow({ ...input(), project: { ...project, budgetHours: hours / 0.91 } }).status).toBe('warn');
    expect(timeRow({ ...input(), project: { ...project, budgetHours: hours / 0.89 } }).status).toBe('pass');
  });

  it('is deterministic and counts parts that do not fit a plate', () => {
    const print = report();
    const offPlate = { ...print, plan: { ...print.plan, plates: [] } };

    expect(buildTime(input())).toEqual(buildTime(input()));
    expect(buildTime({ ...input(), print: offPlate }).printHours).toBeCloseTo(print.totals.hours);
  });
});
