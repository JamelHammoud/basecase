export const PHONE_CALLS = {
  'phone:pair': (phone) => phone.pair(),
  'phone:unpair': (phone) => phone.unpair(),
  'phone:state': (phone) => phone.state(),
};

export function registerPhoneHandlers(ipcMain, phone) {
  for (const [channel, call] of Object.entries(PHONE_CALLS)) ipcMain.handle(channel, () => call(phone));
}
