import type { PartDimensions, PartEdges, PartKind, ScenePart } from '../types/robotics';

export type Outline = Array<[number, number]>;

type EdgedPart = Pick<ScenePart, 'kind' | 'dimensions' | 'edges'>;

export const EDGE_KINDS: ReadonlySet<PartKind> = new Set<PartKind>([
  'box',
  'cube',
  'cylinder',
  'tube',
  'hex_prism',
  'wedge',
]);

const JUST_UNDER = 0.98;
const MIN_EDGE_MM = 0.01;

export function tubeRadii({ width, depth, thickness = 4 }: PartDimensions): { outer: number; inner: number } {
  const outer = Math.min(width, depth) / 2;
  const wall = Math.min(thickness, outer * 0.75);

  return { outer, inner: Math.max(1, outer - wall) };
}

export function hexOutline({ width, depth }: PartDimensions): Outline {
  return Array.from({ length: 6 }, (_, k) => {
    const theta = (k * Math.PI) / 3;

    return [(width / 2) * Math.sin(theta), (depth / 2) * Math.cos(theta)];
  });
}

export const wedgeOutline = ({ width, height }: PartDimensions): Outline => [
  [-width / 2, height / 2],
  [width / 2, height / 2],
  [-width / 2, -height / 2],
];

function centralInradius(outline: Outline): number {
  return Math.min(
    ...outline.map(([ax, az], i) => {
      const [bx, bz] = outline[(i + 1) % outline.length];

      return Math.abs(ax * bz - bx * az) / Math.hypot(bx - ax, bz - az);
    }),
  );
}

const halfMin = (...values: number[]) => Math.min(...values) / 2;

const LIMITS: Partial<Record<PartKind, (d: PartDimensions) => number>> = {
  box: (d) => halfMin(d.width, d.height, d.depth),
  cube: (d) => halfMin(d.width, d.height, d.depth),
  cylinder: (d) => halfMin(d.width, d.depth, d.height),
  tube: (d) => {
    const { outer, inner } = tubeRadii(d);

    return halfMin(outer - inner, d.height);
  },
  hex_prism: (d) => Math.min(centralInradius(hexOutline(d)), d.height / 2),
  wedge: ({ width, height, depth }) =>
    Math.min((width * height) / (width + height + Math.hypot(width, height)), depth / 2),
};

export function edgeLimitMm(kind: PartKind, dimensions: PartDimensions): number {
  return Math.max(0, (LIMITS[kind]?.(dimensions) ?? 0) * JUST_UNDER);
}

export const canEdge = (part: Pick<ScenePart, 'kind' | 'sculptMesh'>) => EDGE_KINDS.has(part.kind) && !part.sculptMesh;

export function clampEdges(part: Pick<ScenePart, 'kind' | 'dimensions'>, edges: PartEdges): PartEdges {
  const mm = Math.min(Math.max(0, edges.mm || 0), edgeLimitMm(part.kind, part.dimensions));

  return { kind: edges.kind === 'chamfer' ? 'chamfer' : 'fillet', mm: Math.round(mm * 100) / 100 };
}

export function partEdges(part: EdgedPart): PartEdges | null {
  if (!part.edges || !EDGE_KINDS.has(part.kind)) return null;

  const edges = clampEdges(part, part.edges);

  return edges.mm >= MIN_EDGE_MM ? edges : null;
}

export function specEdges(
  part: Pick<ScenePart, 'kind' | 'dimensions'>,
  edges: PartEdges | null,
): PartEdges | undefined {
  return edges && edges.mm > 0 && EDGE_KINDS.has(part.kind) ? clampEdges(part, edges) : undefined;
}
