import { Matrix4, Vector3 } from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';

const ecefOf = (lat, lon, height) =>
  WGS84_ELLIPSOID.getCartographicToPosition((lat * Math.PI) / 180, (lon * Math.PI) / 180, height, new Vector3());

function requireValue(value) {
  if (!value) throw new Error('Declare site registration and vertical frame');
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

export function verticalOffset(frame) {
  requireValue(frame && ['ellipsoid', 'orthometric', 'local'].includes(frame.kind));

  if (frame.kind === 'ellipsoid') return 0;

  requireValue(
    finite(frame.offsetM) &&
      Math.abs(frame.offsetM) <= 100000 &&
      typeof frame.reference === 'string' &&
      frame.reference.length > 0 &&
      frame.reference.length <= 200,
  );

  return frame.offsetM;
}

function controlEcef(point, frame) {
  requireValue(finite(point.latitude) && Math.abs(point.latitude) <= 90);
  requireValue(finite(point.longitude) && Math.abs(point.longitude) <= 180);
  requireValue(finite(point.altitudeM) && Math.abs(point.altitudeM) <= 100000);
  requireValue(
    Array.isArray(point.local) &&
      point.local.length === 3 &&
      point.local.every((n) => finite(n) && Math.abs(n) <= 100000),
  );

  return ecefOf(point.latitude, point.longitude, point.altitudeM + verticalOffset(frame));
}

export function registerControls(value) {
  const input = value;

  requireValue(input?.datum === 'WGS84' && Array.isArray(input.controls) && input.controls.length === 2);

  const [a, b] = input.controls;
  const first = controlEcef(a, input.vertical);
  const second = controlEcef(b, input.vertical);
  const basis = WGS84_ELLIPSOID.getEastNorthUpFrame(
    (a.latitude * Math.PI) / 180,
    (a.longitude * Math.PI) / 180,
    a.altitudeM + verticalOffset(input.vertical),
    new Matrix4(),
  );
  const delta = second.clone().applyMatrix4(basis.clone().invert());
  const source = new Vector3().fromArray(b.local).sub(new Vector3().fromArray(a.local));
  const sourceLength = Math.hypot(source.x, source.y);
  const targetLength = Math.hypot(delta.x, delta.y);

  requireValue(sourceLength >= 1 && Math.abs(sourceLength - targetLength) <= Math.max(0.05, sourceLength * 0.001));
  requireValue(Math.abs(source.z - delta.z) < 0.1);

  const angle = Math.atan2(delta.y, delta.x) - Math.atan2(source.y, source.x);
  const rotation = new Matrix4().makeRotationZ(angle);
  const shift = new Vector3().fromArray(a.local).applyMatrix4(rotation).negate();
  const local = rotation.setPosition(shift);
  const matrix = basis.multiply(local).toArray();

  requireValue(
    first.distanceTo(new Vector3().fromArray(a.local).applyMatrix4(new Matrix4().fromArray(matrix))) < 0.001,
  );

  const vertical = { kind: input.vertical.kind };

  if (vertical.kind !== 'ellipsoid')
    Object.assign(vertical, { offsetM: input.vertical.offsetM, reference: input.vertical.reference });

  const controls = input.controls.map((point) => ({
    local: [...point.local],
    latitude: point.latitude,
    longitude: point.longitude,
    altitudeM: point.altitudeM,
  }));

  return { datum: 'WGS84', vertical, controls, matrix };
}
export function checkedRegistration(value) {
  return registerControls(value);
}
export function locatePose(pose, registration) {
  if (!pose || !['reported', 'estimated'].includes(pose.quality)) return null;

  if (pose.frame === 'facility') return locateFacility(pose, registration);

  if (pose.frame !== 'WGS84' || pose.datum !== 'WGS84' || !pose.vertical) return null;

  try {
    controlEcef(
      { local: [0, 0, 0], latitude: pose.latitude, longitude: pose.longitude, altitudeM: pose.altitudeM },
      pose.vertical,
    );

    return {
      latitude: pose.latitude,
      longitude: pose.longitude,
      altitudeM: pose.altitudeM + verticalOffset(pose.vertical),
      quality: pose.quality,
      floor: pose.floor,
    };
  } catch {
    return null;
  }
}

function locateFacility(pose, registration) {
  if (!registration || !pose.pointM?.every(finite)) return null;

  const ecef = new Vector3().fromArray(pose.pointM).applyMatrix4(new Matrix4().fromArray(registration.matrix));
  const point = { lat: 0, lon: 0, height: 0 };

  WGS84_ELLIPSOID.getPositionToCartographic(ecef, point);

  return {
    latitude: (point.lat * 180) / Math.PI,
    longitude: (point.lon * 180) / Math.PI,
    altitudeM: point.height,
    quality: pose.quality,
    floor: pose.floor,
  };
}
