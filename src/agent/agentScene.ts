import * as THREE from 'three';
import { BLOCKOUT_ONLY, PART_CATALOG, catalogItemFromKey, catalogNote } from '../data/catalog';
import { COMPONENT_BY_ID } from '../data/components';
import { hardwareName, hardwareNote } from '../data/hardware';
import { SUPPLY_BY_ID } from '../data/supplies';
import { PartKind, PartRole, PrintMaterial, ScenePart } from '../types/robotics';
import {
  add,
  eulerToMatrix,
  groupFor,
  MIRROR_AXIS_INDEX,
  r1,
  r2,
  r3,
  rotate,
  rotToCad,
  rotToScene,
  sub,
  toCad,
  toScene,
  type V3,
} from './agentFrame';

export { agentCatalog } from './agentCatalog';
export { groupFor, rotToCad, rotToScene, toCad, toScene } from './agentFrame';
export { mirrorParts } from './agentMirror';

export interface AgentCadPayload {
  language: 'openscad' | 'replicad';
  code: string;
  positions: number[];
  indices: number[];
  edges?: number[] | null;
  stats?: { volume?: number; triangles?: number };
}

export interface AgentPartSpec {
  id: string;
  name?: string;
  shape?: string;
  size?: V3;
  position?: V3;
  rotation?: V3;
  color?: string;
  role?: PartRole;
  group?: string;
  material?: AgentMaterial;
  supply?: string;
  thickness?: number;
  note?: string;
  cad?: AgentCadPayload;
  catalog?: string;
}

export type AgentOp =
  | { op: 'add'; part: AgentPartSpec }
  | { op: 'update'; part: AgentPartSpec }
  | { op: 'delete'; id: string }
  | { op: 'mirror'; ids: string[]; axis: 'x' | 'y' | 'z'; rename: Record<string, string> };

export type AgentMaterial = 'printed' | 'pla' | 'petg' | 'asa' | 'tpu' | 'cots' | 'aluminum' | 'laser_cut';

const PRINT_MATERIAL: Partial<Record<AgentMaterial, PrintMaterial>> = {
  pla: 'PLA',
  petg: 'PETG',
  asa: 'ASA',
  tpu: 'TPU',
};

const MATERIAL_TAGS: Record<AgentMaterial, string> = {
  printed: '3D Printed PLA/PETG',
  pla: '3D Printed PLA/PETG',
  petg: '3D Printed PLA/PETG',
  asa: '3D Printed PLA/PETG',
  tpu: 'TPU Flexible',
  cots: 'Off-the-shelf COTS',
  aluminum: 'CNC Aluminum',
  laser_cut: 'Laser-Cut Acrylic/Carbon',
};
const TAG_TO_MATERIAL = Object.fromEntries(
  Object.entries(MATERIAL_TAGS)
    .filter(([k]) => !PRINT_MATERIAL[k as AgentMaterial] || k === 'tpu')
    .map(([k, v]) => [v, k]),
) as Record<string, AgentPartSpec['material']>;

function materialFields(m: AgentMaterial): { mechanicalTag: string; printMaterial?: PrintMaterial } {
  return { mechanicalTag: MATERIAL_TAGS[m], printMaterial: PRINT_MATERIAL[m] };
}

function supplyFields(supply?: string): { supplyId?: string; mechanicalTag?: string } {
  if (!supply) return {};

  const id = supply.replace(/^supply:/, '');

  if (!SUPPLY_BY_ID[id]) throw new Error(`Unknown supply "${supply}". find_parts lists supply keys.`);

  return { supplyId: id, mechanicalTag: MATERIAL_TAGS.cots };
}

function componentVariantFromKey(key: string): string | undefined {
  const [head, variant] = key.split('|');

  if (!head.startsWith('component:') || !variant) return undefined;

  const c = COMPONENT_BY_ID[head.slice('component:'.length)];

  if (!c?.variants?.some((v) => v.id === variant))
    throw new Error(
      `"${key}": ${c?.name ?? 'this part'} comes in ${c?.variants?.map((v) => v.id).join(', ') || 'one version only'}.`,
    );

  return variant;
}

