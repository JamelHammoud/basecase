import { overlaps, type Bed, type Rect } from './bed';

export interface PackItem {
  id: string;
  w: number;
  d: number;
  diagonalYaw?: number;
  fixed?: { plate: number; x: number; y: number; turned: boolean };
  startPlate?: number;
}

export interface Placement extends Rect {
  plate: number;
  yaw: number;
}

const EPS = 1e-6;

interface PlateSpace {
  free: Rect[];
}

const contains = (a: Rect, b: Rect) =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.d <= a.y + a.d + EPS;

function splitFree(free: Rect, used: Rect): Rect[] {
  if (!overlaps(free, used)) return [free];

  const out: Rect[] = [];

  if (used.x > free.x) out.push({ ...free, w: used.x - free.x });

  if (used.x + used.w < free.x + free.w)
    out.push({ ...free, x: used.x + used.w, w: free.x + free.w - used.x - used.w });

  if (used.y > free.y) out.push({ ...free, d: used.y - free.y });

  if (used.y + used.d < free.y + free.d)
    out.push({ ...free, y: used.y + used.d, d: free.y + free.d - used.y - used.d });

  return out.filter((r) => r.w > EPS && r.d > EPS);
}

function occupy(space: PlateSpace, used: Rect) {
  const split = space.free.flatMap((f) => splitFree(f, used));

  space.free = split.filter((r, i) => !split.some((o, j) => j !== i && contains(o, r) && (!contains(r, o) || j < i)));
}

function newPlate(bed: Bed, gap: number): PlateSpace {
  const space = { free: [{ x: 0, y: 0, w: bed.width + gap, d: bed.depth + gap }] };

  for (const k of bed.keepOut) occupy(space, k);

  return space;
}

function bestSpot(space: PlateSpace, w: number, d: number) {
  let best: { rect: Rect; score: number } | null = null;

  for (const f of space.free) {
    if (w > f.w + EPS || d > f.d + EPS) continue;

    const score = Math.min(f.w - w, f.d - d) * 1e6 + f.y * 1e3 + f.x;

    if (!best || score < best.score) best = { rect: { x: f.x, y: f.y, w, d }, score };
  }

  return best;
}

function placeLoose(spaces: PlateSpace[], item: PackItem, gap: number, bed: Bed): Placement {
  const options = [
    { w: item.w + gap, d: item.d + gap, yaw: 0 },
    { w: item.d + gap, d: item.w + gap, yaw: 90 },
  ];

  for (let plate = Math.max(0, (item.startPlate ?? 1) - 1); ; plate++) {
    for (let p = 0; p < plate; p++) spaces[p] ??= newPlate(bed, gap);

    const fresh = !spaces[plate];

    spaces[plate] ??= newPlate(bed, gap);

    const found = options
      .map((o) => ({ o, spot: bestSpot(spaces[plate], o.w, o.d) }))
      .filter((c) => c.spot)
      .sort((a, b) => a.spot!.score - b.spot!.score)[0];

    if (!found && fresh) return { plate: plate + 1, x: 0, y: 0, w: item.w, d: item.d, yaw: 0 };

    if (!found) continue;

    occupy(spaces[plate], found.spot!.rect);

    const { x, y } = found.spot!.rect;

    return { plate: plate + 1, x, y, w: found.o.w - gap, d: found.o.d - gap, yaw: found.o.yaw };
  }
}

function placeFixed(spaces: PlateSpace[], item: PackItem, gap: number, bed: Bed): Placement | null {
  const fixed = item.fixed!;
  const [w, d] = fixed.turned ? [item.d, item.w] : [item.w, item.d];
  const rect = { x: fixed.x, y: fixed.y, w, d };
  const inside = rect.x >= -EPS && rect.y >= -EPS && rect.x + w <= bed.width + EPS && rect.y + d <= bed.depth + EPS;

  if (!inside || fixed.plate < 1) return null;

  for (let p = 0; p < fixed.plate; p++) spaces[p] ??= newPlate(bed, gap);

  occupy(spaces[fixed.plate - 1], { ...rect, w: w + gap, d: d + gap });

  return { plate: fixed.plate, ...rect, yaw: fixed.turned ? 90 : 0 };
}

export function packPlates(
  items: PackItem[],
  bed: Bed,
  gap = 6,
): { placements: Record<string, Placement>; plates: number } {
  const spaces: PlateSpace[] = [];
  const placements: Record<string, Placement> = {};
  const loose: PackItem[] = [];

  for (const item of items.filter((i) => i.fixed && i.diagonalYaw === undefined)) {
    const placed = placeFixed(spaces, item, gap, bed);

    if (placed) placements[item.id] = placed;
    else loose.push(item);
  }

  const rest = [...loose, ...items.filter((i) => !i.fixed && i.diagonalYaw === undefined)].sort(
    (a, b) =>
      (a.startPlate ? 0 : 1) - (b.startPlate ? 0 : 1) ||
      b.w * b.d - a.w * a.d ||
      Math.max(b.w, b.d) - Math.max(a.w, a.d),
  );

  for (const item of rest) placements[item.id] = placeLoose(spaces, item, gap, bed);

  let plates = spaces.length;

  for (const item of items.filter((i) => i.diagonalYaw !== undefined)) {
    plates += 1;
    placements[item.id] = {
      plate: plates,
      x: (bed.width - item.w) / 2,
      y: (bed.depth - item.d) / 2,
      w: item.w,
      d: item.d,
      yaw: item.diagonalYaw!,
    };
  }

  return { placements, plates };
}
