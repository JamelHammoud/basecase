import { describe, expect, it } from 'vitest';
import { box, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT } from '../types/robotics';
import { defaultStudyKnobs, enumerateStudy, gradeStudy, paretoFrontier, runStudy, studyScene } from './study';
import type { StudyKnob, StudyScene } from './types';

const arm = servoArm();
const scene: StudyScene = {
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  triangles: Object.fromEntries(arm.parts.map((p) => [p.id, fixtureTriangles(arm.parts)(p.id)!])),
};
const knobs: StudyKnob[] = [
  {
    id: 'servo',
    kind: 'servo',
    joints: [arm.joints[0].id],
    values: ['component:feetech-sts3215|c001', 'component:feetech-sts3215|c018'],
  },
  { id: 'voltage', kind: 'voltage', values: [6, 7.4, 12] },
];

describe('study combinations', () => {
  it('evaluates every joint choice and voltage combination exactly once', () => {
    expect(enumerateStudy(knobs)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it('caps large spaces with reproducible seeded choices and preserves every axis', () => {
    const large: StudyKnob[] = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      kind: 'voltage',
      values: [6, 7.4, 12],
    }));
    const rows = enumerateStudy(large, { seed: 92 });

    expect(rows).toHaveLength(64);
    expect(new Set(rows.map(String)).size).toBe(64);
    expect(enumerateStudy(large, { seed: 92 })).toEqual(rows);
    expect(enumerateStudy(large, { seed: 93 })).not.toEqual(rows);
    expect(enumerateStudy(knobs, { limit: 2 })).toHaveLength(2);
  });

  it('rejects empty and unsafe spaces before evaluating candidates', () => {
    expect(() => enumerateStudy([{ id: 'empty', kind: 'voltage', values: [] }])).toThrow();
    expect(() => enumerateStudy(knobs, { limit: 0 })).toThrow();
    expect(() => enumerateStudy([{ id: 'bad', kind: 'voltage', values: [Number.NaN] }])).toThrow();
  });
});

describe('study scenes', () => {
  it('composes independent changes without editing the saved design', async () => {
    const before = structuredClone(scene);
    const chosen = await studyScene(scene, knobs, [1, 2]);

    expect(chosen.parts.find((p) => p.id === arm.joints[0].actuators![0])?.componentVariant).toBe('c018');
    expect(chosen.project.tether?.volts).toBe(12);
    expect(scene).toEqual(before);
  });

  it('scales both scene geometry and measures for feet', async () => {
    const foot = { ...box('foot', [0, 2, 0], [10, 4, 20], 0), massG: undefined };
    const base = {
      ...scene,
      parts: [foot],
      measures: fixtureMeasures([foot]),
      triangles: { foot: fixtureTriangles([foot])('foot')! },
    };
    const chosen = await studyScene(base, [{ id: 'feet', kind: 'foot', values: [{ length: 2, width: 1.5 }] }], [0]);

    expect(chosen.parts[0].dimensions).toEqual({ width: 15, height: 4, depth: 40 });
    expect(chosen.measures.foot?.volumeMm3).toBeCloseTo(base.measures.foot.volumeMm3 * 3);
    expect(Math.max(...chosen.triangles.foot)).toBe(20);
    expect(base.parts[0].dimensions.width).toBe(10);
  });

  it('keeps installed battery voltage fixed and composes battery and voltage choices in either order', async () => {
    const battery = {
      ...box('pack', [0, 20, 0], [30, 20, 60], 100),
      kind: 'component' as const,
      componentId: 'ovonic-2s-2200-50c',
    };
    const base = { ...scene, parts: [...scene.parts, battery] };
    const voltage: StudyKnob = { id: 'voltage', kind: 'voltage', values: [6, 7.4] };
    const pack: StudyKnob = { id: 'pack', kind: 'battery', values: ['component:ovonic-2s-2200-50c'] };
    const geometry = async (candidate: StudyScene) => candidate;

    await expect(studyScene(base, [voltage, pack], [0, 0], { geometry })).rejects.toThrow('fixes the servo voltage');

    const first = await studyScene(base, [voltage, pack], [1, 0], { geometry });
    const second = await studyScene(base, [pack, voltage], [0, 1], { geometry });

    expect(first.parts).toEqual(second.parts);
    expect(first.project).toEqual(second.project);
    expect(first.project.tether).toEqual(base.project.tether);
  });

  it('compiles chosen dimensions together for each part and rejects absent compilation', async () => {
    const dimensions: StudyKnob[] = [
      { id: 'w', kind: 'dimension', part: 'cad', name: 'width', values: [30] },
      { id: 'h', kind: 'dimension', part: 'cad', name: 'height', values: [40] },
    ];
    const compiled: unknown[] = [];

    await expect(studyScene(scene, dimensions, [0, 0])).rejects.toThrow();
    await studyScene(scene, dimensions, [0, 0], {
      dimension: async (input) => {
        compiled.push(input.values);

        return input.scene;
      },
    });
    expect(compiled).toEqual([{ width: 30, height: 40 }]);
  });
});

