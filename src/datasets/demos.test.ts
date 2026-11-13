import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { caseCommand } from '../cases/caseTarget';
import { caseRunner } from '../cases/runCase';
import { sha256, type TryRecord } from '../cases/tries';
import { caseRobot } from '../cases/testing';
import { fixtureRobots } from '../sim/fixtures/robots';
import { obsSize } from '../sim/policy';
import { trainingJob } from '../sim/trainingJob';
import { buildRig } from '../utils/kinematics';
import { canTrain, DEMO_CONTROL_DT, demoActionScale, demoEpisode } from './demos';
import { DATASET_FPS, episodeData, robotJoints } from './episodes';
import { usableTries } from './usableTries';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

function touchAPoint() {
  const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

async function scriptedTry(seed: number) {
  const mj = await loadMujoco();
  const kase = touchAPoint();
  const result = await caseRunner(mj, kase, caseRobot(arm), { controller: 'reference', record: true }).run(seed);

  return { kase, result, recording: result.recording!, model: result.model };
}

const tryRecord = (id: string, modelHash: string): TryRecord => ({
  id,
  caseId: 'touch',
  robot: 'arm',
  at: '2026-11-13T00:00:00Z',
  passed: true,
  margin: 0.4,
  seconds: 4,
  manifest: { formatVersion: 1, caseHash: 'c', modelHash, seed: 0, frames: 2, dt: 0.02 },
});

describe('demonstration rows from a try', () => {
  it('match episodeData: joint offsets and velocities in, the next row’s targets out', async () => {
    const { kase, recording, model } = await scriptedTry(1);
    const job = trainingJob(model, model.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'demo');
    const command = caseCommand(kase);
    const actionScale = demoActionScale([recording], model, job.defaultPose);
    const demo = demoEpisode(recording, model, { defaultPose: job.defaultPose, actionScale, command });
    const data = episodeData(recording, model, '');
    const n = robotJoints(model).length;

    expect(canTrain(recording, model)).toBe(true);
    expect(DEMO_CONTROL_DT).toBeCloseTo(1 / DATASET_FPS);
    expect(demo.obs).toHaveLength(data.frames.length - 1);
    expect(demo.actions).toHaveLength(demo.obs.length);
    expect(command.some((v) => v !== 0)).toBe(true);

    demo.obs.forEach((row, r) => {
      expect(row).toHaveLength(obsSize(n));
      expect(row.slice(0, 3)).toEqual([0, 0, -1]);
      expect(row.slice(9, 12)).toEqual([...Float32Array.from(command)]);

      for (let k = 0; k < n; k++) {
        expect(row[12 + k]).toBeCloseTo(data.state[r * n + k] - job.defaultPose[k], 5);
        expect(demo.actions[r][k]).toBeCloseTo((data.action[(r + 1) * n + k] - job.defaultPose[k]) / actionScale, 5);
        expect(Math.abs(demo.actions[r][k])).toBeLessThanOrEqual(1);
      }
    });
    expect(demo.actions.flat().some((a) => Math.abs(a) > 0.05)).toBe(true);
  }, 30000);

  it('leave out a try recorded on an older model, and one without joint velocities', async () => {
    const { recording, model } = await scriptedTry(2);
    const hash = await sha256(model.xml);
    const recordings = new Map([
      ['now', recording],
      ['older', recording],
      ['no-dofs', { ...recording, jointDof: undefined }],
    ]);
    const tries = [tryRecord('now', hash), tryRecord('older', 'an-earlier-model'), tryRecord('no-dofs', hash)];
    const { usable } = await usableTries(tries, model, {
      accepts: canTrain,
      load: (id) => Promise.resolve(recordings.get(id)),
    });

    expect(usable.map((u) => u.record.id)).toEqual(['now']);
  }, 30000);
});
