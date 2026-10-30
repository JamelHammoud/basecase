import { describe, expect, it } from 'vitest';
import { printed } from '../assembly/assembly.fixtures';
import type { ProjectSettings } from '../types/robotics';
import { declareJoints, type JointSpec } from '../workspace/agentBuildRequests';
import { runEngineering } from './engineering';

const parts = [printed('base', { size: [20, 10, 20] }, [0, 0, 0]), printed('link', { size: [10, 40, 10] }, [0, 10, 0])];
const PROJECT: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 20 };
const knee = (range: [number, number]): JointSpec => ({
  id: 'knee',
  name: 'Left knee',
  parent: ['base'],
  child: ['link'],
  origin: [0, 0, 10],
  axis: [1, 0, 0],
  range,
});

const define = (project: ProjectSettings, range: [number, number]) =>
  declareJoints({ joints: [knee(range)] }, parts, project, () => null).next;

const rangeRow = (project: ProjectSettings) =>
  runEngineering({ parts, project, measures: {}, servoOutputs: {} }).rows.find((r) => r.check === 'Range changes');

describe('range changes', () => {
  it('keeps the first range when a joint is redefined', () => {
    const first = define(PROJECT, [-10, 120]);
    const narrowed = define(first, [-5, 75]);

    expect(narrowed.firstRanges).toEqual({ knee: [-10, 120] });
    expect(narrowed.joints?.[0].range).toEqual([-5, 75]);
  });

  it('reports a narrowed range with its first value, and passes when it is restored', () => {
    const first = define(PROJECT, [-10, 120]);
    const row = rangeRow(define(first, [-5, 75]))!;

    expect(row.status).toBe('warn');
    expect(row.items?.[0].text).toMatch(/^Left knee: −5° to 75°, first defined as −10° to 120°/);
    expect(rangeRow(define(first, [-10, 120]))?.status).toBe('pass');
  });

  it('cannot be cleared by redefining every joint', () => {
    const first = define(PROJECT, [-10, 120]);
    const replaced = declareJoints({ joints: [knee([0, 60])], replace: true }, parts, first, () => null).next;

    expect(rangeRow(replaced)?.status).toBe('warn');
  });
});
