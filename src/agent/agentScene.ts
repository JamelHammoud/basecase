import * as THREE from 'three';
import { BLOCKOUT_ONLY, PART_CATALOG, catalogItemFromKey, catalogNote } from '../data/catalog';
import { ActuatorSpec, COMPONENTS, COMPONENT_BY_ID, componentSize, hasComponentMesh } from '../data/components';
import { HARDWARE_TYPES, driveOptions, hardwareName, hardwareNote } from '../data/hardware';
import { SUPPLIES, SUPPLY_BY_ID } from '../data/supplies';
import { PartKind, PartRole, PrintMaterial, ScenePart } from '../types/robotics';

/**
 * Agent ↔ scene translation.
 *
 * The agent works in the standard CAD frame: Z up, floor z = 0, front faces −Y, left is +X.
 * The viewport is Y up with the front facing +Z. scene = (x, z, −y).
 */

type V3 = [number, number, number];

export interface AgentCadPayload {
  language: 'openscad' | 'replicad';
  code: string;
  positions: number[];
  indices: number[];
  edges?: number[] | null;
  stats?: { volume?: number; triangles?: number };
}

/** Part spec sent by the CAD MCP server (see electron/cad-mcp-server.mjs) */
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
  /** This part is the envelope of a bought supply ("supply:<id>"), e.g. the battery */
  supply?: string;
  thickness?: number;
  note?: string;
  cad?: AgentCadPayload;
  /** A real part from the catalog: "component:<id>" or "hardware:<type>|<size>|<length>[|<finish>|<drive>]" */
  catalog?: string;
}

export type AgentOp =
  | { op: 'add'; part: AgentPartSpec }
  | { op: 'update'; part: AgentPartSpec }
  | { op: 'delete'; id: string }
  | { op: 'mirror'; ids: string[]; axis: 'x' | 'y' | 'z'; rename: Record<string, string> };

export type AgentMaterial = 'printed' | 'pla' | 'petg' | 'asa' | 'tpu' | 'cots' | 'aluminum' | 'laser_cut';

/** Printed filaments the agent can pick per part (else the project's material) */
const PRINT_MATERIAL: Partial<Record<AgentMaterial, PrintMaterial>> = { pla: 'PLA', petg: 'PETG', asa: 'ASA', tpu: 'TPU' };

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
  Object.entries(MATERIAL_TAGS).filter(([k]) => !PRINT_MATERIAL[k as AgentMaterial] || k === 'tpu').map(([k, v]) => [v, k])
) as Record<
  string,
  AgentPartSpec['material']
>;

function materialFields(m: AgentMaterial): { mechanicalTag: string; printMaterial?: PrintMaterial } {
  return { mechanicalTag: MATERIAL_TAGS[m], printMaterial: PRINT_MATERIAL[m] };
}

/** A part standing for a bought supply: not printed, counted as that supply in the BOM */
function supplyFields(supply?: string): { supplyId?: string; mechanicalTag?: string } {
  if (!supply) return {};
  const id = supply.replace(/^supply:/, '');
  if (!SUPPLY_BY_ID[id]) throw new Error(`Unknown supply "${supply}". find_parts lists supply keys.`);
  return { supplyId: id, mechanicalTag: MATERIAL_TAGS.cots };
}

/** The variant in "component:<id>|<variant>", checked against the catalog */
function componentVariantFromKey(key: string): string | undefined {
  const [head, variant] = key.split('|');
  if (!head.startsWith('component:') || !variant) return undefined;
  const c = COMPONENT_BY_ID[head.slice('component:'.length)];
  if (!c?.variants?.some((v) => v.id === variant))
    throw new Error(`"${key}": ${c?.name ?? 'this part'} comes in ${c?.variants?.map((v) => v.id).join(', ') || 'one version only'}.`);
  return variant;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
/** CAD sizes keep 0.01 mm and positions 0.001 mm: rounding a part's center shifts its faces, and exact parts mate on them */
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

export const toScene = ([x, y, z]: V3): V3 => [x, z, -y];
export const toCad = ([x, y, z]: V3): V3 => [x, -z, y];

// Basis taking CAD axes to scene axes
const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
const Mi = M.clone().invert();
const DEG = Math.PI / 180;

function eulerToMatrix(deg: V3): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(deg[0] * DEG, deg[1] * DEG, deg[2] * DEG, 'XYZ'));
}
function matrixToEuler(m: THREE.Matrix4): V3 {
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
  const d = (v: number) => {
    const x = Math.round((v / DEG) * 10) / 10;
    return Object.is(x, -0) ? 0 : x;
  };
  return [d(e.x), d(e.y), d(e.z)];
}
export const rotToScene = (deg: V3): V3 => matrixToEuler(M.clone().multiply(eulerToMatrix(deg)).multiply(Mi));
export const rotToCad = (deg: V3): V3 => matrixToEuler(Mi.clone().multiply(eulerToMatrix(deg)).multiply(M));

