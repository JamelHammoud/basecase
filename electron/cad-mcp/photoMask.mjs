import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MASK_SIDE = 900;
let vision;

function nativeVision() {
  if (vision !== undefined) return vision;

  try {
    const addon = require('../native/vision/build/Release/vision.node');

    vision = addon.available ? addon : null;
  } catch {
    vision = null;
  }

  return vision;
}

export const visionAvailable = () => Boolean(nativeVision());

export async function photoMasks(buf, maxSide = MASK_SIDE) {
  const addon = nativeVision();

  if (!addon) return null;

  try {
    const found = await addon.foregroundMasks(Buffer.from(buf), maxSide);

    if (!found) return { width: 0, height: 0, instances: [] };

    return {
      width: found.width,
      height: found.height,
      instances: found.instances.map((m) => Buffer.from(m).toString('base64')),
    };
  } catch {
    return null;
  }
}