describe('study grading', () => {
  it('uses the engineering rows and complete BOM cost for every design', () => {
    const row = gradeStudy(scene, { knobs, selection: [0, 0] });

    expect(row.costUsd).toBeGreaterThan(0);
    expect(row.massG).toBeGreaterThan(0);
    expect(row.checks.map((r) => r.check)).toContain('Servo torque');
    expect(row.metrics.massG).toBe(row.massG);
  });

  it('stops after a pending grade and never publishes that row', async () => {
    let stopped = false;
    const rows = await runStudy(scene, {
      knobs,
      stopped: () => stopped,
      grade: async (candidate, choice) => {
        stopped = true;

        return gradeStudy(candidate, choice);
      },
    });

    expect(rows).toEqual([]);
  });

  it('retains a failed candidate and continues grading the remaining values', async () => {
    const dimensions: StudyKnob[] = [{ id: 'wall', kind: 'dimension', part: 'cad', name: 'wall', values: [1, 2] }];
    const rows = await runStudy(scene, {
      knobs: dimensions,
      dimension: async (input) => {
        if (input.values.wall === 1) throw new Error('The wall did not compile.');

        return input.scene;
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      error: 'The wall did not compile.',
      checks: [{ check: 'Study', status: 'fail', detail: 'The wall did not compile.' }],
    });
    expect(rows[1].error).toBeUndefined();
  });

  it('discovers named dimensions from their CAD assignments and respects their range', () => {
    const part: StudyScene['parts'][number] = {
      ...scene.parts[0],
      kind: 'cad_part' as const,
      cad: {
        language: 'openscad' as const,
        code: 'wall = 2; // [1:0.5:2]\ncube([wall,20,20]);',
        positions: [],
        indices: [],
        originOffset: [0, 0, 0],
        baseSize: [2, 20, 20],
      },
    };
    const dims = defaultStudyKnobs([part], DEFAULT_PROJECT).filter((knob) => knob.kind === 'dimension');

    expect(dims).toMatchObject([{ part: part.id, name: 'wall', values: [2, 1.5] }]);
  });

  it('keeps all nondominated tradeoffs and excludes failed rows', () => {
    const base = gradeStudy(scene, { knobs, selection: [0, 0] });
    const rows = [
      { ...base, key: 'cheap', checks: [], costUsd: 10, massG: 30 },
      { ...base, key: 'light', checks: [], costUsd: 20, massG: 20 },
      { ...base, key: 'worse', checks: [], costUsd: 21, massG: 30 },
      {
        ...base,
        key: 'failed',
        checks: [{ check: 'Servo torque', status: 'fail' as const, detail: '' }],
        costUsd: 1,
        massG: 1,
      },
    ];

    expect(paretoFrontier(rows)).toEqual(['cheap', 'light']);
  });
});
