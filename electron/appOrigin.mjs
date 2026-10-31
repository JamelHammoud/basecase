const hostOrigin = ({ protocol, host }) => (host ? `${protocol}//${host}` : 'null');

export function originOf(url) {
  try {
    const parsed = new URL(url);

    return parsed.origin === 'null' ? hostOrigin(parsed) : parsed.origin;
  } catch {
    return null;
  }
}

export function isAppUrl(url, appUrl) {
  const origin = originOf(url);

  return origin !== null && origin !== 'null' && origin === originOf(appUrl);
}

export function isExternalWebUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function trustedIpc(ipcMain, appUrl) {
  const fromApp = (event) => event.senderFrame?.parent === null && isAppUrl(event.senderFrame.url, appUrl);

  return {
    handle: (channel, listener) =>
      ipcMain.handle(channel, (event, ...args) => {
        if (!fromApp(event)) throw new Error(`Refused ${channel} from ${event.senderFrame?.url ?? 'an unknown frame'}`);

        return listener(event, ...args);
      }),
    on: (channel, listener) =>
      ipcMain.on(channel, (event, ...args) => {
        if (fromApp(event)) listener(event, ...args);
      }),
  };
}
