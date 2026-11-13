import { isAppUrl } from './appOrigin.mjs';

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);
const REFUSED_CAMERA = new Set(['denied', 'restricted']);

export function isAllowedPermission(permission, origin, appOrigin) {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(origin ?? '', appOrigin);
}

export function isVideoOnly(mediaTypes) {
  return Array.isArray(mediaTypes) && mediaTypes.length === 1 && mediaTypes[0] === 'video';
}

export function isAppVideoRequest(details, appOrigin) {
  return isAppUrl(details?.requestingUrl ?? '', appOrigin) && isVideoOnly(details?.mediaTypes);
}

export function isAppVideoCheck(origin, details, appOrigin) {
  return isAppUrl(origin ?? '', appOrigin) && details?.mediaType === 'video';
}

export async function cameraAllowed({ platform, systemPreferences }) {
  if (platform !== 'darwin') return true;

  if (REFUSED_CAMERA.has(systemPreferences.getMediaAccessStatus('camera'))) return false;

  return (await systemPreferences.askForMediaAccess('camera')) === true;
}

export async function decideRequest(permission, details, options) {
  if (permission !== 'media') return isAllowedPermission(permission, details?.requestingUrl, options.appOrigin);

  if (!isAppVideoRequest(details, options.appOrigin)) return false;

  return cameraAllowed(options);
}

export function decideCheck(permission, origin, details, appOrigin) {
  if (permission === 'media') return isAppVideoCheck(origin, details, appOrigin);

  return isAllowedPermission(permission, origin, appOrigin);
}

export function installPermissions(ses, options) {
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    decideRequest(permission, details, options).then(
      (granted) => callback(granted === true),
      () => callback(false),
    );
  });
  ses.setPermissionCheckHandler((_contents, permission, origin, details) =>
    decideCheck(permission, origin, details, options.appOrigin),
  );
}
