import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { runCase } from '../cases/runCase';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { embeddedTargetParts, fingerPhysics } from './physics.fixtures';

it('keeps the exact selected target separate from embedded source geometry through ordinary model preparation', async () => {
  const mj = await loadMujoco();
  const target = selectedPickTargets()[0];
  const original = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const fixture = { ...original, parts: [...original.parts, target] };
  const rig = buildRig(fixture.joints, fixture.parts);
  const built = buildCase({ goal: 'pick', world: 'floor', pickTarget: target }, builderRobot(rig, fixture.parts));

  if (!built.ok) throw new Error(built.problem);

  const parts = embeddedTargetParts(fixture.parts, target.id);
  const result = await runCase(
    mj,
    built.kase,
    { id: 'source-identity', parts, joints: fixture.joints, ...fingerPhysics(parts) },
    { controller: 'reference', record: true },
  );
  const bodies = result.model.bodies.filter(
    (body) => body.parts.includes(target.id) || body.world?.includes(target.id),
  );

  expect(bodies).toHaveLength(1);
  expect(bodies[0].world).toEqual([target.id]);
  expect(result.passed).toBe(true);
  expect(result.case.world.objects.find((object) => object.id === target.id)!.geometry).toEqual(target);
});
