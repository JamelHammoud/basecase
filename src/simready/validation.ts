import { parseAssetUrl } from '../../electron/simready/catalog.mjs';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validSimReadyFields(part: unknown): boolean {
  if (!record(part)) return false;

  try {
    const ref = part.simready;
    const visual = record(part.mesh) ? part.mesh.visual : undefined;

    if (ref === undefined && visual === undefined) return true;

    if (!record(ref) || typeof ref.url !== 'string') return false;

    const asset = parseAssetUrl(ref.url);

    if (visual === undefined) return true;

    if (!record(visual)) return false;

    const key = `${asset.namespace}--${asset.dataset}--${asset.packageName}--${asset.sha.slice(0, 12)}`;

    return (
      visual.key === key &&
      typeof visual.node === 'string' &&
      visual.node.length > 0 &&
      Array.isArray(visual.matrix) &&
      visual.matrix.length === 16 &&
      visual.matrix.every((n) => typeof n === 'number' && Number.isFinite(n))
    );
  } catch {
    return false;
  }
}
