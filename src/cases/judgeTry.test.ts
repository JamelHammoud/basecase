import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { Recording } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { fittingCases, judgeUnjudged } from './judgeTry';
import type { Case } from './schema';
import { referenceTry } from './testing';
import { canMark } from './tryLabels';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const rig = buildRig(robot.joints, robot.parts);

function built(goal: 'touch' | 'pick'): Case {
  const result = buildCase({ goal, world: 'floor' }, builderRobot(rig, robot.parts));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

function robotOnly(recording: Recording, bodies: number): Recording {
  const poses = new Float32Array(recording.frames * bodies * 7);

  for (let f = 0; f < recording.frames; f++)
    poses.set(recording.poses.subarray(f * recording.nbody * 7, f * recording.nbody * 7 + bodies * 7), f * bodies * 7);

  return { ...recording, nbody: bodies, poses };
}

describe('judging a try no Case judged', () => {
  let touch: Case;
  let imported: Recording;
  let model: Awaited<ReturnType<typeof referenceTry>>['source']['model'];

  beforeAll(async () => {
    touch = built('touch');

    const { source } = await referenceTry(await loadMujoco(), touch, robot);
    const bodies = source.model.bodies.reduce((n, b, i) => (b.parts.length ? i + 1 : n), 0);

    model = source.model;
    imported = robotOnly(source.recording, bodies);
  }, 60000);

  it('judges an imported try by a fitting Touch a Point Case, after which it can no longer be marked', async () => {
    const scene = { model, rig, parts: robot.parts, partners: [] };

    expect(imported.nbody).toBeLessThan(model.bodies.length);
    expect(fittingCases([touch], imported, model).map((c) => c.id)).toEqual([touch.id]);

    const judged = await judgeUnjudged([touch], imported, scene);

    expect(judged).toMatchObject({ caseId: touch.id, caseName: 'Touch a Point', verdict: 'passed' });
    expect(canMark('unjudged', { judged: judged! })).toBe(false);
  });

  it('leaves a try unjudged when the only Case probes an object the try never recorded', async () => {
    const kase = {
      ...touch,
      world: { ...touch.world, objects: touch.world.objects.map((o) => ({ ...o, behavior: 'dynamic' as const })) },
    };

    expect(fittingCases([kase], imported, model)).toEqual([]);
    expect(await judgeUnjudged([kase], imported, { model, rig, parts: robot.parts, partners: [] })).toBeNull();
    expect(canMark('unjudged', undefined)).toBe(true);
  });
});
