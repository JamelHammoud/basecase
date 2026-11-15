import { describe, expect, it, vi } from 'vitest';
import { noRuns, type CaseRuns } from '../cases/caseRuns';
import { touchTheDots } from '../cases/testing';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { gradeStudy, runStudy, studyFingerprint } from '../study/study';
import type { StudyRecord, StudyRow, StudyScene } from '../study/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyReply } from './agentStudyReply';
import { studyRequest } from './agentStudyRequest';
import type { StudyRequest } from './studyRun';
import type { Cases } from './useCases';

const arm = servoArm();
const kase = touchTheDots(arm);
const base: StudyScene = {
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  triangles: Object.fromEntries(arm.parts.map((part) => [part.id, fixtureTriangles(arm.parts)(part.id)!])),
};

describe('study_design payload integration', () => {
  it('composes servo and voltage choices through the engine and retains both reply formats', async () => {
    const before = structuredClone(base);
    const runs = async () => ({ ...noRuns(''), refusal: null, runs: 8, passes: 8, worstMargin: 0.10351 });
    const run = vi.fn(async ({ knobs = [], seed = 1, limit }: StudyRequest = {}) => ({
      base: { parts: base.parts, project: base.project },
      baseKey: studyFingerprint(base.parts, base.project),
      knobs,
      seed,
      total: 4,
      current: { ...gradeStudy(base, { knobs: [], selection: [], runs: await runs() }), label: 'as modeled' },
      rows: await runStudy(base, { knobs, seed, limit, runs }),
    }));
    const reply = await studyRequest(
      {
        case: kase.id,
        cap: 4,
        seed: 9,
        knobs: [
          {
            id: 'shoulder',
            kind: 'servo',
            joints: [arm.joints[0].id],
            values: ['component:feetech-sts3215|c001', 'component:feetech-sts3215|c046'],
          },
          { id: 'power', kind: 'voltage', values: [7.4, 12] },
        ],
      },
      {
        cases: { cases: [kase], active: kase } as unknown as Cases,
        setAction: () => {},
        study: { run },
      },
    );

    expect(reply).toMatchObject({
      ok: true,
      case: kase.name,
      runs: 8,
      seed: 9,
      current: { servos: expect.arrayContaining([{ joint: 'Shoulder', mpn: 'ST-3215-C001' }]) },
      rows: expect.arrayContaining([
        expect.objectContaining({ selection: [0, 0], volts: 7.4 }),
        expect.objectContaining({ selection: [0, 1], volts: 12 }),
        expect.objectContaining({ selection: [1, 0], volts: 7.4 }),
        expect.objectContaining({ selection: [1, 1], volts: 12 }),
      ]),
      designs: expect.arrayContaining([
        expect.objectContaining({
          passes: 8,
          worst_margin: 0.104,
          changes: [{ joints: ['Shoulder'], mpn: 'ST-3215-C046' }],
        }),
      ]),
      text: expect.stringContaining('Cheapest passing set'),
    });
    expect(base).toEqual(before);
  });
});

function replyFixture(): StudyRecord {
  const runs: CaseRuns = {
    ...noRuns(''),
    refusal: null,
    runs: 8,
    passes: 7,
    medianMargin: 0.12345,
    worstMargin: -0.5,
    outcomes: [
      {
        seed: 4,
        passed: false,
        margin: -0.5,
        failed: ['fell'],
        firstTrip: { label: 'fell', frame: 12 },
        path: Float32Array.from({ length: 80000 }, (_, i) => i / 10),
      },
    ],
  };
  const current: StudyRow = {
    key: 'current',
    sceneKey: 'base',
    selection: [],
    label: 'as modeled',
    costUsd: 50,
    massG: 1000,
    runs,
    metrics: { massG: 1000, torque: 'warn' },
    checks: [
      {
        check: 'Servo torque',
        status: 'warn',
        detail: 'Calibrate the shoulder.',
        ids: ['shoulder'],
        items: [
          {
            text: 'Calibrate the shoulder.',
            ids: ['shoulder'],
            status: 'warn',
            fix: { kind: 'calibrate', joints: ['shoulder'] },
          },
        ],
        dots: Array.from({ length: 1000 }, () => ({ at: [0, 1, 2], shade: 0.5 })),
        envelopes: [
          {
            joint: 'shoulder',
            label: 'Shoulder',
            outside: 4,
            samples: Array.from({ length: 1000 }, () => [20, 0.4]),
            servo: { name: 'STS3215', stallNm: 3, ratedNm: 1, rpm: 60 },
          },
        ],
      },
    ],
  };

  return {
    base: { parts: base.parts, project: base.project },
    baseKey: 'base',
    seed: 9,
    total: 1,
    knobs: [{ id: 'power', kind: 'voltage', values: [12] }],
    current,
    rows: [{ ...current, key: '0', selection: [0], label: '12 V' }],
  };
}

describe('study_design compact reply', () => {
  it('retains actionable checks and seeded outcomes while omitting presentation buffers', () => {
    const record = replyFixture();
    const before = structuredClone(record);
    const reply = studyReply(record, kase);
    const expectedCheck = {
      check: 'Servo torque',
      status: 'warn',
      detail: 'Calibrate the shoulder.',
      ids: ['shoulder'],
      items: [
        {
          text: 'Calibrate the shoulder.',
          ids: ['shoulder'],
          status: 'warn',
          fix: { kind: 'calibrate', joints: ['shoulder'] },
        },
      ],
    };

    expect(reply).toMatchObject({ case: kase.name, runs: 8, seed: 9 });
    expect(reply.rows[0]).toMatchObject({
      runs: {
        runs: 8,
        passes: 7,
        medianMargin: 0.12345,
        worstMargin: -0.5,
        outcomes: [{ seed: 4, passed: false, margin: -0.5, failed: ['fell'], firstTrip: { label: 'fell', frame: 12 } }],
      },
      checks: [expectedCheck],
    });
    expect(reply.designs[0]).toMatchObject({
      passes: 7,
      worst_margin: -0.5,
      cost_usd: 50,
      mass_g: 1000,
      checks: [expectedCheck],
    });
    expect(JSON.stringify(reply)).not.toMatch(/"(?:path|dots|envelopes)":/);
    expect(JSON.stringify(reply).length).toBeLessThan(20000);
    expect(record).toEqual(before);
  });

  it('retains failed candidates and their errors without reporting sentinel measurements', () => {
    const record = replyFixture();

    record.rows = [
      {
        ...record.rows[0],
        error: 'The width could not compile.',
        costUsd: 0,
        massG: 0,
        metrics: { massG: 0, torque: 'not run' },
      },
    ];

    const reply = studyReply(record, null);
    const failed = reply.designs.find((design) => design.key === '0');

    expect(failed).toMatchObject({ error: 'The width could not compile.' });
    expect(failed).not.toHaveProperty('cost_usd');
    expect(failed).not.toHaveProperty('mass_g');
    expect(failed).not.toHaveProperty('metrics');
    expect(reply.rows[0]).toHaveProperty('error', 'The width could not compile.');
    expect(reply.rows[0]).not.toHaveProperty('costUsd');
    expect(reply.rows[0]).not.toHaveProperty('massG');
    expect(reply.rows[0]).not.toHaveProperty('metrics');
    expect(reply.text).toContain('The width could not compile.');
  });
});