/** Scene-frame rotation applied to a vector */
function rotate(v: V3, sceneDeg: V3): V3 {
  const out = new THREE.Vector3(...v).applyMatrix4(eulerToMatrix(sceneDeg));
  return [out.x, out.y, out.z];
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function groupFor(name?: string): ScenePart['group'] {
  return name ? { id: `agent-${slug(name)}`, name } : undefined;
}

/* ------------------------------------------------------------------ */
/* CAD meshes                                                          */
/* ------------------------------------------------------------------ */

/** Convert a kernel mesh (CAD frame) to a centered scene-frame mesh */
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

/* ------------------------------------------------------------------ */
/* Specs → parts                                                       */
/* ------------------------------------------------------------------ */

export function specToPart(spec: AgentPartSpec): ScenePart {
  const rotation = rotToScene(spec.rotation ?? [0, 0, 0]);
  const base = {
    id: spec.id,
    name: spec.name || spec.id,
    rotation,
    note: spec.note ?? '',
    visible: true,
    locked: false,
    group: groupFor(spec.group),
  };

  if (spec.catalog) {
    const item = catalogItemFromKey(spec.catalog);
    if (!item || (item.kind !== 'component' && item.kind !== 'hardware')) {
      throw new Error(`Unknown catalog part "${spec.catalog}". find_parts lists the keys.`);
    }
    const d = item.defaultDimensions;
    return {
      ...base,
      name: spec.name || (item.hardware ? hardwareName(item.hardware) : item.name),
      note: spec.note ?? (item.hardware ? hardwareNote(item.hardware) : catalogNote(item)),
      kind: item.kind,
      category: item.category,
      role: spec.role ?? 'solid',
      position: toScene(spec.position ?? [0, 0, d.height / 2]).map(r3) as V3,
      dimensions: { ...d },
      color: spec.color ?? item.defaultColor,
      mechanicalTag: item.defaultTag,
      hardware: item.hardware,
      componentId: item.componentId,
      ...(componentVariantFromKey(spec.catalog) ? { componentVariant: componentVariantFromKey(spec.catalog) } : {}),
    };
  }

  if (spec.shape === 'cad_part' && spec.cad) {
    const mesh = cadMeshToScene(spec.cad);
    const origin = toScene(spec.position ?? [0, 0, 0]);
    const role = spec.role ?? 'solid';
    return {
      ...base,
      kind: 'cad_part',
      category: 'custom_models',
      role,
      position: add(origin, rotate(mesh.center, rotation)).map(r3) as V3,
      dimensions: { width: Math.max(0.1, mesh.size[0]), height: Math.max(0.1, mesh.size[1]), depth: Math.max(0.1, mesh.size[2]) },
      color: spec.color ?? (role === 'cutout' ? '#ef4444' : '#e4e4e7'),
      ...materialFields(spec.material ?? 'printed'),
      ...supplyFields(spec.supply),
      cad: {
        language: spec.cad.language,
        code: spec.cad.code,
        positions: mesh.positions,
        indices: mesh.indices,
        edges: mesh.edges,
        originOffset: mesh.center,
        baseSize: mesh.size,
        volume: spec.cad.stats?.volume,
      },
    };
  }

  const kind = (spec.shape || 'box') as PartKind;
  const catalog = [...PART_CATALOG, ...BLOCKOUT_ONLY].find((c) => c.kind === kind);
  const [sx, sy, sz] = spec.size ?? [20, 20, 20];
  const role: PartRole = spec.role ?? (kind.startsWith('hole_') ? 'cutout' : kind === 'pivot_axis' ? 'reference' : 'solid');
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
      ...(spec.thickness !== undefined || catalog?.defaultDimensions.thickness !== undefined
        ? { thickness: spec.thickness ?? catalog?.defaultDimensions.thickness }
        : {}),
    },
    color: spec.color ?? (role === 'cutout' ? '#ef4444' : catalog?.defaultColor ?? '#e4e4e7'),
    ...(spec.material ? materialFields(spec.material) : { mechanicalTag: catalog?.defaultTag ?? MATERIAL_TAGS.printed }),
    ...supplyFields(spec.supply),
  };
}

