import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { sceneModel } from '../datasets/import/fixtures';
import { armReplay, fixtureArm } from '../datasets/labelFixtures';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { touchTheDots } from '../cases/testing';
import { encodeRecording } from '../cases/recordingFile';
import { storedTryOf, tryRecordOf, readStoredTry } from '../cases/tryFile';
import { tryManifest, scoreTry } from '../cases/tries';
import { buildRig } from '../utils/kinematics';
import { caseTryRecord } from './caseTryRecord';

it('scores and retains a complete ordinary branch with its original Case and parent, without editing source bytes', async () => {
  const mj = await loadMujoco();
  const robot = fixtureArm();
  const model = sceneModel([robot]);
  const recording = armReplay(mj, model, { frames: 8, fps: 50, radians: (frame) => frame * 0.01 });
  const replay = { robot, model, recording };
  const rig = buildRig(replay.robot.joints, replay.robot.parts);
  const kase = touchTheDots(replay.robot);
  const staged = stageCase(kase, { rig, parts: replay.robot.parts }, []);
  const scoring = {
    kase: staged.kase,
    model: replay.model,
    ...stagedEffectors(staged, { rig, parts: replay.robot.parts }),
  };
  const original = encodeRecording(replay.recording);
  const manifest = await tryManifest(scoring.kase, replay.model, replay.recording);
  const source = {
    id: 'parent',
    caseId: kase.id,
    robot: 'Arm',
    at: '2026-11-20T00:00:00.000Z',
    passed: false,
    margin: -1,
    seconds: replay.recording.frames * replay.recording.dt,
    manifest,
  };
  const provenance = { version: 1 as const, checkpoint: 'c'.repeat(64), frame: 1, time: replay.recording.dt };
  const record = await caseTryRecord({
    kase,
    model: replay.model,
    recording: replay.recording,
    scene: { rig, parts: replay.robot.parts, partners: [] },
    branch: { source, scoring, provenance },
  });
  const expected = await scoreTry({ ...scoring, recording: replay.recording });
  const stored = storedTryOf(record, {
    sceneId: 'scene',
    caseName: kase.name,
    joints: replay.model.joints.map((j) => j.id),
    input: null,
  });
  const reopened = tryRecordOf(readStoredTry(JSON.parse(JSON.stringify(stored)))!);

  expect(record.id).not.toBe(source.id);
  expect(record.passed).toBe(expected.passed);
  expect(record.margin).toBe(expected.margin);
  expect(reopened.manifest.source).toBe(source.id);
  expect(reopened.manifest.branch).toEqual(provenance);
  expect(record.manifest.caseHash).toBe(source.manifest.caseHash);
  expect(encodeRecording(replay.recording)).toEqual(original);
});
