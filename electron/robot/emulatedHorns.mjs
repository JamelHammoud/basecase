const HORN_SEED = 0x1badb002;
const COUNTS_PER_TURN = 4096;
const CENTER_COUNTS = 2048;
const REVERSED_ONE_IN = 4;

export const MAX_HORN_OFFSET_COUNTS = 136;

function mix32(value) {
  let z = (value + 0x9e3779b9) | 0;

  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);

  return (z ^ (z >>> 16)) >>> 0;
}

export function emulatedHorn(id) {
  const offsetHash = mix32(id ^ HORN_SEED);
  const directionHash = mix32(offsetHash);

  return {
    offsetCounts: (offsetHash % (2 * MAX_HORN_OFFSET_COUNTS + 1)) - MAX_HORN_OFFSET_COUNTS,
    direction: directionHash % REVERSED_ONE_IN === 0 ? -1 : 1,
  };
}

export const linkRadians = (counts, horn) =>
  (horn.direction * (counts - CENTER_COUNTS - horn.offsetCounts) * 2 * Math.PI) / COUNTS_PER_TURN;

function withLinkAngle(joint, hornFor) {
  if (!joint || typeof joint !== 'object') return joint;

  const known = typeof joint.position === 'number' && typeof joint.id === 'number';

  return { ...joint, link_rad: known ? linkRadians(joint.position, hornFor(joint.id)) : null };
}

export function statusWithLinkAngles(status, hornFor) {
  if (!Array.isArray(status.joints)) return status;

  return { ...status, joints: status.joints.map((joint) => withLinkAngle(joint, hornFor)) };
}
