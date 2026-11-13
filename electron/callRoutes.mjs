export function registerCalls(ipcMain, calls, target) {
  for (const [channel, call] of Object.entries(calls)) ipcMain.handle(channel, (_e, payload) => call(target, payload));
}

const asIs = (reply) => reply;

export const postRoutesOf = (calls, target, overHttp = {}) =>
  Object.entries(calls).map(([channel, call]) => [
    `/${channel.replace(':', '-')}`,
    async (body) => (overHttp[channel] ?? asIs)(await call(target, body?.arg)),
  ]);
