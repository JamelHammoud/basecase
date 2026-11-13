type Xyz = [number, number, number];

interface FixtureSurface {
  identifier: string;
  category: Record<string, Record<string, unknown>>;
  dimensions: Xyz;
  transform: number[];
  parentIdentifier: string | null;
}

export interface FixtureRoom {
  identifier: string;
  version: number;
  walls: FixtureSurface[];
  doors: FixtureSurface[];
  windows: FixtureSurface[];
  openings: FixtureSurface[];
  objects: FixtureSurface[];
  basecase?: unknown;
}

export const FIXTURE_FLOOR_M = -1.2;
export const FIXTURE_DOOR = { center: [0, 2] as [number, number], widthM: 0.9 };
export const FIXTURE_TABLE = { center: [-1.2, -0.825, -0.6] as Xyz, dimensions: [1.2, 0.75, 0.8] as Xyz };
export const FIXTURE_START_MM: Xyz = [0, 0, 1250];
export const FIXTURE_TAP = { start: [-0.3, FIXTURE_FLOOR_M, -1.2] as Xyz, heading: Math.PI / 2 };
export const FIXTURE_TAP_MM: Xyz = [-300, 0, -1200];

const WALL_M = 2.4;
const QUARTER = Math.PI / 2;

function transform([x, y, z]: Xyz, yaw: number, turn: number): number[] {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const a = yaw + turn;

  return [
    ...[Math.cos(a), 0, -Math.sin(a), 0],
    ...[0, 1, 0, 0],
    ...[Math.sin(a), 0, Math.cos(a), 0],
    ...[x * c + z * s, y, -x * s + z * c, 1],
  ];
}

interface Spec {
  id: string;
  category: string;
  at: Xyz;
  size: Xyz;
  yaw?: number;
  parent?: string;
  extra?: Record<string, unknown>;
}

const surface =
  (turn: number) =>
  ({ id, category, at, size, yaw = 0, parent, extra = {} }: Spec): FixtureSurface => ({
    identifier: id,
    category: { [category]: extra },
    dimensions: size,
    transform: transform(at, yaw, turn),
    parentIdentifier: parent ?? null,
  });

const WALLS: Spec[] = [
  { id: 'south', category: 'wall', at: [0, 0, -2], size: [4, WALL_M, 0] },
  { id: 'north', category: 'wall', at: [0, 0, 4.5], size: [4, WALL_M, 0], yaw: Math.PI },
  { id: 'west', category: 'wall', at: [-2, 0, 1.25], size: [6.5, WALL_M, 0], yaw: QUARTER },
  { id: 'east', category: 'wall', at: [2, 0, 1.25], size: [6.5, WALL_M, 0], yaw: -QUARTER },
  { id: 'divider', category: 'wall', at: [0, 0, 2], size: [4, WALL_M, 0] },
];

const DOOR: Spec = {
  id: 'door',
  category: 'door',
  at: [FIXTURE_DOOR.center[0], FIXTURE_FLOOR_M + 1.05, FIXTURE_DOOR.center[1]],
  size: [FIXTURE_DOOR.widthM, 2.1, 0],
  parent: 'divider',
  extra: { isOpen: true },
};

const WINDOW: Spec = { id: 'window', category: 'window', at: [1, 0.2, 4.5], size: [1, 1.2, 0], yaw: Math.PI };

const OBJECTS: Spec[] = [
  { id: 'sofa', category: 'sofa', at: [1.45, FIXTURE_FLOOR_M + 0.425, -0.5], size: [2, 0.85, 0.9], yaw: QUARTER },
  { id: 'table', category: 'table', at: FIXTURE_TABLE.center, size: FIXTURE_TABLE.dimensions },
  { id: 'chair', category: 'chair', at: [-1.2, FIXTURE_FLOOR_M + 0.45, 0.15], size: [0.5, 0.9, 0.5] },
];

function clutter(count: number): Spec[] {
  return Array.from({ length: count }, (_, i) => {
    const side = 0.05 + (i % 50) * 0.002;

    return {
      id: `clutter${i}`,
      category: 'storage',
      at: [-1.8 + (i % 20) * 0.05, FIXTURE_FLOOR_M + side / 2, 3 + Math.floor(i / 20) * 0.05],
      size: [side, side, side],
    };
  });
}

interface FixtureOptions {
  turnDeg?: number;
  extraObjects?: number;
  basecase?: unknown;
}

export function fixtureRoom({ turnDeg = 0, extraObjects = 0, basecase }: FixtureOptions = {}): FixtureRoom {
  const make = surface((turnDeg * Math.PI) / 180);

  return {
    ...(basecase === undefined ? {} : { basecase }),
    identifier: 'fixture-flat',
    version: 2,
    walls: WALLS.map(make),
    doors: [make(DOOR)],
    windows: [make(WINDOW)],
    openings: [],
    objects: [...OBJECTS, ...clutter(extraObjects)].map(make),
  };
}

export function fixtureTap(turnDeg = 0) {
  const turn = (turnDeg * Math.PI) / 180;
  const [x, y, z] = FIXTURE_TAP.start;

  return {
    start: [x * Math.cos(turn) + z * Math.sin(turn), y, -x * Math.sin(turn) + z * Math.cos(turn)],
    heading: FIXTURE_TAP.heading + turn,
  };
}
