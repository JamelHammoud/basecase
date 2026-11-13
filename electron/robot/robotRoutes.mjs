export const ROBOT_CALLS = {
  'robot:connect': (link, spec) => link.connect(spec),
  'robot:command': (link, command) => link.command(command),
  'robot:disconnect': (link) => link.disconnect(),
  'robot:state': (link) => link.state(),
};

export function registerRobotHandlers(ipcMain, link) {
  for (const [channel, call] of Object.entries(ROBOT_CALLS))
    ipcMain.handle(channel, (_e, payload) => call(link, payload));
}

export const LEADER_CALLS = {
  'leader:connect': (link, spec) => link.connect(spec),
  'leader:disconnect': (link) => link.disconnect(),
  'leader:state': (link) => link.state(),
};

export function registerLeaderHandlers(ipcMain, link) {
  for (const [channel, call] of Object.entries(LEADER_CALLS))
    ipcMain.handle(channel, (_e, payload) => call(link, payload));
}
