import { isAppUrl } from './appOrigin.mjs';

const APP_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

const videoOnly = (mediaTypes) =>
  Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every((type) => type === 'video');

export function permissionPolicy(appOrigin) {
  const fromApp = (url) => isAppUrl(url ?? '', appOrigin);

  return {
    request: (permission, details = {}) => {
      if (!fromApp(details.requestingUrl)) return false;

      if (permission === 'media') return videoOnly(details.mediaTypes);

      return APP_PERMISSIONS.has(permission);
    },
    check: (permission, origin, details = {}) => {
      if (!fromApp(origin)) return false;

      if (permission === 'media') return details.mediaType === 'video';

      return APP_PERMISSIONS.has(permission);
    },
  };
}

export function limitPermissions(session, appOrigin) {
  const policy = permissionPolicy(appOrigin);

  session.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(policy.request(permission, details)),
  );
  session.setPermissionCheckHandler((_contents, permission, origin, details) =>
    policy.check(permission, origin, details),
  );
}

export function registerCameraHandlers(ipcMain, { platform, systemPreferences }) {
  ipcMain.handle('camera:access', async () => {
    if (platform !== 'darwin') return true;

    return (await systemPreferences.askForMediaAccess('camera')) === true;
  });
}
