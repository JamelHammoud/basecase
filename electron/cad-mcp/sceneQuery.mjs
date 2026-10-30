import { partLine } from './sceneText.mjs';

const MAX_MATCHES = 40;

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9.]+|-/)
    .filter(Boolean);

function matchesText(p, query) {
  if (!query) return true;

  const hay = words([p.id, p.name, p.group, p.kind, p.catalog, p.supply, p.material].join(' '));

  return words(query).every((w) => hay.some((h) => h.startsWith(w)));
}

const matchesGroup = (p, group) => !group || (p.group ?? '').toLowerCase().includes(group.trim().toLowerCase());

const matchesKind = (p, kind) =>
  !kind || [p.kind, p.catalog, p.supply].some((v) => (v ?? '').toLowerCase().includes(kind.trim().toLowerCase()));

function overlapsRegion(p, region) {
  if (!region) return true;

  return [0, 1, 2].every((k) => p.bounds.max[k] >= region.min[k] && p.bounds.min[k] <= region.max[k]);
}

function distanceToBox(point, box) {
  const d = [0, 1, 2].map((k) => Math.max(box.min[k] - point[k], 0, point[k] - box.max[k]));

  return Math.hypot(...d);
}

const centre = (box) => [0, 1, 2].map((k) => (box.min[k] + box.max[k]) / 2);
const nearness = (point, p) =>
  distanceToBox(point, p.bounds) + 1e-3 * Math.hypot(...centre(p.bounds).map((v, k) => v - point[k]));

const isNear = (p, near) => !near || distanceToBox(near.point, p.bounds) <= near.radius;

export function findInScene(snap, { query, group, kind, region, near }) {
  const found = snap.parts.filter(
    (p) =>
      matchesText(p, query) &&
      matchesGroup(p, group) &&
      matchesKind(p, kind) &&
      overlapsRegion(p, region) &&
      isNear(p, near),
  );

  if (near) found.sort((a, b) => nearness(near.point, a) - nearness(near.point, b));

  if (!found.length) return 'No parts match. Loosen the query, or call get_scene for the groups.';

  const shown = found.slice(0, MAX_MATCHES);
  const more = found.length - shown.length;

  return [
    `${found.length} of ${snap.parts.length} parts match${more ? `; the first ${shown.length}` : ''}:`,
    ...shown.map((p) => partLine(p, false)),
    ...(more ? [`${more} more. Narrow the query to see them.`] : []),
  ].join('\n');
}
