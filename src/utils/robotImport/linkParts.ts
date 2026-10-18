import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScenePart } from '../../types/robotics';
import { primitive, simplify } from './meshes';
import type { Model, ModelLink, Visual } from './model';
import { hex, linkLabel, round, ROBOT_DATA_VERSION, type PublishedData } from './published';
import type { Source } from './sources';

export type MeshFiles = Map<string, THREE.BufferGeometry | null>;

export interface LinkGeometry {
  geo: THREE.BufferGeometry;
  color: THREE.Color;
}

export interface PartsSpec {
  name: string;
  groupId: string;
  source: Source;
  rotate?: Array<[string, number]>;
  maxTriangles?: number;
}

export interface BuiltParts {
  parts: ScenePart[];
  triangles: number;
  shift: THREE.Vector3;
  partOfLink: Map<string, string>;
  centerOfLink: Map<string, THREE.Vector3>;
}

function visualGeometry(v: Visual, files: MeshFiles): THREE.BufferGeometry | null {
  if (v.geometry.type !== 'mesh') return primitive(v.geometry);

  const src = files.get(v.geometry.file);

  if (!src) return null;

  const g = src.clone();

  g.scale(v.geometry.scale.x, v.geometry.scale.y, v.geometry.scale.z);

  return g;
}

function linkGeometry(l: ModelLink, files: MeshFiles, frame: THREE.Matrix4) {
  const pieces: THREE.BufferGeometry[] = [];
  const colors: THREE.Color[] = [];

  for (const v of l.visuals) {
    const g = visualGeometry(v, files);

    if (!g) continue;

    g.applyMatrix4(v.origin);
    g.applyMatrix4(l.world);
    g.applyMatrix4(frame);
    g.scale(1000, 1000, 1000);
    pieces.push(g);

    if (v.color) colors.push(v.color);
  }

  if (!pieces.length) return null;

  const merged = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);

  return merged ? { merged, colors } : null;
}

export function linkGeometries(
  model: Model,
  files: MeshFiles,
  frame: THREE.Matrix4,
  color: string | undefined,
): Map<string, LinkGeometry> {
  const linkGeo = new Map<string, LinkGeometry>();

  for (const [link, l] of model.links) {
    const built = linkGeometry(l, files, frame);

    if (!built) continue;

    linkGeo.set(link, {
      geo: built.merged,
      color: color ? new THREE.Color(color) : (built.colors[0] ?? new THREE.Color('#b3b3b3')),
    });
  }

  return linkGeo;
}

function compactMesh(positions: Float32Array, indices: Uint32Array, center: THREE.Vector3) {
  const local: number[] = new Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    local[i] = Math.round((positions[i] - center.x) * 100) / 100;
    local[i + 1] = Math.round((positions[i + 1] - center.y) * 100) / 100;
    local[i + 2] = Math.round((positions[i + 2] - center.z) * 100) / 100;
  }

  const used = new Int32Array(positions.length / 3).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];

  for (const i of indices) {
    if (used[i] < 0) {
      used[i] = pos.length / 3;
      pos.push(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
    }

    idx.push(used[i]);
  }

  return { pos, idx };
}

interface PartBuild {
  spec: PartsSpec;
  shift: THREE.Vector3;
  budget: number;
  total: number;
}

function linkPart(b: PartBuild, link: string, { geo, color }: LinkGeometry) {
  const { name, groupId, source, rotate } = b.spec;
  const tris = geo.getAttribute('position').count / 3;
  const target = b.total > b.budget ? Math.max(1500, Math.round((b.budget * tris) / b.total)) : tris;
  const { positions, indices } = simplify(geo, target);
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(positions, 3));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const { pos, idx } = compactMesh(positions, indices, center);
  const id = `${groupId}-${link.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
  const baseSize: [number, number, number] = [Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)];
  const { shift } = b;
  const part: ScenePart = {
    id,
    name: linkLabel(link),
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [round(center.x + shift.x), round(center.y + shift.y), round(center.z + shift.z)],
    rotation: [0, 0, 0],
    dimensions: { width: round(baseSize[0]), height: round(baseSize[1]), depth: round(baseSize[2]) },
    color: hex(color),
    note: '',
    mechanicalTag: `${name} · ${link}`,
    visible: true,
    locked: false,
    mesh: { positions: pos, indices: idx, baseSize, source: `${name} · ${link}` },
    group: { id: groupId, name },
    robotLink: {
      robot: groupId,
      link,
      url: source.kind === 'url' ? source.url : undefined,
      rotate,
      version: ROBOT_DATA_VERSION,
    },
  };

  return { part, center, triangles: idx.length / 3 };
}

export function buildLinkParts(linkGeo: Map<string, LinkGeometry>, spec: PartsSpec): BuiltParts {
  const budget = spec.maxTriangles ?? 220_000;
  const total = [...linkGeo.values()].reduce((s, { geo }) => s + geo.getAttribute('position').count / 3, 0);
  const box = new THREE.Box3();

  linkGeo.forEach(({ geo }) => {
    geo.computeBoundingBox();
    box.union(geo.boundingBox!);
  });

  const shift = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const out: BuiltParts = { parts: [], triangles: 0, shift, partOfLink: new Map(), centerOfLink: new Map() };

  for (const [link, lg] of linkGeo) {
    const { part, center, triangles } = linkPart({ spec, shift, budget, total }, link, lg);

    out.triangles += triangles;
    out.partOfLink.set(link, part.id);
    out.centerOfLink.set(link, center.clone());
    out.parts.push(part);
  }

  return out;
}

export function applyPublishedMass(built: BuiltParts, data: PublishedData) {
  for (const p of built.parts) {
    const link = p.robotLink!.link;
    const d = data.links.get(link);

    if (!d) continue;

    p.massG = Math.round(d.massKg * 10000) / 10;

    const c = d.com.clone().sub(built.centerOfLink.get(link)!);

    p.com = [round(c.x), round(c.y), round(c.z)];
  }
}
