import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { checkFit, type FitRun } from './fitCheck';
import { caseRobot, touchTheDots } from './testing';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

async function fitOf(id: string, caseFrom = 'arm-3dof') {
  const mj = await loadMujoco();
  const r = robot(id);
  const rig = buildRig(r.joints, r.parts);
  const run = async ({ model, controller, seconds, commands }: FitRun) => {
    const engine = new SimEngine(mj, model);
    const due = [...(commands ?? [])];

    engine.setController(controller);

    for (let t = 0; t < seconds; t += 0.02) {
      while (due.length && due[0].at <= t + 1e-9) engine.command(due.shift()!.command);

      engine.step(0.02);
    }

    const stats = engine.stats();

    engine.dispose();

    return stats;
  };

  return checkFit({
    kase: touchTheDots(robot(caseFrom)),
    rig,
    parts: r.parts,
    build: async () => buildMjcf({ ...caseRobot(r), rig, project: DEFAULT_PROJECT }),
    run,
  });
}

describe('robot fit', () => {
  it('passes an arm on an arm Case and skips the fall check', async () => {
    const rows = await fitOf('arm-6dof');

    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['slot', 'pass'],
      ['compile', 'pass'],
      ['settle', 'pass'],
      ['body', 'pass'],
      ['fall', 'skip'],
    ]);
  });

  it('says when a hexapod does not fit an arm Case, and still checks its walk', async () => {
    const rows = await fitOf('hexapod');

    expect(rows.find((r) => r.id === 'slot')).toMatchObject({ state: 'fail', detail: 'No' });
    expect(rows.find((r) => r.id === 'fall')?.state).toBe('pass');
  });

  it('a weak quadruped fails its fall check', async () => {
    const rows = await fitOf('must-fail-weak-quad');

    expect(rows.find((r) => r.id === 'fall')?.state).toBe('fail');
  });
});
