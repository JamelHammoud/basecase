export function readTryBranch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  if (value.version !== 1 || typeof value.checkpoint !== 'string' || !/^[0-9a-f]{64}$/.test(value.checkpoint))
    return null;

  if (!Number.isInteger(value.frame) || value.frame < 0 || value.frame > 29_999) return null;

  if (!Number.isFinite(value.time) || value.time < 0 || value.time > 600) return null;

  return { version: 1, checkpoint: value.checkpoint, frame: value.frame, time: value.time };
}
