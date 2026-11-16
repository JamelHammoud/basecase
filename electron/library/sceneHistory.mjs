const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

export function checkedSceneHistory(value) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string' || value.length > MAX_HISTORY_BYTES || new TextEncoder().encode(value).byteLength > MAX_HISTORY_BYTES)
    throw new Error('The scene history is too large. Export a scene copy.');

  return value;
}
