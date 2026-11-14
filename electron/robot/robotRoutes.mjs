export const ROBOT_CALLS = {
  'robot:connect': (link, spec) => link.connect(spec),
  'robot:command': (link, command) => link.command(command),
  'robot:disconnect': (link) => link.disconnect(),
  'robot:policy': (link, id) => link.policy(id),
  'robot:calibration': (link, joints) => link.calibrate(joints),
  'robot:state': (link) => link.state(),
  'robot:take-scene': (link, context) => link.takeScene(context),
  'robot:take-sample': (link, sample) => link.takeSample(sample),
};

export function registerRobotHandlers(ipcMain, link) {
  for (const [channel, call] of Object.entries(ROBOT_CALLS))
    ipcMain.handle(channel, (_e, payload) => call(link, payload));
}
