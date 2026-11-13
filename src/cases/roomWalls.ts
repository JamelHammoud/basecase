import type { V3 } from '../utils/kinematics';
import { MAX_OBJECTS, type WorldObject } from './schema';

export interface RoomSurface {
  id?: string;
  parent?: string;
  size: V3;
  center: V3;
  yaw: number;
}

export interface RoomItem extends RoomSurface {
  category: string;
}

export interface RoomScan {
  walls: RoomSurface[];
  doors: RoomSurface[];
  windows: RoomSurface[];
  openings: RoomSurface[];
  objects: RoomItem[];
}

interface Cut {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

type Span = [number, number];

const WALL_THICKNESS_MM = 100;
const WALL_GREY = '#8c8c8c';
const FURNITURE_GREY = '#6e6e6e';
const MIN_PIECE_MM = 1;
const MIN_SIDE_MM = 10;
const ON_WALL_MM = 300;
const PARALLEL = Math.sin((10 * Math.PI) / 180);
const SNAP_DEG = 1;

const SHOVABLE: Record<string, { massG: number; maxSideMm: number }> = {
  chair: { massG: 5000, maxSideMm: Infinity },
  storage: { massG: 8000, maxSideMm: 600 },
};

const axisOf = (yaw: number): V3 => [Math.cos(yaw), 0, -Math.sin(yaw)];

const normalOf = (yaw: number): V3 => [Math.sin(yaw), 0, Math.cos(yaw)];

const along = (d: V3, axis: V3) => d[0] * axis[0] + d[2] * axis[2];

const offset = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function dominantYaw(surfaces: RoomSurface[]): number {
  const [c, s] = surfaces.reduce(
    ([x, y], w) => [x + w.size[0] * Math.cos(4 * w.yaw), y + w.size[0] * Math.sin(4 * w.yaw)],
    [0, 0],
  );

  return Math.hypot(c, s) < 1e-9 ? 0 : Math.atan2(s, c) / 4;
}

function turned<T extends RoomSurface>(surface: T, by: number): T {
  const [x, y, z] = surface.center;
  const cos = Math.cos(by);
  const sin = Math.sin(by);

  return { ...surface, center: [x * cos + z * sin, y, -x * sin + z * cos], yaw: surface.yaw + by };
}

function onWall(wall: RoomSurface, hole: RoomSurface): boolean {
  if (hole.parent !== undefined && hole.parent === wall.id) return true;

  if (Math.abs(Math.sin(hole.yaw - wall.yaw)) > PARALLEL) return false;

  const d = offset(hole.center, wall.center);

  return Math.abs(along(d, normalOf(wall.yaw))) < ON_WALL_MM && Math.abs(along(d, axisOf(wall.yaw))) < wall.size[0] / 2;
}

function cutOf(wall: RoomSurface, hole: RoomSurface, toFloor: boolean): Cut {
  const u = along(offset(hole.center, wall.center), axisOf(wall.yaw));
  const half = hole.size[0] / 2;
  const top = hole.center[1] + hole.size[1] / 2;

  return { from: u - half, to: u + half, bottom: toFloor ? -Infinity : hole.center[1] - hole.size[1] / 2, top };
}

function solidSpans(full: Span, holes: Span[]): Span[] {
  const sorted = [...holes].sort((a, b) => a[0] - b[0]);
  const spans: Span[] = [];
  let from = full[0];

  for (const [bottom, top] of sorted) {
    if (bottom > from) spans.push([from, Math.min(bottom, full[1])]);

    from = Math.max(from, top);
  }

  if (from < full[1]) spans.push([from, full[1]]);

  return spans.filter(([a, b]) => b - a > MIN_PIECE_MM);
}

function wallPieces(wall: RoomSurface, cuts: Cut[], index: number): WorldObject[] {
  const half = wall.size[0] / 2;
  const height: Span = [wall.center[1] - wall.size[1] / 2, wall.center[1] + wall.size[1] / 2];
  const edges = [...new Set([-half, half, ...cuts.flatMap((c) => [c.from, c.to])])]
    .filter((u) => u >= -half && u <= half)
    .sort((a, b) => a - b);
  const axis = axisOf(wall.yaw);

  return edges.slice(1).flatMap((to, i) => {
    const from = edges[i];
    const mid = (from + to) / 2;
    const holes = cuts.filter((c) => c.from <= mid && c.to >= mid).map((c): Span => [c.bottom, c.top]);

    if (to - from < MIN_PIECE_MM) return [];

    return solidSpans(height, holes).map(([bottom, top], j) => ({
      id: `wall-${index}-${i}-${j}`,
      name: 'Wall',
      kind: 'box' as const,
      position: [wall.center[0] + axis[0] * mid, (bottom + top) / 2, wall.center[2] + axis[2] * mid] as V3,
      rotation: [0, wall.yaw, 0] as V3,
      size: [to - from, top - bottom, WALL_THICKNESS_MM] as V3,
      color: WALL_GREY,
      behavior: 'static' as const,
    }));
  });
}

const words = (category: string) => category.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

const kebab = (category: string) => category.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

function furniture(items: RoomItem[]): WorldObject[] {
  const counts = new Map<string, number>();

  return items.map((item) => {
    const n = (counts.get(item.category) ?? 0) + 1;
    const size = item.size.map((x) => Math.max(x, MIN_SIDE_MM)) as V3;
    const shove = SHOVABLE[item.category];
    const moves = !!shove && Math.max(...size) <= shove.maxSideMm;

    counts.set(item.category, n);

    return {
      id: `${kebab(item.category)}-${n}`,
      name: words(item.category),
      kind: 'box',
      position: item.center,
      rotation: [0, item.yaw, 0],
      size,
      color: FURNITURE_GREY,
      behavior: moves ? 'dynamic' : 'static',
      ...(moves ? { massG: shove.massG } : {}),
    };
  });
}

function snapped(o: WorldObject): WorldObject {
  const deg = (((((o.rotation[1] * 180) / Math.PI) % 360) + 540) % 360) - 180;
  const quarter = Math.round(deg / 90);

  if (Math.abs(deg - quarter * 90) > SNAP_DEG) return { ...o, rotation: [0, deg, 0] };

  const size: V3 = quarter % 2 === 0 ? o.size : [o.size[2], o.size[1], o.size[0]];

  return { ...o, rotation: [0, 0, 0], size };
}

const volume = (o: WorldObject) => o.size[0] * o.size[1] * o.size[2];

export function largest(objects: WorldObject[], count: number): WorldObject[] {
  if (objects.length <= count) return objects;

  const kept = new Set([...objects].sort((a, b) => volume(b) - volume(a)).slice(0, Math.max(count, 0)));

  return objects.filter((o) => kept.has(o));
}

function floorOf(scan: RoomScan): number {
  const from = scan.walls.length ? scan.walls : scan.objects;

  return Math.min(...from.map((s) => s.center[1] - s.size[1] / 2));
}

function onFloor<T extends RoomSurface>(surface: T, floor: number): T {
  const [x, y, z] = surface.center;

  return { ...surface, center: [x, y - floor, z] };
}

export interface RoomFrame {
  turn: number;
  floor: number;
}

export const roomFrame = (scan: RoomScan): RoomFrame => ({
  turn: -dominantYaw(scan.walls.length ? scan.walls : scan.objects),
  floor: floorOf(scan),
});

export const inRoomFrame = <T extends RoomSurface>(surface: T, { turn, floor }: RoomFrame): T =>
  onFloor(turned(surface, turn), floor);

export function roomObjects(scan: RoomScan): WorldObject[] {
  const frame = roomFrame(scan);
  const level = <T extends RoomSurface>(list: T[]) => list.map((s) => inRoomFrame(s, frame));
  const holes = level([...scan.doors, ...scan.openings]);
  const windows = level(scan.windows);
  const walls = level(scan.walls).flatMap((wall, i) => {
    const cuts = [
      ...holes.filter((h) => onWall(wall, h)).map((h) => cutOf(wall, h, true)),
      ...windows.filter((h) => onWall(wall, h)).map((h) => cutOf(wall, h, false)),
    ];

    return wallPieces(wall, cuts, i);
  });

  return largest([...walls, ...furniture(level(scan.objects))].map(snapped), MAX_OBJECTS);
}