/** Where a part's placement point is in the scene (CAD origin for CAD parts, center otherwise) */
function placementPoint(part: ScenePart): V3 {
  if (part.kind === 'cad_part' && part.cad) return sub(part.position, rotate(part.cad.originOffset, part.rotation));
  return part.position;
}

export function applySpec(part: ScenePart, spec: AgentPartSpec): ScenePart {
  const next: ScenePart = { ...part };
  if (spec.name) next.name = spec.name;
  if (spec.color) next.color = spec.color;
  if (spec.role) next.role = spec.role;
  if (spec.group !== undefined) next.group = groupFor(spec.group);
  if (spec.material) {
    const m = materialFields(spec.material);
    next.mechanicalTag = m.mechanicalTag;
    next.printMaterial = m.printMaterial;
  }
  if (spec.supply !== undefined) Object.assign(next, supplyFields(spec.supply), spec.supply ? {} : { supplyId: undefined });
  if (spec.note !== undefined) next.note = spec.note;
  if (spec.thickness !== undefined) next.dimensions = { ...next.dimensions, thickness: spec.thickness };
  // CAD parts, hardware and real components keep their exact geometry
  if (spec.size && part.kind !== 'cad_part' && part.kind !== 'component' && part.kind !== 'hardware') {
    next.dimensions = { ...next.dimensions, width: r1(spec.size[0]), height: r1(spec.size[2]), depth: r1(spec.size[1]) };
  }
  if (spec.rotation || spec.position) {
    const placement = spec.position ? toScene(spec.position) : placementPoint(part);
    next.rotation = spec.rotation ? rotToScene(spec.rotation) : part.rotation;
    next.position = (
      part.kind === 'cad_part' && part.cad ? add(placement, rotate(part.cad.originOffset, next.rotation)) : placement
    ).map(r3) as V3;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Mirroring                                                           */
/* ------------------------------------------------------------------ */

/** "Left Thigh" ↔ "Right Thigh" (and front ↔ rear for front/back mirrors); leaves words like "Bright" alone */
function swapWords(s: string, pairs: [string, string][]) {
  return pairs.reduce((acc, [a, b]) => {
    const re = new RegExp(`(?<![A-Za-z])(${a}|${b})(?![a-z])`, 'gi');
    return acc.replace(re, (m) => {
      const out = m.toLowerCase() === a ? b : a;
      if (m === m.toUpperCase()) return out.toUpperCase();
      return m[0] === m[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
    });
  }, s);
}

/** Mirrored copies across the CAD x (left/right) or y (front/back) plane */
export function mirrorParts(parts: ScenePart[], ids: string[], axis: 'x' | 'y' | 'z', rename: Record<string, string>): ScenePart[] {
  // Scene axis index for the CAD axis being mirrored
  const k = axis === 'x' ? 0 : axis === 'y' ? 2 : 1;
  const words: [string, string][] = axis === 'x' ? [['left', 'right']] : axis === 'y' ? [['front', 'rear'], ['front', 'back']] : [['top', 'bottom']];
  const S = new THREE.Matrix4().makeScale(k === 0 ? -1 : 1, k === 1 ? -1 : 1, k === 2 ? -1 : 1);
  const flip = (v: V3): V3 => {
    const o: V3 = [...v];
    o[k] = -o[k];
    return o;
  };
  const taken = new Set(parts.map((p) => p.id));
  return ids.flatMap((id) => {
    const src = parts.find((p) => p.id === id);
    if (!src) return [];
    let newId = rename[id] ?? swapWords(id, words);
    if (newId === id || taken.has(newId)) newId = `${newId}-mirror`;
    taken.add(newId);
    const swappedName = swapWords(src.name, words);
    const rotation = matrixToEuler(S.clone().multiply(eulerToMatrix(src.rotation)).multiply(S));
    const copy: ScenePart = {
      ...src,
      id: newId,
      name: swappedName === src.name ? `${src.name} (Mirror)` : swappedName,
      position: flip(src.position),
      rotation,
      group: src.group ? groupFor(swapWords(src.group.name, words)) : undefined,
    };
    if (src.kind === 'cad_part' && src.cad) {
      // Mirror the geometry in its local frame and fix the triangle winding
      const pos = src.cad.positions.slice();
      for (let i = k; i < pos.length; i += 3) pos[i] = -pos[i];
      const idx = src.cad.indices.slice();
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      const edges = src.cad.edges?.slice() ?? null;
      if (edges) for (let i = k; i < edges.length; i += 3) edges[i] = -edges[i];
      copy.cad = { ...src.cad, positions: pos, indices: idx, edges, originOffset: flip(src.cad.originOffset) };
    }
    return [copy];
  });
}

/* ------------------------------------------------------------------ */
/* Snapshot for the agent                                              */
/* ------------------------------------------------------------------ */

/** World AABB of a part in the scene frame (from its local box corners) */
function worldBox(p: ScenePart): { min: V3; max: V3 } {
  const hx = p.dimensions.width / 2, hy = p.dimensions.height / 2, hz = p.dimensions.depth / 2;
  const m = eulerToMatrix(p.rotation);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const cx of [-hx, hx]) for (const cy of [-hy, hy]) for (const cz of [-hz, hz]) {
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
        ...(isCad ? { volume: p.cad!.volume } : { size: [p.dimensions.width, p.dimensions.depth, p.dimensions.height] }),
        bounds: boxToCad(worldBox(p)),
        color: p.color,
        role: p.role,
        group: p.group?.name,
        material: p.printMaterial ? p.printMaterial.toLowerCase() : p.mechanicalTag ? TAG_TO_MATERIAL[p.mechanicalTag] : undefined,
        ...(p.componentId ? { catalog: `component:${p.componentId}${p.componentVariant ? `|${p.componentVariant}` : ''}` } : {}),
        ...(p.supplyId ? { supply: `supply:${p.supplyId}` } : {}),
        ...(p.note ? { note: p.note } : {}),
        ...(p.visible ? {} : { hidden: true }),
        ...(p.kind === 'image_plane' ? { referenceImage: true } : {}),
      };
    }),
    bounds,
  };
}

