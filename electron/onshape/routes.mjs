export const ONSHAPE_CALLS = {
  'onshape:account': (onshape) => onshape.account(),
  'onshape:set-key': (onshape, payload) => onshape.setKey(payload),
  'onshape:import': (onshape, payload) => onshape.importAssembly(payload),
};

const base64Files = (got) => ({
  ...got,
  files: Object.fromEntries(Object.entries(got.files).map(([k, v]) => [k, Buffer.from(v).toString('base64')])),
});

const OVER_HTTP = { 'onshape:import': base64Files };

export function registerOnshapeHandlers(ipcMain, onshape) {
  for (const [channel, call] of Object.entries(ONSHAPE_CALLS))
    ipcMain.handle(channel, (_e, payload) => call(onshape, payload));
}

export const onshapePostRoutes = (onshape) =>
  Object.entries(ONSHAPE_CALLS).map(([channel, call]) => [
    `/${channel.replace(':', '-')}`,
    async (body) => (OVER_HTTP[channel] ?? ((v) => v))(await call(onshape, body?.arg)),
  ]);
