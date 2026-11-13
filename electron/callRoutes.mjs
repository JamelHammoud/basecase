export function registerCalls(ipcMain, calls, target) {
  for (const [channel, call] of Object.entries(calls)) ipcMain.handle(channel, (_e, payload) => call(target, payload));
}

export const postRoutesOf = (calls, target) =>
  Object.entries(calls).map(([channel, call]) => [`/${channel.replace(':', '-')}`, (body) => call(target, body?.arg)]);
