import { noRuns, type CaseRuns } from '../cases/caseRuns';
import { describe, expect, it } from 'vitest';
import { servoArm } from '../sim/fixtures/servoArm';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';
import { getWorldAsset, hashWorldAsset, registerWorldAsset } from '../cases/worldAssets';
import { touchTheDots } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { sceneJson } from '../utils/sceneJson';
import { projectFromSeed } from '../workspace/helpers';
import { gradeStudy, runStudy, studyFingerprint } from './study';
import { readStudyRecord, validateStudyKnobs } from './record';
import type { StudyKnob, StudyRecord, StudyScene } from './types';

const arm = servoArm();
const base: StudyScene = {
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  triangles: Object.fromEntries(arm.parts.map((part) => [part.id, fixtureTriangles(arm.parts)(part.id)!])),
};
const caseRuns: CaseRuns = {
  ...noRuns(''),
  runs: 2,
  passes: 1,
  refusal: null,
  medianMargin: 0.5,
  worstMargin: -0.1,
  outcomes: [
    { seed: 1, passed: true, margin: 1.1, failed: [], path: new Float32Array([0, 1, 2, 3]), firstTrip: null },
    {
      seed: 2,
      passed: false,
      margin: -0.1,
      failed: ['missed'],
      path: new Float32Array([3, 2, 1, 0]),
      firstTrip: { label: 'missed', frame: 3 },
    },
  ],
  failures: [{ label: 'missed', runs: 1 }],
};
const knobs: StudyKnob[] = [{ id: 'power', kind: 'voltage', values: [7.4, 12] }];

async function record(): Promise<StudyRecord> {
  return {
    knobs,
    rows: await runStudy(base, { knobs, runs: async () => caseRuns }),
    seed: 1,
    current: { ...gradeStudy(base, { knobs: [], selection: [], runs: caseRuns }), label: 'as modeled' },
    total: 2,
    baseKey: studyFingerprint(base.parts, base.project),
    base: { parts: base.parts, project: base.project },
  };
}

function sceneFile(study: unknown) {
  return new TextEncoder().encode(
    JSON.stringify({
      format: 'basecase-scene',
      version: 1,
      scene: { name: 'Arm', parts: arm.parts, project: { ...base.project, study } },
    }),
  );
}

