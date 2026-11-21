import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { runCase } from './runCase';
import { caseRobot, presetCase } from './testing';
import { encodeRecording, decodeRecording } from './recordingFile';
import { evaluationReplay, readEvaluationReplay, replayOfEvaluation } from './evaluationReplay';
import { decodeSceneFile } from '../utils/sceneFile';

it('retains an exact independent model, Case, scene and failure through ordinary recording bytes', async () => {
  const mj = await loadMujoco();
  const robot = fixtureRobots().find((value) => value.id === 'rover-diff')!;
  const weak = { ...robot, joints: robot.joints.map((joint) => ({ ...joint, effortNm: 0.075 })) };
  const kase = presetCase(robot, 'reach-the-flag');
  const result = await runCase(mj, kase, caseRobot(weak), {
    controller: 'reference',
    seed: 7,
    record: true,
    fixedCase: true,
    worldRandomization: false,
  });
  const scene = {
    name: 'Weak rover',
    globalGoal: '',
    parts: weak.parts,
    annotations: [],
    project: { ...DEFAULT_PROJECT, joints: weak.joints, cases: [kase] },
  };
  const retained = await evaluationReplay(mj, result, {
    scene,
    meshes: {},
    evaluation: 'a'.repeat(64),
    revision: 'b'.repeat(64),
    seed: 7,
  });
  const decoded = decodeRecording(encodeRecording({ ...result.recording!, evaluation: retained }))!;
  const replay = replayOfEvaluation(decoded)!;

  expect(encodeRecording(decoded)).toEqual(encodeRecording({ ...result.recording!, evaluation: retained }));

  expect(replay.model).toEqual(result.model);
  expect(replay.kase).toEqual(result.case);
  expect(replay.trace).toEqual(result.trace);
  expect(replay.passed).toBe(false);
  expect(replay.trips.length).toBeGreaterThan(0);
  expect((await decodeSceneFile(decoded.evaluation!.scene)).name).toBe('Weak rover');
  expect(readEvaluationReplay({ ...retained, seed: 8 })).toBeNull();
  expect(decodeRecording(encodeRecording({ ...decoded, evaluation: { ...retained, seed: 8 } }))).toBeNull();
});

it('refuses executable or external model inputs even with a recomputed content hash', async () => {
  const { evaluationReplayHash } = await import('./evaluationReplayValidation');
  const value = {
    version: 1,
    evaluation: 'a'.repeat(64),
    revision: 'b'.repeat(64),
    seed: 7,
    scene: new Uint8Array(),
    meshes: {},
    model: { version: 2, xml: '<mujoco><include file="../outside.xml"/></mujoco>', bodies: [], joints: [], robots: [] },
    efforts: { peaks: [], forces: [] },
    trips: [],
    margin: -1,
    passed: false,
  };

  expect(readEvaluationReplay({ ...value, hash: evaluationReplayHash(value) })).toBeNull();
});
