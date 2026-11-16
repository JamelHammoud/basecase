import { locatePose } from '../sites/registration.mjs';
import { insist, identifier, text } from './validation.mjs';

export function checkedPose(value, observedAt) {
  if (value === null || value === undefined) return null;

  insist(value && ['reported', 'estimated'].includes(value.quality));
  insist(value.floor === undefined || (typeof value.floor === 'string' && value.floor.length <= 200));

  if (value.frame === 'facility') {
    insist(
      Array.isArray(value.pointM) &&
        value.pointM.length === 3 &&
        value.pointM.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000),
    );
    insist(typeof value.facility === 'string' && /^[0-9a-f]{64}$/.test(value.facility));

    return {
      frame: value.frame,
      pointM: value.pointM,
      site: identifier(value.site),
      facility: value.facility,
      quality: value.quality,
      floor: value.floor,
      observedAt,
    };
  }

  insist(locatePose(value, null));

  return {
    frame: 'WGS84',
    latitude: value.latitude,
    longitude: value.longitude,
    altitudeM: value.altitudeM,
    datum: 'WGS84',
    vertical: value.vertical,
    quality: value.quality,
    floor: value.floor,
    observedAt,
  };
}

export function checkedWork(value) {
  if (value === null || value === undefined) return null;

  return { current: value.current ? text(value.current, 200) : null, next: value.next ? text(value.next, 200) : null };
}
