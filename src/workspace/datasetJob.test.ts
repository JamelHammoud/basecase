import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { caseRunner } from '../cases/runCase';
import { caseRobot } from '../cases/testing';
import { sha256, type TryRecord } from '../cases/tries';
import { datasetCameras } from '../datasets/cameras';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { Recording } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { prepareDataset } from './datasetJob';
import { caseDatasetIn, caseDatasetOf } from './useCaseDataset';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

function touchAPoint() {
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

const record = (id: string, modelHash: string, passed: boolean): TryRecord => ({
  id,
  caseId: 'touch-a-point',
  robot: 'arm',
  at: `2026-11-14T00:00:0${id.length}Z`,
  passed,
  margin: passed ? 0.3 : -0.2,
  seconds: 4,
  manifest: { formatVersion: 1, caseHash: `case-${id}`, modelHash, seed: id.length, frames: 2, dt: 0.02 },
});

describe('a dataset made from a Case’s passed tries', () => {
  it('builds the same export job Results built before datasets, so the files come out byte for byte the same', async () => {
    const mj = await loadMujoco();
    const kase = touchAPoint();
    const run = await caseRunner(mj, kase, caseRobot(arm), { controller: 'reference', record: true }).run(1);
    const model = run.model;
    const modelHash = await sha256(model.xml);
    const recordings = new Map<string, Recording>();
    const tries = [record('a', modelHash, true), record('bb', modelHash, false), record('ccc', 'older', true)];

    tries.forEach((t) => recordings.set(t.id, run.recording!));

    const dataset = caseDatasetOf(kase, tries, 'scene-1', 'now');
    const scene = { model, robotName: 'Arm 3DOF', parts: arm.parts, world: [], guests: [] };
    const load = (id: string) => Promise.resolve(recordings.get(id));
    const byId = new Map(tries.map((t) => [t.id, t]));
    const made = await prepareDataset({
      scene,
      kase,
      name: dataset.name,
      task: dataset.task,
      records: dataset.members.map((id) => byId.get(id)!),
      load,
    });
    const visible = arm.parts.filter((p) => p.visible && p.role === 'solid');

    expect(dataset.members).toEqual(['a', 'ccc']);
    expect(made?.used).toBe(1);
    expect(made?.left).toBe(1);
    expect(made?.job).toEqual({
      name: 'touch-a-point-dataset',
      robotType: 'arm_3dof',
      parts: visible,
      world: [],
      model,
      cameras: datasetCameras(visible, []),
      episodes: [
        {
          recording: run.recording,
          task: kase.brief.trim() || kase.name,
          source: { try: 'a', at: tries[0].at, margin: 0.3, case_hash: 'case-a', seed: 1, source: null },
        },
      ],
      slots: [{ id: 'robot', robot: model.robots[0].key }],
      source: { app: 'basecase', case: kase.id, case_name: kase.name, model_hash: modelHash },
    });
  }, 30000);
});

describe('Make Dataset in Results', () => {
  it('opens the dataset it already made from the same passed tries instead of saving a copy', () => {
    const kase = touchAPoint();
    const tries = [record('a', 'm', true), record('bb', 'm', true), record('ccc', 'm', false)];
    const first = caseDatasetOf(kase, tries, 'scene-1', 'now');
    const fromSearch = { ...first, id: 'searched', query: 'arm' };

    expect(caseDatasetIn([fromSearch, first], kase, ['bb', 'a'])).toBe(first);
    expect(caseDatasetIn([first], kase, ['a'])).toBeNull();
    expect(caseDatasetIn([fromSearch], kase, ['a', 'bb'])).toBeNull();
  });
});
