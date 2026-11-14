import type { NetworkRobot, NetworkRobotAsk } from './networkTypes';

export function networkRobotAsk(robot: NetworkRobot, code = ''): NetworkRobotAsk {
  return {
    host: robot.host,
    port: robot.port,
    ...(robot.id ? { id: robot.id } : {}),
    ...(code ? { code } : {}),
  };
}
