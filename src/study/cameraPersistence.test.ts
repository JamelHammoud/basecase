import { expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { readStudyRecord } from './record';
import { studyFingerprint, studyScene, gradeStudy } from './study';
import { summarizeVisibility } from './visibility';
import type { StudyKnob, StudyRecord, StudyScene } from './types';

it('reopens exact camera choices and recording identity and rejects damaged measurements', async () => {
  const part = {
    ...box('eye', [0, 200, 0], [20, 20, 20], 0),
    kind: 'component' as const,
    componentId: 'raspberry-pi-camera-3',
  };
  const base: StudyScene = { parts: [part], project: DEFAULT_PROJECT, measures: {}, triangles: {} };
  const knobs: StudyKnob[] = [
    { id: 'lens', kind: 'camera_lens', part: part.id, values: [{ model: 'fisheye', fovDeg: 180 }] },
  ];
  const scene = await studyScene(base, knobs, [0]);
  const visibility = summarizeVisibility({
    key: 'recording-hash',
    width: 320,
    height: 240,
    times: [0, 1],
    end: 2,
    targets: [{ id: 'obstacle', minPixels: 20 }],
    cameras: [part.id],
    captures: [[{ obstacle: { pixels: 20, potential: 30 } }, null]],
  });
  const current = { ...gradeStudy(base, { knobs: [], selection: [] }), visibility };
  const row = { ...gradeStudy(scene, { knobs, selection: [0] }), visibility };
  const study: StudyRecord = {
    knobs,
    rows: [row],
    current,
    seed: 1,
    total: 1,
    baseKey: studyFingerprint(base.parts, base.project),
    base: { parts: base.parts, project: base.project },
    visibility: { tryId: 'saved-try', cameras: [part.id], targets: [{ id: 'obstacle', minPixels: 20 }], samples: 2 },
  };
  const file = await encodeSceneFile({
    name: 'Camera choices',
    globalGoal: '',
    parts: base.parts,
    project: { ...DEFAULT_PROJECT, study },
    annotations: [],
  });
  const reopened = await decodeSceneFile(file);

  expect(reopened.project?.study).toEqual(JSON.parse(JSON.stringify(study)));
  expect(
    readStudyRecord({ ...study, rows: [{ ...row, visibility: { ...visibility, key: 'other-recording' } }] }),
  ).toBeUndefined();
  expect(
    readStudyRecord({ ...study, current: { ...current, visibility: { ...visibility, times: [1, 0] } } }),
  ).toBeUndefined();
  expect(readStudyRecord({ ...study, visibility: { ...study.visibility, targets: [] } })).toBeUndefined();
});
