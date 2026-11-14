import { isAppUrl } from './appOrigin.mjs';

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen', 'midi']);
const MEDIA_DEVICES = { video: 'camera', audio: 'microphone' };
const REFUSED_ACCESS = new Set(['denied', 'restricted']);

export function isAllowedPermission(permission, origin, appOrigin) {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(origin ?? '', appOrigin);
}

const isMediaType = (type) => Object.hasOwn(MEDIA_DEVICES, type);

export function mediaDevices(mediaTypes) {
  if (!Array.isArray(mediaTypes) || mediaTypes.length === 0 || !mediaTypes.every(isMediaType)) return null;

  return [...new Set(mediaTypes.map((type) => MEDIA_DEVICES[type]))];
}

export function appMediaRequest(details, appOrigin) {
  if (!isAppUrl(details?.requestingUrl ?? '', appOrigin)) return null;

  return mediaDevices(details?.mediaTypes);
}

export function isAppMediaCheck(origin, details, appOrigin) {
  return isAppUrl(origin ?? '', appOrigin) && isMediaType(details?.mediaType);
}

async function deviceAllowed(device, systemPreferences) {
  if (REFUSED_ACCESS.has(systemPreferences.getMediaAccessStatus(device))) return false;

  return (await systemPreferences.askForMediaAccess(device)) === true;
}

export async function devicesAllowed(devices, { platform, systemPreferences }) {
  if (platform !== 'darwin') return true;

  for (const device of devices) {
    if (!(await deviceAllowed(device, systemPreferences))) return false;
  }

  return true;
}

export async function decideRequest(permission, details, options) {
  if (permission !== 'media') return isAllowedPermission(permission, details?.requestingUrl, options.appOrigin);

  const devices = appMediaRequest(details, options.appOrigin);

  return devices !== null && devicesAllowed(devices, options);
}

export function decideCheck(permission, origin, details, appOrigin) {
  if (permission === 'media') return isAppMediaCheck(origin, details, appOrigin);

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
