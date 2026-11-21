import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { caseRobot, presetCase } from '../cases/testing';
import { runCase } from '../cases/runCase';
import { evaluationReplay, replayOfEvaluation } from '../cases/evaluationReplay';
import { ensureEvaluationScene } from './evaluationScene';
import type { TryRecord } from '../cases/tries';
import type { Simulation } from '../sim/useSimulation';
import { buildRig } from '../utils/kinematics';
import { prepareOpening } from './tryTimelineOpening';
import { importTryArchive } from '../cases/tryArchive';
import { evaluationRecording } from '../cases/evaluation';
import { evaluationReplayHash } from '../cases/evaluationReplayValidation';
import { encodeSceneFile } from '../utils/sceneFile';

it('opens the recorded source in a new scene when the working geometry differs, preserving the working scene', async () => {
  const mj = await loadMujoco();
  const robot = fixtureRobots().find((value) => value.id === 'rover-diff')!;
  const kase = presetCase(robot, 'reach-the-flag');
  const result = await runCase(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    record: true,
    seed: 7,
  });
  const scene = {
    name: 'Recorded rover',
    parts: robot.parts,
    globalGoal: '',
    annotations: [],
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [result.case] },
  };
  const source = await evaluationReplay(mj, result, {
    scene,
    meshes: {},
    evaluation: 'a'.repeat(64),
    revision: 'b'.repeat(64),
    seed: 7,
  });
  const input = {
    record: { id: 'saved-evaluation' } as TryRecord,
    recording: { ...result.recording!, evaluation: source },
  };
  const working = { parts: robot.parts.map((part) => ({ ...part, color: '#eeeeee' })), project: scene.project };
  const before = structuredClone(working);
  const newScene = vi.fn();

  expect(await ensureEvaluationScene({ newScene }, working, input)).toBe(false);
  expect(working).toEqual(before);
  expect(newScene).toHaveBeenCalledWith(
    expect.objectContaining({ sceneName: scene.name, parts: scene.parts, openTry: 'saved-evaluation' }),
  );
  newScene.mockClear();
  expect(await ensureEvaluationScene({ newScene }, { parts: scene.parts, project: scene.project }, input)).toBe(true);
  expect(newScene).not.toHaveBeenCalled();

  const sim = {
    status: 'off',
    drive: { active: false },
    setWorld: vi.fn(),
    worldNow: () => ({ items: [], guests: { parts: [], joints: [] } }),
    modelNow: () => source.model,
    start: vi.fn(),
    scrub: vi.fn(async () => source.efforts),
  } as unknown as Simulation;
  const opened = await prepareOpening(
    { sim, rig: buildRig(robot.joints, robot.parts), parts: robot.parts, cases: [], partners: () => [] },
    input.record,
    input.recording,
    { seeded: replayOfEvaluation(input.recording), previous: null },
  );

  expect(opened?.scene?.kase).toBe(source.kase);
  expect(opened?.scene?.scoring.model).toBe(source.model);
  expect(opened?.scene?.trace).toBe(source.trace);

  const missingMeshScene = await encodeSceneFile({
    ...scene,
    parts: scene.parts.map((part, index) => (index ? part : { ...part, componentId: 'missing-frozen-mesh' })),
  });
  const { hash, ...body } = source;

  expect(hash).toBe(evaluationReplayHash(body));

  const changed = { ...body, scene: missingMeshScene };
  const archive = evaluationRecording(
    { ...result, recording: { ...result.recording!, evaluation: { ...changed, hash: evaluationReplayHash(changed) } } },
    { id: 'missing-mesh', revision: source.revision, evaluation: source.evaluation, seed: source.seed },
  );
  const keep = vi.fn();

  await expect(
    importTryArchive(archive, { manifests: async () => [], bytes: async () => null, keep }),
  ).rejects.toThrow();
  expect(keep).not.toHaveBeenCalled();
});
