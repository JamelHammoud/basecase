import { installRobot } from './robotInstall.mjs';

export const ROBOT_CALLS = {
  'robot:install': (_fleet, request) => installRobot(request),
  'robot:discover': (fleet) => fleet.discover(),
  'robot:network-connect': (fleet, ask, unit) => fleet.connectNetwork(ask, unit),
  'robot:connect': (fleet, spec, unit) => fleet.connect(spec, unit),
  'robot:command': (fleet, command, unit) => fleet.command(command, unit),
  'robot:disconnect': (fleet, unit) => fleet.disconnect(unit),
  'robot:policy': (fleet, refs, unit) => fleet.policy(refs, unit),
  'robot:calibration': (fleet, joints, unit) => fleet.calibrate(joints, unit),
  'robot:state': (fleet, unit) => fleet.state(unit),
  'robot:record': (fleet, sample, unit) => fleet.record(sample, unit),
  'robot:units': (fleet) => fleet.units(),
  'robot:rollback': (fleet, unit) => fleet.rollBack(unit),
};

export function registerRobotHandlers(ipcMain, fleet) {
  for (const [channel, call] of Object.entries(ROBOT_CALLS))
    ipcMain.handle(channel, (_e, ...args) => call(fleet, ...args));
}