function cadMeshToScene(cad: AgentCadPayload) {
  const pos = new Array<number>(cad.positions.length);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < cad.positions.length; i += 3) {
    const s = toScene([cad.positions[i], cad.positions[i + 1], cad.positions[i + 2]]);

    for (let k = 0; k < 3; k++) {
      pos[i + k] = s[k];
      min[k] = Math.min(min[k], s[k]);
      max[k] = Math.max(max[k], s[k]);
    }
  }

  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = r3(pos[i + k] - center[k]);

  let edges: number[] | null = null;

  if (cad.edges?.length) {
    edges = new Array<number>(cad.edges.length);

    for (let i = 0; i < cad.edges.length; i += 3) {
      const s = toScene([cad.edges[i], cad.edges[i + 1], cad.edges[i + 2]]);

      for (let k = 0; k < 3; k++) edges[i + k] = r3(s[k] - center[k]);
    }
  }

  const size: V3 = [r2(max[0] - min[0]), r2(max[1] - min[1]), r2(max[2] - min[2])];

  return { positions: pos, indices: cad.indices, edges, center, size };
}

type PartBase = Pick<ScenePart, 'id' | 'name' | 'rotation' | 'note' | 'visible' | 'locked' | 'group'>;

function catalogPart(spec: AgentPartSpec, key: string, base: PartBase): ScenePart {
  const item = catalogItemFromKey(key);

  if (!item || (item.kind !== 'component' && item.kind !== 'hardware')) {
    throw new Error(`Unknown catalog part "${key}". find_parts lists the keys.`);
  }

  const d = item.defaultDimensions;
  const hardware = item.hardware;
  const variant = componentVariantFromKey(key);

  return {
    ...base,
    name: spec.name || (hardware ? hardwareName(hardware) : item.name),
    note: spec.note ?? (hardware ? hardwareNote(hardware) : catalogNote(item)),
    kind: item.kind,
    category: item.category,
    role: spec.role ?? 'solid',
    position: toScene(spec.position ?? [0, 0, d.height / 2]).map(r3) as V3,
    dimensions: { ...d },
    color: spec.color ?? item.defaultColor,
    mechanicalTag: item.defaultTag,
    hardware,
    componentId: item.componentId,
    ...(variant ? { componentVariant: variant } : {}),
  };
}

function cadPart(spec: AgentPartSpec, cad: AgentCadPayload, base: PartBase): ScenePart {
  const mesh = cadMeshToScene(cad);
  const origin = toScene(spec.position ?? [0, 0, 0]);
  const role = spec.role ?? 'solid';

  return {
    ...base,
    kind: 'cad_part',
    category: 'custom_models',
    role,
    position: add(origin, rotate(mesh.center, base.rotation)).map(r3) as V3,
    dimensions: {
      width: Math.max(0.1, mesh.size[0]),
      height: Math.max(0.1, mesh.size[1]),
      depth: Math.max(0.1, mesh.size[2]),
    },
    color: spec.color ?? (role === 'cutout' ? '#ef4444' : '#e4e4e7'),
    ...materialFields(spec.material ?? 'printed'),
    ...supplyFields(spec.supply),
    cad: {
      language: cad.language,
      code: cad.code,
      positions: mesh.positions,
      indices: mesh.indices,
      edges: mesh.edges,
      originOffset: mesh.center,
      baseSize: mesh.size,
      volume: cad.stats?.volume,
    },
  };
}

type CatalogEntry = (typeof PART_CATALOG)[number] | undefined;

function defaultRole(kind: PartKind): PartRole {
  if (kind.startsWith('hole_')) return 'cutout';

  return kind === 'pivot_axis' ? 'reference' : 'solid';
}

function thicknessField(spec: AgentPartSpec, catalog: CatalogEntry): { thickness?: number } {
  const fallback = catalog?.defaultDimensions.thickness;

  return spec.thickness !== undefined || fallback !== undefined ? { thickness: spec.thickness ?? fallback } : {};
}

function primitiveColor(spec: AgentPartSpec, role: PartRole, catalog: CatalogEntry): string {
  if (spec.color) return spec.color;

  return role === 'cutout' ? '#ef4444' : (catalog?.defaultColor ?? '#e4e4e7');
}

function primitiveMaterial(spec: AgentPartSpec, catalog: CatalogEntry) {
  return spec.material
    ? materialFields(spec.material)
    : { mechanicalTag: catalog?.defaultTag ?? MATERIAL_TAGS.printed };
}

