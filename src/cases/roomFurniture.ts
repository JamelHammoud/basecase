import type { V3 } from '../utils/kinematics';
import type { ObjectJitter, WorldObject } from './schema';

export const CONFIDENCES = ['low', 'medium', 'high'] as const;

export type Confidence = (typeof CONFIDENCES)[number];

export interface RoomFurniture {
  id?: string;
  size: V3;
  center: V3;
  yaw: number;
  category: string;
  confidence?: Confidence;
}

const FURNITURE_GREY = '#6e6e6e';
const MIN_SIDE_MM = 10;
const TABLE_TOP_MM = 40;

const SHOVABLE: Record<string, { massG: number; maxSideMm: number }> = {
  chair: { massG: 5000, maxSideMm: Infinity },
  storage: { massG: 8000, maxSideMm: 600 },
};

const RAISED_TOP: ReadonlySet<string> = new Set(['table']);

export const SCAN_JITTER: Record<Confidence, ObjectJitter> = {
  high: { mm: 50, deg: 5 },
  medium: { mm: 75, deg: 7.5 },
  low: { mm: 100, deg: 10 },
};

const words = (category: string) => category.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

const kebab = (category: string) => category.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

function topOnly(item: RoomFurniture, size: V3): { center: V3; size: V3 } {
  if (!RAISED_TOP.has(item.category) || size[1] <= TABLE_TOP_MM * 2) return { center: item.center, size };

  const [x, y, z] = item.center;
  const top = y + size[1] / 2;

  return { center: [x, top - TABLE_TOP_MM / 2, z], size: [size[0], TABLE_TOP_MM, size[2]] };
}

export function furniture(items: RoomFurniture[]): WorldObject[] {
  const counts = new Map<string, number>();

  return items.map((item) => {
    const n = (counts.get(item.category) ?? 0) + 1;
    const box = topOnly(item, item.size.map((x) => Math.max(x, MIN_SIDE_MM)) as V3);
    const shove = SHOVABLE[item.category];
    const moves = !!shove && Math.max(...box.size) <= shove.maxSideMm;

    counts.set(item.category, n);

    return {
      id: `${kebab(item.category)}-${n}`,
      name: words(item.category),
      kind: 'box',
      position: box.center,
      rotation: [0, item.yaw, 0],
      size: box.size,
      color: FURNITURE_GREY,
      behavior: moves ? 'dynamic' : 'static',
      ...(moves ? { massG: shove.massG } : { jitter: SCAN_JITTER[item.confidence ?? 'high'] }),
    };
  });
}
