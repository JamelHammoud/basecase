import type { NetworkRobot, NetworkRobotAsk } from './networkTypes';
import { isServoAsk, servoFamily, type RobotSpec } from './robotState';
import type { ConnectChoice } from './sceneRobot';
import { G1_WRITABLE_IDS } from './unitreeG1';

export const NETWORK_ROBOT_MISMATCH = 'Choose a robot that matches the scene.';

export function networkRobotChoice(robot: NetworkRobot, choices: readonly ConnectChoice[]): ConnectChoice | undefined {
  const { family } = robot;

  if (!family) return choices[0];

  return choices.find(
    ({ spec }) => spec.family === family || (servoFamily(spec) !== null && servoFamily({ family }) !== null),
  );
}

const sameOrder = <T>(actual: readonly T[], expected: readonly T[]) =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

export function networkRobotMatches(actual: RobotSpec | null | undefined, { spec, joints }: ConnectChoice): boolean {
  if (!actual || actual.ids.length !== joints.length) return false;

  if (isServoAsk(spec))
    return servoFamily(actual) !== null && actual.class === spec.class && sameOrder(actual.ids, spec.ids);

  if (spec.family === 'unitree-g1')
    return actual.family === spec.family && actual.class === 'legged' && sameOrder(actual.ids, G1_WRITABLE_IDS);

  return (
    actual.family === spec.family &&
    actual.class === 'arm' &&
    sameOrder(
      actual.ids,
      spec.joints.map((_, index) => index + 1),
    ) &&
    sameOrder(actual.joints ?? [], spec.joints) &&
    actual.controller?.kind === spec.controller.kind
  );
}

export function networkRobotAsk(robot: NetworkRobot, code = ''): NetworkRobotAsk {
  return {
    host: robot.host,
    port: robot.port,
    ...(robot.id ? { id: robot.id } : {}),
    ...(code ? { code } : {}),
  };
}