function primitivePart(spec: AgentPartSpec, base: PartBase): ScenePart {
  const kind = (spec.shape || 'box') as PartKind;
  const catalog = [...PART_CATALOG, ...BLOCKOUT_ONLY].find((c) => c.kind === kind);
  const [sx, sy, sz] = spec.size ?? [20, 20, 20];
  const role: PartRole = spec.role ?? defaultRole(kind);

  return {
    ...base,
    kind,
    category: catalog?.category ?? 'primitives',
    role,
    position: toScene(spec.position ?? [0, 0, sz / 2]).map(r3) as V3,
    dimensions: {
      width: Math.max(0.5, r1(sx)),
      height: Math.max(0.5, r1(sz)),
      depth: Math.max(0.5, r1(sy)),
      ...thicknessField(spec, catalog),
    },
    color: primitiveColor(spec, role, catalog),
    ...primitiveMaterial(spec, catalog),
    ...supplyFields(spec.supply),
  };
}

export function specToPart(spec: AgentPartSpec): ScenePart {
  const base: PartBase = {
    id: spec.id,
    name: spec.name || spec.id,
    rotation: rotToScene(spec.rotation ?? [0, 0, 0]),
    note: spec.note ?? '',
    visible: true,
    locked: false,
    group: groupFor(spec.group),
  };

  if (spec.catalog) return catalogPart(spec, spec.catalog, base);

  if (spec.shape === 'cad_part' && spec.cad) return cadPart(spec, spec.cad, base);

  return primitivePart(spec, base);
}

function placementPoint(part: ScenePart): V3 {
  if (part.kind === 'cad_part' && part.cad) return sub(part.position, rotate(part.cad.originOffset, part.rotation));

  return part.position;
}

function applyLooks(next: ScenePart, spec: AgentPartSpec) {
  if (spec.name) next.name = spec.name;

  if (spec.color) next.color = spec.color;

  if (spec.role) next.role = spec.role;

  if (spec.group !== undefined) next.group = groupFor(spec.group);

  if (spec.material) {
    const m = materialFields(spec.material);

    next.mechanicalTag = m.mechanicalTag;
    next.printMaterial = m.printMaterial;
  }

  if (spec.supply !== undefined)
    Object.assign(next, supplyFields(spec.supply), spec.supply ? {} : { supplyId: undefined });

  if (spec.note !== undefined) next.note = spec.note;
}

const isResizable = (part: ScenePart) =>
  part.kind !== 'cad_part' && part.kind !== 'component' && part.kind !== 'hardware';

function applyPlacement(next: ScenePart, part: ScenePart, spec: AgentPartSpec) {
  const placement = spec.position ? toScene(spec.position) : placementPoint(part);

  next.rotation = spec.rotation ? rotToScene(spec.rotation) : part.rotation;
  next.position = (
    part.kind === 'cad_part' && part.cad ? add(placement, rotate(part.cad.originOffset, next.rotation)) : placement
  ).map(r3) as V3;
}

export function applySpec(part: ScenePart, spec: AgentPartSpec): ScenePart {
  const next: ScenePart = { ...part };

  applyLooks(next, spec);

  if (spec.thickness !== undefined) next.dimensions = { ...next.dimensions, thickness: spec.thickness };

  if (spec.size && isResizable(part)) {
    next.dimensions = {
      ...next.dimensions,
      width: r1(spec.size[0]),
      height: r1(spec.size[2]),
      depth: r1(spec.size[1]),
    };
  }

  if (spec.rotation || spec.position) applyPlacement(next, part, spec);

  return next;
}

function worldBox(p: ScenePart): { min: V3; max: V3 } {
  const hx = p.dimensions.width / 2,
    hy = p.dimensions.height / 2,
    hz = p.dimensions.depth / 2;
  const m = eulerToMatrix(p.rotation);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  const corners = [-hx, hx].flatMap((cx) => [-hy, hy].flatMap((cy) => [-hz, hz].map((cz) => [cx, cy, cz] as V3)));

  for (const [cx, cy, cz] of corners) {
    const v = new THREE.Vector3(cx, cy, cz).applyMatrix4(m);
    const w: V3 = [v.x + p.position[0], v.y + p.position[1], v.z + p.position[2]];

    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], w[i]);
      max[i] = Math.max(max[i], w[i]);
    }
  }

  return { min, max };
}

function boxToCad(b: { min: V3; max: V3 }) {
  const a = toCad(b.min);
  const c = toCad(b.max);

  return {
    min: [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])].map(r2),
    max: [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])].map(r2),
  };
}