describe('saved Study records', () => {
  it('carries a baseline Case world after that Case leaves the live scene', async () => {
    const study = await record();
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const kase = touchTheDots(arm);
    const captured = {
      ...kase,
      world: { ...kase.world, imported: { hash, position: [0, 0, 0] as [number, number, number] } },
    };
    const saved = { ...study, base: { ...study.base, project: { ...study.base.project, cases: [captured] } } };
    const project = { ...base.project, cases: [], study: saved };

    registerWorldAsset(hash, asset);

    const autosaved = JSON.parse(await sceneJson({ parts: arm.parts, project }));
    const shared = sharedScene({ name: 'Arm', globalGoal: '', parts: arm.parts, project });
    const restored = await decodeSceneFile(await encodeSceneFile(shared));

    expect(Object.keys(autosaved.worldAssets)).toEqual([hash]);
    expect(Object.keys(shared.worldAssets ?? {})).toEqual([hash]);
    expect(restored.project?.cases).toEqual([]);
    expect(restored.project?.study?.base.project.cases?.[0].world.imported?.hash).toBe(hash);
    expect(getWorldAsset(hash)?.world.mesh.positions).toEqual(asset.world.mesh.positions);

    const missing = { ...shared, worldAssets: {} };

    await expect(decodeSceneFile(await encodeSceneFile(missing))).rejects.toThrow('missing');
  });

  it('keeps local records out of exported and imported Study baselines without changing the saved Study', async () => {
    const study = await record();
    const project = {
      ...base.project,
      prints: [],
      quotes: [],
      madeBy: 'service' as const,
      policies: [],
      tries: [],
      triesStored: true,
      skills: [],
      buildGuide: { id: 'local-guide', pages: 1, steps: 1, generatedAt: '', fingerprint: '' },
    };
    const saved = { ...study, base: { ...study.base, project } };
    const shared = sharedScene({
      name: 'Arm',
      globalGoal: '',
      parts: arm.parts,
      project: { ...project, study: saved },
    });
    const imported = await decodeSceneFile(sceneFile(saved));
    const roundTripped = await decodeSceneFile(await encodeSceneFile(shared));
    const localKeys = ['prints', 'quotes', 'madeBy', 'policies', 'tries', 'triesStored', 'skills', 'buildGuide'];

    for (const scene of [shared, imported, roundTripped]) {
      expect(scene.project?.study?.rows).toEqual(study.rows);
      expect(scene.project?.study?.base.project.joints).toEqual(base.project.joints);

      for (const key of localKeys) {
        expect(scene.project).not.toHaveProperty(key);
        expect(scene.project?.study?.base.project).not.toHaveProperty(key);
      }
    }

    expect(saved.base.project).toBe(project);
    expect(saved.base.project.buildGuide.id).toBe('local-guide');
  });

  it('round trips the engine result, original scene and baseline without recursive project data', async () => {
    const study = await record();
    const project = { ...base.project, study };
    const shared = sharedScene({ name: 'Arm', globalGoal: '', parts: arm.parts, project });
    const decoded = await decodeSceneFile(await encodeSceneFile(shared));

    expect(readStudyRecord(study)).toBe(study);
    expect(projectFromSeed(project).study).toBe(study);
    expect(decoded.project?.study).toEqual(study);
    expect(decoded.project?.study?.base.project).not.toHaveProperty('study');
    expect(decoded.project?.study?.rows[0].runs?.outcomes[1].path).toEqual(caseRuns.outcomes[1].path);

    const restored = projectFromSeed(JSON.parse(JSON.stringify(project)));

    expect(restored.study?.rows[0].runs?.outcomes[0].path).toBeInstanceOf(Float32Array);
    expect(restored.study?.base).toEqual(study.base);

    const portable = JSON.parse(JSON.stringify(study));
    const normalized = readStudyRecord(portable);

    expect(normalized?.base).toBe(portable.base);
    expect(normalized?.current.runs?.outcomes[0].path).toBeInstanceOf(Float32Array);
    expect(portable.current.runs.outcomes[0].path).not.toBeInstanceOf(Float32Array);
  });

  it('rejects paths with gaps, stray keys, sparse entries or nonnumeric samples', async () => {
    const study = await record();
    const withPath = (path: unknown) => ({
      ...study,
      current: {
        ...study.current,
        runs: { ...caseRuns, outcomes: [{ ...caseRuns.outcomes[0], path }] },
      },
    });

    expect(readStudyRecord(withPath({ 0: 1, 2: 3 }))).toBeUndefined();
    expect(readStudyRecord(withPath({ 0: 1, other: 3 }))).toBeUndefined();
    expect(readStudyRecord(withPath([1, undefined, 3]))).toBeUndefined();
    expect(readStudyRecord(withPath([1, '2', 3]))).toBeUndefined();
    expect(readStudyRecord(withPath([1, 1e100, 3]))).toBeUndefined();
    expect(readStudyRecord(withPath(Array(3)))).toBeUndefined();
  });

  it('drops malformed selections and nested Studies while keeping the scene usable', async () => {
    const study = await record();
    const malformed = { ...study, rows: [{ ...study.rows[0], selection: [2] }] };
    const recursive = { ...study, base: { ...study.base, project: { ...study.base.project, study } } };

    expect(readStudyRecord(malformed)).toBeUndefined();
    expect(readStudyRecord(recursive)).toBeUndefined();
    expect(projectFromSeed({ ...base.project, study: malformed }).study).toBeUndefined();
    expect((await decodeSceneFile(sceneFile(malformed))).project?.study).toBeUndefined();
    expect((await decodeSceneFile(sceneFile(recursive))).parts).toEqual(arm.parts);
  });

  it('rejects corrupt baseline geometry, unsafe sheet transforms and nonfinite result fields', async () => {
    const study = await record();
    const part = study.base.parts[0];
    const changedPart = (extra: unknown) => ({
      ...study,
      base: { ...study.base, parts: [{ ...part, ...(extra as object) }] },
    });

    expect(readStudyRecord(changedPart({ position: [0, Infinity, 0] }))).toBeUndefined();
    expect(readStudyRecord(changedPart({ dimensions: { ...part.dimensions, width: '20' } }))).toBeUndefined();
    expect(readStudyRecord(changedPart({ sheetTransform: Array(16).fill(0) }))).toBeUndefined();
    expect(
      readStudyRecord({ ...study, current: { ...study.current, metrics: { massG: NaN, torque: 'pass' } } }),
    ).toBeUndefined();
    expect(readStudyRecord({ ...study, rows: Array(65).fill(study.rows[0]) })).toBeUndefined();
    expect(readStudyRecord({ ...study, seed: -1 })).toBeUndefined();
  });
});

describe('Study knob validation', () => {
  it('accepts every supported knob and rejects missing, duplicate or excessive values', () => {
    const choices: StudyKnob[] = [
      ...knobs,
      { id: 'servo', kind: 'servo', joints: ['shoulder'], values: ['component:feetech-sts3215|c044'] },
      { id: 'battery', kind: 'battery', parts: ['pack'], values: ['component:ovonic-2s-2200mah'] },
      { id: 'offset', kind: 'battery_offset', values: [[0, -10, 20]] },
      { id: 'feet', kind: 'foot', values: [{ length: 1.2, width: 1.1 }] },
      { id: 'width', kind: 'dimension', part: 'sole', name: 'width', values: [-20, 0, 30] },
    ];

    expect(validateStudyKnobs(choices)).toBe(true);
    expect(validateStudyKnobs([])).toBe(false);
    expect(validateStudyKnobs([...knobs, ...knobs])).toBe(false);
    expect(validateStudyKnobs([{ ...knobs[0], values: [] }])).toBe(false);
    expect(validateStudyKnobs([{ ...knobs[0], values: Array(65).fill(12) }])).toBe(false);
    expect(validateStudyKnobs([{ id: 'bad', kind: 'battery_offset', values: [[0, 1]] }])).toBe(false);
    expect(validateStudyKnobs([{ ...knobs[0], values: [Infinity] }])).toBe(false);
  });
});
