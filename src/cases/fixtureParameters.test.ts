import { expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const robot = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);

it.each(['lid', 'drawer', 'button'] as const)(
  'edits %s stops, resistance and return spring in the existing builder representation',
  (goal) => {
    const built = buildCase(
      {
        goal,
        world: 'floor',
        values: {
          fixtureLowerStop: -2,
          fixtureTravel: 15,
          fixtureFriction: 20,
          fixtureDamping: 40,
          fixtureStiffness: 3000,
          fixtureSpringref: 5,
        },
      },
      robot,
    );

    expect(built.ok).toBe(true);

    if (!built.ok) throw new Error(built.problem);

    expect(built.kase.world.objects.find((object) => object.joint)!.joint).toMatchObject({
      range: [-2, 15],
      damping: 0.04,
      frictionloss: 0.02,
      stiffness: 3,
      springref: 5,
    });
  },
);