function materialOf(p: ScenePart): string | undefined {
  if (p.printMaterial) return p.printMaterial.toLowerCase();

  return p.mechanicalTag ? TAG_TO_MATERIAL[p.mechanicalTag] : undefined;
}

export function snapshotScene(parts: ScenePart[]) {
  const visible = parts.filter((p) => p.visible && p.kind !== 'image_plane');
  let bounds: { min: number[]; max: number[]; size: number[] } | null = null;

  for (const p of visible) {
    const b = boxToCad(worldBox(p));

    if (!bounds) bounds = { min: [...b.min], max: [...b.max], size: [] };

    for (let i = 0; i < 3; i++) {
      bounds.min[i] = Math.min(bounds.min[i], b.min[i]);
      bounds.max[i] = Math.max(bounds.max[i], b.max[i]);
    }
  }

  if (bounds) bounds.size = bounds.max.map((v, i) => r2(v - bounds!.min[i]));

  return {
    frame: 'mm, Z up, floor z = 0, front faces −Y, left is +X',
    parts: parts.map((p) => {
      const isCad = p.kind === 'cad_part' && !!p.cad;

      return {
        id: p.id,
        name: p.name,
        kind: isCad ? `cad (${p.cad!.language})` : p.kind,
        position: toCad(placementPoint(p)).map(r3),
        rotation: rotToCad(p.rotation),
        ...(isCad
          ? { volume: p.cad!.volume }
          : { size: [p.dimensions.width, p.dimensions.depth, p.dimensions.height] }),
        bounds: boxToCad(worldBox(p)),
        color: p.color,
        role: p.role,
        group: p.group?.name,
        material: materialOf(p),
        ...(p.componentId
          ? { catalog: `component:${p.componentId}${p.componentVariant ? `|${p.componentVariant}` : ''}` }
          : {}),
        ...(p.supplyId ? { supply: `supply:${p.supplyId}` } : {}),
        ...(p.note ? { note: p.note } : {}),
        ...(p.visible ? {} : { hidden: true }),
        ...(p.kind === 'image_plane' ? { referenceImage: true } : {}),
      };
    }),
    bounds,
  };
}

function addTarget(part: AgentPartSpec): V3 | null {
  if (part.shape === 'cad_part' && part.cad?.positions?.length) {
    const zs = part.cad.positions.filter((_, i) => i % 3 === 2);
    const top = Math.max(...zs.slice(0, 5000));
    const p = part.position ?? [0, 0, 0];

    return toScene([p[0], p[1], p[2] + top]);
  }

  const p = part.position;
  const h = part.size?.[2] ?? 0;

  return p ? toScene([p[0], p[1], p[2] + h / 2]) : null;
}

function opPartId(op: Exclude<AgentOp, { op: 'add' }>): string {
  if (op.op === 'mirror') return op.ids[0];

  return op.op === 'delete' ? op.id : op.part.id;
}

export function opTarget(op: AgentOp, parts: ScenePart[]): V3 | null {
  if (op.op === 'add') return addTarget(op.part);

  const part = parts.find((p) => p.id === opPartId(op));
  const moved = op.op === 'update' && op.part.position ? toScene(op.part.position) : null;

  if (!part) return moved;

  const pos: V3 = moved ?? part.position;
  const target: V3 = [pos[0], pos[1] + part.dimensions.height / 2, pos[2]];

  if (op.op === 'mirror') target[MIRROR_AXIS_INDEX[op.axis]] *= -1;

  return target;
}

export function describeOp(op: AgentOp, parts: ScenePart[]): string {
  switch (op.op) {
    case 'add':
      return op.part.name || op.part.id;
    case 'update':
      return parts.find((p) => p.id === op.part.id)?.name ?? op.part.id;
    case 'delete':
      return parts.find((p) => p.id === op.id)?.name ?? op.id;
    case 'mirror':
      return `${op.ids.length} parts`;
  }
}

export function partCode(parts: ScenePart[], id: string) {
  const p = parts.find((x) => x.id === id);

  if (!p) return { error: `No part with id ${id}` };

  if (!p.cad)
    return { id, kind: p.kind, note: 'This is a primitive block, not a CAD part. Replace it with model_part.' };

  return { id, language: p.cad.language, code: p.cad.code };
}
