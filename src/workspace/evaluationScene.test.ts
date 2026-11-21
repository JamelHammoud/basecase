import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { caseRobot, presetCase } from '../cases/testing';
import { runCase } from '../cases/runCase';
import { evaluationReplay } from '../cases/evaluationReplay';
import { ensureEvaluationScene } from './evaluationScene';
import type { TryRecord } from '../cases/tries';

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
});