/* ------------------------------------------------------------------ */
/* Cursor helpers                                                      */
/* ------------------------------------------------------------------ */

/** Scene point the agent cursor should glide to for an op */
export function opTarget(op: AgentOp, parts: ScenePart[]): V3 | null {
  if (op.op === 'add') {
    if (op.part.shape === 'cad_part' && op.part.cad?.positions?.length) {
      // Top of the part's bounding box above its placement point
      const zs = op.part.cad.positions.filter((_, i) => i % 3 === 2);
      const top = Math.max(...zs.slice(0, 5000));
      const p = op.part.position ?? [0, 0, 0];
      return toScene([p[0], p[1], p[2] + top]);
    }
    const p = op.part.position;
    const h = op.part.size?.[2] ?? 0;
    return p ? toScene([p[0], p[1], p[2] + h / 2]) : null;
  }
  const id = op.op === 'mirror' ? op.ids[0] : op.op === 'delete' ? op.id : op.part.id;
  const part = parts.find((p) => p.id === id);
  if (!part) return op.op === 'update' && op.part.position ? toScene(op.part.position) : null;
  const pos: V3 = op.op === 'update' && op.part.position ? toScene(op.part.position) : part.position;
  const target: V3 = [pos[0], pos[1] + part.dimensions.height / 2, pos[2]];
  if (op.op === 'mirror') target[op.axis === 'x' ? 0 : op.axis === 'y' ? 2 : 1] *= -1;
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

/** Source code of a CAD part, for the agent to edit */
export function partCode(parts: ScenePart[], id: string) {
  const p = parts.find((x) => x.id === id);
  if (!p) return { error: `No part with id ${id}` };
  if (!p.cad) return { id, kind: p.kind, note: 'This is a primitive block, not a CAD part. Replace it with model_part.' };
  return { id, language: p.cad.language, code: p.cad.code };
}

/* ------------------------------------------------------------------ */
/* Catalog for the agent                                               */
/* ------------------------------------------------------------------ */

/**
 * Real parts the agent can place with add_parts({ catalog }), as plain text: every component
 * with its exact size (CAD frame x × y × z), key specs and mounting, then the hardware types.
 * `query` filters by words (all must match).
 */
export function agentCatalog(query = ''): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
  const comps = COMPONENTS.filter((c) => hasComponentMesh(c.id)).filter((c) =>
    matches(`${c.id} ${c.name} ${c.manufacturer} ${c.mpn} ${c.group} ${c.description} ${c.keywords ?? ''}`)
  );
  const hw = HARDWARE_TYPES.filter((t) => matches(`hardware ${t.type} ${t.name} ${t.group} ${t.description} ${t.sizes.join(' ')}`));
  const lines: string[] = [];
  if (comps.length) {
    lines.push('Components (exact manufacturer geometry; size is x × y × z in mm as placed with rotation [0, 0, 0]):');
    let group = '';
    for (const c of comps) {
      if (c.group !== group) lines.push(`${(group = c.group)}:`);
      const sz = componentSize(c.id);
      const specs = c.specs.slice(0, 3).map(([k, v]) => `${k} ${v}`).join('; ');
      lines.push(`- component:${c.id} — ${c.name} · ${sz.width} × ${sz.depth} × ${sz.height} mm · ${specs} · Mounting: ${c.mounting}`);
      const nm = (x?: number) => (x === undefined ? '?' : x.toFixed(2));
      const act = (x: ActuatorSpec) =>
        `stall ${nm(x.stallNm)} N·m, rated ${nm(x.ratedNm ?? undefined)} N·m at ${x.atVolts} V (input ${x.volts[0]}–${x.volts[1]} V)${x.stallA ? `, stall ${x.stallA} A` : ''}`;
      if (c.variants?.length) {
        lines.push(`  Versions (buy one; put it in the key): ${c.variants.map((v) => `component:${c.id}|${v.id} = ${v.label}${v.actuator ? `, ${act(v.actuator)}` : ''}`).join('; ')}`);
      } else if (c.actuator) lines.push(`  Actuator: ${act(c.actuator)}`);
    }
  }
  if (hw.length) {
    lines.push(
      '',
      'Hardware (generated to ISO/DIN dimensions): hardware:<type>|<size>|<length mm>[|<finish>|<drive>], e.g. hardware:socket_head|M3|10, hardware:pan_head|M3|8|zinc|phillips, hardware:heat_insert|M3, hardware:bearing|608'
    );
    for (const t of hw) {
      const drives = driveOptions(t.type);
      lines.push(
        `- hardware:${t.type} — ${t.name} (${t.description}); sizes ${t.sizes.join(', ')}${t.lengths ? '; lengths per size' : ''}${
          drives.length > 1 ? `; drives ${drives.join(', ')}` : ''
        }`
      );
    }
  }
  const supplies = SUPPLIES.filter((x) => matches(`supply ${x.id} ${x.name} ${x.group} ${x.spec}`));
  if (supplies.length) {
    lines.push('', 'Supplies (bought, not modeled: batteries, power, wiring, filament). Add them to the BOM with set_build({ extras }), not add_parts; model the battery or converter bay around the spec size:');
    for (const x of supplies) lines.push(`- supply:${x.id} — ${x.name} · ${x.spec}${x.weightG ? ` · about ${x.weightG} g` : ''}`);
  }
  if (!lines.length) return `Nothing in the catalog matches "${query}". Call find_parts with no query to see everything.`;
  return lines.join('\n');
}
